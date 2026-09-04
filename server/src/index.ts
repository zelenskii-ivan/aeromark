import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { db, migrate } from "./db.js";
import {
  hashPassword,
  hashToken,
  normalizeInvite,
  randomToken,
  verifyPassword,
} from "./security.js";

const app = Fastify({ logger: true, trustProxy: true, bodyLimit: 256_000 });
const origin = process.env.APP_ORIGIN || "http://localhost:3000";
const production = process.env.NODE_ENV === "production";
await app.register(helmet, { contentSecurityPolicy: false });
await app.register(cookie);
await app.register(cors, { origin, credentials: true });
await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

const credentials = z.object({
  email: z.string().email().max(200),
  password: z.string().min(10).max(128),
});
const sessionCookie = "aeromark_session";

async function createSession(parentId: string, reply: any) {
  const token = randomToken();
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.query(
    "INSERT INTO sessions(id,parent_id,token_hash,expires_at) VALUES($1,$2,$3,$4)",
    [randomUUID(), parentId, hashToken(token), expires],
  );
  reply.setCookie(sessionCookie, token, {
    httpOnly: true,
    secure: production,
    sameSite: "lax",
    path: "/",
    expires,
  });
}

async function currentParent(request: any, reply: any) {
  const token = request.cookies?.[sessionCookie];
  if (!token) return reply.code(401).send({ error: "Требуется вход" });
  const result = await db.query(
    "SELECT p.id,p.family_id,p.email,p.display_name,f.status FROM sessions s JOIN parents p ON p.id=s.parent_id JOIN families f ON f.id=p.family_id WHERE s.token_hash=$1 AND s.expires_at>now()",
    [hashToken(token)],
  );
  const user = result.rows[0];
  if (!user || user.status !== "active")
    return reply.code(401).send({ error: "Доступ отключён" });
  return user;
}

app.get("/health", async () => ({ ok: true }));

app.post(
  "/api/admin/invites",
  { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
  async (request, reply) => {
    if (
      !process.env.ADMIN_BOOTSTRAP_TOKEN ||
      request.headers["x-admin-token"] !== process.env.ADMIN_BOOTSTRAP_TOKEN
    )
      return reply.code(403).send({ error: "Нет доступа" });
    const body = z
      .object({ label: z.string().min(2).max(100) })
      .parse(request.body);
    const code = normalizeInvite(`AERO-${randomToken(6).toUpperCase()}`);
    await db.query(
      "INSERT INTO invite_codes(id,code_hash,label) VALUES($1,$2,$3)",
      [randomUUID(), hashToken(code), body.label],
    );
    return { code, label: body.label };
  },
);

app.post(
  "/api/auth/register",
  { config: { rateLimit: { max: 8, timeWindow: "10 minutes" } } },
  async (request, reply) => {
    const body = credentials
      .extend({
        inviteCode: z.string().min(6).max(60),
        displayName: z.string().min(2).max(80),
      })
      .parse(request.body);
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const invite = await client.query(
        "SELECT id,status FROM invite_codes WHERE code_hash=$1 FOR UPDATE",
        [hashToken(normalizeInvite(body.inviteCode))],
      );
      if (!invite.rows[0] || invite.rows[0].status !== "active") {
        await client.query("ROLLBACK");
        return reply
          .code(403)
          .send({ error: "Код недействителен или уже использован" });
      }
      const familyId = randomUUID();
      const parentId = randomUUID();
      await client.query("INSERT INTO families(id) VALUES($1)", [familyId]);
      await client.query(
        "INSERT INTO parents(id,family_id,email,password_hash,display_name) VALUES($1,$2,$3,$4,$5)",
        [
          parentId,
          familyId,
          body.email.toLowerCase(),
          await hashPassword(body.password),
          body.displayName,
        ],
      );
      await client.query(
        "UPDATE invite_codes SET status='used',family_id=$1,used_at=now() WHERE id=$2",
        [familyId, invite.rows[0].id],
      );
      await client.query("COMMIT");
      await createSession(parentId, reply);
      return reply.code(201).send({ ok: true });
    } catch (error: any) {
      await client.query("ROLLBACK");
      if (error?.code === "23505")
        return reply
          .code(409)
          .send({ error: "Такой email уже зарегистрирован" });
      throw error;
    } finally {
      client.release();
    }
  },
);

app.post(
  "/api/auth/login",
  { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } },
  async (request, reply) => {
    const body = credentials.parse(request.body);
    const result = await db.query(
      "SELECT p.id,p.password_hash,f.status FROM parents p JOIN families f ON f.id=p.family_id WHERE p.email=$1",
      [body.email.toLowerCase()],
    );
    const parent = result.rows[0];
    if (
      !parent ||
      parent.status !== "active" ||
      !(await verifyPassword(parent.password_hash, body.password))
    )
      return reply.code(401).send({ error: "Неверный email или пароль" });
    await createSession(parent.id, reply);
    return { ok: true };
  },
);

