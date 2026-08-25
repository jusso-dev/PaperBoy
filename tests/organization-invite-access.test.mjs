import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  organizationInvitePath,
  safeAuthCallbackPath,
} from "../src/lib/organization-invite-access.ts";

const invitationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("invite callback paths stay on PaperBoy", () => {
  assert.equal(organizationInvitePath(invitationId), `/invite/${invitationId}`);
  assert.equal(safeAuthCallbackPath(`/invite/${invitationId}`), `/invite/${invitationId}`);
  assert.equal(safeAuthCallbackPath("/app/organization"), "/app/organization");
  assert.equal(safeAuthCallbackPath("https://evil.example/invite"), "/app");
  assert.equal(safeAuthCallbackPath("//evil.example"), "/app");
  assert.equal(safeAuthCallbackPath("/sign-in"), "/app");
});

test("closed signup still lets an invited address create an account", async () => {
  const [auth, page, email] = await Promise.all([
    readFile(new URL("../src/lib/auth.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../src/app/(auth)/invite/[invitationId]/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/lib/organization-invite-email.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(auth, /disableSignUp: false/);
  assert.match(auth, /canCreateAccountForEmail/);
  assert.match(auth, /acceptPendingInvitationsForEmail/);
  assert.match(page, /Create an account with/);
  assert.match(email, /organizationInvitePath/);
});
