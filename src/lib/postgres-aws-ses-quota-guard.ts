import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  awsSesRateLimitStates,
  awsSesSendReservations,
} from "@/db/schema";
import {
  AWS_SES_QUOTA_REFRESH_MS,
  safeAwsSesDailyRecipients,
  safeAwsSesRecipientsPerSecond,
  type AwsSesQuotaGuard,
} from "@/lib/aws-ses-quota";

const RESERVATION_RETENTION_MS = 25 * 60 * 60 * 1_000;

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export const postgresAwsSesQuotaGuard: AwsSesQuotaGuard = {
  async reserve(input) {
    return db.transaction(async (tx) => {
      await tx
        .insert(awsSesRateLimitStates)
        .values({
          nextAvailableAt: input.now,
          scopeHash: input.scopeHash,
          updatedAt: input.now,
        })
        .onConflictDoNothing();

      const [state] = await tx
        .select({
          databaseNow: sql<Date | string>`transaction_timestamp()`,
          nextAvailableAt: awsSesRateLimitStates.nextAvailableAt,
        })
        .from(awsSesRateLimitStates)
        .where(eq(awsSesRateLimitStates.scopeHash, input.scopeHash))
        .for("update");
      if (!state) throw new Error("Amazon SES quota state is unavailable.");

      const databaseNow = asDate(state.databaseNow);
      const [existing] = await tx
        .select({ scheduledAt: awsSesSendReservations.scheduledAt })
        .from(awsSesSendReservations)
        .where(
          and(
            eq(awsSesSendReservations.scopeHash, input.scopeHash),
            eq(awsSesSendReservations.reservationKey, input.reservationKey),
          ),
        )
        .limit(1);
      if (existing) {
        return {
          delayMs: Math.max(0, existing.scheduledAt.getTime() - databaseNow.getTime()),
          scheduledAt: existing.scheduledAt,
        };
      }

      await tx.delete(awsSesSendReservations).where(
        and(
          eq(awsSesSendReservations.scopeHash, input.scopeHash),
          lt(
            awsSesSendReservations.scheduledAt,
            new Date(databaseNow.getTime() - RESERVATION_RETENTION_MS),
          ),
        ),
      );

      const observationBoundary = new Date(
        Math.min(input.snapshot.observedAt.getTime(), databaseNow.getTime()),
      );
      const [reserved] = await tx
        .select({
          recipients: sql<number>`coalesce(sum(${awsSesSendReservations.recipientCount}), 0)::integer`,
        })
        .from(awsSesSendReservations)
        .where(
          and(
            eq(awsSesSendReservations.scopeHash, input.scopeHash),
            gte(awsSesSendReservations.scheduledAt, observationBoundary),
          ),
        );
      const dailyLimit = safeAwsSesDailyRecipients(input.snapshot);
      if (
        dailyLimit !== null &&
        input.snapshot.sentLast24Hours +
          (reserved?.recipients ?? 0) +
          input.recipientCount >
          dailyLimit
      ) {
        return {
          retryAt: new Date(databaseNow.getTime() + AWS_SES_QUOTA_REFRESH_MS),
        };
      }

      const recipientsPerSecond = safeAwsSesRecipientsPerSecond(input.snapshot);
      const scheduledAt = new Date(
        Math.max(databaseNow.getTime(), state.nextAvailableAt.getTime()),
      );
      const nextAvailableAt = new Date(
        scheduledAt.getTime() +
          Math.ceil((input.recipientCount * 1_000) / recipientsPerSecond),
      );

      await tx.insert(awsSesSendReservations).values({
        createdAt: databaseNow,
        recipientCount: input.recipientCount,
        reservationKey: input.reservationKey,
        scheduledAt,
        scopeHash: input.scopeHash,
      });
      await tx
        .update(awsSesRateLimitStates)
        .set({ nextAvailableAt, updatedAt: databaseNow })
        .where(eq(awsSesRateLimitStates.scopeHash, input.scopeHash));

      return {
        delayMs: Math.max(0, scheduledAt.getTime() - databaseNow.getTime()),
        scheduledAt,
      };
    });
  },
};
