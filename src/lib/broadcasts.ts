import { and, asc, count, desc, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  apiKeys,
  broadcastRecipients,
  broadcasts,
  emailSuppressions,
  orgMembers,
} from "@/db/schema";
import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { AudienceError } from "@/lib/audience-core";
import { getActiveAudienceContacts } from "@/lib/audiences";
import {
  can,
  isOrgRole,
  requirePermission,
  type OrgPermission,
} from "@/lib/authorization";
import {
  BroadcastError,
  MAX_BROADCAST_SCHEDULE_AHEAD_MS,
  parseCreateBroadcastInput,
  type BroadcastRecipientStatus,
  type BroadcastStatus,
} from "@/lib/broadcast-core";
import { DomainError } from "@/lib/domain-core";
import { EmailError } from "@/lib/email-core";
import {
  queueEmail,
  type MessageQueuePrincipal,
  type QueuedMessageRecord,
} from "@/lib/messages";
import { RateLimitError } from "@/lib/rate-limit-core";
import { requestBroadcastJob } from "@/lib/job-queue";
import { TemplateError, renderTemplateForSend } from "@/lib/template-core";
import { getTemplate } from "@/lib/templates";
import {
  createUnsubscribeUrl,
  withUnsubscribeFooter,
} from "@/lib/unsubscribe-core";

export type BroadcastProgress = {
  cancelled: number;
  failed: number;
  pending: number;
  processing: number;
  queued: number;
  suppressed: number;
  total: number;
};

export type BroadcastRecord = {
  cancelledAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  environment: "live" | "test";
  from: string;
  id: string;
  name: string;
  pausedAt: Date | null;
  progress: BroadcastProgress;
  scheduledFor: Date | null;
  sourceAudienceId: string | null;
  sourceTemplateId: string | null;
  status: BroadcastStatus;
  templateName: string;
  updatedAt: Date;
};

export type BroadcastPrincipal = Omit<ApiKeyPrincipal, "apiKeyId"> & {
  apiKeyId: string | null;
};

export type BroadcastQueue = (input: {
  allowAttachments?: boolean;
  idempotencyKey?: unknown;
  payload: unknown;
  principal: MessageQueuePrincipal;
}) => Promise<QueuedMessageRecord>;

type ProcessBroadcastDependencies = {
  now?: () => Date;
  queue?: BroadcastQueue;
  unsubscribeUrl?: (contactId: string) => string;
};

const broadcastSelection = {
  apiKeyId: broadcasts.apiKeyId,
  cancelledAt: broadcasts.cancelledAt,
  completedAt: broadcasts.completedAt,
  createdAt: broadcasts.createdAt,
  createdByUserId: broadcasts.createdByUserId,
  environment: broadcasts.environment,
  from: broadcasts.from,
  id: broadcasts.id,
  name: broadcasts.name,
  orgId: broadcasts.orgId,
  pausedAt: broadcasts.pausedAt,
  scheduledFor: broadcasts.scheduledFor,
  sourceAudienceId: broadcasts.sourceAudienceId,
  sourceTemplateId: broadcasts.sourceTemplateId,
  status: broadcasts.status,
  templateHtml: broadcasts.templateHtml,
  templateName: broadcasts.templateName,
  templateRequiredVariables: broadcasts.templateRequiredVariables,
  templateSubject: broadcasts.templateSubject,
  templateText: broadcasts.templateText,
  updatedAt: broadcasts.updatedAt,
};
const BROADCAST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireBroadcastId(broadcastId: string): void {
  if (!BROADCAST_ID_PATTERN.test(broadcastId)) {
    throw new BroadcastError("BROADCAST_NOT_FOUND");
  }
}

function emptyProgress(): BroadcastProgress {
  return {
    cancelled: 0,
    failed: 0,
    pending: 0,
    processing: 0,
    queued: 0,
    suppressed: 0,
    total: 0,
  };
}

