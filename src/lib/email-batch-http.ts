import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import {
  describeEmailFailure,
  emailJson,
} from "@/lib/email-http";
import type { QueuedMessageBatchItem } from "@/lib/messages";

export const MAX_BATCH_EMAILS = 100;

type EmailBatchHttpDependencies = {
  authenticate: (request: Request) => Promise<ApiKeyPrincipal | null>;
  queueBatch: (input: {
    payloads: unknown[];
    principal: ApiKeyPrincipal;
  }) => Promise<QueuedMessageBatchItem[]>;
};

function invalidBatch(message: string) {
  return emailJson(
    {
      error: {
        code: "batch_validation_error",
        fields: [{ field: "body", message }],
        message: "Correct the batch request and try again.",
      },
    },
    422,
  );
}

export async function handleSendEmailBatchRequest(
  request: Request,
  dependencies: EmailBatchHttpDependencies,
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

  if (request.headers.has("Idempotency-Key")) {
    return emailJson(
      {
        error: {
          code: "batch_idempotency_not_supported",
          message:
            "Batch Idempotency-Key support is not available in this API version.",
        },
      },
      422,
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

  if (!Array.isArray(payload)) {
    return invalidBatch("Must be a JSON array of email objects.");
  }

  if (payload.length === 0) {
    return invalidBatch("Provide at least one email.");
  }

  if (payload.length > MAX_BATCH_EMAILS) {
    return invalidBatch(`Provide at most ${MAX_BATCH_EMAILS} emails.`);
  }

  const queued = await dependencies.queueBatch({
    payloads: payload,
    principal,
  });
  let hasFailures = false;
  let rateLimitFailures = 0;
  let retryAfterSeconds = 0;
  const data = queued.map((item) => {
    if (item.ok) {
      return { id: item.message.id };
    }

    hasFailures = true;
    const failure = describeEmailFailure(item.error);
    if (failure.status === 429) {
      rateLimitFailures += 1;
      retryAfterSeconds = Math.max(
        retryAfterSeconds,
        Number(failure.headers?.["Retry-After"] ?? 0),
      );
    }
    return { error: failure.body.error };
  });

  const allRateLimited =
    rateLimitFailures > 0 && rateLimitFailures === queued.length;
  return emailJson(
    { data },
    allRateLimited ? 429 : hasFailures ? 207 : 200,
    retryAfterSeconds > 0
      ? { "Retry-After": String(retryAfterSeconds) }
      : undefined,
  );
}
