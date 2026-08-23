import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { AuthorizationError } from "@/lib/authorization";
import {
  OutboundProviderConfigurationError,
  providerConfigurationErrorMessage,
} from "@/lib/outbound-provider-configuration";
import type { LiveOutboundProvider } from "@/lib/outbound-provider-core";
import {
  OutboundProviderSettingsError,
  type OutboundProviderSettings,
} from "@/lib/outbound-providers";

export type OutboundProviderHttpServices = {
  get: (principal: ApiKeyPrincipal) => Promise<OutboundProviderSettings>;
  test: (
    principal: ApiKeyPrincipal,
    payload: unknown,
  ) => Promise<{ provider: LiveOutboundProvider; testedAt: Date }>;
  update: (
    principal: ApiKeyPrincipal,
    payload: unknown,
  ) => Promise<OutboundProviderSettings>;
};

type Dependencies = {
  authenticate: (request: Request) => Promise<ApiKeyPrincipal | null>;
  services: OutboundProviderHttpServices;
};

function json(data: unknown, status: number, headers?: HeadersInit): Response {
  return Response.json(data, {
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

export function serializeOutboundProviderSettings(
  settings: OutboundProviderSettings,
) {
  return {
    default_provider: settings.defaultProvider,
    domains: settings.domains.map((domain) => ({
      domain_id: domain.id,
      effective_provider: domain.effectiveProvider,
      name: domain.name,
      override_provider: domain.overrideProvider,
      updated_at: domain.updatedAt.toISOString(),
    })),
    protocol_time_zone: "UTC" as const,
    providers: settings.providers.map((provider) => ({
      capabilities: provider.capabilities,
      configured: provider.configured,
      credential_scope: provider.credentialScope,
      id: provider.id,
      label: provider.label,
      state: provider.state,
    })),
    updated_at: settings.updatedAt.toISOString(),
  };
}

function failure(error: unknown): Response {
  if (error instanceof AuthorizationError) {
    return json(
      {
        error: {
          code: "forbidden",
          message:
            "The API key creator's current role does not allow this outbound-provider change.",
        },
      },
      403,
    );
  }
  if (error instanceof OutboundProviderSettingsError) {
    if (error.code === "MEMBERSHIP_REQUIRED") {
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
    if (error.code === "DOMAIN_NOT_FOUND") {
      return json(
        {
          error: {
            code: "domain_not_found",
            message: "Choose a sending domain from this organization.",
          },
        },
        404,
      );
    }
    return json(
      {
        error: {
          code: "validation_error",
          fields: error.issues,
          message: "Correct the outbound-provider settings and try again.",
        },
      },
      422,
    );
  }
  if (error instanceof OutboundProviderConfigurationError) {
    return json(
      {
        error: {
          code:
            error.code === "CREDENTIALS_MISSING"
              ? "provider_credentials_missing"
              : error.code === "ADAPTER_UNAVAILABLE"
                ? "provider_adapter_unavailable"
                : error.code === "CONFIGURATION_INVALID"
                  ? "provider_configuration_invalid"
                  : "provider_connection_failed",
          message: providerConfigurationErrorMessage(error),
          provider: error.provider,
        },
      },
      422,
    );
  }
  console.error("PaperBoy outbound-provider settings operation failed.");
  return json(
    {
      error: {
        code: "internal_error",
        message: "The outbound-provider operation failed.",
      },
    },
    500,
  );
}

async function principal(
  request: Request,
  dependencies: Dependencies,
): Promise<ApiKeyPrincipal | Response> {
  return (await dependencies.authenticate(request)) ?? unauthorized();
}

async function payload(request: Request): Promise<unknown | Response> {
  try {
    return await request.json();
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
}

export async function handleGetOutboundProvidersRequest(
  request: Request,
  dependencies: Dependencies,
): Promise<Response> {
  const authenticated = await principal(request, dependencies);
  if (authenticated instanceof Response) return authenticated;
  try {
    return json(
      serializeOutboundProviderSettings(
        await dependencies.services.get(authenticated),
      ),
      200,
    );
  } catch (error) {
    return failure(error);
  }
}

export async function handleUpdateOutboundProvidersRequest(
  request: Request,
  dependencies: Dependencies,
): Promise<Response> {
  const authenticated = await principal(request, dependencies);
  if (authenticated instanceof Response) return authenticated;
  const body = await payload(request);
  if (body instanceof Response) return body;
  try {
    return json(
      serializeOutboundProviderSettings(
        await dependencies.services.update(authenticated, body),
      ),
      200,
    );
  } catch (error) {
    return failure(error);
  }
}

export async function handleTestOutboundProviderRequest(
  request: Request,
  dependencies: Dependencies,
): Promise<Response> {
  const authenticated = await principal(request, dependencies);
  if (authenticated instanceof Response) return authenticated;
  const body = await payload(request);
  if (body instanceof Response) return body;
  try {
    const result = await dependencies.services.test(authenticated, body);
    return json(
      {
        ok: true,
        protocol_time_zone: "UTC",
        provider: result.provider,
        tested_at: result.testedAt.toISOString(),
      },
      200,
    );
  } catch (error) {
    return failure(error);
  }
}