async function requireOrganizationPermission(input: {
  actorUserId: string | null;
  orgId: string;
  permission: OrgPermission;
}): Promise<string> {
  if (!input.actorUserId) {
    throw new BroadcastError("MEMBERSHIP_REQUIRED");
  }

  const [membership] = await db
    .select({ role: orgMembers.role })
    .from(orgMembers)
    .where(
      and(
        eq(orgMembers.orgId, input.orgId),
        eq(orgMembers.userId, input.actorUserId),
      ),
    )
    .limit(1);

  if (!membership || !isOrgRole(membership.role)) {
    throw new BroadcastError("MEMBERSHIP_REQUIRED");
  }

  requirePermission(membership.role, input.permission);
  return input.actorUserId;
}

async function broadcastProgress(broadcastId: string): Promise<BroadcastProgress> {
  const rows = await db
    .select({ count: count(), status: broadcastRecipients.status })
    .from(broadcastRecipients)
    .where(eq(broadcastRecipients.broadcastId, broadcastId))
    .groupBy(broadcastRecipients.status);
  const progress = emptyProgress();

  for (const row of rows) {
    const value = Number(row.count);
    progress[row.status] = value;
    progress.total += value;
  }

  return progress;
}

async function recordFromRow(
  row: typeof broadcasts.$inferSelect,
): Promise<BroadcastRecord> {
  return {
    cancelledAt: row.cancelledAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    environment: row.environment,
    from: row.from,
    id: row.id,
    name: row.name,
    pausedAt: row.pausedAt,
    progress: await broadcastProgress(row.id),
    scheduledFor: row.scheduledFor,
    sourceAudienceId: row.sourceAudienceId,
    sourceTemplateId: row.sourceTemplateId,
    status: row.status,
    templateName: row.templateName,
    updatedAt: row.updatedAt,
  };
}

async function readBroadcastRow(input: { orgId: string; broadcastId: string }) {
  requireBroadcastId(input.broadcastId);
  const [row] = await db
    .select()
    .from(broadcasts)
    .where(
      and(
        eq(broadcasts.id, input.broadcastId),
        eq(broadcasts.orgId, input.orgId),
      ),
    )
    .limit(1);

  if (!row) {
    throw new BroadcastError("BROADCAST_NOT_FOUND");
  }

  return row;
}

function failureCode(error: unknown): string {
  if (error instanceof TemplateError) {
    return error.code === "MISSING_REQUIRED_VARIABLES"
      ? "missing_template_variables"
      : "template_validation_error";
  }

  if (error instanceof EmailError) {
    return error.code === "RECIPIENT_SUPPRESSED"
      ? "recipient_suppressed"
      : "email_validation_error";
  }

  if (error instanceof DomainError) {
    return error.code === "INVALID_DOMAIN"
      ? "invalid_from_domain"
      : "domain_not_verified";
  }

  return "queue_error";
}

