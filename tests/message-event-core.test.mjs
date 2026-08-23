import assert from "node:assert/strict";
import test from "node:test";
import {
  MESSAGE_EVENT_TYPES,
  MessageEventError,
  requireMessageEventAllowed,
} from "../src/lib/message-event-core.ts";

test("the event catalog is bounded to message lifecycle outcomes", () => {
  assert.deepEqual(MESSAGE_EVENT_TYPES, [
    "queued",
    "delivered",
    "bounced",
    "complained",
    "opened",
  ]);
});

test("opened events require persisted opt-in while lifecycle events do not", () => {
  for (const type of MESSAGE_EVENT_TYPES.filter((type) => type !== "opened")) {
    assert.doesNotThrow(() =>
      requireMessageEventAllowed({ openTrackingEnabled: false, type }),
    );
  }

  assert.throws(
    () =>
      requireMessageEventAllowed({
        openTrackingEnabled: false,
        type: "opened",
      }),
    (error) =>
      error instanceof MessageEventError &&
      error.code === "OPEN_TRACKING_DISABLED",
  );
  assert.doesNotThrow(() =>
    requireMessageEventAllowed({ openTrackingEnabled: true, type: "opened" }),
  );
});
