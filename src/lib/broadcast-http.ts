import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { AudienceError } from "@/lib/audience-core";
import { AuthorizationError } from "@/lib/authorization";
import {
  BroadcastError,
  type BroadcastValidationIssue,
} from "@/lib/broadcast-core";
import type { BroadcastRecord } from "@/lib/broadcasts";
import { TemplateError } from "@/lib/template-core";
import { UnsubscribeConfigurationError } from "@/lib/unsubscribe-core";

export type BroadcastHttpServices = {
  cancel: (
    principal: ApiKeyPrincipal,
    broadcastId: string,
  ) => Promise<BroadcastRecord>;
  create: (
    principal: ApiKeyPrincipal,
    payload: unknown,
  ) => Promise<BroadcastRecord>;
  get: (
    principal: ApiKeyPrincipal,
    broadcastId: string,
  ) => Promise<BroadcastRecord>;
  list: (principal: ApiKeyPrincipal) => Promise<BroadcastRecord[]>;
  pause: (
    principal: ApiKeyPrincipal,
    broadcastId: string,
  ) => Promise<BroadcastRecord>;
  resume: (
    principal: ApiKeyPrincipal,
    broadcastId: string,
  ) => Promise<BroadcastRecord>;
};

type BroadcastHttpDependencies = {
  authenticate: (request: Request) => Promise<ApiKeyPrincipal | null>;
  services: BroadcastHttpServices;
};

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    headers: { "Cache-Control": "no-store" },
    status,
  });
}

function unauthorized(): Response {
  return Response.json(
    {
      error: {
        code: "unauthorized",
        message: "A valid PaperBoy API key is required.",
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": 'Bearer realm="PaperBoy"',
      },
      status: 401,
    },
  );
}

function invalidJson(): Response {
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

function failure(error: unknown): Response {
  let code = "internal_error";
  let fields: BroadcastValidationIssue[] | undefined;
  let message = "The broadcast operation failed.";
  let status = 500;

  if (error instanceof AuthorizationError) {
    code = "forbidden";
    message = "The API key creator's current role does not allow this broadcast operation.";
    status = 403;
  } else if (error instanceof BroadcastError) {
    if (error.code === "MEMBERSHIP_REQUIRED") {
      code = "forbidden";
      message = "Create a new API key from a current organization owner or admin.";
      status = 403;
    } else if (error.code === "BROADCAST_NOT_FOUND") {
      code = "broadcast_not_found";
      message = "No broadcast with that ID exists in this organization.";
      status = 404;
    } else if (error.code === "INVALID_TRANSITION") {
      code = "invalid_broadcast_transition";
      message = "This broadcast cannot make that state transition.";
      status = 409;
    } else {
      code = "validation_error";
      fields = error.issues;
      message = "Correct the invalid broadcast fields and try again.";
      status = 422;
    }
  } else if (error instanceof TemplateError) {
    if (error.code === "TEMPLATE_NOT_FOUND") {
      code = "template_not_found";
      message = "No template with that ID exists in this organization.";
      status = 404;
    } else if (error.code === "MEMBERSHIP_REQUIRED") {
      code = "forbidden";
      message = "Create a new API key from a current organization owner or admin.";
      status = 403;
    } else {
      code = "validation_error";
      fields = error.issues;
      message = "Correct the invalid template fields and try again.";
      status = 422;
    }
  } else if (error instanceof AudienceError) {
    if (error.code === "AUDIENCE_NOT_FOUND") {
      code = "audience_not_found";
      message = "No audience with that ID exists in this organization.";
      status = 404;
    } else if (error.code === "AUDIENCE_EMPTY") {
      code = "audience_empty";
      message = "The audience has no active subscribed contacts.";
      status = 409;
    } else if (error.code === "AUDIENCE_FULL") {
      code = "audience_too_large";
      message = "The audience exceeds the 100-contact broadcast limit.";
      status = 409;
    }
  } else if (error instanceof UnsubscribeConfigurationError) {
    code = "unsubscribe_unavailable";
    message = "The operator must configure PaperBoy unsubscribe signing before sending broadcasts.";
    status = 503;
  } else {
    console.error("PaperBoy broadcast operation failed.");
  }

  return json(
    {
      error: {
        code,
        ...(fields ? { fields } : {}),
        message,
      },
    },
    status,
  );
}

export function serializeBroadcast(record: BroadcastRecord) {
  return {
    cancelled_at: record.cancelledAt?.toISOString() ?? null,
    completed_at: record.completedAt?.toISOString() ?? null,
    created_at: record.createdAt.toISOString(),
    environment: record.environment,
    from: record.from,
    id: record.id,
    name: record.name,
    paused_at: record.pausedAt?.toISOString() ?? null,
    progress: record.progress,
    source_audience_id: record.sourceAudienceId,
    source_template_id: record.sourceTemplateId,
    status: record.status,
    template_name: record.templateName,
    updated_at: record.updatedAt.toISOString(),
  };
}

async function authenticate(
  request: Request,
  dependencies: BroadcastHttpDependencies,
): Promise<ApiKeyPrincipal | Response> {
  return (await dependencies.authenticate(request)) ?? unauthorized();
}

export async function handleCreateBroadcastRequest(
  request: Request,
  dependencies: BroadcastHttpDependencies,
): Promise<Response> {
  const principal = await authenticate(request, dependencies);

  if (principal instanceof Response) {
    return principal;
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return invalidJson();
  }

  try {
    const broadcast = await dependencies.services.create(principal, payload);
    return json({ data: serializeBroadcast(broadcast) }, 201);
  } catch (error) {
    return failure(error);
  }
}

export async function handleListBroadcastsRequest(
  request: Request,
  dependencies: BroadcastHttpDependencies,
): Promise<Response> {
  const principal = await authenticate(request, dependencies);

  if (principal instanceof Response) {
    return principal;
  }

  try {
    const records = await dependencies.services.list(principal);
    return json({ data: records.map(serializeBroadcast) }, 200);
  } catch (error) {
    return failure(error);
  }
}

export async function handleGetBroadcastRequest(
  request: Request,
  broadcastId: string,
  dependencies: BroadcastHttpDependencies,
): Promise<Response> {
  const principal = await authenticate(request, dependencies);

  if (principal instanceof Response) {
    return principal;
  }

  try {
    const record = await dependencies.services.get(principal, broadcastId);
    return json({ data: serializeBroadcast(record) }, 200);
  } catch (error) {
    return failure(error);
  }
}

async function handleControlBroadcastRequest(
  request: Request,
  broadcastId: string,
  operation: "cancel" | "pause" | "resume",
  dependencies: BroadcastHttpDependencies,
): Promise<Response> {
  const principal = await authenticate(request, dependencies);

  if (principal instanceof Response) {
    return principal;
  }

  try {
    const record = await dependencies.services[operation](
      principal,
      broadcastId,
    );
    return json({ data: serializeBroadcast(record) }, 200);
  } catch (error) {
    return failure(error);
  }
}

export function handlePauseBroadcastRequest(
  request: Request,
  broadcastId: string,
  dependencies: BroadcastHttpDependencies,
) {
  return handleControlBroadcastRequest(request, broadcastId, "pause", dependencies);
}

export function handleResumeBroadcastRequest(
  request: Request,
  broadcastId: string,
  dependencies: BroadcastHttpDependencies,
) {
  return handleControlBroadcastRequest(request, broadcastId, "resume", dependencies);
}

export function handleCancelBroadcastRequest(
  request: Request,
  broadcastId: string,
  dependencies: BroadcastHttpDependencies,
) {
  return handleControlBroadcastRequest(request, broadcastId, "cancel", dependencies);
}
