import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultBroadcastWindowLayout,
  moveWindowRect,
  resizeWindowRect,
} from "../src/lib/broadcast-workspace-windows.ts";

test("broadcast windows stay inside the desk while dragging", () => {
  const moved = moveWindowRect(
    { height: 200, width: 300, x: 10, y: 10 },
    5000,
    5000,
    { height: 400, width: 500 },
  );

  assert.equal(moved.x, 200);
  assert.equal(moved.y, 200);
  assert.equal(moved.width, 300);
  assert.equal(moved.height, 200);
});

test("broadcast windows grow from the corner without leaving the desk", () => {
  const resized = resizeWindowRect(
    { height: 180, width: 280, x: 20, y: 20 },
    "se",
    400,
    400,
    { height: 360, width: 420 },
    160,
    120,
  );

  assert.equal(resized.width, 400);
  assert.equal(resized.height, 340);
  assert.equal(resized.x, 20);
  assert.equal(resized.y, 20);
});

test("broadcast desk lays out envelope, HTML source, and HTML output windows", () => {
  const layout = defaultBroadcastWindowLayout({ height: 800, width: 1200 });

  assert.ok(layout.envelope.width < layout.source.width);
  assert.equal(layout.source.x, layout.preview.x);
  assert.ok(layout.preview.y > layout.source.y);
  assert.ok(layout.source.height + layout.preview.height < 800);
});
