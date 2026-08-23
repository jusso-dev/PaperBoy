import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { AttachmentStorageError } from "@/lib/attachment-storage";
import { DomainError } from "@/lib/domain-core";
import { EmailError, normalizeIdempotencyKey } from "@/lib/email-core";
import type { QueuedMessageRecord } from "@/lib/messages";
import { OpenTrackingConfigurationError } from "@/lib/open-tracking-core";
import {
  RateLimitConfigurationError,
  RateLimitError,
} from "@/lib/rate-limit-core";
import { TemplateError } from "@/lib/template-core";

export type EmailHttpDependencies = {
  authenticate: (request: Request) => Promise<ApiKeyPrincipal | null>;
  queue: (input: {
    idempotencyKey?: unknown;
    payload: unknown;
    principal: ApiKeyPrincipal;
  }) => Promise<QueuedMessageRecord>;
};

export type EmailFailure = {
  body: {
    error: {
      code: string;
      message: string;
      [key: string]: unknown;
    };
  };
  headers?: Record<string, string>;
  status: number;
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

export function describeEmailFailure(error: unknown): EmailFailure {
  if (error instanceof RateLimitError) {
    return {
      body: {
        error: {
          code: "rate_limit_exceeded",
          environment: error.environment,
          limit: error.limit,
          message: `This organization reached its ${error.environment} send limit. Retry after ${error.retryAfterSeconds} seconds.`,
          retry_after_seconds: error.retryAfterSeconds,
        },
      },
      headers: { "Retry-After": String(error.retryAfterSeconds) },
      status: 429,
    };
  }

  if (error instanceof RateLimitConfigurationError) {
    return {
      body: {
        error: {
          code: "rate_limit_unavailable",
          message:
            "The operator must correct PaperBoy's live and test rate-limit configuration.",
        },
      },
      status: 503,
    };
  }

  if (error instanceof OpenTrackingConfigurationError) {
    return {
      body: {
        error: {
          code: "open_tracking_unavailable",
          message:
            "The operator must configure PaperBoy's public URL and dedicated open-tracking signing key.",
        },
      },
      status: 503,
    };
  }

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

    if (error.code === "MISSING_REQUIRED_VARIABLES") {
      return {
        body: {
          error: {
            code: "missing_template_variables",
            fields: error.issues,
            message: "Provide every required template variable and try again.",
          },
        },
        status: 422,
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
    if (error.code === "RECIPIENT_SUPPRESSED") {
      return {
        body: {
          error: {
            code: "recipient_suppressed",
            fields: error.issues,
            message:
              "One or more recipients are suppressed after a bounce, complaint, or operator action.",
          },
        },
        status: 422,
      };
    }

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

  return emailJson(failure.body, failure.status, failure.headers);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sendRequestInput(request: Request, payload: unknown): {
  idempotencyKey: string | null;
  payload: unknown;
} {
  const headerKey = request.headers.has("Idempotency-Key")
    ? normalizeIdempotencyKey(request.headers.get("Idempotency-Key"))
    : null;

  if (
    !isRecord(payload) ||
    !Object.prototype.hasOwnProperty.call(payload, "idempotency_key")
  ) {
    return { idempotencyKey: headerKey, payload };
  }

  const { idempotency_key: rawBodyKey, ...emailPayload } = payload;
  const bodyKey = normalizeIdempotencyKey(rawBodyKey, "idempotency_key");

  if (!bodyKey) {
    throw new EmailError("VALIDATION_ERROR", [
      {
        field: "idempotency_key",
        message: "Use 1-256 visible ASCII characters without spaces.",
      },
    ]);
  }

  if (headerKey && headerKey !== bodyKey) {
    throw new EmailError("VALIDATION_ERROR", [
      {
        field: "idempotency_key",
        message: "Must match the Idempotency-Key header when both are provided.",
      },
    ]);
  }

  return { idempotencyKey: bodyKey, payload: emailPayload };
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
    const input = sendRequestInput(request, payload);
    const message = await dependencies.queue({
      idempotencyKey: input.idempotencyKey,
      payload: input.payload,
      principal,
    });

    return emailJson({ id: message.id }, 200);
  } catch (error) {
    return errorResponse(error);
  }
}
