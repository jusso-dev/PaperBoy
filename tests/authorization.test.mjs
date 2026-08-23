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
    "domains.create",
    "domains.delete",
    "members.invite",
    "members.read",
  ]),
  member: new Set(["members.read"]),
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
