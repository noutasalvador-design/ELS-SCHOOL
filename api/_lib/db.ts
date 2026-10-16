import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn("DATABASE_URL is not configured. Neon database requests will fail until it is set in Vercel.");
}

declare global {
  // Reuse a single pool across warm Vercel function invocations.
  // eslint-disable-next-line no-var
  var elsSchoolPool: Pool | undefined;
}

export const db = globalThis.elsSchoolPool ?? new Pool({
  connectionString,
  // Neon requires TLS for hosted connections.
  ssl: connectionString ? { rejectUnauthorized: true } : undefined,
  max: 5,
  idleTimeoutMillis: 5_000,
  connectionTimeoutMillis: 10_000,
});

if (process.env.NODE_ENV !== "production") {
  globalThis.elsSchoolPool = db;
}
