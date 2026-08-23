import { normalizeEmailAddress } from "@/lib/email-core";

export const SUPPRESSION_REASONS = [
  "manual",
  "bounced",
  "complained",
] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

export const MAX_SUPPRESSION_CSV_BYTES = 1024 * 1024;
export const MAX_SUPPRESSION_IMPORT_ROWS = 5_000;
export const MAX_SUPPRESSION_LIST_LIMIT = 500;

export type SuppressionRecord = {
  createdAt: Date;
  email: string;
  id: string;
  reason: SuppressionReason;
  updatedAt: Date;
};

export type SuppressionValidationIssue = {
  field: string;
  message: string;
};

export type SuppressionErrorCode =
  | "CSV_TOO_LARGE"
  | "CSV_TOO_MANY_ROWS"
  | "MEMBERSHIP_REQUIRED"
  | "SUPPRESSION_EXISTS"
  | "SUPPRESSION_NOT_FOUND"
  | "VALIDATION_ERROR";

export class SuppressionError extends Error {
  constructor(
    readonly code: SuppressionErrorCode,
    readonly issues: SuppressionValidationIssue[] = [],
  ) {
    super(code);
    this.name = "SuppressionError";
  }
}

export type CreateSuppressionInput = {
  email: string;
  reason: SuppressionReason;
};

export type UpdateSuppressionInput = {
  email?: string;
  reason?: SuppressionReason;
};

export type SuppressionListInput = {
  limit: number;
  query: string | null;
  reason: SuppressionReason | null;
};

export type SuppressionCsvRow = {
  email: string;
  reason: SuppressionReason;
};

export type SuppressionCsvImport = {
  inputRows: number;
  rows: SuppressionCsvRow[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function isSuppressionReason(value: unknown): value is SuppressionReason {
  return (
    typeof value === "string" &&
    SUPPRESSION_REASONS.includes(value as SuppressionReason)
  );
}

function plainEmail(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    /[<>\r\n]/.test(value)
  ) {
    return null;
  }

  return normalizeEmailAddress(value.trim());
}

function unsupportedFields(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): SuppressionValidationIssue[] {
  return Object.keys(value)
    .filter((field) => !allowed.has(field))
    .map((field) => ({
      field,
      message: "This field is not supported.",
    }));
}

export function parseCreateSuppressionInput(
  value: unknown,
): CreateSuppressionInput {
  if (!isRecord(value)) {
    throw new SuppressionError("VALIDATION_ERROR", [
      { field: "body", message: "Must be a JSON object." },
    ]);
  }

  const issues = unsupportedFields(value, new Set(["email", "reason"]));
  const email = plainEmail(value.email);
  const reason = value.reason === undefined ? "manual" : value.reason;

  if (!email) {
    issues.push({ field: "email", message: "Must be one plain email address." });
  }

  if (!isSuppressionReason(reason)) {
    issues.push({
      field: "reason",
      message: "Must be manual, bounced, or complained.",
    });
  }

  if (issues.length > 0 || !email || !isSuppressionReason(reason)) {
    throw new SuppressionError("VALIDATION_ERROR", issues);
  }

  return { email, reason };
}

export function parseUpdateSuppressionInput(
  value: unknown,
): UpdateSuppressionInput {
  if (!isRecord(value)) {
    throw new SuppressionError("VALIDATION_ERROR", [
      { field: "body", message: "Must be a JSON object." },
    ]);
  }

  const issues = unsupportedFields(value, new Set(["email", "reason"]));
  const result: UpdateSuppressionInput = {};

  if (Object.hasOwn(value, "email")) {
    const email = plainEmail(value.email);

    if (email) {
      result.email = email;
    } else {
      issues.push({
        field: "email",
        message: "Must be one plain email address.",
      });
    }
  }

  if (Object.hasOwn(value, "reason")) {
    if (isSuppressionReason(value.reason)) {
      result.reason = value.reason;
    } else {
      issues.push({
        field: "reason",
        message: "Must be manual, bounced, or complained.",
      });
    }
  }

  if (result.email === undefined && result.reason === undefined) {
    issues.push({
      field: "body",
      message: "Provide email or reason to update.",
    });
  }

  if (issues.length > 0) {
    throw new SuppressionError("VALIDATION_ERROR", issues);
  }

  return result;
}

export function parseSuppressionListInput(
  value: {
    limit?: unknown;
    query?: unknown;
    reason?: unknown;
  } = {},
): SuppressionListInput {
  const issues: SuppressionValidationIssue[] = [];
  const rawQuery = value.query ?? null;
  const query =
    typeof rawQuery === "string" && rawQuery.trim().length > 0
      ? rawQuery.trim().toLowerCase()
      : null;
  const reason = value.reason ?? null;
  const numericLimit =
    typeof value.limit === "string" && /^\d+$/.test(value.limit)
      ? Number(value.limit)
      : value.limit === undefined
        ? 100
        : value.limit;

  if (rawQuery !== null && typeof rawQuery !== "string") {
    issues.push({ field: "query", message: "Must be a string." });
  }

  if (query && query.length > 254) {
    issues.push({ field: "query", message: "Must not exceed 254 characters." });
  }

  if (reason !== null && reason !== "" && !isSuppressionReason(reason)) {
    issues.push({
      field: "reason",
      message: "Must be manual, bounced, or complained.",
    });
  }

  if (
    typeof numericLimit !== "number" ||
    !Number.isInteger(numericLimit) ||
    numericLimit < 1 ||
    numericLimit > MAX_SUPPRESSION_LIST_LIMIT
  ) {
    issues.push({
      field: "limit",
      message: `Must be an integer from 1 to ${MAX_SUPPRESSION_LIST_LIMIT}.`,
    });
  }

  if (issues.length > 0) {
    throw new SuppressionError("VALIDATION_ERROR", issues);
  }

  return {
    limit: numericLimit as number,
    query,
    reason: reason === "" || reason === null ? null : (reason as SuppressionReason),
  };
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
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      if (field.length > 0 || afterQuote) {
        throw new SuppressionError("VALIDATION_ERROR", [
          { field: "csv", message: "Contains an invalid quoted field." },
        ]);
      }
      quoted = true;
      continue;
    }

    if (afterQuote && character !== "," && character !== "\r" && character !== "\n") {
      throw new SuppressionError("VALIDATION_ERROR", [
        { field: "csv", message: "Contains text after a closing quote." },
      ]);
    }

    if (character === ",") {
      finishField();
    } else if (character === "\n") {
      finishRow();
    } else if (character === "\r") {
      if (csv[index + 1] === "\n") index += 1;
      finishRow();
    } else {
      field += character;
    }
  }

  if (quoted) {
    throw new SuppressionError("VALIDATION_ERROR", [
      { field: "csv", message: "Contains an unterminated quoted field." },
    ]);
  }

  if (field.length > 0 || row.length > 0 || afterQuote) {
    finishRow();
  }

  return rows;
}

