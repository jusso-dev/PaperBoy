import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { events, messageAttachments, messages } from "@/db/schema";
import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import {
  attachmentStorageKey,
  localAttachmentStore,
  type AttachmentStore,
} from "@/lib/attachment-storage";
import {
  EmailError,
  MESSAGE_DELIVERY_MODES,
  MESSAGE_STATUSES,
  emailRequestHash,
  normalizeIdempotencyKey,
  parseSendEmailInput,
  type MessageDeliveryMode,
  type MessageStatus,
} from "@/lib/email-core";
import { authorizeSendingDomain } from "@/lib/domains";
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
  replayed: boolean;
  status: MessageStatus;
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

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  if ("code" in error && error.code === "23505") {
    return true;
  }

  return "cause" in error && isUniqueViolation(error.cause);
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

async function findIdempotentMessage(apiKeyId: string, key: string) {
  const [message] = await db
    .select({
      createdAt: messages.createdAt,
      deliveryMode: messages.deliveryMode,
      domainId: messages.domainId,
      environment: messages.environment,
      id: messages.id,
      requestHash: messages.requestHash,
      status: messages.status,
    })
    .from(messages)
    .where(
      and(
        eq(messages.apiKeyId, apiKeyId),
        eq(messages.idempotencyKey, key),
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
    replayed: true,
    status: messageStatus(message.status),
  };
}

export async function queueEmail(input: {
  allowAttachments?: boolean;
  attachmentStore?: AttachmentStore;
  idempotencyKey?: unknown;
  payload: unknown;
  principal: ApiKeyPrincipal;
}): Promise<QueuedMessageRecord> {
  const payload = await materializeTemplateSendPayload({
    orgId: input.principal.orgId,
    payload: input.payload,
  });
  const email = parseSendEmailInput(payload, {
    allowAttachments: input.allowAttachments,
  });
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const requestHash = emailRequestHash(email);

  if (idempotencyKey) {
    const existing = await findIdempotentMessage(
      input.principal.apiKeyId,
      idempotencyKey,
    );

    if (existing) {
      return replayMessage(existing, requestHash);
    }
  }

  const domain = await authorizeSendingDomain({
    environment: input.principal.environment,
    fromDomain: email.fromDomain,
    orgId: input.principal.orgId,
  });

  const attachmentStore = input.attachmentStore ?? localAttachmentStore;
  const storedKeys: string[] = [];

  try {
    const created = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(messages)
        .values({
          apiKeyId: input.principal.apiKeyId,
          deliveryMode: domain.mode,
          domainId: domain.domainId,
          environment: input.principal.environment,
          from: email.from,
          html: email.html,
          idempotencyKey,
          orgId: input.principal.orgId,
          requestHash: idempotencyKey ? requestHash : null,
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
          status: messages.status,
        });

      if (!inserted) {
        throw new Error("Message insert returned no row.");
      }

      await tx.insert(events).values({
        createdAt: inserted.createdAt,
        data: {},
        messageId: inserted.id,
        type: "queued",
      });

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

    return {
      createdAt: created.createdAt,
      deliveryMode: deliveryMode(created.deliveryMode),
      domainId: created.domainId,
      environment: created.environment === "live" ? "live" : "test",
      id: created.id,
      replayed: false,
      status: messageStatus(created.status),
    };
  } catch (error) {
    await Promise.allSettled(
      storedKeys.map((storageKey) => attachmentStore.delete(storageKey)),
    );

    if (idempotencyKey && isUniqueViolation(error)) {
      const existing = await findIdempotentMessage(
        input.principal.apiKeyId,
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
  principal: ApiKeyPrincipal;
}): Promise<QueuedMessageBatchItem[]> {
  return Promise.all(
    input.payloads.map(async (payload) => {
      try {
        return {
          message: await queueEmail({
            allowAttachments: false,
            payload,
            principal: input.principal,
          }),
          ok: true as const,
        };
      } catch (error) {
        return { error, ok: false as const };
      }
    }),
  );
}
