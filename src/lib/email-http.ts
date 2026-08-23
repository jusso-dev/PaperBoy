import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { DomainError } from "@/lib/domain-core";
import { EmailError } from "@/lib/email-core";
import type { QueuedMessageRecord } from "@/lib/messages";

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
  if (error instanceof EmailError) {
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
