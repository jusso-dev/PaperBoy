import { resolve } from "node:path";
import { config } from "dotenv";
import { migrate } from "drizzle-orm/node-postgres/migrator";

config({ quiet: true });

async function main() {
  const { db } = await import("@/db");
  try {
    await migrate(db, {
      migrationsFolder: resolve(process.cwd(), "drizzle"),
    });
    console.error("PaperBoy database migrations applied.");
  } finally {
    await db.$client.end();
  }
}

void main().catch(() => {
  console.error(
    "PaperBoy database migration failed. Check DATABASE_URL, database reachability, and migration state.",
  );
  process.exitCode = 1;
});
