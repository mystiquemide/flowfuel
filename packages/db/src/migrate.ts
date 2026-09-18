import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import type { Db } from "./client";

/**
 * Applies the generated drizzle migrations. The folder is resolved relative to
 * this package so callers in other modules do not need to know the path.
 * Kept out of the main entry point so bundled apps never pull the migrator.
 */
export async function migrateDb(db: Db): Promise<void> {
  const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));
  await migrate(db, { migrationsFolder });
}
