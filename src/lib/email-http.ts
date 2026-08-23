import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { DomainError } from "@/lib/domain-core";
import { EmailError } from "@/lib/email-core";
import type { QueuedMessageRecord } from "@/lib/messages";

type EmailHttpDependencies = {
  authenticate: (request: Request) => Promise<ApiKeyPrincipal | null>;
  queue: (input: {
    idempotencyKey?: unknown;
    payload: unknown;
    principal: ApiKeyPrincipal;
  }) => Promise<QueuedMessageRecord>;
};

function json(data: unknown, status: number, headers?: HeadersInit) {
  return Response.json(data, {
    headers: { "Cache-Control": "no-store", ...headers },
    status,
  });
}

function errorResponse(error: unknown): Response {
  if (error instanceof EmailError) {
    if (error.code === "IDEMPOTENCY_CONFLICT") {
      return json(
        {
          error: {
            code: "idempotency_conflict",
            message:
              "This Idempotency-Key was already used with a different request.",
          },
        },
        409,
      );
    }

    return json(
      {
        error: {
          code: "validation_error",
          fields: error.issues,
          message: "Correct the invalid email fields and try again.",
        },
      },
      422,
    );
  }

  if (error instanceof DomainError) {
    const invalid = error.code === "INVALID_DOMAIN";

    return json(
      {
        error: {
          code: invalid ? "invalid_from_domain" : "domain_not_verified",
          message: invalid
            ? "The From address must use a valid sending domain."
            : "Verify the From domain before sending with a live API key.",
        },
      },
      422,
    );
  }

  console.error("PaperBoy failed to queue an email.");

  return json(
    {
      error: {
        code: "internal_error",
        message: "The email could not be queued.",
      },
    },
    500,
  );
}

export async function handleSendEmailRequest(
  request: Request,
  dependencies: EmailHttpDependencies,
): Promise<Response> {
  const principal = await dependencies.authenticate(request);

  if (!principal) {
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

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return json(
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

    return json({ id: message.id }, 200);
  } catch (error) {
    return errorResponse(error);
  }
}
