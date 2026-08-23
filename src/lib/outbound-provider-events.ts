import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  emailSuppressions,
  events,
  messages,
  orgMembers,
  orgs,
  providerEventIngestions,
} from "@/db/schema";
import { isOrgRole, requirePermission } from "@/lib/authorization";
import {
  AWS_SES_MAX_EVENT_BYTES,
  mapAwsSesEvent,
} from "@/lib/aws-ses-adapter";
import { normalizeEmailAddress } from "@/lib/email-core";
import { insertMessageEvent } from "@/lib/message-events";
import { OutboundProviderEventError } from "@/lib/outbound-provider-event-core";
import type {
  LiveOutboundProvider,
  OutboundProviderEvent,
} from "@/lib/outbound-provider-core";

export type OutboundProviderEventIngestionResult = {
  createdAt: Date;
  eventId: string;
  messageId: string;
  provider: LiveOutboundProvider;
  providerEventId: string;
  replayed: boolean;
  suppressionCount: number;
  type: OutboundProviderEvent["type"];
};

export { OutboundProviderEventError } from "@/lib/outbound-provider-event-core";

type IngestInput = {
  now?: Date;
  orgId: string;
  payload: unknown;
  provider: LiveOutboundProvider;
};

function serializedPayload(payload: unknown): {
  payloadSha256: string;
} {
  let encoded: string;
  try {
    encoded = JSON.stringify(payload);
  } catch {
    throw new OutboundProviderEventError("INVALID_EVENT");
  }
  if (
    !encoded ||
    Buffer.byteLength(encoded, "utf8") > AWS_SES_MAX_EVENT_BYTES
  ) {
    throw new OutboundProviderEventError("INVALID_EVENT");
  }
  return {
    payloadSha256: createHash("sha256").update(encoded).digest("hex"),
  };
}

async function requireActor(input: {
  actorUserId: string | null;
  orgId: string;
}): Promise<void> {
  if (!input.actorUserId) {
    throw new OutboundProviderEventError("MEMBERSHIP_REQUIRED");
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
    throw new OutboundProviderEventError("MEMBERSHIP_REQUIRED");
  }
  requirePermission(membership.role, "feedback.ingest");
}

function mappedEvents(input: IngestInput, receivedAt: Date) {
  if (input.provider !== "aws-ses") {
    throw new OutboundProviderEventError("UNSUPPORTED_PROVIDER");
  }
  try {
    const mapped = mapAwsSesEvent({ payload: input.payload, receivedAt });
    if (mapped.length < 1 || mapped.length > 50) {
      throw new OutboundProviderEventError("INVALID_EVENT");
    }
    return mapped;
  } catch (error) {
    if (error instanceof OutboundProviderEventError) throw error;
    throw new OutboundProviderEventError("INVALID_EVENT");
  }
}

function safeOccurredAt(occurredAt: Date, receivedAt: Date): Date {
  const delta = occurredAt.getTime() - receivedAt.getTime();
  return Number.isFinite(delta) &&
    delta <= 5 * 60 * 1000 &&
    delta >= -30 * 24 * 60 * 60 * 1000
    ? occurredAt
    : receivedAt;
}

