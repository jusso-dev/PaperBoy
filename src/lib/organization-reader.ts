import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orgs } from "@/db/schema";

export type OrganizationRecord = {
  id: string;
  name: string;
};

export async function findOrganizationById(
  orgId: string,
): Promise<OrganizationRecord | null> {
  const [organization] = await db
    .select({ id: orgs.id, name: orgs.name })
    .from(orgs)
    .where(eq(orgs.id, orgId))
    .limit(1);

  return organization ?? null;
}
