import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  OrganizationInviteEmailError,
  organizationInviteAcceptUrl,
  organizationInviteFromAddress,
  organizationInviteMessage,
  queueOrganizationInviteEmail,
  selectInviteSendingDomain,
} from "../src/lib/organization-invite-email.ts";

const invitationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const orgId = "11111111-1111-4111-8111-111111111111";

test("invite email prefers a verified domain that matches the recipient", () => {
  assert.equal(
    selectInviteSendingDomain(
      ["grick.au", "rangeros.com.au"],
      "justin@rangeros.com.au",
    ),
    "rangeros.com.au",
  );
  assert.equal(
    selectInviteSendingDomain(["grick.au"], "justin@yumait.com.au"),
    "grick.au",
  );
  assert.equal(selectInviteSendingDomain([], "justin@yumait.com.au"), null);
});

test("invite message is a live PaperBoy letter the recipient can accept", () => {
  const message = organizationInviteMessage({
    acceptUrl: "https://paperboy.example/app/organization",
    from: organizationInviteFromAddress("rangeros.com.au"),
    invitationId,
    orgName: "RangerOS",
    role: "admin",
    to: "justin@yumait.com.au",
  });

  assert.equal(message.from, "PaperBoy <invites@rangeros.com.au>");
  assert.equal(message.to, "justin@yumait.com.au");
  assert.equal(message.subject, "You're invited to RangerOS");
  assert.match(message.text, /https:\/\/paperboy\.example\/app\/organization/);
  assert.match(message.html, /RangerOS/);
  assert.deepEqual(message.tags, [
    { name: "invitation_id", value: invitationId },
    { name: "organization_invite", value: "1" },
  ]);
});

test("invite accept URL stays on the PaperBoy organization page", () => {
  assert.equal(
    organizationInviteAcceptUrl("https://paperboy.example"),
    "https://paperboy.example/app/organization",
  );
  assert.throws(
    () => organizationInviteAcceptUrl(""),
    (error) =>
      error instanceof OrganizationInviteEmailError &&
      error.code === "ACCEPT_URL_UNAVAILABLE",
  );
});

test("queueing an invite email uses a ready sender and live principal", async () => {
  const queued = [];
  const result = await queueOrganizationInviteEmail(
    {
      actorUserId: "user-one",
      email: "justin@yumait.com.au",
      invitationId,
      orgId,
      orgName: "RangerOS",
      role: "member",
    },
    {
      acceptUrl: () => "https://paperboy.example/app/organization",
      queue: async (input) => {
        queued.push(input);
        return { id: "message-1" };
      },
      readyDomains: async () => ["rangeros.com.au"],
    },
  );

  assert.equal(result.id, "message-1");
  assert.equal(queued.length, 1);
  assert.equal(queued[0].payload.from, "PaperBoy <invites@rangeros.com.au>");
  assert.equal(queued[0].principal.environment, "live");
  assert.equal(queued[0].principal.orgId, orgId);
});

test("organization invite UI queues a live email instead of saving silently", async () => {
  const [page, actions] = await Promise.all([
    readFile(
      new URL("../src/app/app/organization/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/app/app/organization/actions.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.doesNotMatch(page, /No email is sent in v1/);
  assert.match(page, /Send invitation/);
  assert.match(page, /href="\/app\/logs"/);
  assert.match(actions, /inviteAndEmailOrganizationMember/);
  assert.match(actions, /queuedId/);

  const shared = await readFile(
    new URL("../src/lib/organization-invites.ts", import.meta.url),
    "utf8",
  );
  assert.match(shared, /queueOrganizationInviteEmail/);
  assert.match(shared, /listOrganizationInvitationsForActor/);
});

test("invite email cannot queue without a ready sender", async () => {
  await assert.rejects(
    () =>
      queueOrganizationInviteEmail(
        {
          actorUserId: "user-one",
          email: "justin@yumait.com.au",
          invitationId,
          orgId,
          orgName: "RangerOS",
          role: "member",
        },
        {
          acceptUrl: () => "https://paperboy.example/app/organization",
          queue: async () => ({ id: "message-1" }),
          readyDomains: async () => [],
        },
      ),
    (error) =>
      error instanceof OrganizationInviteEmailError &&
      error.code === "SENDER_UNAVAILABLE",
  );
});
