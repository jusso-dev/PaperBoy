import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { AuthorizationError } from "@/lib/authorization";
import {
  MAX_SUPPRESSION_CSV_BYTES,
  SuppressionError,
  type SuppressionRecord,
} from "@/lib/suppression-core";
import type { SuppressionImportResult } from "@/lib/suppressions";

export type SuppressionHttpServices = {
  create: (
    principal: ApiKeyPrincipal,
    payload: unknown,
  ) => Promise<SuppressionRecord>;
  delete: (
    principal: ApiKeyPrincipal,
    suppressionId: string,
  ) => Promise<void>;
  get: (
    principal: ApiKeyPrincipal,
    suppressionId: string,
  ) => Promise<SuppressionRecord>;
  import: (
    principal: ApiKeyPrincipal,
    csv: string,
  ) => Promise<SuppressionImportResult>;
  list: (
    principal: ApiKeyPrincipal,
    filter: { limit?: unknown; query?: unknown; reason?: unknown },
  ) => Promise<SuppressionRecord[]>;
  update: (
    principal: ApiKeyPrincipal,
    suppressionId: string,
    payload: unknown,
  ) => Promise<SuppressionRecord>;
};

export type SuppressionHttpDependencies = {
  authenticate: (request: Request) => Promise<ApiKeyPrincipal | null>;
  services: SuppressionHttpServices;
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
            "The API key creator's current role does not allow this suppression operation.",
        },
      },
      403,
    );
  }

  if (error instanceof SuppressionError) {
    switch (error.code) {
      case "MEMBERSHIP_REQUIRED":
        return json(
          {
            error: {
              code: "membership_required",
              message:
                "Create a new API key from a current organization member.",
            },
          },
          403,
        );
      case "SUPPRESSION_NOT_FOUND":
        return json(
          {
            error: {
              code: "suppression_not_found",
              message:
                "No suppression with that ID exists in this organization.",
            },
          },
          404,
        );
      case "SUPPRESSION_EXISTS":
        return json(
          {
            error: {
              code: "suppression_exists",
              message:
                "That email address is already suppressed in this organization.",
            },
          },
          409,
        );
      case "CSV_TOO_LARGE":
        return json(
          {
            error: {
              code: "csv_too_large",
              message: "Suppression CSV files must not exceed 1 MiB.",
            },
          },
          413,
        );
      case "CSV_TOO_MANY_ROWS":
        return json(
          {
            error: {
              code: "csv_too_many_rows",
              message: "Suppression CSV files must not exceed 5,000 data rows.",
            },
          },
          422,
        );
      default:
        return json(
          {
            error: {
              code: "validation_error",
              fields: error.issues,
              message: "Correct the invalid suppression input and try again.",
            },
          },
          422,
        );
    }
  }

  console.error("PaperBoy suppression API operation failed.");
  return json(
    {
      error: {
        code: "internal_error",
        message: "The suppression operation failed.",
      },
    },
    500,
  );
}

function serialize(suppression: SuppressionRecord) {
  return {
    created_at: suppression.createdAt.toISOString(),
    email: suppression.email,
    id: suppression.id,
    reason: suppression.reason,
    updated_at: suppression.updatedAt.toISOString(),
  };
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

async function boundedCsv(request: Request): Promise<string> {
  const length = request.headers.get("content-length");

  if (length && /^\d+$/.test(length) && Number(length) > MAX_SUPPRESSION_CSV_BYTES) {
    throw new SuppressionError("CSV_TOO_LARGE");
  }

  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let value = "";

  try {
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      size += chunk.byteLength;

      if (size > MAX_SUPPRESSION_CSV_BYTES) {
        await reader.cancel();
        throw new SuppressionError("CSV_TOO_LARGE");
      }

      value += decoder.decode(chunk, { stream: true });
    }

    value += decoder.decode();
    return value;
  } catch (error) {
    if (error instanceof SuppressionError) throw error;
    throw new SuppressionError("VALIDATION_ERROR", [
      { field: "csv", message: "Must be valid UTF-8 text." },
    ]);
  }
}

export async function handleListSuppressionsRequest(
  request: Request,
  dependencies: SuppressionHttpDependencies,
): Promise<Response> {
  const principal = await dependencies.authenticate(request);
  if (!principal) return unauthorized();
  const query = new URL(request.url).searchParams;

  try {
    const suppressions = await dependencies.services.list(principal, {
      limit: query.get("limit") ?? undefined,
      query: query.get("query") ?? undefined,
      reason: query.get("reason") ?? undefined,
    });
    return json(
      {
        data: suppressions.map(serialize),
        protocol_time_zone: "UTC",
      },
      200,
    );
  } catch (error) {
    return failure(error);
  }
}

export async function handleCreateSuppressionRequest(
  request: Request,
  dependencies: SuppressionHttpDependencies,
): Promise<Response> {
  const principal = await dependencies.authenticate(request);
  if (!principal) return unauthorized();

  let payload: unknown;
  try {
    payload = await requestBody(request);
  } catch {
    return invalidJson();
  }

  try {
    return json(serialize(await dependencies.services.create(principal, payload)), 201);
  } catch (error) {
    return failure(error);
  }
}

export async function handleGetSuppressionRequest(
  request: Request,
  suppressionId: string,
  dependencies: SuppressionHttpDependencies,
): Promise<Response> {
  const principal = await dependencies.authenticate(request);
  if (!principal) return unauthorized();

  try {
    return json(serialize(await dependencies.services.get(principal, suppressionId)), 200);
  } catch (error) {
    return failure(error);
  }
}

export async function handleUpdateSuppressionRequest(
  request: Request,
  suppressionId: string,
  dependencies: SuppressionHttpDependencies,
): Promise<Response> {
  const principal = await dependencies.authenticate(request);
  if (!principal) return unauthorized();

  let payload: unknown;
  try {
    payload = await requestBody(request);
  } catch {
    return invalidJson();
  }

  try {
    return json(
      serialize(
        await dependencies.services.update(principal, suppressionId, payload),
      ),
      200,
    );
  } catch (error) {
    return failure(error);
  }
}

export async function handleDeleteSuppressionRequest(
  request: Request,
  suppressionId: string,
  dependencies: SuppressionHttpDependencies,
): Promise<Response> {
  const principal = await dependencies.authenticate(request);
  if (!principal) return unauthorized();

  try {
    await dependencies.services.delete(principal, suppressionId);
    return json({ deleted: true, id: suppressionId }, 200);
  } catch (error) {
    return failure(error);
  }
}

export async function handleImportSuppressionsRequest(
  request: Request,
  dependencies: SuppressionHttpDependencies,
): Promise<Response> {
  const principal = await dependencies.authenticate(request);
  if (!principal) return unauthorized();
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim();

  if (contentType !== "text/csv" && contentType !== "application/csv") {
    return json(
      {
        error: {
          code: "unsupported_media_type",
          message: "Send the CSV file as text/csv.",
        },
      },
      415,
    );
  }

  try {
    const result = await dependencies.services.import(
      principal,
      await boundedCsv(request),
    );
    return json(
      {
        created: result.created,
        imported_at: result.importedAt.toISOString(),
        input_rows: result.inputRows,
        protocol_time_zone: "UTC",
        unchanged: result.unchanged,
        unique_rows: result.uniqueRows,
        updated: result.updated,
      },
      200,
    );
  } catch (error) {
    return failure(error);
  }
}
