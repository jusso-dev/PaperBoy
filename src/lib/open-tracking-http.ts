import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { AuthorizationError } from "@/lib/authorization";
import {
  OpenTrackingConfigurationError,
  OpenTrackingSettingsError,
  type OpenTrackingSettings,
} from "@/lib/open-tracking-core";

const TRANSPARENT_GIF = Uint8Array.from(
  Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64"),
);

export type OpenTrackingHttpServices = {
  get: (principal: ApiKeyPrincipal) => Promise<OpenTrackingSettings>;
  update: (
    principal: ApiKeyPrincipal,
    payload: unknown,
  ) => Promise<OpenTrackingSettings>;
};

export type OpenTrackingHttpDependencies = {
  authenticate: (request: Request) => Promise<ApiKeyPrincipal | null>;
  services: OpenTrackingHttpServices;
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

function serialize(settings: OpenTrackingSettings) {
  return {
    enabled: settings.enabled,
    protocol_time_zone: "UTC",
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
            "The API key creator's current role does not allow this open-tracking change.",
        },
      },
      403,
    );
  }
  if (error instanceof OpenTrackingSettingsError) {
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
          message: "Correct the open-tracking setting and try again.",
        },
      },
      422,
    );
  }
  if (error instanceof OpenTrackingConfigurationError) {
    return json(
      {
        error: {
          code: "open_tracking_unavailable",
          message:
            "The operator must configure PaperBoy's public URL and dedicated open-tracking signing key.",
        },
      },
      503,
    );
  }
  console.error("PaperBoy open-tracking settings operation failed.");
  return json(
    {
      error: {
        code: "internal_error",
        message: "The open-tracking settings operation failed.",
      },
    },
    500,
  );
}

async function principal(
  request: Request,
  dependencies: OpenTrackingHttpDependencies,
): Promise<ApiKeyPrincipal | Response> {
  return (await dependencies.authenticate(request)) ?? unauthorized();
}

export async function handleGetOpenTrackingRequest(
  request: Request,
  dependencies: OpenTrackingHttpDependencies,
): Promise<Response> {
  const authenticated = await principal(request, dependencies);
  if (authenticated instanceof Response) return authenticated;
  try {
    return json(serialize(await dependencies.services.get(authenticated)), 200);
  } catch (error) {
    return failure(error);
  }
}

export async function handleUpdateOpenTrackingRequest(
  request: Request,
  dependencies: OpenTrackingHttpDependencies,
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

export async function handleOpenTrackingPixelRequest(
  input: { messageId: string; signature: string },
  dependencies: {
    record: (input: {
      messageId: string;
      signature: string;
    }) => Promise<boolean>;
  },
): Promise<Response> {
  try {
    await dependencies.record(input);
  } catch {
    console.error("PaperBoy could not record an open-tracking pixel request.");
  }
  return new Response(TRANSPARENT_GIF, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Content-Type": "image/gif",
      "Cross-Origin-Resource-Policy": "cross-origin",
      Expires: "0",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
    status: 200,
  });
}
