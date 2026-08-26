import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  orgs,
  receivedEmails,
  webhookDeliveries,
  webhookEndpoints,
} from "@/db/schema";
import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { DomainError } from "@/lib/domain-core";
import { authorizeSendingDomain } from "@/lib/domains";
import { parseEmailAddressField } from "@/lib/email-core";
import { MessageStatusError } from "@/lib/message-status-core";
import {
  inboundRecipientDomains,
  parseInboundEmailInput,
} from "@/lib/inbound-core";
import { enqueuePendingWebhook } from "@/lib/job-queue";
import { isPostgresErrorCode } from "@/lib/postgres-errors";
import { receivedEmailWebhookBody } from "@/lib/webhook-core";

export type ReceivedEmailRecord = {
  bcc: string[];
  cc: string[];
  createdAt: Date;
  environment: "live" | "test";
  from: string;
  html: string | null;
  id: string;
  messageId: string | null;
  replayed: boolean;
  subject: string;
  text: string | null;
  to: string[];
};

function isUniqueViolation(error: unknown): boolean {
  return isPostgresErrorCode(error, "23505");
}

function recordFromRow(
  row: typeof receivedEmails.$inferSelect,
  replayed = false,
): ReceivedEmailRecord {
  return {
    bcc: row.bcc,
    cc: row.cc,
    createdAt: row.createdAt,
    environment: row.environment === "live" ? "live" : "test",
    from: row.from,
    html: row.html,
    id: row.id,
    messageId: row.rfc822MessageId,
    replayed,
    subject: row.subject,
    text: row.textBody,
    to: row.to,
  };
}

async function findExistingReceivedEmail(input: {
  contentSha256: string;
  orgId: string;
  rfc822MessageId: string | null;
}) {
  const [byHash] = await db
    .select()
    .from(receivedEmails)
    .where(
      and(
        eq(receivedEmails.orgId, input.orgId),
        eq(receivedEmails.contentSha256, input.contentSha256),
      ),
    )
    .limit(1);
  if (byHash) return byHash;

  if (!input.rfc822MessageId) return null;

  const [byMessageId] = await db
    .select()
    .from(receivedEmails)
    .where(
      and(
        eq(receivedEmails.orgId, input.orgId),
        eq(receivedEmails.rfc822MessageId, input.rfc822MessageId),
      ),
    )
    .limit(1);
  return byMessageId ?? null;
}

async function authorizeInboundRecipient(input: {
  environment: ApiKeyPrincipal["environment"];
  orgId: string;
  to: string[];
}) {
  const domains = inboundRecipientDomains(input.to);
  if (domains.length === 0) {
    throw new DomainError("INVALID_DOMAIN");
  }

  let lastError: unknown = new DomainError("DOMAIN_NOT_VERIFIED");
  for (const domain of domains) {
    try {
      return await authorizeSendingDomain({
        environment: input.environment,
        fromDomain: domain,
        orgId: input.orgId,
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

async function enqueueReceivedEmailWebhook(input: {
  email: ReceivedEmailRecord;
  orgId: string;
}) {
  const [endpoint] = await db
    .select({
      encryptedSecret: webhookEndpoints.encryptedSecret,
      id: webhookEndpoints.id,
      url: webhookEndpoints.url,
    })
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.orgId, input.orgId))
    .limit(1);

  if (!endpoint) return;

  const [delivery] = await db
    .insert(webhookDeliveries)
    .values({
      body: receivedEmailWebhookBody({
        createdAt: input.email.createdAt,
        environment: input.email.environment,
        from: input.email.from,
        messageId: input.email.messageId,
        receivedEmailId: input.email.id,
        subject: input.email.subject,
        to: input.email.to,
      }),
      createdAt: input.email.createdAt,
      encryptedSecret: endpoint.encryptedSecret,
      endpointId: endpoint.id,
      nextAttemptAt: input.email.createdAt,
      orgId: input.orgId,
      receivedEmailId: input.email.id,
      updatedAt: input.email.createdAt,
      url: endpoint.url,
    })
    .onConflictDoNothing()
    .returning({ id: webhookDeliveries.id });

  if (delivery) {
    void enqueuePendingWebhook(delivery.id).catch(() => {
      console.error(
        `PaperBoy could not dispatch inbound webhook ${delivery.id}; BullMQ reconciliation will retry it.`,
      );
    });
  }
}

export async function receiveInboundEmail(input: {
  payload: unknown;
  principal: ApiKeyPrincipal;
}): Promise<ReceivedEmailRecord> {
  const email = await parseInboundEmailInput(input.payload);
  const domain = await authorizeInboundRecipient({
    environment: input.principal.environment,
    orgId: input.principal.orgId,
    to: email.to,
  });

  try {
    const created = await db.transaction(async (tx) => {
      await tx
        .select({ id: orgs.id })
        .from(orgs)
        .where(eq(orgs.id, input.principal.orgId))
        .for("share");

      const [inserted] = await tx
        .insert(receivedEmails)
        .values({
          apiKeyId: input.principal.apiKeyId,
          domainId: domain.domainId,
          environment: input.principal.environment,
          from: email.from,
          html: email.html,
          orgId: input.principal.orgId,
          rfc822MessageId: email.rfc822MessageId,
          contentSha256: email.contentSha256,
          subject: email.subject,
          textBody: email.text,
          to: email.to,
          cc: email.cc,
          bcc: email.bcc,
        })
        .returning();

      if (!inserted) {
        throw new Error("Inbound email insert returned no row.");
      }

      return recordFromRow(inserted);
    });

    await enqueueReceivedEmailWebhook({
      email: created,
      orgId: input.principal.orgId,
    });
    return created;
  } catch (error) {
    if (isUniqueViolation(error)) {
      const existing = await findExistingReceivedEmail({
        contentSha256: email.contentSha256,
        orgId: input.principal.orgId,
        rfc822MessageId: email.rfc822MessageId,
      });
      if (existing) return recordFromRow(existing, true);
    }
    throw error;
  }
}

export async function getReceivedEmail(input: {
  orgId: string;
  receivedEmailId: string;
  environment: "live" | "test";
}): Promise<ReceivedEmailRecord> {
  const [row] = await db
    .select()
    .from(receivedEmails)
    .where(
      and(
        eq(receivedEmails.id, input.receivedEmailId),
        eq(receivedEmails.orgId, input.orgId),
        eq(receivedEmails.environment, input.environment),
      ),
    )
    .limit(1);

  if (!row) {
    throw new MessageStatusError("MESSAGE_NOT_FOUND");
  }

  return recordFromRow(row);
}

export function inboundEmailApiBody(record: ReceivedEmailRecord) {
  return {
    bcc: record.bcc,
    cc: record.cc,
    created_at: record.createdAt.toISOString(),
    from: parseEmailAddressField(record.from)?.address ?? record.from,
    html: record.html,
    id: record.id,
    message_id: record.messageId,
    object: "email" as const,
    subject: record.subject,
    text: record.text,
    to: record.to.map(
      (address) => parseEmailAddressField(address)?.address ?? address,
    ),
  };
}

export type { InboundEmailInput } from "@/lib/inbound-core";