function strongerReason(
  current: SuppressionReason,
  candidate: SuppressionReason,
): SuppressionReason {
  const rank: Record<SuppressionReason, number> = {
    manual: 0,
    bounced: 1,
    complained: 2,
  };
  return rank[candidate] > rank[current] ? candidate : current;
}

export function parseSuppressionCsv(value: string): SuppressionCsvImport {
  if (Buffer.byteLength(value, "utf8") > MAX_SUPPRESSION_CSV_BYTES) {
    throw new SuppressionError("CSV_TOO_LARGE");
  }

  const rows = parseCsvRows(value.replace(/^\uFEFF/, ""));
  const header = rows.shift()?.map((cell) => cell.trim().toLowerCase()) ?? [];

  if (
    header.length < 1 ||
    header.length > 2 ||
    header[0] !== "email" ||
    (header.length === 2 && header[1] !== "reason")
  ) {
    throw new SuppressionError("VALIDATION_ERROR", [
      {
        field: "csv.header",
        message: "Use an email header with an optional reason column.",
      },
    ]);
  }

  const records = new Map<string, SuppressionCsvRow>();
  const issues: SuppressionValidationIssue[] = [];
  let inputRows = 0;

  rows.forEach((cells, index) => {
    if (cells.every((cell) => cell.trim().length === 0)) return;
    inputRows += 1;
    const line = index + 2;

    if (cells.length !== header.length) {
      issues.push({
        field: `csv.${line}`,
        message: `Must contain exactly ${header.length} column${header.length === 1 ? "" : "s"}.`,
      });
      return;
    }

    const email = plainEmail(cells[0].trim());
    const reasonCell = header.length === 2 ? cells[1].trim().toLowerCase() : "";
    const rawReason = reasonCell || "manual";

    if (!email) {
      issues.push({
        field: `csv.${line}.email`,
        message: "Must be one plain email address.",
      });
    }

    if (!isSuppressionReason(rawReason)) {
      issues.push({
        field: `csv.${line}.reason`,
        message: "Must be manual, bounced, or complained.",
      });
    }

    if (!email || !isSuppressionReason(rawReason)) return;
    const existing = records.get(email);
    records.set(email, {
      email,
      reason: existing
        ? strongerReason(existing.reason, rawReason)
        : rawReason,
    });
  });

  if (inputRows > MAX_SUPPRESSION_IMPORT_ROWS) {
    throw new SuppressionError("CSV_TOO_MANY_ROWS");
  }

  if (inputRows === 0) {
    issues.push({ field: "csv", message: "Include at least one data row." });
  }

  if (issues.length > 0) {
    throw new SuppressionError("VALIDATION_ERROR", issues.slice(0, 100));
  }

  return { inputRows, rows: [...records.values()] };
}
