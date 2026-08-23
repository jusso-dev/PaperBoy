import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { audiences, contacts, emailSuppressions } from "@/db/schema";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe-core";

export class UnsubscribeError extends Error {
  readonly code = "INVALID_TOKEN";

  constructor() {
    super("The unsubscribe link is invalid.");
    this.name = "UnsubscribeError";
  }
}

export type UnsubscribeResult = {
  replayed: boolean;
  unsubscribedAt: Date;
};

export async function unsubscribe(input: {
  key?: Buffer;
  now?: Date;
  token: string;
}): Promise<UnsubscribeResult> {
  const contactId = verifyUnsubscribeToken({ key: input.key, token: input.token });
  if (!contactId) throw new UnsubscribeError();
  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({
        audienceId: contacts.audienceId,
        email: contacts.email,
        unsubscribedAt: contacts.unsubscribedAt,
      })
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .for("update");
    if (!target) throw new UnsubscribeError();
    const [audience] = await tx
      .select({ orgId: audiences.orgId })
      .from(audiences)
      .where(eq(audiences.id, target.audienceId))
      .limit(1);
    if (!audience) throw new UnsubscribeError();
    const organizationAudiences = await tx
      .select({ id: audiences.id })
      .from(audiences)
      .where(eq(audiences.orgId, audience.orgId));

    await tx
      .update(contacts)
      .set({
        unsubscribedAt: sql`coalesce(${contacts.unsubscribedAt}, ${now})`,
        updatedAt: now,
      })
      .where(
        and(
          inArray(
            contacts.audienceId,
            organizationAudiences.map((row) => row.id),
          ),
          eq(contacts.email, target.email),
        ),
      );
    await tx
      .insert(emailSuppressions)
      .values({
        createdAt: now,
        email: target.email,
        orgId: audience.orgId,
        reason: "unsubscribed",
        updatedAt: now,
      })
      .onConflictDoUpdate({
        set: {
          reason: sql`case
            when ${emailSuppressions.reason} = 'complained' then 'complained'
            when ${emailSuppressions.reason} = 'bounced' then 'bounced'
            else 'unsubscribed'
          end`,
          updatedAt: now,
        },
        target: [emailSuppressions.orgId, emailSuppressions.email],
      });

    return {
      replayed: target.unsubscribedAt !== null,
      unsubscribedAt: target.unsubscribedAt ?? now,
    };
  });
}
