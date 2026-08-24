import assert from "node:assert/strict";
import test from "node:test";
import { isPostgresErrorCode } from "../src/lib/postgres-errors.ts";

test("PostgreSQL errors are recognized through pg and Bun SQL wrappers", () => {
  assert.equal(isPostgresErrorCode({ code: "23505" }, "23505"), true);
  assert.equal(
    isPostgresErrorCode(
      { cause: { code: "ERR_POSTGRES_SERVER_ERROR", errno: "23505" } },
      "23505",
    ),
    true,
  );
  assert.equal(isPostgresErrorCode({ errno: "23503" }, "23505"), false);
});
