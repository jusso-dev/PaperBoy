import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("settings lets each user choose their IANA timezone", async () => {
  const [page, actions, policy] = await Promise.all([
    readFile(
      new URL("../src/app/app/settings/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/app/app/settings/actions.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../src/lib/timezone-policy.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /updateTimeZoneAction/);
  assert.match(page, /name="timezone"/);
  assert.match(page, /Intl\.supportedValuesOf\("timeZone"\)/);
  assert.doesNotMatch(page, /This deployment is fixed/);
  assert.doesNotMatch(page, /fixedApplicationTimeZone/);
  assert.match(actions, /auth\.api\.updateUser/);
  assert.match(actions, /canonicalTimeZone/);
  assert.doesNotMatch(actions, /timezone-locked/);
  assert.match(policy, /normalizeTimeZone\(/);
  assert.doesNotMatch(
    policy,
    /fixedApplicationTimeZone\(environment\) \?\?/,
  );
});
