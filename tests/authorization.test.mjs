import assert from "node:assert/strict";
import test from "node:test";
import {
  AuthorizationError,
  ORG_PERMISSIONS,
  can,
  isOrgRole,
  requirePermission,
} from "../src/lib/authorization.ts";

const matrix = {
  owner: new Set(ORG_PERMISSIONS),
  admin: new Set([
    "audiences.manage",
    "audiences.read",
    "apiKeys.create",
    "apiKeys.read",
    "apiKeys.revoke",
    "broadcasts.control",
    "broadcasts.create",
    "broadcasts.read",
    "domains.create",
    "domains.delete",
    "domains.manageDkim",
    "domains.read",
    "domains.verify",
    "feedback.ingest",
    "members.invite",
    "members.read",
    "messages.read",
    "messages.send",
    "rateLimits.manage",
    "rateLimits.read",
    "suppressions.manage",
    "suppressions.read",
    "templates.create",
    "templates.delete",
    "templates.read",
    "templates.update",
    "webhooks.manage",
    "webhooks.read",
  ]),
  member: new Set([
    "audiences.read",
    "broadcasts.read",
    "domains.read",
    "members.read",
    "messages.read",
    "rateLimits.read",
    "suppressions.read",
    "templates.read",
  ]),
};

for (const [role, allowed] of Object.entries(matrix)) {
  test(`${role} permission matrix`, () => {
    for (const permission of ORG_PERMISSIONS) {
      assert.equal(can(role, permission), allowed.has(permission), permission);
    }
  });
}

test("members cannot mint API keys or delete domains", () => {
  assert.equal(can("member", "apiKeys.create"), false);
  assert.equal(can("member", "domains.delete"), false);
  assert.equal(can("member", "templates.read"), true);
  assert.equal(can("member", "templates.update"), false);
  assert.equal(can("member", "broadcasts.read"), true);
  assert.equal(can("member", "messages.read"), true);
  assert.equal(can("admin", "messages.downloadMime"), false);
  assert.equal(can("member", "messages.downloadMime"), false);
  assert.equal(can("member", "messages.send"), false);
  assert.equal(can("member", "broadcasts.control"), false);
  assert.equal(can("member", "webhooks.manage"), false);
  assert.equal(can("member", "feedback.ingest"), false);
  assert.equal(can("member", "suppressions.read"), true);
  assert.equal(can("member", "suppressions.manage"), false);
  assert.equal(can("member", "audiences.read"), true);
  assert.equal(can("member", "audiences.manage"), false);
  assert.equal(can("member", "rateLimits.read"), true);
  assert.equal(can("member", "rateLimits.manage"), false);
  assert.throws(
    () => requirePermission("member", "apiKeys.create"),
    AuthorizationError,
  );
});

test("only declared roles are accepted", () => {
  assert.equal(isOrgRole("owner"), true);
  assert.equal(isOrgRole("admin"), true);
  assert.equal(isOrgRole("member"), true);
  assert.equal(isOrgRole("super-admin"), false);
});
