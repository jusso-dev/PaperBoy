export const MAX_TEMPLATE_NAME_LENGTH = 120;
export const MAX_TEMPLATE_SUBJECT_LENGTH = 998;
export const MAX_TEMPLATE_BODY_LENGTH = 2 * 1024 * 1024;
export const MAX_TEMPLATE_DATA_BYTES = 256 * 1024;

export type TemplateValidationIssue = {
  field: string;
  message: string;
};

export type TemplateErrorCode =
  | "MEMBERSHIP_REQUIRED"
  | "TEMPLATE_EXISTS"
  | "TEMPLATE_NOT_FOUND"
  | "VALIDATION_ERROR";

export class TemplateError extends Error {
  constructor(
    readonly code: TemplateErrorCode,
    readonly issues: TemplateValidationIssue[] = [],
  ) {
    super(code);
    this.name = "TemplateError";
  }
}

export type TemplateDefinition = {
  html: string | null;
  name: string;
  subject: string;
  text: string | null;
};

export type TemplateRecord = TemplateDefinition & {
  createdAt: Date;
  id: string;
  updatedAt: Date;
};

export type RenderedTemplate = {
  html: string | null;
  subject: string;
  text: string | null;
};

const TEMPLATE_FIELDS = new Set(["html", "name", "subject", "text"]);
const TEMPLATE_PATH_PATTERN =
  /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/;
const TEMPLATE_TOKEN_PATTERN = /{{\s*([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*)\s*}}/g;
const FORBIDDEN_PATH_PARTS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasForbiddenPathPart(path: string): boolean {
  const parts = path.split(".");
  return (
    path.length > 256 ||
    parts.some(
      (part) => part.length > 64 || FORBIDDEN_PATH_PARTS.has(part),
    )
  );
}

function validTemplateSyntax(source: string): boolean {
  if (source.includes("{{{") || source.includes("}}}")) {
    return false;
  }

  let cursor = 0;
  const matcher = /{{([\s\S]*?)}}/g;

  for (const match of source.matchAll(matcher)) {
    const index = match.index;
    const between = source.slice(cursor, index);
    const path = match[1].trim();

    if (
      between.includes("{{") ||
      between.includes("}}") ||
      !TEMPLATE_PATH_PATTERN.test(path) ||
      hasForbiddenPathPart(path)
    ) {
      return false;
    }

    cursor = index + match[0].length;
  }

  const tail = source.slice(cursor);
  return !tail.includes("{{") && !tail.includes("}}");
}

function validateSyntax(
  source: string,
  field: "html" | "subject" | "text",
  issues: TemplateValidationIssue[],
): void {
  if (!validTemplateSyntax(source)) {
    issues.push({
      field,
      message:
        "Use only double-brace variables such as {{reader.name}}. Helpers, sections, triple braces, and expressions are not supported.",
    });
  }
}

function parseName(
  value: unknown,
  issues: TemplateValidationIssue[],
): string {
  const name = typeof value === "string" ? value.trim() : "";

  if (
    !name ||
    name.length > MAX_TEMPLATE_NAME_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(name)
  ) {
    issues.push({
      field: "name",
      message: `Enter a name of at most ${MAX_TEMPLATE_NAME_LENGTH} characters without control characters.`,
    });
  }

  return name;
}

function parseSubject(
  value: unknown,
  issues: TemplateValidationIssue[],
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > MAX_TEMPLATE_SUBJECT_LENGTH ||
    /[\r\n]/.test(value)
  ) {
    issues.push({
      field: "subject",
      message: `Enter a single-line subject of at most ${MAX_TEMPLATE_SUBJECT_LENGTH} characters.`,
    });
    return typeof value === "string" ? value : "";
  }

  validateSyntax(value, "subject", issues);
  return value;
}

function parseBody(
  value: unknown,
  field: "html" | "text",
  issues: TemplateValidationIssue[],
): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    issues.push({ field, message: "Must be a string or null." });
    return null;
  }

  if (value.trim().length === 0 || value.length > MAX_TEMPLATE_BODY_LENGTH) {
    issues.push({
      field,
      message: "Must be non-empty and no larger than 2 MiB.",
    });
  }

  validateSyntax(value, field, issues);
  return value;
}

function definitionFromValues(input: {
  html: unknown;
  name: unknown;
  subject: unknown;
  text: unknown;
}): TemplateDefinition {
  const issues: TemplateValidationIssue[] = [];
  const definition = {
    html: parseBody(input.html, "html", issues),
    name: parseName(input.name, issues),
    subject: parseSubject(input.subject, issues),
    text: parseBody(input.text, "text", issues),
  };

  if (!definition.html && !definition.text) {
    issues.push({
      field: "body",
      message: "Provide non-empty html or text template content.",
    });
  }

  if (issues.length > 0) {
    throw new TemplateError("VALIDATION_ERROR", issues);
  }

  return definition;
}

function templateObject(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TemplateError("VALIDATION_ERROR", [
      { field: "body", message: "Must be a JSON object." },
    ]);
  }

  const unsupported = Object.keys(value).filter(
    (field) => !TEMPLATE_FIELDS.has(field),
  );

  if (unsupported.length > 0) {
    throw new TemplateError(
      "VALIDATION_ERROR",
      unsupported.map((field) => ({
        field,
        message: "This field is not supported.",
      })),
    );
  }

  return value;
}

export function parseCreateTemplateInput(value: unknown): TemplateDefinition {
  const input = templateObject(value);

  return definitionFromValues({
    html: input.html,
    name: input.name,
    subject: input.subject,
    text: input.text,
  });
}

