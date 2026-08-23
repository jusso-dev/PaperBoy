import { AttachmentStorageError } from "@/lib/attachment-storage";
import { AuthorizationError } from "@/lib/authorization";
import { buildOwnerMessageMime } from "@/lib/message-mime";
import { MessageStatusError } from "@/lib/message-status-core";
import { requireOrganization } from "@/lib/session";

function failure(message: string, status: number): Response {
  return new Response(message, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
    status,
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ messageId: string }> },
) {
  const { organization, session } = await requireOrganization();
  const { messageId } = await context.params;

  try {
    const content = await buildOwnerMessageMime({
      actorUserId: session.user.id,
      messageId,
      orgId: organization.id,
    });
    return new Response(new Uint8Array(content), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="paperboy-${messageId}.eml"`,
        "Content-Type": "message/rfc822",
        "X-Content-Type-Options": "nosniff",
      },
      status: 200,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return failure("Only organization owners can download MIME.", 403);
    }
    if (error instanceof MessageStatusError) {
      return failure(
        error.code === "MESSAGE_NOT_FOUND"
          ? "Message not found."
          : "Organization membership required.",
        error.code === "MESSAGE_NOT_FOUND" ? 404 : 403,
      );
    }
    if (error instanceof AttachmentStorageError) {
      return failure("Stored attachments are unavailable.", 503);
    }
    console.error("PaperBoy MIME download failed.");
    return failure("MIME download failed.", 500);
  }
}
