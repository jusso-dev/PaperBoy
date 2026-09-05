import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  domains,
  emailSuppressions,
  messageAttachments,
  messages,
  orgs,
} from "@/db/schema";
import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import {
  attachmentStore as configuredAttachmentStore,
  attachmentStorageKey,
  type AttachmentStore,
} from "@/lib/attachment-storage";
import {
  EmailError,
  MESSAGE_DELIVERY_MODES,
  MESSAGE_STATUSES,
  emailRequestHash,
  normalizeEmailAddress,
  normalizeIdempotencyKey,
  parseSendEmailInput,
  type MessageDeliveryMode,
  type MessageStatus,
} from "@/lib/email-core";
import { authorizeSendingDomain } from "@/lib/domains";
import type { providerVerifiedSenderDomains } from "@/lib/provider-sender-identities";
import { insertMessageEvent } from "@/lib/message-events";
import { requestMessageJob } from "@/lib/job-queue";
import {
  appendOpenTrackingPixel,
  createOpenTrackingUrl,
} from "@/lib/open-tracking-core";
import { rewriteHtmlLinksForMessage } from "@/lib/click-tracking-core";
import {
  isOutboundProvider,
  type OutboundProvider,
} from "@/lib/outbound-provider-core";
import { isPostgresErrorCode } from "@/lib/postgres-errors";
import { consumeSendRateLimit } from "@/lib/rate-limits";
import { materializeTemplateSendPayload } from "@/lib/templates";

export {
  loadMessageAttachments,
  type LoadedMessageAttachment,
} from "@/lib/stored-message-attachments";

export type QueuedMessageRecord = {
  createdAt: Date;
  deliveryMode: MessageDeliveryMode;
  domainId: string | null;
  environment: "live" | "test";
  id: string;
  provider: OutboundProvider;
  replayed: boolean;
  status: MessageStatus;
};

export type MessageQueuePrincipal = Omit<ApiKeyPrincipal, "apiKeyId"> & {
  apiKeyId: string | null;
};

export type QueuedMessageBatchItem =
  | {
      error: unknown;
      ok: false;
    }
  | {
      message: QueuedMessageRecord;
      ok: true;
    };

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

function activeIdempotencyWindow() {
  return sql`${messages.createdAt} > now() - (${IDEMPOTENCY_TTL_SECONDS} * interval '1 second')`;
}

function expiredIdempotencyWindow() {
  return sql`${messages.createdAt} <= now() - (${IDEMPOTENCY_TTL_SECONDS} * interval '1 second')`;
}

function isUniqueViolation(error: unknown): boolean {
  return isPostgresErrorCode(error, "23505");
}

function messageStatus(value: string): MessageStatus {
  return MESSAGE_STATUSES.includes(value as MessageStatus)
    ? (value as MessageStatus)
    : "queued";
}

function deliveryMode(value: string): MessageDeliveryMode {
  return MESSAGE_DELIVERY_MODES.includes(value as MessageDeliveryMode)
    ? (value as MessageDeliveryMode)
    : "test-sink";
}

function outboundProvider(value: string): OutboundProvider {
  return isOutboundProvider(value) ? value : "test-sink";
}

type RecipientSuppression = {
  email: string;
  reason: "manual" | "unsubscribed" | "bounced" | "complained";
};

function requireRecipientsNotSuppressed(
  recipients: { bcc: string[]; cc: string[]; to: string[] },
  suppressions: RecipientSuppression[],
): void {
  if (suppressions.length === 0) return;
  const reasons = new Map(
    suppressions.map((suppression) => [suppression.email, suppression.reason]),
  );
  const reasonMessage = (reason: RecipientSuppression["reason"]) =>
    reason === "bounced"
      ? "Recipient is suppressed after a permanent bounce."
      : reason === "complained"
        ? "Recipient is suppressed after a complaint."
        : reason === "unsubscribed"
          ? "Recipient unsubscribed from organization mail."
          : "Recipient is on the organization suppression list.";
  const issues = (
    [
      ["to", recipients.to],
      ["cc", recipients.cc],
      ["bcc", recipients.bcc],
    ] as const
  ).flatMap(([field, addresses]) =>
    addresses.flatMap((recipient, index) => {
      const reason = reasons.get(normalizeEmailAddress(recipient) ?? "");
      if (!reason) return [];
      return [{ field: `${field}.${index}`, message: reasonMessage(reason) }];
    }),
  );
  if (issues.length > 0) {
    throw new EmailError("RECIPIENT_SUPPRESSED", issues);
  }
}

