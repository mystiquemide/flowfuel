import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

interface DbInstance {
  db: ReturnType<typeof drizzle<typeof schema>>;
  sql: postgres.Sql;
}

const globalForDb = globalThis as unknown as {
  __flowfuelDbMap?: Map<string, DbInstance>;
};

const cache = globalForDb.__flowfuelDbMap ?? new Map<string, DbInstance>();
globalForDb.__flowfuelDbMap = cache;

export function createDb(url: string): DbInstance {
  let instance = cache.get(url);
  if (!instance) {
    const sql = postgres(url, { max: 5, idle_timeout: 10 });
    const db = drizzle(sql, { schema });
    instance = { db, sql };
    cache.set(url, instance);
  }
  return instance;
}

export async function closeDb(url?: string): Promise<void> {
  if (url) {
    const instance = cache.get(url);
    if (instance) {
      await instance.sql.end();
      cache.delete(url);
    }
  } else {
    for (const [key, instance] of cache.entries()) {
      await instance.sql.end();
      cache.delete(key);
    }
  }
}

export type Db = ReturnType<typeof createDb>["db"];
export type Sql = ReturnType<typeof createDb>["sql"];

export const DEFAULT_DATABASE_URL =
  "postgres://flowfuel:flowfuel@localhost:55432/flowfuel";

export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
}
