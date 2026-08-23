import assert from "node:assert/strict";
import test from "node:test";
import {
  BroadcastError,
  parseCreateBroadcastInput,
} from "../src/lib/broadcast-core.ts";

const templateId = "88888888-8888-4888-8888-888888888888";

const audienceId = "77777777-7777-4777-8777-777777777777";

test("broadcast creation accepts one stored audience id", () => {
  const parsed = parseCreateBroadcastInput({
    audience_id: audienceId,
    from: "Newsroom <News@Example.COM>",
    name: " Morning edition ",
    template_id: templateId,
  });

  assert.equal(parsed.name, "Morning edition");
  assert.equal(parsed.from, "Newsroom <News@Example.COM>");
  assert.equal(parsed.audienceId, audienceId);
});

test("broadcast input rejects inline recipients and invalid audience ids", () => {
  assert.throws(
    () =>
      parseCreateBroadcastInput({
        audience: [{ email: "Reader@example.net" }],
        audience_id: "not-an-id",
        from: "news@example.com",
        name: "Duplicate list",
        template_id: templateId,
      }),
    (error) =>
      error instanceof BroadcastError &&
      error.code === "VALIDATION_ERROR" &&
      error.issues.some((issue) => issue.field === "audience") &&
      error.issues.some((issue) => issue.field === "audience_id"),
  );
});

test("broadcast input has no tracking or arbitrary envelope fields", () => {
  assert.throws(
    () =>
      parseCreateBroadcastInput({
        audience_id: audienceId,
        from: "news@example.com",
        name: "No tracking",
        open_tracking: true,
        template_id: templateId,
      }),
    (error) =>
      error instanceof BroadcastError &&
      error.issues.some((issue) => issue.field === "open_tracking"),
  );
});
