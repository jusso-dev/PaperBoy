import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";

const databaseUrl = process.env.PAPERBOY_TEST_DATABASE_URL;

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

test(
  "PostgreSQL serializes SES recipient pacing and rolling quota across workers",
  { skip: databaseUrl ? false : "PAPERBOY_TEST_DATABASE_URL is not configured" },
  async () => {
    process.env.DATABASE_URL = databaseUrl;
    const [
      { eq },
      { db },
      { awsSesRateLimitStates, awsSesSendReservations },
      { postgresAwsSesQuotaGuard },
    ] = await Promise.all([
      import("drizzle-orm"),
      import("../src/db/index.ts"),
      import("../src/db/schema.ts"),
      import("../src/lib/postgres-aws-ses-quota-guard.ts"),
    ]);
    const suffix = randomUUID();
    const pacedScope = digest(`paced:${suffix}`);
    const dailyScope = digest(`daily:${suffix}`);
    const now = new Date();
    const pacingSnapshot = {
      max24HourSend: 1_000,
      maxSendRate: 2.5,
      observedAt: new Date(now.getTime() - 1_000),
      sentLast24Hours: 0,
    };

    try {
      const paced = await Promise.all(
        Array.from({ length: 3 }, (_, index) =>
          postgresAwsSesQuotaGuard.reserve({
            now,
            recipientCount: 1,
            reservationKey: digest(`paced:${index}:${suffix}`),
            scopeHash: pacedScope,
            snapshot: pacingSnapshot,
          }),
        ),
      );
      const scheduled = paced
        .map((reservation) => reservation.scheduledAt.getTime())
        .sort((left, right) => left - right);
      assert.deepEqual(
        scheduled.slice(1).map((value, index) => value - scheduled[index]),
        [500, 500],
      );

      const firstDailyKey = digest(`daily:first:${suffix}`);
      const dailyInput = {
        now,
        recipientCount: 1,
        reservationKey: firstDailyKey,
        scopeHash: dailyScope,
        snapshot: {
          max24HourSend: 10,
          maxSendRate: 10,
          observedAt: new Date(now.getTime() - 1_000),
          sentLast24Hours: 8,
        },
      };
      const accepted = await postgresAwsSesQuotaGuard.reserve(dailyInput);
      assert.equal("scheduledAt" in accepted, true);
      const replay = await postgresAwsSesQuotaGuard.reserve(dailyInput);
      assert.equal(replay.scheduledAt.getTime(), accepted.scheduledAt.getTime());

      const deferred = await postgresAwsSesQuotaGuard.reserve({
        ...dailyInput,
        reservationKey: digest(`daily:second:${suffix}`),
      });
      assert.equal("retryAt" in deferred, true);
      const stored = await db
        .select({ id: awsSesSendReservations.id })
        .from(awsSesSendReservations)
        .where(eq(awsSesSendReservations.scopeHash, dailyScope));
      assert.equal(stored.length, 1);
    } finally {
      await db
        .delete(awsSesRateLimitStates)
        .where(eq(awsSesRateLimitStates.scopeHash, pacedScope));
      await db
        .delete(awsSesRateLimitStates)
        .where(eq(awsSesRateLimitStates.scopeHash, dailyScope));
    }
  },
);
