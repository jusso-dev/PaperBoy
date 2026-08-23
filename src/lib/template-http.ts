import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { AuthorizationError } from "@/lib/authorization";
import {
  TemplateError,
  type TemplatePreview,
  type TemplateRecord,
} from "@/lib/template-core";

export type TemplateHttpServices = {
  create: (
    principal: ApiKeyPrincipal,
    payload: unknown,
  ) => Promise<TemplateRecord>;
  delete: (
    principal: ApiKeyPrincipal,
    templateId: string,
  ) => Promise<void>;
  get: (
    principal: ApiKeyPrincipal,
    templateId: string,
  ) => Promise<TemplateRecord>;
  list: (principal: ApiKeyPrincipal) => Promise<TemplateRecord[]>;
  preview: (
    principal: ApiKeyPrincipal,
    templateId: string,
    data: unknown,
  ) => Promise<TemplatePreview>;
  update: (
    principal: ApiKeyPrincipal,
    templateId: string,
    payload: unknown,
  ) => Promise<TemplateRecord>;
};

export type TemplateHttpDependencies = {
  authenticate: (request: Request) => Promise<ApiKeyPrincipal | null>;
  services: TemplateHttpServices;
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

function failure(error: unknown): Response {
  if (error instanceof AuthorizationError) {
    return json(
      {
        error: {
          code: "forbidden",
          message:
            "The API key creator's current role does not allow this template operation.",
        },
      },
      403,
    );
  }

  if (error instanceof TemplateError) {
    if (error.code === "MEMBERSHIP_REQUIRED") {
      return json(
        {
          error: {
            code: "membership_required",
            message:
              "Create a new API key from a current organization owner or admin.",
          },
        },
        403,
      );
    }

    if (error.code === "TEMPLATE_NOT_FOUND") {
      return json(
        {
          error: {
            code: "template_not_found",
            message: "No template with that ID exists in this organization.",
          },
        },
        404,
      );
    }

    if (error.code === "TEMPLATE_EXISTS") {
      return json(
        {
          error: {
            code: "template_exists",
            message:
              "A template with that name already exists in this organization.",
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
          message: "Correct the invalid template fields and try again.",
        },
      },
      422,
    );
  }

  console.error("PaperBoy template API operation failed.");
  return json(
    {
      error: {
        code: "internal_error",
        message: "The template operation failed.",
      },
    },
    500,
  );
}

function serialize(template: TemplateRecord) {
  return {
    created_at: template.createdAt.toISOString(),
    html: template.html,
    id: template.id,
    name: template.name,
    required_variables: template.requiredVariables,
    subject: template.subject,
    text: template.text,
    updated_at: template.updatedAt.toISOString(),
  };
}

function previewData(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TemplateError("VALIDATION_ERROR", [
      { field: "body", message: "Must be a JSON object." },
    ]);
  }

  const input = payload as Record<string, unknown>;
  const unsupported = Object.keys(input).filter((field) => field !== "data");

  if (unsupported.length > 0) {
    throw new TemplateError(
      "VALIDATION_ERROR",
      unsupported.map((field) => ({
        field,
        message: "This field is not supported.",
      })),
    );
  }

  return Object.hasOwn(input, "data") ? input.data : {};
}

async function requestBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new SyntaxError("INVALID_JSON");
  }
}

function invalidJson(): Response {
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

export async function handleListTemplatesRequest(
  request: Request,
  dependencies: TemplateHttpDependencies,
): Promise<Response> {
  const principal = await dependencies.authenticate(request);

  if (!principal) {
    return unauthorized();
  }

  try {
    const templates = await dependencies.services.list(principal);
    return json({ data: templates.map(serialize) }, 200);
  } catch (error) {
    return failure(error);
  }
}

export async function handleCreateTemplateRequest(
  request: Request,
  dependencies: TemplateHttpDependencies,
): Promise<Response> {
  const principal = await dependencies.authenticate(request);

  if (!principal) {
    return unauthorized();
  }

  let payload: unknown;

  try {
    payload = await requestBody(request);
  } catch {
    return invalidJson();
  }

  try {
    const template = await dependencies.services.create(principal, payload);
    return json(serialize(template), 201);
  } catch (error) {
    return failure(error);
  }
}

export async function handleGetTemplateRequest(
  request: Request,
  templateId: string,
  dependencies: TemplateHttpDependencies,
): Promise<Response> {
  const principal = await dependencies.authenticate(request);

  if (!principal) {
    return unauthorized();
  }

  try {
    const template = await dependencies.services.get(principal, templateId);
    return json(serialize(template), 200);
  } catch (error) {
    return failure(error);
  }
}

export async function handleUpdateTemplateRequest(
  request: Request,
  templateId: string,
  dependencies: TemplateHttpDependencies,
): Promise<Response> {
  const principal = await dependencies.authenticate(request);

  if (!principal) {
    return unauthorized();
  }

  let payload: unknown;

  try {
    payload = await requestBody(request);
  } catch {
    return invalidJson();
  }

  try {
    const template = await dependencies.services.update(
      principal,
      templateId,
      payload,
    );
    return json(serialize(template), 200);
  } catch (error) {
    return failure(error);
  }
}

export async function handleDeleteTemplateRequest(
  request: Request,
  templateId: string,
  dependencies: TemplateHttpDependencies,
): Promise<Response> {
  const principal = await dependencies.authenticate(request);

  if (!principal) {
    return unauthorized();
  }

  try {
    await dependencies.services.delete(principal, templateId);
    return json({ deleted: true, id: templateId }, 200);
  } catch (error) {
    return failure(error);
  }
}

export async function handlePreviewTemplateRequest(
  request: Request,
  templateId: string,
  dependencies: TemplateHttpDependencies,
): Promise<Response> {
  const principal = await dependencies.authenticate(request);

  if (!principal) {
    return unauthorized();
  }

  let payload: unknown;

  try {
    payload = await requestBody(request);
  } catch {
    return invalidJson();
  }

  try {
    const preview = await dependencies.services.preview(
      principal,
      templateId,
      previewData(payload),
    );
    return json(
      {
        html: preview.html,
        missing_variables: preview.missingVariables,
        subject: preview.subject,
        template_id: templateId,
        text: preview.text,
      },
      200,
    );
  } catch (error) {
    return failure(error);
  }
}
