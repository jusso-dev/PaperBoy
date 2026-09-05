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
    "deferred",
    "bounced",
    "complained",
    "opened",
    "clicked",
    "scheduled",
    "cancelled",
  ]);
});

test("opened events require persisted opt-in while lifecycle events do not", () => {
  for (const type of MESSAGE_EVENT_TYPES.filter(
    (type) => type !== "opened" && type !== "clicked",
  )) {
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

test("clicked events require persisted click opt-in", () => {
  assert.throws(
    () =>
      requireMessageEventAllowed({
        clickTrackingEnabled: false,
        openTrackingEnabled: false,
        type: "clicked",
      }),
    (error) =>
      error instanceof MessageEventError &&
      error.code === "CLICK_TRACKING_DISABLED",
  );
  assert.doesNotThrow(() =>
    requireMessageEventAllowed({
      clickTrackingEnabled: true,
      openTrackingEnabled: false,
      type: "clicked",
    }),
  );
});
