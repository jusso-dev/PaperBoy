import { resolve } from "node:path";
import { migrate } from "drizzle-orm/bun-sql/migrator";

async function main() {
  const { db } = await import("@/db");
  try {
    await migrate(db, {
      migrationsFolder: resolve(process.cwd(), "drizzle"),
    });
    console.error("PaperBoy database migrations applied.");
  } finally {
    await db.$client.close();
  }
}

void main().catch(() => {
  console.error(
    "PaperBoy database migration failed. Check DATABASE_URL, database reachability, and migration state.",
  );
  process.exitCode = 1;
});
