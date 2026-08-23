import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { AuthorizationError } from "@/lib/authorization";
import { AWS_SES_MAX_EVENT_BYTES } from "@/lib/aws-ses-adapter";
import type { LiveOutboundProvider } from "@/lib/outbound-provider-core";
import { OutboundProviderEventError } from "@/lib/outbound-provider-event-core";
import {
  type OutboundProviderEventIngestionResult,
} from "@/lib/outbound-provider-events";

type Dependencies = {
  authenticate: (request: Request) => Promise<ApiKeyPrincipal | null>;
  ingest: (
    principal: ApiKeyPrincipal,
    provider: LiveOutboundProvider,
    payload: unknown,
  ) => Promise<OutboundProviderEventIngestionResult[]>;
};

function json(data: unknown, status: number, headers?: HeadersInit): Response {
  return Response.json(data, {
    headers: { "Cache-Control": "no-store", ...headers },
    status,
  });
}

function failure(error: unknown): Response {
  if (error instanceof AuthorizationError) {
    return json(
      {
        error: {
          code: "forbidden",
          message:
            "The API key creator's current role does not allow provider-event ingestion.",
        },
      },
      403,
    );
  }
  if (error instanceof OutboundProviderEventError) {
    const status =
      error.code === "NO_MATCHING_MESSAGE"
        ? 404
        : error.code === "MEMBERSHIP_REQUIRED"
          ? 403
          : 422;
    const code =
      error.code === "NO_MATCHING_MESSAGE"
        ? "provider_event_message_not_found"
        : error.code === "MEMBERSHIP_REQUIRED"
          ? "membership_required"
          : error.code === "UNSUPPORTED_PROVIDER"
            ? "provider_event_unsupported"
            : "provider_event_invalid";
    return json(
      {
        error: {
          code,
          message:
            error.code === "NO_MATCHING_MESSAGE"
              ? "The provider event does not match one message in this organization."
              : error.code === "MEMBERSHIP_REQUIRED"
                ? "Create a new API key from a current organization member."
                : error.code === "UNSUPPORTED_PROVIDER"
                  ? "This provider does not support authenticated event ingestion."
                  : "Provide one valid, bounded outbound-provider event.",
        },
      },
      status,
    );
  }
  console.error("PaperBoy outbound-provider event ingestion failed.");
  return json(
    {
      error: {
        code: "internal_error",
        message: "The outbound-provider event could not be ingested.",
      },
    },
    500,
  );
}

async function requestPayload(request: Request): Promise<unknown | Response> {
  const contentLength = request.headers.get("content-length");
  if (
    contentLength &&
    /^\d+$/.test(contentLength) &&
    Number(contentLength) > AWS_SES_MAX_EVENT_BYTES
  ) {
    return json(
      {
        error: {
          code: "provider_event_too_large",
          message: "Provider events must not exceed 512 KiB.",
        },
      },
      413,
    );
  }
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return json(
      { error: { code: "invalid_json", message: "Provide valid JSON." } },
      400,
    );
  }
  if (!raw || Buffer.byteLength(raw, "utf8") > AWS_SES_MAX_EVENT_BYTES) {
    return json(
      {
        error: {
          code: raw ? "provider_event_too_large" : "invalid_json",
          message: raw
            ? "Provider events must not exceed 512 KiB."
            : "Provide valid JSON.",
        },
      },
      raw ? 413 : 400,
    );
  }
  try {
    return JSON.parse(raw);
  } catch {
    return json(
      { error: { code: "invalid_json", message: "Provide valid JSON." } },
      400,
    );
  }
}

export function serializeOutboundProviderEventResults(
  results: OutboundProviderEventIngestionResult[],
) {
  return {
    data: results.map((result) => ({
      created_at: result.createdAt.toISOString(),
      event_id: result.eventId,
      message_id: result.messageId,
      provider: result.provider,
      provider_event_id: result.providerEventId,
      replayed: result.replayed,
      suppression_count: result.suppressionCount,
      type: result.type,
    })),
    protocol_time_zone: "UTC" as const,
  };
}

export async function handleIngestOutboundProviderEventRequest(
  request: Request,
  provider: LiveOutboundProvider,
  dependencies: Dependencies,
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
  const payload = await requestPayload(request);
  if (payload instanceof Response) return payload;
  try {
    const results = await dependencies.ingest(principal, provider, payload);
    return json(serializeOutboundProviderEventResults(results), 202);
  } catch (error) {
    return failure(error);
  }
}
