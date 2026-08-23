import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { AuthorizationError } from "@/lib/authorization";
import type { MessageEventRecord } from "@/lib/message-event-core";
import type { MessageDetailRecord } from "@/lib/message-events";
import { MessageStatusError } from "@/lib/message-status-core";

export type MessageHttpServices = {
  get: (
    principal: ApiKeyPrincipal,
    messageId: string,
  ) => Promise<MessageDetailRecord>;
  listEvents: (
    principal: ApiKeyPrincipal,
    messageId: string,
  ) => Promise<MessageEventRecord[]>;
};

type MessageHttpDependencies = {
  authenticate: (request: Request) => Promise<ApiKeyPrincipal | null>;
  services: MessageHttpServices;
};

function json(body: unknown, status: number, headers?: HeadersInit): Response {
  return Response.json(body, {
    headers: { "Cache-Control": "no-store", ...headers },
    status,
  });
}

function unauthorized(): Response {
  return json(
    {
      error: {
        code: "unauthorized",
        message: "A valid PaperBoy API key is required.",
      },
    },
    401,
    { "WWW-Authenticate": 'Bearer realm="PaperBoy"' },
  );
}

function failure(error: unknown): Response {
  if (error instanceof AuthorizationError) {
    return json(
      {
        error: {
          code: "forbidden",
          message:
            "The API key creator's current role does not allow message access.",
        },
      },
      403,
    );
  }

  if (error instanceof MessageStatusError) {
    if (error.code === "MESSAGE_NOT_FOUND") {
      return json(
        {
          error: {
            code: "email_not_found",
            message: "No email with that ID exists in this environment.",
          },
        },
        404,
      );
    }

    return json(
      {
        error: {
          code: "membership_required",
          message: "Create a new API key from a current organization member.",
        },
      },
      403,
    );
  }

  console.error("PaperBoy message read operation failed.");
  return json(
    {
      error: {
        code: "internal_error",
        message: "The message operation failed.",
      },
    },
    500,
  );
}

export function serializeMessageEvent(event: MessageEventRecord) {
  return {
    created_at: event.createdAt.toISOString(),
    data: event.data,
    id: event.id,
    message_id: event.messageId,
    type: event.type,
  };
}

export function serializeMessage(message: MessageDetailRecord) {
  const timestamp = (value: Date | null) => value?.toISOString() ?? null;

  return {
    attachments: message.attachments.map((attachment) => ({
      content_type: attachment.contentType,
      filename: attachment.filename,
      id: attachment.id,
      size: attachment.size,
    })),
    attempt_count: message.attemptCount,
    created_at: message.createdAt.toISOString(),
    delivery_mode: message.deliveryMode,
    domain_id: message.domainId,
    environment: message.environment,
    failed_at: timestamp(message.failedAt),
    failure_reason: message.failureReason,
    from: message.from,
    html: message.html,
    id: message.id,
    last_attempt_at: timestamp(message.lastAttemptAt),
    last_error_code: message.lastErrorCode,
    next_attempt_at: timestamp(message.nextAttemptAt),
    object: "email" as const,
    open_tracking_enabled: message.openTrackingEnabled,
    sent_at: timestamp(message.sentAt),
    status: message.status,
    subject: message.subject,
    tags: message.tags,
    text: message.text,
    to: message.to,
    updated_at: message.updatedAt.toISOString(),
  };
}

async function principal(
  request: Request,
  dependencies: MessageHttpDependencies,
): Promise<ApiKeyPrincipal | Response> {
  return (await dependencies.authenticate(request)) ?? unauthorized();
}

export async function handleGetMessageRequest(
  request: Request,
  messageId: string,
  dependencies: MessageHttpDependencies,
): Promise<Response> {
  const authenticated = await principal(request, dependencies);

  if (authenticated instanceof Response) {
    return authenticated;
  }

  try {
    return json(
      serializeMessage(await dependencies.services.get(authenticated, messageId)),
      200,
    );
  } catch (error) {
    return failure(error);
  }
}

export async function handleListMessageEventsRequest(
  request: Request,
  messageId: string,
  dependencies: MessageHttpDependencies,
): Promise<Response> {
  const authenticated = await principal(request, dependencies);

  if (authenticated instanceof Response) {
    return authenticated;
  }

  try {
    const events = await dependencies.services.listEvents(
      authenticated,
      messageId,
    );
    return json({ data: events.map(serializeMessageEvent) }, 200);
  } catch (error) {
    return failure(error);
  }
}
