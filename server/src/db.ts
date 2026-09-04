import pg from "pg";

const { Pool } = pg;
export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 12,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: process.env.NODE_ENV === "production" ? false : undefined,
});

export async function migrate() {
  const { readFile } = await import("node:fs/promises");
  const sql = await readFile(
    new URL("../sql/001_init.sql", import.meta.url),
    "utf8",
  );
  await db.query(sql);
}