async function claimRecipient(input: {
  broadcastId: string;
  orgId: string;
  now: Date;
}) {
  requireBroadcastId(input.broadcastId);
  return db.transaction(async (tx) => {
    const [broadcast] = await tx
      .select(broadcastSelection)
      .from(broadcasts)
      .where(
        and(
          eq(broadcasts.id, input.broadcastId),
          eq(broadcasts.orgId, input.orgId),
        ),
      )
      .for("update");

    if (!broadcast) {
      throw new BroadcastError("BROADCAST_NOT_FOUND");
    }

    if (broadcast.status !== "running") {
      return null;
    }

    let authorized = false;
    if (broadcast.apiKeyId) {
      const [credential] = await tx
        .select({ revokedAt: apiKeys.revokedAt })
        .from(apiKeys)
        .where(
          and(
            eq(apiKeys.id, broadcast.apiKeyId),
            eq(apiKeys.orgId, broadcast.orgId),
          ),
        )
        .limit(1);
      authorized = Boolean(credential && !credential.revokedAt);
    } else if (broadcast.createdByUserId) {
      const [membership] = await tx
        .select({ role: orgMembers.role })
        .from(orgMembers)
        .where(
          and(
            eq(orgMembers.orgId, broadcast.orgId),
            eq(orgMembers.userId, broadcast.createdByUserId),
          ),
        )
        .limit(1);
      authorized = Boolean(
        membership &&
          isOrgRole(membership.role) &&
          can(membership.role, "broadcasts.create"),
      );
    }

    if (!authorized) {
      await tx
        .update(broadcasts)
        .set({ pausedAt: input.now, status: "paused", updatedAt: input.now })
        .where(eq(broadcasts.id, broadcast.id));
      return null;
    }

    const [recipient] = await tx
      .select({
        data: broadcastRecipients.data,
        email: broadcastRecipients.email,
        id: broadcastRecipients.id,
      })
      .from(broadcastRecipients)
      .where(
        and(
          eq(broadcastRecipients.broadcastId, broadcast.id),
          eq(broadcastRecipients.status, "pending"),
        ),
      )
      .orderBy(asc(broadcastRecipients.position))
      .limit(1)
      .for("update");

    if (!recipient) {
      const [processing] = await tx
        .select({ count: count() })
        .from(broadcastRecipients)
        .where(
          and(
            eq(broadcastRecipients.broadcastId, broadcast.id),
            eq(broadcastRecipients.status, "processing"),
          ),
        );

      if (Number(processing?.count ?? 0) === 0) {
        await tx
          .update(broadcasts)
          .set({
            completedAt: input.now,
            status: "completed",
            updatedAt: input.now,
          })
          .where(
            and(
              eq(broadcasts.id, broadcast.id),
              eq(broadcasts.status, "running"),
            ),
          );
      }

      return null;
    }

    await tx
      .update(broadcastRecipients)
      .set({ status: "processing", updatedAt: input.now })
      .where(
        and(
          eq(broadcastRecipients.id, recipient.id),
          eq(broadcastRecipients.status, "pending"),
        ),
      );

    return { broadcast, recipient };
  });
}

async function finishRecipient(input: {
  broadcastId: string;
  failureCode?: string;
  messageId?: string;
  now: Date;
  recipientId: string;
  status: Exclude<BroadcastRecipientStatus, "pending" | "processing">;
}) {
  await db
    .update(broadcastRecipients)
    .set({
      failureCode: input.failureCode ?? null,
      messageId: input.messageId ?? null,
      processedAt: input.now,
      status: input.status,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(broadcastRecipients.id, input.recipientId),
        eq(broadcastRecipients.status, "processing"),
      ),
    );

  await db
    .update(broadcasts)
    .set({ updatedAt: input.now })
    .where(eq(broadcasts.id, input.broadcastId));
}

async function pauseRateLimitedRecipient(input: {
  broadcastId: string;
  now: Date;
  recipientId: string;
}) {
  await db.transaction(async (tx) => {
    await tx
      .update(broadcastRecipients)
      .set({
        failureCode: null,
        status: "pending",
        updatedAt: input.now,
      })
      .where(
        and(
          eq(broadcastRecipients.id, input.recipientId),
          eq(broadcastRecipients.status, "processing"),
        ),
      );
    await tx
      .update(broadcasts)
      .set({
        pausedAt: input.now,
        status: "paused",
        updatedAt: input.now,
      })
      .where(
        and(
          eq(broadcasts.id, input.broadcastId),
          eq(broadcasts.status, "running"),
        ),
      );
  });
}

