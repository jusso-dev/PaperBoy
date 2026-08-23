import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { AttachmentStorageError } from "@/lib/attachment-storage";
import { DomainError } from "@/lib/domain-core";
import { EmailError } from "@/lib/email-core";
import type { QueuedMessageRecord } from "@/lib/messages";
import { TemplateError } from "@/lib/template-core";

export type EmailHttpDependencies = {
  authenticate: (request: Request) => Promise<ApiKeyPrincipal | null>;
  queue: (input: {
    idempotencyKey?: unknown;
    payload: unknown;
    principal: ApiKeyPrincipal;
  }) => Promise<QueuedMessageRecord>;
};

export function emailJson(
  data: unknown,
  status: number,
  headers?: HeadersInit,
) {
  return Response.json(data, {
    headers: { "Cache-Control": "no-store", ...headers },
    status,
  });
}

export function describeEmailFailure(error: unknown) {
  if (error instanceof TemplateError) {
    if (error.code === "TEMPLATE_NOT_FOUND") {
      return {
        body: {
          error: {
            code: "template_not_found",
            message: "No template with that ID exists in this organization.",
          },
        },
        status: 404,
      };
    }

    return {
      body: {
        error: {
          code: "validation_error",
          fields: error.issues,
          message: "Correct the template fields and try again.",
        },
      },
      status: 422,
    };
  }

  if (error instanceof EmailError) {
    if (error.code === "ATTACHMENTS_TOO_LARGE") {
      return {
        body: {
          error: {
            code: "attachment_size_exceeded",
            fields: [
              {
                field: "attachments",
                message: "Attachments must total at most 10 MiB.",
              },
            ],
            message: "Reduce the attachment size and try again.",
          },
        },
        status: 413,
      };
    }

    if (error.code === "IDEMPOTENCY_CONFLICT") {
      return {
        body: {
          error: {
            code: "idempotency_conflict",
            message:
              "This Idempotency-Key was already used with a different request.",
          },
        },
        status: 409,
      };
    }

    return {
      body: {
        error: {
          code: "validation_error",
          fields: error.issues,
          message: "Correct the invalid email fields and try again.",
        },
      },
      status: 422,
    };
  }

  if (error instanceof DomainError) {
    const invalid = error.code === "INVALID_DOMAIN";

    return {
      body: {
        error: {
          code: invalid ? "invalid_from_domain" : "domain_not_verified",
          message: invalid
            ? "The From address must use a valid sending domain."
            : "Verify the From domain before sending with a live API key.",
        },
      },
      status: 422,
    };
  }

  if (error instanceof AttachmentStorageError) {
    return {
      body: {
        error: {
          code: "attachment_storage_unavailable",
          message:
            "Attachment storage is unavailable. Ask the PaperBoy operator to check its private storage configuration.",
        },
      },
      status: 503,
    };
  }

  console.error("PaperBoy failed to queue an email.");

  return {
    body: {
      error: {
        code: "internal_error",
        message: "The email could not be queued.",
      },
    },
    status: 500,
  };
}

function errorResponse(error: unknown): Response {
  const failure = describeEmailFailure(error);

  return emailJson(failure.body, failure.status);
}

export async function handleSendEmailRequest(
  request: Request,
  dependencies: EmailHttpDependencies,
): Promise<Response> {
  const principal = await dependencies.authenticate(request);

  if (!principal) {
    return emailJson(
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

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return emailJson(
      {
        error: {
          code: "invalid_json",
          message: "Provide a valid JSON request body.",
        },
      },
      400,
    );
  }

  try {
    const message = await dependencies.queue({
      idempotencyKey: request.headers.get("Idempotency-Key"),
      payload,
      principal,
    });

    return emailJson({ id: message.id }, 200);
  } catch (error) {
    return errorResponse(error);
  }
}