export function parseUpdateTemplateInput(
  value: unknown,
  current: TemplateDefinition,
): TemplateDefinition {
  const input = templateObject(value);

  if (Object.keys(input).length === 0) {
    throw new TemplateError("VALIDATION_ERROR", [
      { field: "body", message: "Provide at least one template field." },
    ]);
  }

  return definitionFromValues({
    html: Object.hasOwn(input, "html") ? input.html : current.html,
    name: Object.hasOwn(input, "name") ? input.name : current.name,
    subject: Object.hasOwn(input, "subject")
      ? input.subject
      : current.subject,
    text: Object.hasOwn(input, "text") ? input.text : current.text,
  });
}

function validateTemplateData(data: unknown): Record<string, unknown> {
  if (!isRecord(data)) {
    throw new TemplateError("VALIDATION_ERROR", [
      { field: "data", message: "Must be a JSON object." },
    ]);
  }

  const issues: TemplateValidationIssue[] = [];
  const seen = new WeakSet<object>();
  let nodes = 0;

  function visit(value: unknown, path: string, depth: number): void {
    if (issues.length >= 25) {
      return;
    }

    nodes += 1;

    if (nodes > 10_000 || depth > 16) {
      issues.push({
        field: "data",
        message: "Template data is too deeply nested or complex.",
      });
      return;
    }

    if (value === null) {
      return;
    }

    if (typeof value === "string") {
      return;
    }

    if (typeof value === "boolean") {
      return;
    }

    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        issues.push({ field: path, message: "Must be a finite number." });
      }
      return;
    }

    if (!isRecord(value)) {
      issues.push({
        field: path,
        message: "Use JSON objects and scalar string, number, boolean, or null values. Arrays are not supported.",
      });
      return;
    }

    if (seen.has(value)) {
      issues.push({ field: path, message: "Circular data is not supported." });
      return;
    }

    seen.add(value);

    for (const [key, child] of Object.entries(value)) {
      if (issues.length >= 25) {
        break;
      }

      const displayKey = key.length > 64 ? `${key.slice(0, 64)}…` : key;
      const childPath = path ? `${path}.${displayKey}` : displayKey;

      if (
        key.length > 64 ||
        !/^[A-Za-z][A-Za-z0-9_]*$/.test(key) ||
        FORBIDDEN_PATH_PARTS.has(key)
      ) {
        issues.push({
          field: childPath,
          message: "Use safe letter-led keys containing only letters, numbers, and underscores.",
        });
        continue;
      }

      visit(child, childPath, depth + 1);
    }

    seen.delete(value);
  }

  visit(data, "data", 0);

  if (
    issues.length === 0 &&
    Buffer.byteLength(JSON.stringify(data), "utf8") > MAX_TEMPLATE_DATA_BYTES
  ) {
    issues.push({
      field: "data",
      message: "Must not exceed 256 KiB.",
    });
  }

  if (issues.length > 0) {
    throw new TemplateError("VALIDATION_ERROR", issues.slice(0, 25));
  }

  return data;
}

function lookup(data: Record<string, unknown>, path: string): unknown {
  let value: unknown = data;

  for (const part of path.split(".")) {
    if (!isRecord(value) || !Object.hasOwn(value, part)) {
      return null;
    }

    value = value[part];
  }

  if (isRecord(value)) {
    throw new TemplateError("VALIDATION_ERROR", [
      {
        field: `data.${path}`,
        message: "A referenced variable must resolve to a scalar value.",
      },
    ]);
  }

  return value;
}

function scalarText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderSource(
  source: string,
  data: Record<string, unknown>,
  htmlEscape: boolean,
  field: "html" | "subject" | "text",
  maxLength: number,
): string {
  const replacements = new Map<string, string>();

  function replacement(path: string): string {
    const cached = replacements.get(path);

    if (cached !== undefined) {
      return cached;
    }

    const text = scalarText(lookup(data, path));
    const rendered = htmlEscape ? escapeHtml(text) : text;
    replacements.set(path, rendered);
    return rendered;
  }

  let renderedLength = source.length;
  const sizingPattern = new RegExp(TEMPLATE_TOKEN_PATTERN.source, "g");

  for (const match of source.matchAll(sizingPattern)) {
    const path = match[1];
    renderedLength += replacement(path).length - match[0].length;

    if (renderedLength > maxLength) {
      throw new TemplateError("VALIDATION_ERROR", [
        {
          field,
          message:
            field === "subject"
              ? "Rendered subject must not exceed 998 characters."
              : "Rendered content must not exceed 2 MiB.",
        },
      ]);
    }
  }

  const renderingPattern = new RegExp(TEMPLATE_TOKEN_PATTERN.source, "g");
  return source.replace(renderingPattern, (_token, path: string) => {
    return replacement(path);
  });
}

export function renderTemplate(
  template: Pick<TemplateDefinition, "html" | "subject" | "text">,
  rawData: unknown,
): RenderedTemplate {
  const definition = definitionFromValues({
    html: template.html,
    name: "Stored template",
    subject: template.subject,
    text: template.text,
  });
  const data = validateTemplateData(rawData);

  return {
    html: definition.html
      ? renderSource(
          definition.html,
          data,
          true,
          "html",
          MAX_TEMPLATE_BODY_LENGTH,
        )
      : null,
    subject: renderSource(
      definition.subject,
      data,
      false,
      "subject",
      MAX_TEMPLATE_SUBJECT_LENGTH,
    ),
    text: definition.text
      ? renderSource(
          definition.text,
          data,
          false,
          "text",
          MAX_TEMPLATE_BODY_LENGTH,
        )
      : null,
  };
}
