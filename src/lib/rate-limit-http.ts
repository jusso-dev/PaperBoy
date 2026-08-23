import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { AuthorizationError } from "@/lib/authorization";
import {
  RateLimitConfigurationError,
  RateLimitSettingsError,
  type RateLimitSettings,
} from "@/lib/rate-limit-core";

export type RateLimitHttpServices = {
  get: (principal: ApiKeyPrincipal) => Promise<RateLimitSettings>;
  update: (
    principal: ApiKeyPrincipal,
    payload: unknown,
  ) => Promise<RateLimitSettings>;
};

export type RateLimitHttpDependencies = {
  authenticate: (request: Request) => Promise<ApiKeyPrincipal | null>;
  services: RateLimitHttpServices;
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

function serialize(settings: RateLimitSettings) {
  return {
    live: {
      default_limit_per_minute: settings.defaultLiveLimitPerMinute,
      limit_per_minute: settings.liveLimitPerMinute,
      override_limit_per_minute: settings.liveOverridePerMinute,
    },
    protocol_time_zone: "UTC",
    test: {
      default_limit_per_minute: settings.defaultTestLimitPerMinute,
      limit_per_minute: settings.testLimitPerMinute,
      override_limit_per_minute: settings.testOverridePerMinute,
    },
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
            "The API key creator's current role does not allow this rate-limit change.",
        },
      },
      403,
    );
  }
  if (error instanceof RateLimitSettingsError) {
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
    return json(
      {
        error: {
          code: "validation_error",
          fields: error.issues,
          message: "Correct the rate-limit settings and try again.",
        },
      },
      422,
    );
  }
  if (error instanceof RateLimitConfigurationError) {
    return json(
      {
        error: {
          code: "rate_limit_unavailable",
          message:
            "The operator must correct PaperBoy's live and test rate-limit defaults.",
        },
      },
      503,
    );
  }
  console.error("PaperBoy rate-limit settings operation failed.");
  return json(
    {
      error: {
        code: "internal_error",
        message: "The rate-limit settings operation failed.",
      },
    },
    500,
  );
}

async function principal(
  request: Request,
  dependencies: RateLimitHttpDependencies,
): Promise<ApiKeyPrincipal | Response> {
  return (await dependencies.authenticate(request)) ?? unauthorized();
}

export async function handleGetRateLimitsRequest(
  request: Request,
  dependencies: RateLimitHttpDependencies,
): Promise<Response> {
  const authenticated = await principal(request, dependencies);
  if (authenticated instanceof Response) return authenticated;
  try {
    return json(serialize(await dependencies.services.get(authenticated)), 200);
  } catch (error) {
    return failure(error);
  }
}

export async function handleUpdateRateLimitsRequest(
  request: Request,
  dependencies: RateLimitHttpDependencies,
): Promise<Response> {
  const authenticated = await principal(request, dependencies);
  if (authenticated instanceof Response) return authenticated;
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
    return json(
      serialize(await dependencies.services.update(authenticated, payload)),
      200,
    );
  } catch (error) {
    return failure(error);
  }
}