async function ingest(input: IngestInput & { actorUserId?: string | null }) {
  const receivedAt = input.now ?? new Date();
  const { payloadSha256 } = serializedPayload(input.payload);
  const mapped = mappedEvents(input, receivedAt);

  return db.transaction(async (tx) => {
    const [organization] = await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.id, input.orgId))
      .for("update");
    if (!organization) {
      throw new OutboundProviderEventError("NO_MATCHING_MESSAGE");
    }
    if (input.actorUserId !== undefined) {
      if (!input.actorUserId) {
        throw new OutboundProviderEventError("MEMBERSHIP_REQUIRED");
      }
      const [membership] = await tx
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
        throw new OutboundProviderEventError("MEMBERSHIP_REQUIRED");
      }
      requirePermission(membership.role, "feedback.ingest");
    }

    const results: OutboundProviderEventIngestionResult[] = [];
    for (const [index, providerEvent] of mapped.entries()) {
      const providerEventId =
        providerEvent.providerEventId ?? `${payloadSha256}:${index}`;
      const [existing] = await tx
        .select({
          createdAt: providerEventIngestions.createdAt,
          eventId: providerEventIngestions.eventId,
          messageId: providerEventIngestions.messageId,
          payloadSha256: providerEventIngestions.payloadSha256,
          suppressionCount: providerEventIngestions.suppressionCount,
          type: events.type,
        })
        .from(providerEventIngestions)
        .innerJoin(events, eq(events.id, providerEventIngestions.eventId))
        .where(
          and(
            eq(providerEventIngestions.orgId, input.orgId),
            eq(providerEventIngestions.provider, input.provider),
            eq(providerEventIngestions.providerEventId, providerEventId),
          ),
        )
        .limit(1);
      if (existing) {
        if (existing.payloadSha256 !== payloadSha256) {
          throw new OutboundProviderEventError("INVALID_EVENT");
        }
        if (
          existing.type !== "bounced" &&
          existing.type !== "complained" &&
          existing.type !== "deferred" &&
          existing.type !== "delivered"
        ) {
          throw new OutboundProviderEventError("INVALID_EVENT");
        }
        results.push({
          createdAt: existing.createdAt,
          eventId: existing.eventId,
          messageId: existing.messageId,
          provider: input.provider,
          providerEventId,
          replayed: true,
          suppressionCount: existing.suppressionCount,
          type: existing.type,
        });
        continue;
      }

      const conditions = [
        eq(messages.orgId, input.orgId),
        eq(messages.outboundProvider, input.provider),
      ];
      if (providerEvent.messageId) {
        conditions.push(eq(messages.id, providerEvent.messageId));
      } else if (providerEvent.providerMessageId) {
        conditions.push(
          eq(messages.providerMessageId, providerEvent.providerMessageId),
        );
      } else {
        throw new OutboundProviderEventError("NO_MATCHING_MESSAGE");
      }
      const candidates = await tx
        .select({
          id: messages.id,
          providerMessageId: messages.providerMessageId,
          to: messages.to,
        })
        .from(messages)
        .where(and(...conditions))
        .limit(2);
      if (
        candidates.length !== 1 ||
        !providerEvent.providerMessageId ||
        candidates[0].providerMessageId !== providerEvent.providerMessageId
      ) {
        throw new OutboundProviderEventError("NO_MATCHING_MESSAGE");
      }
      const message = candidates[0];
      const recipientSet = new Set(
        message.to.flatMap((recipient) => normalizeEmailAddress(recipient) ?? []),
      );
      const suppressions = (providerEvent.suppressions ?? []).filter(
        (suppression, suppressionIndex, all) =>
          recipientSet.has(suppression.email) &&
          all.findIndex(
            (candidate) => candidate.email === suppression.email,
          ) === suppressionIndex,
      );
      const occurredAt = safeOccurredAt(providerEvent.occurredAt, receivedAt);
      const event = await insertMessageEvent(tx, {
        createdAt: occurredAt,
        data: {
          ...providerEvent.data,
          suppression_count: suppressions.length,
        },
        messageId: message.id,
        type: providerEvent.type,
      });

      for (const suppression of suppressions) {
        await tx
          .insert(emailSuppressions)
          .values({
            createdAt: occurredAt,
            email: suppression.email,
            orgId: input.orgId,
            reason: suppression.reason,
          })
          .onConflictDoUpdate({
            set: {
              reason: sql`case when ${emailSuppressions.reason} = 'complained' then 'complained' else ${suppression.reason} end`,
              updatedAt: occurredAt,
            },
            target: [emailSuppressions.orgId, emailSuppressions.email],
          });
      }

      await tx.insert(providerEventIngestions).values({
        createdAt: receivedAt,
        eventId: event.id,
        messageId: message.id,
        orgId: input.orgId,
        payloadSha256,
        provider: input.provider,
        providerEventId,
        suppressionCount: suppressions.length,
      });
      results.push({
        createdAt: receivedAt,
        eventId: event.id,
        messageId: message.id,
        provider: input.provider,
        providerEventId,
        replayed: false,
        suppressionCount: suppressions.length,
        type: providerEvent.type,
      });
    }
    return results;
  });
}

export async function ingestOutboundProviderEvent(
  input: IngestInput & { actorUserId: string | null },
): Promise<OutboundProviderEventIngestionResult[]> {
  await requireActor(input);
  return ingest(input);
}

export function ingestVerifiedOutboundProviderEvent(
  input: IngestInput,
): Promise<OutboundProviderEventIngestionResult[]> {
  return ingest(input);
}
