import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { db } from "./db.js";

/** Произвольное, но постоянное число: идентификатор advisory-lock миграций. */
const MIGRATION_LOCK = 4_820_7311;

const SQL_DIR = fileURLToPath(new URL("../sql", import.meta.url));

/**
 * Раньше при каждом старте выполнялся весь 001_init.sql, а таблицы миграций не
 * было вовсе — то есть пути к 002_* не существовало, а при нескольких репликах
 * старты гонялись между собой. Теперь применённые файлы записываются, а на
 * время применения берётся advisory-lock.
 */
export async function migrate(): Promise<string[]> {
  const client = await db.connect();
  const applied: string[] = [];
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK]);
    const done = new Set(
      (await client.query<{ name: string }>("SELECT name FROM schema_migrations"))
        .rows.map((row) => row.name),
    );
    const files = (await readdir(SQL_DIR))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    for (const name of files) {
      if (done.has(name)) continue;
      const sql = await readFile(path.join(SQL_DIR, name), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations(name) VALUES($1)", [
          name,
        ]);
        await client.query("COMMIT");
        applied.push(name);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    return applied;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK]).catch(() => {});
    client.release();
  }
}
