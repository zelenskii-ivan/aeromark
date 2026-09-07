import pg from "pg";

const { Pool } = pg;

/**
 * SSL включается переменной DATABASE_SSL, а не режимом сборки: в docker-compose
 * база живёт в приватной сети без TLS, а у управляемого Postgres он обязателен.
 * Прежняя формула `production ? false : undefined` выключала SSL именно там,
 * где он нужен.
 */
const ssl =
  process.env.DATABASE_SSL === "require"
    ? { rejectUnauthorized: process.env.DATABASE_SSL_INSECURE !== "1" }
    : undefined;

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DATABASE_POOL_MAX || 12),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl,
});