async function findIdempotentMessage(apiKeyId: string, key: string) {
  const [message] = await db
    .select({
      createdAt: messages.createdAt,
      deliveryMode: messages.deliveryMode,
      domainId: messages.domainId,
      environment: messages.environment,
      id: messages.id,
      provider: messages.outboundProvider,
      requestHash: messages.requestHash,
      status: messages.status,
    })
    .from(messages)
    .where(
      and(
        eq(messages.apiKeyId, apiKeyId),
        eq(messages.idempotencyKey, key),
        activeIdempotencyWindow(),
      ),
    )
    .limit(1);

  return message;
}

function replayMessage(
  message: NonNullable<Awaited<ReturnType<typeof findIdempotentMessage>>>,
  requestHash: string,
): QueuedMessageRecord {
  if (message.requestHash !== requestHash) {
    throw new EmailError("IDEMPOTENCY_CONFLICT");
  }

  return {
    createdAt: message.createdAt,
    deliveryMode: deliveryMode(message.deliveryMode),
    domainId: message.domainId,
    environment: message.environment === "live" ? "live" : "test",
    id: message.id,
    provider: outboundProvider(message.provider),
    replayed: true,
    status: messageStatus(message.status),
  };
}

export async function queueEmail(input: {
  allowAttachments?: boolean;
  attachmentStore?: AttachmentStore;
  idempotencyKey?: unknown;
  payload: unknown;
  principal: MessageQueuePrincipal;
  providerEnvironment?: Readonly<Record<string, string | undefined>>;
  providerSenderDomains?: typeof providerVerifiedSenderDomains;
  rateLimitNow?: Date;
}): Promise<QueuedMessageRecord> {
  const payload = await materializeTemplateSendPayload({
    orgId: input.principal.orgId,
    payload: input.payload,
  });
  const email = parseSendEmailInput(payload, {
    allowAttachments: input.allowAttachments,
  });
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const apiKeyId = input.principal.apiKeyId;
  if (idempotencyKey && !apiKeyId) {
    throw new Error("Idempotency keys require an API-key queue principal.");
  }
  const requestHash = emailRequestHash(email);
  const normalizedRecipients = [...email.to, ...email.cc, ...email.bcc].flatMap(
    (recipient) => normalizeEmailAddress(recipient) ?? [],
  );

  if (idempotencyKey && apiKeyId) {
    const existing = await findIdempotentMessage(
      apiKeyId,
      idempotencyKey,
    );

    if (existing) {
      const replay = replayMessage(existing, requestHash);
      const suppressions = await db
        .select({
          email: emailSuppressions.email,
          reason: emailSuppressions.reason,
        })
        .from(emailSuppressions)
        .where(
          and(
            eq(emailSuppressions.orgId, input.principal.orgId),
            inArray(emailSuppressions.email, normalizedRecipients),
          ),
        );
      requireRecipientsNotSuppressed(
        { bcc: email.bcc, cc: email.cc, to: email.to },
        suppressions,
      );
      return replay;
    }
  }

  const domain = await authorizeSendingDomain(
    {
      environment: input.principal.environment,
      fromDomain: email.fromDomain,
      orgId: input.principal.orgId,
      providerEnvironment: input.providerEnvironment,
    },
    { providerSenderDomains: input.providerSenderDomains },
  );
  if (domain.provider === "aws-ses" && email.to.length !== 1) {
    throw new EmailError("VALIDATION_ERROR", [
      {
        field: "to",
        message:
          "Amazon SES messages require exactly one recipient; use a batch or broadcast for bulk delivery.",
      },
    ]);
  }

  const attachmentStore = input.attachmentStore ?? configuredAttachmentStore;
  const storedKeys: string[] = [];

  try {
    const created = await db.transaction(async (tx) => {
      if (idempotencyKey && apiKeyId) {
        await tx
          .update(messages)
          .set({
            idempotencyKey: null,
            requestHash: null,
            updatedAt: sql`${messages.updatedAt}`,
          })
          .where(
            and(
              eq(messages.apiKeyId, apiKeyId),
              eq(messages.idempotencyKey, idempotencyKey),
              expiredIdempotencyWindow(),
            ),
          );
      }

      await consumeSendRateLimit({
        environment: input.principal.environment,
        now: input.rateLimitNow,
        orgId: input.principal.orgId,
        tx,
      });
      const suppressions = await tx
        .select({
          email: emailSuppressions.email,
          reason: emailSuppressions.reason,
        })
        .from(emailSuppressions)
        .where(
          and(
            eq(emailSuppressions.orgId, input.principal.orgId),
            inArray(emailSuppressions.email, normalizedRecipients),
          ),
        );

      requireRecipientsNotSuppressed(
        { bcc: email.bcc, cc: email.cc, to: email.to },
        suppressions,
      );

      const [organization] = await tx
        .select({ openTrackingEnabled: orgs.openTrackingEnabled })
        .from(orgs)
        .where(eq(orgs.id, input.principal.orgId))
        .for("share");
      if (!organization) {
        throw new Error("Message organization is unavailable.");
      }
      let domainClickEnabled = false;
      if (domain.domainId) {
        const [domainRow] = await tx
          .select({ enabled: domains.clickTrackingEnabled })
          .from(domains)
          .where(eq(domains.id, domain.domainId))
          .limit(1);
        domainClickEnabled = domainRow?.enabled === true;
      }
      const messageId = randomUUID();
      let html = email.html;
      let clickTrackingEnabled = false;
      if (domainClickEnabled && html !== null) {
        const rewritten = rewriteHtmlLinksForMessage({ html, messageId });
        if (rewritten.rewritten > 0) {
          html = rewritten.html;
          clickTrackingEnabled = true;
        }
      }
      let openTrackingEnabled = false;
      if (organization.openTrackingEnabled && html !== null) {
        html = appendOpenTrackingPixel({
          html,
          url: createOpenTrackingUrl({ messageId }),
        });
        openTrackingEnabled = true;
      }

      const [inserted] = await tx
        .insert(messages)
        .values({
          apiKeyId,
          bcc: email.bcc,
          cc: email.cc,
          clickTrackingEnabled,
          deliveryMode: domain.mode,
          domainId: domain.domainId,
          environment: input.principal.environment,
          from: email.from,
          headers: email.headers,
          html,
          idempotencyKey,
          nextAttemptAt: email.scheduledAt ?? undefined,
          openTrackingEnabled,
          orgId: input.principal.orgId,
          outboundProvider: domain.provider,
          requestHash: idempotencyKey ? requestHash : null,
          scheduledAt: email.scheduledAt,
          subject: email.subject,
          tags: email.tags,
          textBody: email.text,
          to: email.to,
        })
        .returning({
          createdAt: messages.createdAt,
          deliveryMode: messages.deliveryMode,
          domainId: messages.domainId,
          environment: messages.environment,
          id: messages.id,
          nextAttemptAt: messages.nextAttemptAt,
          provider: messages.outboundProvider,
          status: messages.status,
        });

      if (!inserted) {
        throw new Error("Message insert returned no row.");
      }

      await insertMessageEvent(tx, {
        createdAt: inserted.createdAt,
        data: {},
        messageId: inserted.id,
        type: "queued",
      });

      if (email.scheduledAt) {
        await insertMessageEvent(tx, {
          createdAt: inserted.createdAt,
          data: { scheduled_at: email.scheduledAt.toISOString() },
          messageId: inserted.id,
          type: "scheduled",
        });
      }

      for (const [position, attachment] of email.attachments.entries()) {
        const attachmentId = randomUUID();
        const storageKey = attachmentStorageKey({
          attachmentId,
          messageId: inserted.id,
          orgId: input.principal.orgId,
        });

        await attachmentStore.put({
          content: attachment.content,
          storageKey,
        });
        storedKeys.push(storageKey);

        await tx.insert(messageAttachments).values({
          byteSize: attachment.size,
          contentId: attachment.contentId,
          contentSha256: attachment.contentSha256,
          contentType: attachment.contentType,
          filename: attachment.filename,
          id: attachmentId,
          messageId: inserted.id,
          position,
          storageKey,
        });
      }

      return inserted;
    });

    requestMessageJob({
      attemptCount: 0,
      messageId: created.id,
      runAt: created.nextAttemptAt,
    });

    return {
      createdAt: created.createdAt,
      deliveryMode: deliveryMode(created.deliveryMode),
      domainId: created.domainId,
      environment: created.environment === "live" ? "live" : "test",
      id: created.id,
      provider: outboundProvider(created.provider),
      replayed: false,
      status: messageStatus(created.status),
    };
  } catch (error) {
    await Promise.allSettled(
      storedKeys.map((storageKey) => attachmentStore.delete(storageKey)),
    );

    if (idempotencyKey && apiKeyId && isUniqueViolation(error)) {
      const existing = await findIdempotentMessage(
        apiKeyId,
        idempotencyKey,
      );

      if (existing) {
        return replayMessage(existing, requestHash);
      }
    }

    throw error;
  }
}

export async function queueEmailBatch(input: {
  payloads: unknown[];
  principal: MessageQueuePrincipal;
  providerEnvironment?: Readonly<Record<string, string | undefined>>;
  rateLimitNow?: Date;
}): Promise<QueuedMessageBatchItem[]> {
  return Promise.all(
    input.payloads.map(async (payload) => {
      try {
        return {
          message: await queueEmail({
            allowAttachments: false,
            payload,
            principal: input.principal,
            providerEnvironment: input.providerEnvironment,
            rateLimitNow: input.rateLimitNow,
          }),
          ok: true as const,
        };
      } catch (error) {
        return { error, ok: false as const };
      }
    }),
  );
}
