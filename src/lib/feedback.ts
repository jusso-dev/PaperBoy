import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  emailSuppressions,
  feedbackIngestions,
  messages,
  orgMembers,
  orgs,
} from "@/db/schema";
import {
  isOrgRole,
  requirePermission,
} from "@/lib/authorization";
import { normalizeEmailAddress } from "@/lib/email-core";
import {
  FeedbackError,
  parseFeedbackReport,
  type FeedbackClassification,
} from "@/lib/feedback-core";
import { insertMessageEvent } from "@/lib/message-events";

export type FeedbackIngestionResult = {
  classification: FeedbackClassification;
  createdAt: Date;
  eventId: string;
  messageId: string;
  replayed: boolean;
  suppressed: boolean;
};

function addsSuppression(classification: FeedbackClassification): boolean {
  return classification === "hard_bounce" || classification === "complaint";
}

export async function ingestFeedbackReport(input: {
  actorUserId: string | null;
  now?: Date;
  orgId: string;
  raw: Buffer;
}): Promise<FeedbackIngestionResult[]> {
  if (!input.actorUserId) {
    throw new FeedbackError("MEMBERSHIP_REQUIRED");
  }

  const actorUserId = input.actorUserId;
  const [currentMembership] = await db
    .select({ role: orgMembers.role })
    .from(orgMembers)
    .where(
      and(
        eq(orgMembers.orgId, input.orgId),
        eq(orgMembers.userId, actorUserId),
      ),
    )
    .limit(1);

  if (!currentMembership || !isOrgRole(currentMembership.role)) {
    throw new FeedbackError("MEMBERSHIP_REQUIRED");
  }

  requirePermission(currentMembership.role, "feedback.ingest");
  const parsed = await parseFeedbackReport(input.raw);
  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.id, input.orgId))
      .for("update");
    const [membership] = await tx
      .select({ role: orgMembers.role })
      .from(orgMembers)
      .where(
        and(
          eq(orgMembers.orgId, input.orgId),
          eq(orgMembers.userId, actorUserId),
        ),
      )
      .limit(1);

    if (!membership || !isOrgRole(membership.role)) {
      throw new FeedbackError("MEMBERSHIP_REQUIRED");
    }

    requirePermission(membership.role, "feedback.ingest");
    const results: FeedbackIngestionResult[] = [];

    for (const outcome of parsed.outcomes) {
      const [message] = await tx
        .select({ id: messages.id, to: messages.to })
        .from(messages)
        .where(
          and(
            eq(messages.id, outcome.messageId),
            eq(messages.orgId, input.orgId),
          ),
        )
        .limit(1);

      if (
        !message ||
        !message.to.some(
          (recipient) => normalizeEmailAddress(recipient) === outcome.recipient,
        )
      ) {
        continue;
      }

      const [existing] = await tx
        .select({
          classification: feedbackIngestions.classification,
          createdAt: feedbackIngestions.createdAt,
          eventId: feedbackIngestions.eventId,
          messageId: feedbackIngestions.messageId,
        })
        .from(feedbackIngestions)
        .where(
          and(
            eq(feedbackIngestions.reportSha256, parsed.reportSha256),
            eq(feedbackIngestions.messageId, message.id),
            eq(feedbackIngestions.recipient, outcome.recipient),
            eq(feedbackIngestions.classification, outcome.classification),
          ),
        )
        .limit(1);

      if (existing) {
        results.push({
          ...existing,
          replayed: true,
          suppressed: addsSuppression(existing.classification),
        });
        continue;
      }

      const event = await insertMessageEvent(tx, {
        createdAt: now,
        data: {
          classification: outcome.classification,
          ...(outcome.status ? { status: outcome.status } : {}),
        },
        messageId: message.id,
        type: outcome.classification === "complaint" ? "complained" : "bounced",
      });

      if (addsSuppression(outcome.classification)) {
        const reason =
          outcome.classification === "complaint" ? "complained" : "bounced";
        await tx
          .insert(emailSuppressions)
          .values({
            createdAt: now,
            email: outcome.recipient,
            orgId: input.orgId,
            reason,
          })
          .onConflictDoUpdate({
            set: {
              reason: sql`case when ${emailSuppressions.reason} = 'complained' then 'complained' else ${reason} end`,
            },
            target: [emailSuppressions.orgId, emailSuppressions.email],
          });
      }

      await tx.insert(feedbackIngestions).values({
        classification: outcome.classification,
        createdAt: now,
        eventId: event.id,
        messageId: message.id,
        orgId: input.orgId,
        recipient: outcome.recipient,
        reportSha256: parsed.reportSha256,
        status: outcome.status,
      });
      results.push({
        classification: outcome.classification,
        createdAt: now,
        eventId: event.id,
        messageId: message.id,
        replayed: false,
        suppressed: addsSuppression(outcome.classification),
      });
    }

    if (results.length === 0) {
      throw new FeedbackError("NO_MATCHING_MESSAGE");
    }

    return results;
  });
}
