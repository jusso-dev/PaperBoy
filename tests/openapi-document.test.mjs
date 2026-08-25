import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseOpenApiDocument } from "../src/lib/openapi-document.ts";

test("OpenAPI document parser lists HTTP routes and MCP peers", async () => {
  const source = await readFile(new URL("../openapi.yaml", import.meta.url), "utf8");
  const document = parseOpenApiDocument(source);
  const byId = new Map(document.operations.map((operation) => [operation.operationId, operation]));

  assert.equal(document.title, "PaperBoy HTTP API");
  assert.match(document.description, /Rust CLI/);
  assert.ok(document.operations.length >= 40);

  const send = byId.get("sendEmail");
  assert.equal(send?.method, "POST");
  assert.equal(send?.path, "/api/v1/emails");
  assert.equal(send?.mcp, "paperboy_send_email");
  assert.match(send?.description ?? "", /provider-neutral message/);

  const update = byId.get("updateBroadcast");
  assert.equal(update?.method, "PATCH");
  assert.equal(update?.path, "/api/v1/broadcasts/{broadcastId}");
  assert.equal(update?.mcp, "paperboy_update_broadcast");

  const imported = byId.get("importContacts");
  assert.equal(imported?.method, "POST");
  assert.equal(imported?.tag, "Audiences");
});
