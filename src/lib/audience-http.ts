import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import {
  AudienceError,
  MAX_CONTACT_CSV_BYTES,
  type AudienceRecord,
  type ContactRecord,
} from "@/lib/audience-core";
import { AuthorizationError } from "@/lib/authorization";
import type { ContactImportResult } from "@/lib/audiences";

export type AudienceHttpServices = {
  createAudience: (principal: ApiKeyPrincipal, payload: unknown) => Promise<AudienceRecord>;
  createContact: (principal: ApiKeyPrincipal, audienceId: string, payload: unknown) => Promise<ContactRecord>;
  deleteAudience: (principal: ApiKeyPrincipal, audienceId: string) => Promise<void>;
  deleteContact: (principal: ApiKeyPrincipal, audienceId: string, contactId: string) => Promise<void>;
  getAudience: (principal: ApiKeyPrincipal, audienceId: string) => Promise<AudienceRecord>;
  getContact: (principal: ApiKeyPrincipal, audienceId: string, contactId: string) => Promise<ContactRecord>;
  importContacts: (principal: ApiKeyPrincipal, audienceId: string, csv: string) => Promise<ContactImportResult>;
  listAudiences: (principal: ApiKeyPrincipal) => Promise<AudienceRecord[]>;
  listContacts: (principal: ApiKeyPrincipal, audienceId: string) => Promise<ContactRecord[]>;
  updateAudience: (principal: ApiKeyPrincipal, audienceId: string, payload: unknown) => Promise<AudienceRecord>;
  updateContact: (principal: ApiKeyPrincipal, audienceId: string, contactId: string, payload: unknown) => Promise<ContactRecord>;
};

export type AudienceHttpDependencies = {
  authenticate: (request: Request) => Promise<ApiKeyPrincipal | null>;
  services: AudienceHttpServices;
};

function json(data: unknown, status: number, headers?: HeadersInit): Response {
  return Response.json(data, {
    headers: { "Cache-Control": "no-store", ...headers },
    status,
  });
}

function unauthorized(): Response {
  return json(
    { error: { code: "unauthorized", message: "A valid PaperBoy API key is required." } },
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
          message: "The API key creator's current role does not allow this audience operation.",
        },
      },
      403,
    );
  }

  if (error instanceof AudienceError) {
    const responses: Partial<Record<typeof error.code, [string, string, number]>> = {
      AUDIENCE_EMPTY: ["audience_empty", "The audience has no active subscribed contacts.", 409],
      AUDIENCE_EXISTS: ["audience_exists", "An audience with that name already exists in this organization.", 409],
      AUDIENCE_NOT_FOUND: ["audience_not_found", "No audience with that ID exists in this organization.", 404],
      CONTACT_EXISTS: ["contact_exists", "That email address already belongs to this audience.", 409],
      CONTACT_NOT_FOUND: ["contact_not_found", "No contact with that ID exists in this audience.", 404],
      CSV_TOO_LARGE: ["csv_too_large", "Contact CSV files must not exceed 1 MiB.", 413],
      MEMBERSHIP_REQUIRED: ["membership_required", "Create a new API key from a current organization member.", 403],
    };
    const response = responses[error.code];
    if (response) {
      return json(
        { error: { code: response[0], message: response[1] } },
        response[2],
      );
    }
    return json(
      {
        error: {
          code: "validation_error",
          fields: error.issues,
          message: "Correct the invalid audience or contact input and try again.",
        },
      },
      422,
    );
  }

  console.error("PaperBoy audience API operation failed.");
  return json(
    { error: { code: "internal_error", message: "The audience operation failed." } },
    500,
  );
}

function serializeAudience(record: AudienceRecord) {
  return {
    active_contact_count: record.activeContactCount,
    contact_count: record.contactCount,
    created_at: record.createdAt.toISOString(),
    id: record.id,
    name: record.name,
    updated_at: record.updatedAt.toISOString(),
  };
}

function serializeContact(record: ContactRecord) {
  return {
    audience_id: record.audienceId,
    created_at: record.createdAt.toISOString(),
    email: record.email,
    id: record.id,
    name: record.name,
    unsubscribed_at: record.unsubscribedAt?.toISOString() ?? null,
    updated_at: record.updatedAt.toISOString(),
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
    { error: { code: "invalid_json", message: "Provide a valid JSON request body." } },
    400,
  );
}

async function boundedCsv(request: Request): Promise<string> {
  const length = request.headers.get("content-length");
  if (length && /^\d+$/.test(length) && Number(length) > MAX_CONTACT_CSV_BYTES) {
    throw new AudienceError("CSV_TOO_LARGE");
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let value = "";
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > MAX_CONTACT_CSV_BYTES) {
        await reader.cancel();
        throw new AudienceError("CSV_TOO_LARGE");
      }
      value += decoder.decode(result.value, { stream: true });
    }
    return value + decoder.decode();
  } catch (error) {
    if (error instanceof AudienceError) throw error;
    throw new AudienceError("VALIDATION_ERROR", [
      { field: "csv", message: "Must be valid UTF-8 text." },
    ]);
  }
}

