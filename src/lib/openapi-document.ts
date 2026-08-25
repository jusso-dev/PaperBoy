import { readFile } from "node:fs/promises";
import path from "node:path";

export type OpenApiOperation = {
  description: string;
  mcp: string | null;
  method: string;
  operationId: string;
  path: string;
  summary: string;
  tag: string;
};

export type OpenApiDocumentView = {
  description: string;
  operations: OpenApiOperation[];
  title: string;
  version: string;
};

const METHODS = new Set(["delete", "get", "patch", "post", "put"]);

export function openApiSpecPath(): string {
  return path.join(process.cwd(), "openapi.yaml");
}

export async function readOpenApiSpec(): Promise<string> {
  return readFile(openApiSpecPath(), "utf8");
}

export function parseOpenApiDocument(source: string): OpenApiDocumentView {
  const mcp = parseMcpEquivalents(source);
  return {
    description: foldedBlock(source, "  description:") ?? "PaperBoy HTTP API",
    operations: parseOperations(source, mcp),
    title: scalarField(source, "  title:") ?? "PaperBoy HTTP API",
    version: scalarField(source, "  version:") ?? "1.0.0",
  };
}

function parseMcpEquivalents(source: string): Map<string, string> {
  const equivalents = new Map<string, string>();
  const block = source.match(/x-paperboy-mcp:[\s\S]*?\npaths:\n/);
  if (!block) return equivalents;
  for (const match of block[0].matchAll(/^ {4}([A-Za-z]+): (paperboy_[a-z0-9_]+)$/gm)) {
    equivalents.set(match[1], match[2]);
  }
  return equivalents;
}

function parseOperations(
  source: string,
  mcp: Map<string, string>,
): OpenApiOperation[] {
  const operations: OpenApiOperation[] = [];
  let pathName = "";
  let method = "";
  let collecting: OpenApiOperation | null = null;
  let descriptionLines: string[] = [];
  let inDescription = false;

  function commit() {
    if (!collecting) return;
    collecting.description = descriptionLines.join(" ").replace(/\s+/g, " ").trim();
    operations.push(collecting);
    collecting = null;
    descriptionLines = [];
    inDescription = false;
  }

  for (const rawLine of source.split("\n")) {
    if (rawLine === "webhooks:") break;
    const pathMatch = rawLine.match(/^  (\/[^:]+):$/);
    if (pathMatch) {
      commit();
      pathName = pathMatch[1];
      method = "";
      continue;
    }

    const methodMatch = rawLine.match(/^    ([a-z]+):$/);
    if (methodMatch && METHODS.has(methodMatch[1])) {
      commit();
      method = methodMatch[1].toUpperCase();
      collecting = {
        description: "",
        mcp: null,
        method,
        operationId: "",
        path: pathName,
        summary: "",
        tag: "API",
      };
      continue;
    }

    if (!collecting) continue;

    if (inDescription) {
      if (/^      \S/.test(rawLine)) {
        inDescription = false;
      } else {
        descriptionLines.push(rawLine.trim());
        continue;
      }
    }

    const operationId = rawLine.match(/^      operationId: (\S+)$/);
    if (operationId) {
      collecting.operationId = operationId[1];
      collecting.mcp = mcp.get(operationId[1]) ?? null;
      continue;
    }

    const summary = rawLine.match(/^      summary: (.+)$/);
    if (summary) {
      collecting.summary = summary[1];
      continue;
    }

    const tag = rawLine.match(/^      tags: \[([^\]]+)\]$/);
    if (tag) {
      collecting.tag = tag[1].split(",")[0]?.trim() || collecting.tag;
      continue;
    }

    if (rawLine === "      description: >-") {
      inDescription = true;
      continue;
    }

    const inlineDescription = rawLine.match(/^      description: (.+)$/);
    if (inlineDescription) {
      collecting.description = inlineDescription[1];
    }
  }

  commit();
  return operations;
}

function scalarField(source: string, key: string): string | null {
  const match = source.match(new RegExp(`^${escapeRegExp(key)} (.+)$`, "m"));
  return match?.[1] ?? null;
}

function foldedBlock(source: string, key: string): string | null {
  const match = source.match(
    new RegExp(`^${escapeRegExp(key)}(?: >-)?\\n((?:    .+\\n)+)`, "m"),
  );
  if (!match) return null;
  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
