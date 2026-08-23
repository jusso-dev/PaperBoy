import { normalizeEmailAddress } from "@/lib/email-core";

export const MAX_AUDIENCE_NAME_LENGTH = 120;
export const MAX_CONTACT_NAME_LENGTH = 200;
export const MAX_AUDIENCE_CONTACTS = 100;
export const MAX_CONTACT_CSV_BYTES = 1024 * 1024;

export type AudienceValidationIssue = {
  field: string;
  message: string;
};

export type AudienceErrorCode =
  | "AUDIENCE_EMPTY"
  | "AUDIENCE_EXISTS"
  | "AUDIENCE_FULL"
  | "AUDIENCE_NOT_FOUND"
  | "CONTACT_EXISTS"
  | "CONTACT_NOT_FOUND"
  | "CSV_TOO_LARGE"
  | "CSV_TOO_MANY_ROWS"
  | "MEMBERSHIP_REQUIRED"
  | "VALIDATION_ERROR";

export class AudienceError extends Error {
  constructor(
    readonly code: AudienceErrorCode,
    readonly issues: AudienceValidationIssue[] = [],
  ) {
    super(code);
    this.name = "AudienceError";
  }
}

export type AudienceRecord = {
  activeContactCount: number;
  contactCount: number;
  createdAt: Date;
  id: string;
  name: string;
  updatedAt: Date;
};

export type ContactRecord = {
  audienceId: string;
  createdAt: Date;
  email: string;
  id: string;
  name: string | null;
  unsubscribedAt: Date | null;
  updatedAt: Date;
};

export type ContactCsvRow = {
  email: string;
  name: string | null;
};

export type ContactCsvImport = {
  inputRows: number;
  rows: ContactCsvRow[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function unsupportedFields(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): AudienceValidationIssue[] {
  return Object.keys(value)
    .filter((field) => !allowed.has(field))
    .map((field) => ({ field, message: "This field is not supported." }));
}

function audienceName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name.length > 0 &&
    name.length <= MAX_AUDIENCE_NAME_LENGTH &&
    !/[\u0000-\u001f\u007f]/.test(name)
    ? name
    : null;
}

function contactEmail(value: unknown): string | null {
  if (typeof value !== "string" || /[<>\r\n]/.test(value)) return null;
  return normalizeEmailAddress(value.trim());
}

function contactName(value: unknown): string | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const name = value.trim();
  if (!name) return null;
  return name.length <= MAX_CONTACT_NAME_LENGTH &&
    !/[\u0000-\u001f\u007f]/.test(name)
    ? name
    : undefined;
}

export function parseCreateAudienceInput(value: unknown): { name: string } {
  if (!isRecord(value)) {
    throw new AudienceError("VALIDATION_ERROR", [
      { field: "body", message: "Must be a JSON object." },
    ]);
  }

  const issues = unsupportedFields(value, new Set(["name"]));
  const name = audienceName(value.name);
  if (!name) {
    issues.push({
      field: "name",
      message: `Enter a name of at most ${MAX_AUDIENCE_NAME_LENGTH} characters without control characters.`,
    });
  }
  if (issues.length > 0 || !name) {
    throw new AudienceError("VALIDATION_ERROR", issues);
  }
  return { name };
}

export const parseUpdateAudienceInput = parseCreateAudienceInput;

export function parseCreateContactInput(value: unknown): {
  email: string;
  name: string | null;
} {
  if (!isRecord(value)) {
    throw new AudienceError("VALIDATION_ERROR", [
      { field: "body", message: "Must be a JSON object." },
    ]);
  }

  const issues = unsupportedFields(value, new Set(["email", "name"]));
  const email = contactEmail(value.email);
  const name = value.name === undefined ? null : contactName(value.name);
  if (!email) {
    issues.push({ field: "email", message: "Must be one plain email address." });
  }
  if (name === undefined) {
    issues.push({
      field: "name",
      message: `Must not exceed ${MAX_CONTACT_NAME_LENGTH} characters or contain control characters.`,
    });
  }
  if (issues.length > 0 || !email || name === undefined) {
    throw new AudienceError("VALIDATION_ERROR", issues);
  }
  return { email, name };
}

