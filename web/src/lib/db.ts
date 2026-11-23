import { neon } from "@neondatabase/serverless";

export function getSql() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("Configure DATABASE_URL no arquivo .env.local.");
  }

  return neon(connectionString);
}
