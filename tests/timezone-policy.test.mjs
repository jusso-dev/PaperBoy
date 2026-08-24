import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultApplicationTimeZone,
  effectiveUserTimeZone,
  fixedApplicationTimeZone,
} from "../src/lib/timezone-policy.ts";

test("Australia/Sydney is the default and a fixed deployment overrides stored users", () => {
  assert.equal(defaultApplicationTimeZone({}), "Australia/Sydney");
  const environment = {
    PAPERBOY_DEFAULT_TIME_ZONE: "Australia/Sydney",
    PAPERBOY_FIXED_TIME_ZONE: "Australia/Sydney",
  };
  assert.equal(fixedApplicationTimeZone(environment), "Australia/Sydney");
  assert.equal(effectiveUserTimeZone("UTC", environment), "Australia/Sydney");
  assert.equal(
    effectiveUserTimeZone("Pacific/Auckland", environment),
    "Australia/Sydney",
  );
});

test("timezone policy accepts only canonical IANA names", () => {
  assert.throws(
    () => defaultApplicationTimeZone({ PAPERBOY_DEFAULT_TIME_ZONE: "US/Eastern" }),
    /canonical IANA timezone/,
  );
  assert.throws(
    () => fixedApplicationTimeZone({ PAPERBOY_FIXED_TIME_ZONE: "GMT+10" }),
    /canonical IANA timezone/,
  );
});
