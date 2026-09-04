import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "./db.js";
import { hashPassword, hashToken, randomToken, verifyPassword } from "./security.js";

export const SESSION_COOKIE = "aeromark_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type Parent = {
  id: string;
  family_id: string;
  email: string;
  display_name: string;
};

declare module "fastify" {
  interface FastifyRequest {
    parent?: Parent;
  }
}

export async function createSession(
  parentId: string,
  reply: FastifyReply,
): Promise<void> {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  await db.query(
    "INSERT INTO sessions(id,parent_id,token_hash,expires_at) VALUES($1,$2,$3,$4)",
    [randomUUID(), parentId, hashToken(token), expires],
  );
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

/**
 * preHandler вместо «верни reply из хелпера»: раньше каждый маршрут был обязан
 * помнить про `if (!parent?.id) return;`, и один забытый чек означал бы выдачу
 * чужих данных. Теперь незалогиненный запрос до обработчика не доходит.
 */
export async function requireParent(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = request.cookies?.[SESSION_COOKIE];
  if (!token) {
    await reply.code(401).send({ error: "Требуется вход" });
    return;
  }
  const result = await db.query<Parent & { status: string }>(
    `SELECT p.id, p.family_id, p.email, p.display_name, f.status
       FROM sessions s
       JOIN parents p ON p.id = s.parent_id
       JOIN families f ON f.id = p.family_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  const user = result.rows[0];
  if (!user || user.status !== "active") {
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    await reply.code(401).send({ error: "Доступ отключён" });
    return;
  }
  request.parent = {
    id: user.id,
    family_id: user.family_id,
    email: user.email,
    display_name: user.display_name,
  };
}

export function parentOf(request: FastifyRequest): Parent {
  if (!request.parent) {
    // Недостижимо: маршрут без requireParent — ошибка программиста, и лучше
    // упасть в 500, чем молча обслужить анонима.
    throw new Error("requireParent не подключён к маршруту");
  }
  return request.parent;
}

/**
 * Ответ на несуществующий email должен занимать столько же времени, сколько на
 * существующий, иначе перебором можно узнать, кто зарегистрирован.
 */
let decoyHash: Promise<string> | null = null;

/**
 * Считает эталонный хеш заранее. Без этого первый же запрос по
 * несуществующему email отвечал заметно дольше остальных — единственный
 * оставшийся временной сигнал.
 */
export function warmUpPasswordTiming(): Promise<unknown> {
  decoyHash ??= hashPassword("decoy-password-for-timing-parity");
  return decoyHash;
}

export function verifyPasswordConstantish(
  hash: string | undefined,
  password: string,
): Promise<boolean> {
  if (hash) return verifyPassword(hash, password);
  return warmUpPasswordTiming()
    .then((value) => verifyPassword(value as string, password))
    .then(() => false);
}

export function isAdmin(request: FastifyRequest): boolean {
  const expected = process.env.ADMIN_BOOTSTRAP_TOKEN;
  const provided = request.headers["x-admin-token"];
  return Boolean(expected) && typeof provided === "string" && provided === expected;
}
