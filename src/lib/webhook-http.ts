import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { AuthorizationError } from "@/lib/authorization";
import type {
  WebhookConfigurationResult,
  WebhookEndpointRecord,
} from "@/lib/webhooks";
import { WebhookError } from "@/lib/webhook-core";

export type WebhookHttpServices = {
  configure: (
    principal: ApiKeyPrincipal,
    payload: unknown,
  ) => Promise<WebhookConfigurationResult>;
  get: (principal: ApiKeyPrincipal) => Promise<WebhookEndpointRecord | null>;
};

type WebhookHttpDependencies = {
  authenticate: (request: Request) => Promise<ApiKeyPrincipal | null>;
  services: WebhookHttpServices;
};

function json(body: unknown, status: number, headers?: HeadersInit): Response {
  return Response.json(body, {
    headers: { "Cache-Control": "no-store", ...headers },
    status,
  });
}

function serialize(endpoint: WebhookEndpointRecord) {
  return {
    created_at: endpoint.createdAt.toISOString(),
    id: endpoint.id,
    updated_at: endpoint.updatedAt.toISOString(),
    url: endpoint.url,
  };
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
            "The API key creator's current role does not allow webhook configuration.",
        },
      },
      403,
    );
  }

  if (error instanceof WebhookError) {
    if (error.code === "MEMBERSHIP_REQUIRED") {
      return json(
        {
          error: {
            code: "membership_required",
            message: "Create a new API key from a current organization admin.",
          },
        },
        403,
      );
    }

    if (error.code === "INVALID_INPUT" || error.code === "INVALID_URL") {
      return json(
        {
          error: {
            code: "invalid_webhook_url",
            message:
              "Provide one HTTPS webhook URL without embedded credentials or a fragment.",
          },
        },
        422,
      );
    }

    return json(
      {
        error: {
          code: "webhook_configuration_unavailable",
          message:
            "Webhook secret encryption is unavailable. Ask the operator to check PAPERBOY_WEBHOOK_ENCRYPTION_KEY.",
        },
      },
      503,
    );
  }

  console.error("PaperBoy webhook configuration operation failed.");
  return json(
    {
      error: {
        code: "internal_error",
        message: "The webhook operation failed.",
      },
    },
    500,
  );
}

async function principal(
  request: Request,
  dependencies: WebhookHttpDependencies,
): Promise<ApiKeyPrincipal | Response> {
  return (await dependencies.authenticate(request)) ?? unauthorized();
}

export async function handleGetWebhookRequest(
  request: Request,
  dependencies: WebhookHttpDependencies,
): Promise<Response> {
  const authenticated = await principal(request, dependencies);

  if (authenticated instanceof Response) {
    return authenticated;
  }

  try {
    const endpoint = await dependencies.services.get(authenticated);
    return json({ data: endpoint ? serialize(endpoint) : null }, 200);
  } catch (error) {
    return failure(error);
  }
}

export async function handleConfigureWebhookRequest(
  request: Request,
  dependencies: WebhookHttpDependencies,
): Promise<Response> {
  const authenticated = await principal(request, dependencies);

  if (authenticated instanceof Response) {
    return authenticated;
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return json(
      {
        error: {
          code: "invalid_json",
          message: "Request body must be valid JSON.",
        },
      },
      400,
    );
  }

  try {
    const configured = await dependencies.services.configure(
      authenticated,
      payload,
    );
    return json(
      {
        data: {
          ...serialize(configured.endpoint),
          signing_secret: configured.signingSecret,
        },
      },
      200,
    );
  } catch (error) {
    return failure(error);
  }
}