export function parseUpdateContactInput(value: unknown): {
  email?: string;
  name?: string | null;
} {
  if (!isRecord(value)) {
    throw new AudienceError("VALIDATION_ERROR", [
      { field: "body", message: "Must be a JSON object." },
    ]);
  }

  const issues = unsupportedFields(value, new Set(["email", "name"]));
  const result: { email?: string; name?: string | null } = {};

  if (Object.hasOwn(value, "email")) {
    const email = contactEmail(value.email);
    if (email) result.email = email;
    else issues.push({ field: "email", message: "Must be one plain email address." });
  }

  if (Object.hasOwn(value, "name")) {
    const name = contactName(value.name);
    if (name !== undefined) result.name = name;
    else {
      issues.push({
        field: "name",
        message: `Must not exceed ${MAX_CONTACT_NAME_LENGTH} characters or contain control characters.`,
      });
    }
  }

  if (result.email === undefined && result.name === undefined) {
    issues.push({ field: "body", message: "Provide email or name to update." });
  }
  if (issues.length > 0) throw new AudienceError("VALIDATION_ERROR", issues);
  return result;
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let afterQuote = false;

  const finishField = () => {
    row.push(field);
    field = "";
    afterQuote = false;
  };
  const finishRow = () => {
    finishField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"') {
        if (csv[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else field += character;
      continue;
    }

    if (character === '"') {
      if (field.length > 0 || afterQuote) {
        throw new AudienceError("VALIDATION_ERROR", [
          { field: "csv", message: "Contains an invalid quoted field." },
        ]);
      }
      quoted = true;
    } else if (afterQuote && ![",", "\r", "\n"].includes(character)) {
      throw new AudienceError("VALIDATION_ERROR", [
        { field: "csv", message: "Contains text after a closing quote." },
      ]);
    } else if (character === ",") finishField();
    else if (character === "\n") finishRow();
    else if (character === "\r") {
      if (csv[index + 1] === "\n") index += 1;
      finishRow();
    } else field += character;
  }

  if (quoted) {
    throw new AudienceError("VALIDATION_ERROR", [
      { field: "csv", message: "Contains an unterminated quoted field." },
    ]);
  }
  if (field.length > 0 || row.length > 0 || afterQuote) finishRow();
  return rows;
}

export function parseContactCsv(value: string): ContactCsvImport {
  if (Buffer.byteLength(value, "utf8") > MAX_CONTACT_CSV_BYTES) {
    throw new AudienceError("CSV_TOO_LARGE");
  }

  const rows = parseCsvRows(value.replace(/^\uFEFF/, ""));
  const header = rows.shift()?.map((cell) => cell.trim().toLowerCase()) ?? [];
  if (
    header.length < 1 ||
    header.length > 2 ||
    header[0] !== "email" ||
    (header.length === 2 && header[1] !== "name")
  ) {
    throw new AudienceError("VALIDATION_ERROR", [
      {
        field: "csv.header",
        message: "Use an email header with an optional name column.",
      },
    ]);
  }

  const dataRows = rows.filter(
    (row) => !(row.length === 1 && row[0].trim().length === 0),
  );
  if (dataRows.length === 0) {
    throw new AudienceError("VALIDATION_ERROR", [
      { field: "csv", message: "Include at least one contact row." },
    ]);
  }
  if (dataRows.length > MAX_AUDIENCE_CONTACTS) {
    throw new AudienceError("CSV_TOO_MANY_ROWS");
  }

  const issues: AudienceValidationIssue[] = [];
  const deduplicated = new Map<string, ContactCsvRow>();
  dataRows.forEach((row, index) => {
    const field = `csv.rows.${index + 2}`;
    if (row.length !== header.length) {
      issues.push({ field, message: `Must contain exactly ${header.length} columns.` });
      return;
    }
    const email = contactEmail(row[0]);
    const name = header.length === 1 ? null : contactName(row[1]);
    if (!email) issues.push({ field: `${field}.email`, message: "Must be one plain email address." });
    if (name === undefined) {
      issues.push({
        field: `${field}.name`,
        message: `Must not exceed ${MAX_CONTACT_NAME_LENGTH} characters or contain control characters.`,
      });
    }
    if (email && name !== undefined) deduplicated.set(email, { email, name });
  });

  if (issues.length > 0) {
    throw new AudienceError("VALIDATION_ERROR", issues.slice(0, 100));
  }
  return { inputRows: dataRows.length, rows: [...deduplicated.values()] };
}
