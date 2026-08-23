import assert from "node:assert/strict";
import test from "node:test";
import {
  BroadcastError,
  MAX_BROADCAST_RECIPIENTS,
  parseCreateBroadcastInput,
} from "../src/lib/broadcast-core.ts";

const templateId = "88888888-8888-4888-8888-888888888888";

test("a 20-contact audience is normalized into a stable snapshot", () => {
  const audience = Array.from({ length: 20 }, (_, index) => ({
    data: { reader: { name: `Reader ${index + 1}` } },
    email: `Reader${index + 1}@Example.NET`,
  }));
  const parsed = parseCreateBroadcastInput({
    audience,
    from: "Newsroom <News@Example.COM>",
    name: " Morning edition ",
    template_id: templateId,
  });

  assert.equal(parsed.name, "Morning edition");
  assert.equal(parsed.from, "Newsroom <News@Example.COM>");
  assert.equal(parsed.audience.length, 20);
  assert.deepEqual(parsed.audience[0], {
    data: { reader: { name: "Reader 1" } },
    email: "reader1@example.net",
    position: 0,
  });
  assert.equal(parsed.audience[19].position, 19);
});

test("broadcast input rejects duplicates, unsupported fields, and oversized audiences", () => {
  assert.throws(
    () =>
      parseCreateBroadcastInput({
        audience: [
          { email: "Reader@example.net" },
          { email: "reader@EXAMPLE.NET", tracking: true },
        ],
        from: "news@example.com",
        name: "Duplicate list",
        template_id: templateId,
      }),
    (error) =>
      error instanceof BroadcastError &&
      error.code === "VALIDATION_ERROR" &&
      error.issues.some((issue) => /unique/.test(issue.message)) &&
      error.issues.some((issue) => issue.field.endsWith("tracking")),
  );

  assert.throws(
    () =>
      parseCreateBroadcastInput({
        audience: Array.from(
          { length: MAX_BROADCAST_RECIPIENTS + 1 },
          (_, index) => ({ email: `reader${index}@example.net` }),
        ),
        from: "news@example.com",
        name: "Too large",
        template_id: templateId,
      }),
    (error) =>
      error instanceof BroadcastError &&
      error.issues.some((issue) => issue.field === "audience"),
  );
});

test("broadcast input has no tracking or arbitrary envelope fields", () => {
  assert.throws(
    () =>
      parseCreateBroadcastInput({
        audience: [{ email: "reader@example.net" }],
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