export async function processBroadcast(
  input: { broadcastId: string; orgId: string },
  dependencies: ProcessBroadcastDependencies = {},
): Promise<void> {
  const now = dependencies.now ?? (() => new Date());
  const queue = dependencies.queue ?? queueEmail;

  for (;;) {
    const claimed = await claimRecipient({ ...input, now: now() });

    if (!claimed) {
      return;
    }

    const { broadcast, recipient } = claimed;
    const [suppression] = await db
      .select({ id: emailSuppressions.id })
      .from(emailSuppressions)
      .where(
        and(
          eq(emailSuppressions.orgId, broadcast.orgId),
          eq(emailSuppressions.email, recipient.email),
        ),
      )
      .limit(1);

    if (suppression) {
      await finishRecipient({
        broadcastId: broadcast.id,
        now: now(),
        recipientId: recipient.id,
        status: "suppressed",
      });
      continue;
    }

    try {
      const rendered = renderTemplateForSend(
        {
          html: broadcast.templateHtml,
          requiredVariables: broadcast.templateRequiredVariables,
          subject: broadcast.templateSubject,
          text: broadcast.templateText,
        },
        recipient.data,
      );
      const message = await queue({
        allowAttachments: false,
        ...(broadcast.apiKeyId
          ? { idempotencyKey: `broadcast:${broadcast.id}:${recipient.id}` }
          : {}),
        payload: {
          from: broadcast.from,
          ...(rendered.html === null ? {} : { html: rendered.html }),
          subject: rendered.subject,
          tags: [{ name: "broadcast_id", value: broadcast.id }],
          ...(rendered.text === null ? {} : { text: rendered.text }),
          to: [recipient.email],
        },
        principal: {
          actorUserId: broadcast.createdByUserId,
          apiKeyId: broadcast.apiKeyId,
          environment: broadcast.environment,
          orgId: broadcast.orgId,
        },
      });

      await finishRecipient({
        broadcastId: broadcast.id,
        messageId: message.id,
        now: now(),
        recipientId: recipient.id,
        status: "queued",
      });
    } catch (error) {
      if (error instanceof RateLimitError) {
        await pauseRateLimitedRecipient({
          broadcastId: broadcast.id,
          now: now(),
          recipientId: recipient.id,
        });
        return;
      }
      await finishRecipient({
        broadcastId: broadcast.id,
        failureCode: failureCode(error),
        now: now(),
        recipientId: recipient.id,
        status:
          error instanceof EmailError &&
          error.code === "RECIPIENT_SUPPRESSED"
            ? "suppressed"
            : "failed",
      });
    }
  }
}

export async function createBroadcast(
  input: { payload: unknown; principal: BroadcastPrincipal },
  dependencies: ProcessBroadcastDependencies = {},
): Promise<BroadcastRecord> {
  const actorUserId = await requireOrganizationPermission({
    actorUserId: input.principal.actorUserId,
    orgId: input.principal.orgId,
    permission: "broadcasts.create",
  });
  const definition = parseCreateBroadcastInput(input.payload);
  const now = dependencies.now?.() ?? new Date();
  if (
    definition.scheduledFor &&
    (definition.scheduledFor <= now ||
      definition.scheduledFor.getTime() - now.getTime() >
        MAX_BROADCAST_SCHEDULE_AHEAD_MS)
  ) {
    throw new BroadcastError("VALIDATION_ERROR", [
      {
        field: "scheduled_for",
        message: "Schedule broadcasts in the future and no more than 366 days ahead.",
      },
    ]);
  }
  const [template, audience] = await Promise.all([
    getTemplate({
      actorUserId,
      orgId: input.principal.orgId,
      templateId: definition.templateId,
    }),
    getActiveAudienceContacts({
      audienceId: definition.audienceId,
      orgId: input.principal.orgId,
    }),
  ]);
  if (audience.length === 0) throw new AudienceError("AUDIENCE_EMPTY");
  const unsubscribeUrl =
    dependencies.unsubscribeUrl ??
    ((contactId: string) => createUnsubscribeUrl({ contactId }));
  const templateBodies = withUnsubscribeFooter({
    html: template.html,
    text: template.text,
  });
  const recipients = audience.map((contact) => ({
    contactId: contact.id,
    data: {
      contact: { email: contact.email, name: contact.name ?? "" },
      email: contact.email,
      name: contact.name ?? "",
      unsubscribe_url: unsubscribeUrl(contact.id),
    },
    email: contact.email,
    position: contact.position,
  }));
  const created = await db.transaction(async (tx) => {
    const [broadcast] = await tx
      .insert(broadcasts)
      .values({
        apiKeyId: input.principal.apiKeyId,
        createdByUserId: actorUserId,
        environment: input.principal.environment,
        from: definition.from,
        name: definition.name,
        orgId: input.principal.orgId,
        scheduledFor: definition.scheduledFor,
        sourceAudienceId: definition.audienceId,
        sourceTemplateId: template.id,
        templateHtml: templateBodies.html,
        templateName: template.name,
        templateRequiredVariables: template.requiredVariables,
        templateSubject: template.subject,
        templateText: templateBodies.text,
        ...(definition.scheduledFor ? { status: "scheduled" as const } : {}),
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: broadcasts.id });

    if (!broadcast) {
      throw new Error("Broadcast insert returned no row.");
    }

    await tx.insert(broadcastRecipients).values(
      recipients.map((recipient) => ({
        broadcastId: broadcast.id,
        contactId: recipient.contactId,
        data: recipient.data,
        email: recipient.email,
        position: recipient.position,
      })),
    );

    return broadcast;
  });

  if (!definition.scheduledFor && dependencies.queue) {
    await processBroadcast(
      { broadcastId: created.id, orgId: input.principal.orgId },
      dependencies,
    );
  } else {
    requestBroadcastJob({
      broadcastId: created.id,
      orgId: input.principal.orgId,
      runAt: definition.scheduledFor ?? now,
    });
  }

  return recordFromRow(
    await readBroadcastRow({
      broadcastId: created.id,
      orgId: input.principal.orgId,
    }),
  );
}

