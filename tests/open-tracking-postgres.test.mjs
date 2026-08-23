import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const databaseUrl = process.env.PAPERBOY_TEST_DATABASE_URL;

test(
  "PostgreSQL open tracking is opt-in and two pixel GETs create one UTC event",
  { skip: databaseUrl ? false : "PAPERBOY_TEST_DATABASE_URL is not configured" },
  async () => {
    const previousPublicUrl = process.env.PAPERBOY_PUBLIC_URL;
    const previousSigningKey = process.env.PAPERBOY_OPEN_TRACKING_SIGNING_KEY;
    process.env.DATABASE_URL = databaseUrl;
    process.env.PAPERBOY_OPEN_TRACKING_SIGNING_KEY = Buffer.alloc(32, 9).toString(
      "base64",
    );
    process.env.PAPERBOY_PUBLIC_URL = "https://paperboy.example";

    const [
      { eq },
      { db },
      { apiKeys, messages, orgMembers, orgs, users },
      { GET: getPixel },
      { listMessageEvents },
      { queueEmail },
      { getOpenTrackingSettings, updateOpenTrackingSettings },
    ] = await Promise.all([
      import("drizzle-orm"),
      import("../src/db/index.ts"),
      import("../src/db/schema.ts"),
      import("../src/app/o/[messageId]/[pixel]/route.ts"),
      import("../src/lib/message-events.ts"),
      import("../src/lib/messages.ts"),
      import("../src/lib/open-tracking.ts"),
    ]);
    const orgId = randomUUID();
    const apiKeyId = randomUUID();
    const userId = `open-tracking-user-${randomUUID()}`;
    const integrationLock = await db.$client.connect();
    const principal = {
      actorUserId: userId,
      apiKeyId,
      environment: "test",
      orgId,
    };

    await integrationLock.query("SELECT pg_advisory_lock($1)", [190020]);

    try {
      await db.insert(orgs).values({ id: orgId, name: "Open tracking proof" });
      await db.insert(users).values({
        email: `${randomUUID()}@example.com`,
        id: userId,
        name: "Open tracking operator",
        timezone: "Australia/Sydney",
      });
      await db.insert(orgMembers).values({ orgId, role: "owner", userId });
      await db.insert(apiKeys).values({
        createdByUserId: userId,
        environment: "test",
        id: apiKeyId,
        keyHash: `hash-${randomUUID()}`,
        keyId: `key-${randomUUID()}`,
        name: "Open tracking test key",
        orgId,
      });

      const untracked = await queueEmail({
        payload: {
          from: "news@example.com",
          html: "<html><body><p>Default off</p></body></html>",
          subject: "Default off",
          to: "reader@example.net",
        },
        principal,
      });
      const [untrackedRow] = await db
        .select({
          html: messages.html,
          openTrackingEnabled: messages.openTrackingEnabled,
        })
        .from(messages)
        .where(eq(messages.id, untracked.id));
      assert.equal(untrackedRow.openTrackingEnabled, false);
      assert.doesNotMatch(untrackedRow.html, /\/o\//);

      const changedAt = new Date("2026-08-24T01:02:03.456Z");
      const setting = await updateOpenTrackingSettings({
        actorUserId: userId,
        now: changedAt,
        orgId,
        payload: { enabled: true },
      });
      assert.deepEqual(setting, { enabled: true, updatedAt: changedAt });

      const tracked = await queueEmail({
        payload: {
          from: "news@example.com",
          html: "<html><body><p>Tracked edition</p></body></html>",
          subject: "Tracked",
          to: "reader@example.net",
        },
        principal,
      });
      const [trackedRow] = await db
        .select({
          html: messages.html,
          openTrackingEnabled: messages.openTrackingEnabled,
        })
        .from(messages)
        .where(eq(messages.id, tracked.id));
      assert.equal(trackedRow.openTrackingEnabled, true);
      assert.ok(trackedRow.html);
      const source = /src="([^"]+\/o\/[^"]+\.gif)"/.exec(trackedRow.html)?.[1];
      assert.ok(source);
      const pixelUrl = new URL(source);
      assert.equal(pixelUrl.origin, "https://paperboy.example");
      const [, routePrefix, messageId, pixel] = pixelUrl.pathname.split("/");
      assert.equal(routePrefix, "o");
      assert.equal(messageId, tracked.id);

      const context = { params: Promise.resolve({ messageId, pixel }) };
      const [first, second] = await Promise.all([
        getPixel(new Request(pixelUrl), context),
        getPixel(new Request(pixelUrl), context),
      ]);
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.equal(first.headers.get("Content-Type"), "image/gif");
      assert.deepEqual(
        Buffer.from(await first.arrayBuffer()),
        Buffer.from(await second.arrayBuffer()),
      );

      const timeline = await listMessageEvents({
        actorUserId: userId,
        environment: "test",
        messageId: tracked.id,
        orgId,
      });
      assert.deepEqual(timeline.map((event) => event.type), ["queued", "opened"]);
      assert.equal(timeline[1].createdAt.toISOString().endsWith("Z"), true);
      assert.deepEqual(timeline[1].data, {});

      const invalid = await getPixel(new Request(pixelUrl), {
        params: Promise.resolve({ messageId, pixel: `invalid.gif` }),
      });
      assert.equal(invalid.status, 200);
      assert.equal(
        (
          await listMessageEvents({
            actorUserId: userId,
            environment: "test",
            messageId: tracked.id,
            orgId,
          })
        ).filter((event) => event.type === "opened").length,
        1,
      );

      const textOnly = await queueEmail({
        payload: {
          from: "news@example.com",
          subject: "Text only",
          text: "No pixel here",
          to: "reader@example.net",
        },
        principal,
      });
      const [textOnlyRow] = await db
        .select({
          html: messages.html,
          openTrackingEnabled: messages.openTrackingEnabled,
        })
        .from(messages)
        .where(eq(messages.id, textOnly.id));
      assert.equal(textOnlyRow.html, null);
      assert.equal(textOnlyRow.openTrackingEnabled, false);

      await db
        .update(orgMembers)
        .set({ role: "member" })
        .where(eq(orgMembers.orgId, orgId));
      assert.equal(
        (
          await getOpenTrackingSettings({
            actorUserId: userId,
            orgId,
          })
        ).enabled,
        true,
      );
      await assert.rejects(
        updateOpenTrackingSettings({
          actorUserId: userId,
          orgId,
          payload: { enabled: false },
        }),
        (error) => error?.code === "FORBIDDEN",
      );
    } finally {
      try {
        await db.delete(orgs).where(eq(orgs.id, orgId));
        await db.delete(users).where(eq(users.id, userId));
      } finally {
        await integrationLock.query("SELECT pg_advisory_unlock($1)", [190020]);
        integrationLock.release();
        await db.$client.end();
        if (previousSigningKey === undefined) {
          delete process.env.PAPERBOY_OPEN_TRACKING_SIGNING_KEY;
        } else {
          process.env.PAPERBOY_OPEN_TRACKING_SIGNING_KEY = previousSigningKey;
        }
        if (previousPublicUrl === undefined) {
          delete process.env.PAPERBOY_PUBLIC_URL;
        } else {
          process.env.PAPERBOY_PUBLIC_URL = previousPublicUrl;
        }
      }
    }
  },
);
