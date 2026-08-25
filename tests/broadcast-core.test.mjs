import assert from "node:assert/strict";
import test from "node:test";
import {
  BroadcastError,
  parseCreateBroadcastInput,
  parseUpdateBroadcastInput,
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
  assert.equal(parsed.scheduledFor, null);
});

test("broadcast creation accepts an explicit scheduled UTC instant", () => {
  const parsed = parseCreateBroadcastInput({
    audience_id: audienceId,
    from: "news@example.com",
    name: "Evening edition",
    scheduled_for: "2026-08-25T08:30:00.000Z",
    template_id: templateId,
  });

  assert.equal(parsed.scheduledFor?.toISOString(), "2026-08-25T08:30:00.000Z");
});

test("broadcast creation rejects scheduled values without an offset", () => {
  assert.throws(
    () =>
      parseCreateBroadcastInput({
        audience_id: audienceId,
        from: "news@example.com",
        name: "Evening edition",
        scheduled_for: "2026-08-25T18:30",
        template_id: templateId,
      }),
    (error) =>
      error instanceof BroadcastError &&
      error.issues.some((issue) => issue.field === "scheduled_for"),
  );
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

test("scheduled broadcast update accepts partial snapshot and schedule changes", () => {
  const parsed = parseUpdateBroadcastInput({
    audience_id: audienceId,
    scheduled_for: "2026-09-24T22:00:00.000Z",
    subject: "Updated subject",
  });

  assert.equal(parsed.audienceId, audienceId);
  assert.equal(parsed.scheduledFor?.toISOString(), "2026-09-24T22:00:00.000Z");
  assert.equal(parsed.templateId, undefined);
  assert.equal(parsed.subject, "Updated subject");
});

test("scheduled broadcast update rejects unsafe subjects", () => {
  assert.throws(
    () => parseUpdateBroadcastInput({ subject: "Hello\r\nBcc: reader@example.net" }),
    (error) =>
      error instanceof BroadcastError &&
      error.issues.some((issue) => issue.field === "subject"),
  );
});

test("scheduled broadcast update rejects empty or unsupported changes", () => {
  assert.throws(
    () => parseUpdateBroadcastInput({}),
    (error) =>
      error instanceof BroadcastError &&
      error.issues.some((issue) => issue.field === "body"),
  );
  assert.throws(
    () => parseUpdateBroadcastInput({ recipients: [] }),
    (error) =>
      error instanceof BroadcastError &&
      error.issues.some((issue) => issue.field === "recipients"),
  );
});