export async function processBroadcastJob(
  input: { broadcastId: string; orgId: string },
  dependencies: ProcessBroadcastDependencies = {},
): Promise<boolean> {
  requireBroadcastId(input.broadcastId);
  const now = dependencies.now?.() ?? new Date();
  const runnable = await db.transaction(async (tx) => {
    const [broadcast] = await tx
      .select({
        id: broadcasts.id,
        orgId: broadcasts.orgId,
        scheduledFor: broadcasts.scheduledFor,
        status: broadcasts.status,
      })
      .from(broadcasts)
      .where(
        and(
          eq(broadcasts.id, input.broadcastId),
          eq(broadcasts.orgId, input.orgId),
        ),
      )
      .for("update");

    if (!broadcast) {
      return null;
    }

    if (broadcast.status === "running") {
      return { id: broadcast.id, orgId: broadcast.orgId };
    }

    if (
      broadcast.status !== "scheduled" ||
      !broadcast.scheduledFor ||
      broadcast.scheduledFor > now
    ) {
      return null;
    }

    const [updated] = await tx
      .update(broadcasts)
      .set({ status: "running", updatedAt: now })
      .where(
        and(
          eq(broadcasts.id, broadcast.id),
          eq(broadcasts.status, "scheduled"),
        ),
      )
      .returning({ id: broadcasts.id, orgId: broadcasts.orgId });
    return updated ?? null;
  });

  if (!runnable) return false;
  await processBroadcast(
    { broadcastId: runnable.id, orgId: runnable.orgId },
    dependencies,
  );
  return true;
}

export async function processNextScheduledBroadcast(
  dependencies: ProcessBroadcastDependencies = {},
): Promise<boolean> {
  const now = dependencies.now?.() ?? new Date();
  const claimed = await db.transaction(async (tx) => {
    const [due] = await tx
      .select({ id: broadcasts.id, orgId: broadcasts.orgId })
      .from(broadcasts)
      .where(
        and(
          eq(broadcasts.status, "scheduled"),
          lte(broadcasts.scheduledFor, now),
        ),
      )
      .orderBy(asc(broadcasts.scheduledFor), asc(broadcasts.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });

    if (!due) return null;
    const [updated] = await tx
      .update(broadcasts)
      .set({ status: "running", updatedAt: now })
      .where(and(eq(broadcasts.id, due.id), eq(broadcasts.status, "scheduled")))
      .returning({ id: broadcasts.id, orgId: broadcasts.orgId });
    return updated ?? null;
  });

  if (!claimed) return false;
  await processBroadcast(
    { broadcastId: claimed.id, orgId: claimed.orgId },
    dependencies,
  );
  return true;
}