app.post("/api/auth/logout", async (request, reply) => {
  const token = request.cookies?.[sessionCookie];
  if (token)
    await db.query("DELETE FROM sessions WHERE token_hash=$1", [
      hashToken(token),
    ]);
  reply.clearCookie(sessionCookie, { path: "/" });
  return { ok: true };
});

app.get("/api/me", async (request, reply) => {
  const parent = await currentParent(request, reply);
  if (!parent?.id) return;
  const children = await db.query(
    "SELECT id,name,birth_year,theme,created_at FROM children WHERE family_id=$1 ORDER BY created_at",
    [parent.family_id],
  );
  return {
    parent: {
      id: parent.id,
      email: parent.email,
      displayName: parent.display_name,
    },
    children: children.rows,
  };
});

app.post("/api/children", async (request, reply) => {
  const parent = await currentParent(request, reply);
  if (!parent?.id) return;
  const body = z
    .object({
      name: z.string().min(1).max(40),
      pin: z.string().regex(/^\d{4}$/),
      birthYear: z.number().int().min(2010).max(2030).optional(),
      theme: z.string().max(30).default("aviation"),
    })
    .parse(request.body);
  const id = randomUUID();
  await db.query(
    "INSERT INTO children(id,family_id,name,pin_hash,birth_year,theme) VALUES($1,$2,$3,$4,$5,$6)",
    [
      id,
      parent.family_id,
      body.name,
      await hashPassword(body.pin),
      body.birthYear || null,
      body.theme,
    ],
  );
  await db.query(
    "INSERT INTO progress(child_id,payload) VALUES($1,'{}'::jsonb)",
    [id],
  );
  return reply.code(201).send({ id, name: body.name, theme: body.theme });
});

app.post(
  "/api/children/:id/unlock",
  { config: { rateLimit: { max: 15, timeWindow: "10 minutes" } } },
  async (request, reply) => {
    const parent = await currentParent(request, reply);
    if (!parent?.id) return;
    const body = z
      .object({ pin: z.string().regex(/^\d{4}$/) })
      .parse(request.body);
    const child = await db.query(
      "SELECT id,pin_hash FROM children WHERE id=$1 AND family_id=$2",
      [(request.params as any).id, parent.family_id],
    );
    if (
      !child.rows[0] ||
      !(await verifyPassword(child.rows[0].pin_hash, body.pin))
    )
      return reply.code(401).send({ error: "Неверный PIN" });
    return { childId: child.rows[0].id, unlocked: true };
  },
);

app.get("/api/children/:id/progress", async (request, reply) => {
  const parent = await currentParent(request, reply);
  if (!parent?.id) return;
  const result = await db.query(
    "SELECT p.payload,p.revision,p.updated_at FROM progress p JOIN children c ON c.id=p.child_id WHERE c.id=$1 AND c.family_id=$2",
    [(request.params as any).id, parent.family_id],
  );
  if (!result.rows[0])
    return reply.code(404).send({ error: "Профиль не найден" });
  return result.rows[0];
});

app.put("/api/children/:id/progress", async (request, reply) => {
  const parent = await currentParent(request, reply);
  if (!parent?.id) return;
  const body = z
    .object({
      payload: z.record(z.string(), z.unknown()),
      revision: z.number().int().positive(),
    })
    .parse(request.body);
  const result = await db.query(
    "UPDATE progress p SET payload=$1,revision=revision+1,updated_at=now() FROM children c WHERE p.child_id=c.id AND c.id=$2 AND c.family_id=$3 AND p.revision=$4 RETURNING p.revision,p.updated_at",
    [body.payload, (request.params as any).id, parent.family_id, body.revision],
  );
  if (!result.rows[0])
    return reply
      .code(409)
      .send({
        error: "Прогресс изменился на другом устройстве. Обновите страницу.",
      });
  return result.rows[0];
});

app.post("/api/admin/families/:id/block", async (request, reply) => {
  if (
    !process.env.ADMIN_BOOTSTRAP_TOKEN ||
    request.headers["x-admin-token"] !== process.env.ADMIN_BOOTSTRAP_TOKEN
  )
    return reply.code(403).send({ error: "Нет доступа" });
  await db.query("UPDATE families SET status='blocked' WHERE id=$1", [
    (request.params as any).id,
  ]);
  await db.query(
    "DELETE FROM sessions WHERE parent_id IN (SELECT id FROM parents WHERE family_id=$1)",
    [(request.params as any).id],
  );
  return { ok: true };
});

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof z.ZodError)
    return reply
      .code(400)
      .send({ error: "Проверьте заполнение полей", details: error.issues });
  app.log.error(error);
  return reply.code(500).send({ error: "Внутренняя ошибка" });
});

await migrate();
await db.query("DELETE FROM sessions WHERE expires_at <= now()");
await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT || 4000) });
