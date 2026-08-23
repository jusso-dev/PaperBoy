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
    "members.invite",
    "members.read",
    "messages.read",
    "templates.create",
    "templates.delete",
    "templates.read",
    "templates.update",
  ]),
  member: new Set([
    "broadcasts.read",
    "domains.read",
    "members.read",
    "messages.read",
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
  assert.equal(can("member", "broadcasts.control"), false);
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