export async function listBroadcasts(input: {
  actorUserId: string | null;
  orgId: string;
}): Promise<BroadcastRecord[]> {
  await requireOrganizationPermission({ ...input, permission: "broadcasts.read" });
  const rows = await db
    .select()
    .from(broadcasts)
    .where(eq(broadcasts.orgId, input.orgId))
    .orderBy(desc(broadcasts.createdAt), desc(broadcasts.id))
    .limit(50);

  return Promise.all(rows.map(recordFromRow));
}

export async function getBroadcast(input: {
  actorUserId: string | null;
  broadcastId: string;
  orgId: string;
}): Promise<BroadcastRecord> {
  await requireOrganizationPermission({ ...input, permission: "broadcasts.read" });
  return recordFromRow(await readBroadcastRow(input));
}

async function setBroadcastStatus(input: {
  actorUserId: string | null;
  broadcastId: string;
  orgId: string;
  target: "paused" | "running" | "cancelled";
  now?: () => Date;
}): Promise<void> {
  requireBroadcastId(input.broadcastId);
  await requireOrganizationPermission({
    ...input,
    permission: "broadcasts.control",
  });
  const now = input.now?.() ?? new Date();

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ status: broadcasts.status })
      .from(broadcasts)
      .where(
        and(
          eq(broadcasts.id, input.broadcastId),
          eq(broadcasts.orgId, input.orgId),
        ),
      )
      .for("update");

    if (!current) {
      throw new BroadcastError("BROADCAST_NOT_FOUND");
    }

    if (current.status === input.target) {
      return;
    }

    if (input.target === "running" && current.status === "completed") {
      return;
    }

    const allowed =
      (input.target === "paused" && current.status === "running") ||
      (input.target === "running" && current.status === "paused") ||
      (input.target === "cancelled" &&
        (current.status === "scheduled" ||
          current.status === "running" ||
          current.status === "paused"));

    if (!allowed) {
      throw new BroadcastError("INVALID_TRANSITION");
    }

    await tx
      .update(broadcasts)
      .set({
        cancelledAt: input.target === "cancelled" ? now : null,
        pausedAt: input.target === "paused" ? now : null,
        status: input.target,
        updatedAt: now,
      })
      .where(eq(broadcasts.id, input.broadcastId));

    if (input.target === "cancelled") {
      await tx
        .update(broadcastRecipients)
        .set({ processedAt: now, status: "cancelled", updatedAt: now })
        .where(
          and(
            eq(broadcastRecipients.broadcastId, input.broadcastId),
            eq(broadcastRecipients.status, "pending"),
          ),
        );
    }
  });

  if (input.target === "running") {
    requestBroadcastJob({
      broadcastId: input.broadcastId,
      orgId: input.orgId,
      runAt: now,
    });
  }
}

export async function pauseBroadcast(input: {
  actorUserId: string | null;
  broadcastId: string;
  orgId: string;
}): Promise<BroadcastRecord> {
  await setBroadcastStatus({ ...input, target: "paused" });
  return getBroadcast(input);
}

export async function resumeBroadcast(
  input: {
    actorUserId: string | null;
    broadcastId: string;
    orgId: string;
  },
  dependencies: ProcessBroadcastDependencies = {},
): Promise<BroadcastRecord> {
  await setBroadcastStatus({ ...input, target: "running", now: dependencies.now });
  if (dependencies.queue) {
    await processBroadcast(input, dependencies);
  }
  return getBroadcast(input);
}

export async function cancelBroadcast(input: {
  actorUserId: string | null;
  broadcastId: string;
  orgId: string;
}): Promise<BroadcastRecord> {
  await setBroadcastStatus({ ...input, target: "cancelled" });
  return getBroadcast(input);
}
