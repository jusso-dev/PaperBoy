import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { messageAttachments } from "@/db/schema";
import {
  localAttachmentStore,
  verifyStoredAttachment,
  type AttachmentStore,
} from "@/lib/attachment-storage";

export type LoadedMessageAttachment = {
  content: Buffer;
  contentSha256: string;
  contentType: string;
  filename: string;
  id: string;
  position: number;
  size: number;
};

export async function loadMessageAttachments(input: {
  attachmentStore?: AttachmentStore;
  messageId: string;
}): Promise<LoadedMessageAttachment[]> {
  const attachmentStore = input.attachmentStore ?? localAttachmentStore;
  const rows = await db
    .select({
      contentSha256: messageAttachments.contentSha256,
      contentType: messageAttachments.contentType,
      filename: messageAttachments.filename,
      id: messageAttachments.id,
      position: messageAttachments.position,
      size: messageAttachments.byteSize,
      storageKey: messageAttachments.storageKey,
    })
    .from(messageAttachments)
    .where(eq(messageAttachments.messageId, input.messageId))
    .orderBy(asc(messageAttachments.position));

  return Promise.all(
    rows.map(async (row) => {
      const content = await attachmentStore.read(row.storageKey);

      verifyStoredAttachment({
        content,
        contentSha256: row.contentSha256,
        size: row.size,
      });

      return {
        content,
        contentSha256: row.contentSha256,
        contentType: row.contentType,
        filename: row.filename,
        id: row.id,
        position: row.position,
        size: row.size,
      };
    }),
  );
}
