import assert from "node:assert/strict";
import test from "node:test";
import {
  RateLimitConfigurationError,
  RateLimitSettingsError,
  configuredRateLimitDefaults,
  effectiveRateLimits,
  parseUpdateRateLimitInput,
} from "../src/lib/rate-limit-core.ts";

test("rate-limit defaults are explicit and test traffic has the higher cap", () => {
  assert.deepEqual(
    configuredRateLimitDefaults({ live: "60", test: "600" }),
    { live: 60, test: 600 },
  );
  assert.deepEqual(
    effectiveRateLimits({
      defaults: { live: 60, test: 600 },
      liveOverride: 120,
      testOverride: 1_200,
    }),
    { live: 120, test: 1_200 },
  );
});

test("invalid or reversed operator defaults fail closed", () => {
  for (const input of [
    { live: "0", test: "600" },
    { live: "60.5", test: "600" },
    { live: "60", test: "60" },
    { live: "60", test: "1000001" },
  ]) {
    assert.throws(
      () => configuredRateLimitDefaults(input),
      RateLimitConfigurationError,
    );
  }
});

test("organization overrides accept bounded integers and null resets", () => {
  assert.deepEqual(
    parseUpdateRateLimitInput({
      live_limit_per_minute: 90,
      test_limit_per_minute: null,
    }),
    { liveLimitPerMinute: 90, testLimitPerMinute: null },
  );

  for (const payload of [
    {},
    { live_limit_per_minute: 0 },
    { test_limit_per_minute: 10.5 },
    { org_id: "not-accepted" },
  ]) {
    assert.throws(
      () => parseUpdateRateLimitInput(payload),
      (error) =>
        error instanceof RateLimitSettingsError &&
        error.code === "VALIDATION_ERROR",
    );
  }
});
