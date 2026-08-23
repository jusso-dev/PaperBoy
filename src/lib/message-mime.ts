import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orgMembers } from "@/db/schema";
import type { AttachmentStore } from "@/lib/attachment-storage";
import {
  isOrgRole,
  requirePermission,
} from "@/lib/authorization";
import { buildSmtpMimeMessage } from "@/lib/email-delivery";
import { normalizeEmailAddress } from "@/lib/email-core";
import { getMessageDetail } from "@/lib/message-events";
import { MessageStatusError } from "@/lib/message-status-core";
import { getMessageDeliveryStatus } from "@/lib/message-statuses";
import { loadMessageAttachments } from "@/lib/stored-message-attachments";

async function requireMimeDownload(input: {
  actorUserId: string;
  orgId: string;
}): Promise<void> {
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
    throw new MessageStatusError("MEMBERSHIP_REQUIRED");
  }
  requirePermission(membership.role, "messages.downloadMime");
}

export async function buildOwnerMessageMime(input: {
  actorUserId: string;
  attachmentStore?: AttachmentStore;
  messageId: string;
  orgId: string;
}): Promise<Buffer> {
  await requireMimeDownload(input);
  const delivery = await getMessageDeliveryStatus({
    actorUserId: input.actorUserId,
    messageId: input.messageId,
    orgId: input.orgId,
  });
  const context = {
    actorUserId: input.actorUserId,
    environment: delivery.environment,
    messageId: input.messageId,
    orgId: input.orgId,
  } as const;
  const [message, attachments] = await Promise.all([
    getMessageDetail(context),
    loadMessageAttachments({
      attachmentStore: input.attachmentStore,
      messageId: input.messageId,
    }),
  ]);
  const sender = normalizeEmailAddress(message.from);
  const senderDomain = sender?.split("@").at(-1);
  if (!senderDomain) throw new Error("Stored message sender is invalid.");

  return buildSmtpMimeMessage({
    attachments: attachments.map((attachment) => ({
      content: attachment.content,
      contentType: attachment.contentType,
      filename: attachment.filename,
    })),
    date: message.lastAttemptAt ?? message.createdAt,
    from: message.from,
    headers: { "X-PaperBoy-Message-ID": message.id },
    html: message.html,
    messageId: `<${message.id}@${senderDomain}>`,
    subject: message.subject,
    text: message.text,
    to: message.to,
  });
}
