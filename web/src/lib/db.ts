import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";

const globalForDatabase = globalThis as typeof globalThis & {
  avaliaDatabasePool?: Pool;
};

export function getDatabase() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("Configure DATABASE_URL no ambiente do servidor.");
  }

  if (!globalForDatabase.avaliaDatabasePool) {
    const pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });

    attachDatabasePool(pool);
    globalForDatabase.avaliaDatabasePool = pool;
  }

  return globalForDatabase.avaliaDatabasePool;
}
