"use server";

import { AuthorizationError, can } from "@/lib/authorization";
import {
  getMessageDetail,
  listMessageEvents,
} from "@/lib/message-events";
import { MessageStatusError } from "@/lib/message-status-core";
import { getMessageDeliveryStatus } from "@/lib/message-statuses";
import { requireOrganization } from "@/lib/session";
import { formatDateTime } from "@/lib/time";

export type MessageDrawerResult =
  | {
      error: string;
      ok: false;
    }
  | {
      canDownloadMime: boolean;
      events: {
        createdAt: string;
        id: string;
        type: string;
      }[];
      message: {
        attachments: {
          contentType: string;
          filename: string;
          id: string;
          size: number;
        }[];
        attemptCount: number;
        createdAt: string;
        deliveryMode: string;
        domainId: string | null;
        environment: string;
        failureReason: string | null;
        from: string;
        html: string | null;
        id: string;
        lastErrorCode: string | null;
        nextAttemptAt: string | null;
        sentAt: string | null;
        status: string;
        subject: string;
        tags: { name: string; value: string }[];
        text: string | null;
        to: string[];
        updatedAt: string;
      };
      ok: true;
      timeZone: string;
    };

function safeError(error: unknown): MessageDrawerResult {
  if (error instanceof AuthorizationError) {
    return { error: "Your role cannot read this message.", ok: false };
  }
  if (error instanceof MessageStatusError) {
    return {
      error:
        error.code === "MESSAGE_NOT_FOUND"
          ? "That message is no longer available in this organisation."
          : "Your organisation membership is no longer available.",
      ok: false,
    };
  }
  console.error("PaperBoy console message drawer failed.");
  return { error: "The message details could not be loaded.", ok: false };
}

export async function getMessageDrawerAction(
  messageId: string,
): Promise<MessageDrawerResult> {
  const { organization, session } = await requireOrganization();

  try {
    const delivery = await getMessageDeliveryStatus({
      actorUserId: session.user.id,
      messageId,
      orgId: organization.id,
    });
    const context = {
      actorUserId: session.user.id,
      environment: delivery.environment,
      messageId,
      orgId: organization.id,
    } as const;
    const [message, events] = await Promise.all([
      getMessageDetail(context),
      listMessageEvents(context),
    ]);
    const timestamp = (value: Date | null) =>
      value ? formatDateTime(value, session.user.timezone) : null;

    return {
      canDownloadMime: can(organization.role, "messages.downloadMime"),
      events: events.map((event) => ({
        createdAt: formatDateTime(event.createdAt, session.user.timezone),
        id: event.id,
        type: event.type,
      })),
      message: {
        attachments: message.attachments.map((attachment) => ({
          contentType: attachment.contentType,
          filename: attachment.filename,
          id: attachment.id,
          size: attachment.size,
        })),
        attemptCount: message.attemptCount,
        createdAt: formatDateTime(message.createdAt, session.user.timezone),
        deliveryMode: message.deliveryMode,
        domainId: message.domainId,
        environment: message.environment,
        failureReason: message.failureReason,
        from: message.from,
        html: message.html,
        id: message.id,
        lastErrorCode: message.lastErrorCode,
        nextAttemptAt: timestamp(message.nextAttemptAt),
        sentAt: timestamp(message.sentAt),
        status: message.status,
        subject: message.subject,
        tags: message.tags,
        text: message.text,
        to: message.to,
        updatedAt: formatDateTime(message.updatedAt, session.user.timezone),
      },
      ok: true,
      timeZone: session.user.timezone,
    };
  } catch (error) {
    return safeError(error);
  }
}