async function authenticated(
  request: Request,
  dependencies: AudienceHttpDependencies,
): Promise<ApiKeyPrincipal | Response> {
  return (await dependencies.authenticate(request)) ?? unauthorized();
}

export async function handleListAudiencesRequest(request: Request, dependencies: AudienceHttpDependencies) {
  const principal = await authenticated(request, dependencies);
  if (principal instanceof Response) return principal;
  try {
    const records = await dependencies.services.listAudiences(principal);
    return json({ data: records.map(serializeAudience), protocol_time_zone: "UTC" }, 200);
  } catch (error) {
    return failure(error);
  }
}

export async function handleCreateAudienceRequest(request: Request, dependencies: AudienceHttpDependencies) {
  const principal = await authenticated(request, dependencies);
  if (principal instanceof Response) return principal;
  let payload: unknown;
  try { payload = await requestBody(request); } catch { return invalidJson(); }
  try {
    return json(serializeAudience(await dependencies.services.createAudience(principal, payload)), 201);
  } catch (error) { return failure(error); }
}

export async function handleGetAudienceRequest(request: Request, audienceId: string, dependencies: AudienceHttpDependencies) {
  const principal = await authenticated(request, dependencies);
  if (principal instanceof Response) return principal;
  try {
    return json(serializeAudience(await dependencies.services.getAudience(principal, audienceId)), 200);
  } catch (error) { return failure(error); }
}

export async function handleUpdateAudienceRequest(request: Request, audienceId: string, dependencies: AudienceHttpDependencies) {
  const principal = await authenticated(request, dependencies);
  if (principal instanceof Response) return principal;
  let payload: unknown;
  try { payload = await requestBody(request); } catch { return invalidJson(); }
  try {
    return json(serializeAudience(await dependencies.services.updateAudience(principal, audienceId, payload)), 200);
  } catch (error) { return failure(error); }
}

export async function handleDeleteAudienceRequest(request: Request, audienceId: string, dependencies: AudienceHttpDependencies) {
  const principal = await authenticated(request, dependencies);
  if (principal instanceof Response) return principal;
  try {
    await dependencies.services.deleteAudience(principal, audienceId);
    return json({ deleted: true, id: audienceId }, 200);
  } catch (error) { return failure(error); }
}

export async function handleListContactsRequest(request: Request, audienceId: string, dependencies: AudienceHttpDependencies) {
  const principal = await authenticated(request, dependencies);
  if (principal instanceof Response) return principal;
  try {
    const records = await dependencies.services.listContacts(principal, audienceId);
    return json({ data: records.map(serializeContact), protocol_time_zone: "UTC" }, 200);
  } catch (error) { return failure(error); }
}

export async function handleCreateContactRequest(request: Request, audienceId: string, dependencies: AudienceHttpDependencies) {
  const principal = await authenticated(request, dependencies);
  if (principal instanceof Response) return principal;
  let payload: unknown;
  try { payload = await requestBody(request); } catch { return invalidJson(); }
  try {
    return json(serializeContact(await dependencies.services.createContact(principal, audienceId, payload)), 201);
  } catch (error) { return failure(error); }
}

export async function handleGetContactRequest(request: Request, audienceId: string, contactId: string, dependencies: AudienceHttpDependencies) {
  const principal = await authenticated(request, dependencies);
  if (principal instanceof Response) return principal;
  try {
    return json(serializeContact(await dependencies.services.getContact(principal, audienceId, contactId)), 200);
  } catch (error) { return failure(error); }
}

export async function handleUpdateContactRequest(request: Request, audienceId: string, contactId: string, dependencies: AudienceHttpDependencies) {
  const principal = await authenticated(request, dependencies);
  if (principal instanceof Response) return principal;
  let payload: unknown;
  try { payload = await requestBody(request); } catch { return invalidJson(); }
  try {
    return json(serializeContact(await dependencies.services.updateContact(principal, audienceId, contactId, payload)), 200);
  } catch (error) { return failure(error); }
}

export async function handleDeleteContactRequest(request: Request, audienceId: string, contactId: string, dependencies: AudienceHttpDependencies) {
  const principal = await authenticated(request, dependencies);
  if (principal instanceof Response) return principal;
  try {
    await dependencies.services.deleteContact(principal, audienceId, contactId);
    return json({ deleted: true, id: contactId }, 200);
  } catch (error) { return failure(error); }
}

export async function handleImportContactsRequest(request: Request, audienceId: string, dependencies: AudienceHttpDependencies) {
  const principal = await authenticated(request, dependencies);
  if (principal instanceof Response) return principal;
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim();
  if (contentType !== "text/csv" && contentType !== "application/csv") {
    return json(
      { error: { code: "unsupported_media_type", message: "Send the CSV file as text/csv." } },
      415,
    );
  }
  try {
    const result = await dependencies.services.importContacts(principal, audienceId, await boundedCsv(request));
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
  } catch (error) { return failure(error); }
}
