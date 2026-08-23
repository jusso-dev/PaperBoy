import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  events,
  messageAttachments,
  messages,
  orgs,
  webhookDeliveries,
  webhookEndpoints,
} from "@/db/schema";
import {
  requireMessageEventAllowed,
  type MessageEventRecord,
  type MessageEventType,
} from "@/lib/message-event-core";
import {
  getMessageDeliveryStatus,
  type MessageDeliveryStatusRecord,
} from "@/lib/message-statuses";
import { MessageStatusError } from "@/lib/message-status-core";
import { webhookEventBody } from "@/lib/webhook-core";

export type MessageAttachmentMetadata = {
  contentType: string;
  filename: string;
  id: string;
  position: number;
  size: number;
};

export type MessageDetailRecord = MessageDeliveryStatusRecord & {
  attachments: MessageAttachmentMetadata[];
  from: string;
  html: string | null;
  openTrackingEnabled: boolean;
  subject: string;
  tags: { name: string; value: string }[];
  text: string | null;
  to: string[];
};

type MessageReadContext = {
  actorUserId: string | null;
  environment: "live" | "test";
  messageId: string;
  orgId: string;
};

function eventFromRow(row: typeof events.$inferSelect): MessageEventRecord {
  return {
    createdAt: row.createdAt,
    data: row.data,
    id: row.id,
    messageId: row.messageId,
    sequence: row.sequence,
    type: row.type,
  };
}

type MessageEventTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export async function insertMessageEvent(
  tx: MessageEventTransaction,
  input: {
    createdAt?: Date;
    data?: Record<string, unknown>;
    messageId: string;
    type: MessageEventType;
  },
): Promise<MessageEventRecord> {
  const [row] = await tx
    .insert(events)
    .values({
      createdAt: input.createdAt,
      data: input.data ?? {},
      messageId: input.messageId,
      type: input.type,
    })
    .returning();

  if (!row) {
    throw new Error("Message event insert returned no row.");
  }

  const event = eventFromRow(row);
  const [message] = await tx
    .select({
      environment: messages.environment,
      orgId: messages.orgId,
    })
    .from(messages)
    .where(eq(messages.id, input.messageId))
    .limit(1);

  if (message) {
    await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.id, message.orgId))
      .for("share");
    const [endpoint] = await tx
      .select({
        encryptedSecret: webhookEndpoints.encryptedSecret,
        id: webhookEndpoints.id,
        url: webhookEndpoints.url,
      })
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.orgId, message.orgId))
      .limit(1);

    if (!endpoint) {
      return event;
    }

    await tx.insert(webhookDeliveries).values({
      body: webhookEventBody({
        createdAt: event.createdAt,
        environment: message.environment === "live" ? "live" : "test",
        messageId: event.messageId,
        type: event.type,
      }),
      createdAt: event.createdAt,
      encryptedSecret: endpoint.encryptedSecret,
      endpointId: endpoint.id,
      eventId: event.id,
      nextAttemptAt: event.createdAt,
      orgId: message.orgId,
      updatedAt: event.createdAt,
      url: endpoint.url,
    });
  }

  return event;
}

export async function getMessageDetail(
  input: MessageReadContext,
): Promise<MessageDetailRecord> {
  const delivery = await getMessageDeliveryStatus(input);
  const [rows, attachments] = await Promise.all([
    db
      .select({
        from: messages.from,
        html: messages.html,
        openTrackingEnabled: messages.openTrackingEnabled,
        subject: messages.subject,
        tags: messages.tags,
        text: messages.textBody,
        to: messages.to,
      })
      .from(messages)
      .where(
        and(
          eq(messages.id, input.messageId),
          eq(messages.orgId, input.orgId),
          eq(messages.environment, input.environment),
        ),
      )
      .limit(1),
    db
      .select({
        contentType: messageAttachments.contentType,
        filename: messageAttachments.filename,
        id: messageAttachments.id,
        position: messageAttachments.position,
        size: messageAttachments.byteSize,
      })
      .from(messageAttachments)
      .where(eq(messageAttachments.messageId, input.messageId))
      .orderBy(asc(messageAttachments.position)),
  ]);
  const [message] = rows;

  if (!message) {
    throw new MessageStatusError("MESSAGE_NOT_FOUND");
  }

  return { ...delivery, ...message, attachments };
}

export async function listMessageEvents(
  input: MessageReadContext,
): Promise<MessageEventRecord[]> {
  await getMessageDeliveryStatus(input);

  const rows = await db
    .select()
    .from(events)
    .where(eq(events.messageId, input.messageId))
    .orderBy(asc(events.createdAt), asc(events.sequence));

  return rows.map(eventFromRow);
}

export async function recordMessageEvent(input: {
  createdAt?: Date;
  data?: Record<string, unknown>;
  messageId: string;
  type: MessageEventType;
}): Promise<MessageEventRecord> {
  return db.transaction(async (tx) => {
    const [message] = await tx
      .select({ openTrackingEnabled: messages.openTrackingEnabled })
      .from(messages)
      .where(eq(messages.id, input.messageId))
      .limit(1)
      .for("update");

    if (!message) {
      throw new MessageStatusError("MESSAGE_NOT_FOUND");
    }

    requireMessageEventAllowed({
      openTrackingEnabled: message.openTrackingEnabled,
      type: input.type,
    });

    if (input.type === "opened") {
      const [existing] = await tx
        .select()
        .from(events)
        .where(
          and(
            eq(events.messageId, input.messageId),
            eq(events.type, "opened"),
          ),
        )
        .limit(1);
      if (existing) return eventFromRow(existing);
    }

    return insertMessageEvent(tx, input);
  });
}
