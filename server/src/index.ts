import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { db } from "./db.js";
import { migrate } from "./migrate.js";
import {
  createSession,
  isAdmin,
  parentOf,
  requireParent,
  SESSION_COOKIE,
  verifyPasswordConstantish,
  warmUpPasswordTiming,
} from "./auth.js";
import { hashPassword, hashToken, normalizeInvite, randomToken } from "./security.js";
import {
  sendVerificationEmail,
  verificationExpiresAt,
} from "./email.js";

const app = Fastify({ logger: true, trustProxy: true, bodyLimit: 256_000 });
const origin = process.env.APP_ORIGIN || "http://localhost:3000";

await app.register(helmet, {
  // API отдаёт только JSON, поэтому запрещаем всё: скрипты, кадры, объекты.
  contentSecurityPolicy: {
    directives: {
      "default-src": ["'none'"],
      "frame-ancestors": ["'none'"],
      "base-uri": ["'none'"],
      "form-action": ["'none'"],
    },
  },
});
await app.register(cookie);
await app.register(cors, { origin, credentials: true });
await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

const credentials = z.object({
  email: z.string().email().max(200),
  password: z.string().min(10).max(128),
});
const idParams = z.object({ id: z.string().uuid() });

/**
 * Ответы API не должны кешироваться браузером. Без этого заголовка Chrome
 * переиспользовал ответ GET /api/me, и только что созданный профиль ребёнка
 * не появлялся в списке до перезагрузки страницы.
 */
app.addHook("onSend", async (_request, reply) => {
  reply.header("cache-control", "no-store");
});

app.get("/health", async () => ({ ok: true }));

app.post(
  "/api/admin/invites",
  { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
  async (request, reply) => {
    if (!isAdmin(request)) return reply.code(403).send({ error: "Нет доступа" });
    const body = z.object({ label: z.string().min(2).max(100) }).parse(request.body);
    const code = normalizeInvite(`AERO-${randomToken(6).toUpperCase()}`);
    await db.query("INSERT INTO invite_codes(id,code_hash,label) VALUES($1,$2,$3)", [
      randomUUID(),
      hashToken(code),
      body.label,
    ]);
    return { code, label: body.label };
  },
);

app.post(
  "/api/auth/register",
  { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
  async (request, reply) => {
    const body = credentials
      .extend({
        displayName: z.string().min(2).max(80),
      })
      .parse(request.body);
    const email = body.email.trim().toLowerCase();
    const client = await db.connect();
    const verificationToken = randomToken();
    try {
      await client.query("BEGIN");
      const familyId = randomUUID();
      const parentId = randomUUID();
      await client.query("INSERT INTO families(id) VALUES($1)", [familyId]);
      await client.query(
        "INSERT INTO parents(id,family_id,email,password_hash,display_name) VALUES($1,$2,$3,$4,$5)",
        [
          parentId,
          familyId,
          email,
          await hashPassword(body.password),
          body.displayName,
        ],
      );
      await client.query(
        `INSERT INTO email_verification_tokens
           (id,parent_id,token_hash,expires_at)
         VALUES($1,$2,$3,$4)`,
        [
          randomUUID(),
          parentId,
          hashToken(verificationToken),
          verificationExpiresAt(),
        ],
      );
      await client.query("COMMIT");
      try {
        await sendVerificationEmail({
          email,
          displayName: body.displayName,
          token: verificationToken,
        });
      } catch (error) {
        app.log.error({ error, email }, "не удалось отправить подтверждение почты");
        return reply.code(503).send({
          error: "Аккаунт создан, но письмо не отправилось. Нажмите «Отправить ещё раз».",
        });
      }
      return reply.code(201).send({ ok: true, needsVerification: true });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if ((error as { code?: string })?.code === "23505") {
        return reply.code(409).send({ error: "Такой email уже зарегистрирован" });
      }
      throw error;
    } finally {
      client.release();
    }
  },
);

app.post(
  "/api/auth/resend-verification",
  { config: { rateLimit: { max: 3, timeWindow: "15 minutes" } } },
  async (request, reply) => {
    const body = z.object({ email: z.string().email().max(200) }).parse(request.body);
    const email = body.email.trim().toLowerCase();
    const result = await db.query<{
      id: string;
      display_name: string;
      email_verified_at: Date | null;
    }>(
      "SELECT id,display_name,email_verified_at FROM parents WHERE email=$1",
      [email],
    );
    const parent = result.rows[0];
    if (parent && !parent.email_verified_at) {
      const token = randomToken();
      await db.query(
        "UPDATE email_verification_tokens SET used_at=now() WHERE parent_id=$1 AND used_at IS NULL",
        [parent.id],
      );
      await db.query(
        `INSERT INTO email_verification_tokens
           (id,parent_id,token_hash,expires_at)
         VALUES($1,$2,$3,$4)`,
        [randomUUID(), parent.id, hashToken(token), verificationExpiresAt()],
      );
      try {
        await sendVerificationEmail({
          email,
          displayName: parent.display_name,
          token,
        });
      } catch (error) {
        app.log.error({ error, email }, "повторное письмо не отправлено");
        return reply.code(503).send({ error: "Письмо пока не отправилось. Повторите позже." });
      }
    }
    return reply.send({
      ok: true,
      message: "Если адрес зарегистрирован, новое письмо уже отправлено.",
    });
  },
);

app.post(
  "/api/auth/verify-email",
  { config: { rateLimit: { max: 12, timeWindow: "10 minutes" } } },
  async (request, reply) => {
    const body = z.object({ token: z.string().min(32).max(200) }).parse(request.body);
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{ id: string; parent_id: string }>(
        `SELECT id,parent_id
           FROM email_verification_tokens
          WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now()
          FOR UPDATE`,
        [hashToken(body.token)],
      );
      const verification = result.rows[0];
      if (!verification) {
        await client.query("ROLLBACK");
        return reply.code(400).send({ error: "Ссылка недействительна или устарела" });
      }
      await client.query(
        "UPDATE parents SET email_verified_at=COALESCE(email_verified_at,now()) WHERE id=$1",
        [verification.parent_id],
      );
      await client.query(
        "UPDATE email_verification_tokens SET used_at=now() WHERE parent_id=$1 AND used_at IS NULL",
        [verification.parent_id],
      );
      await client.query("COMMIT");
      await createSession(verification.parent_id, reply);
      return { ok: true };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
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
    const result = await db.query<{
      id: string;
      password_hash: string;
      status: string;
      email_verified_at: Date | null;
    }>(
      `SELECT p.id, p.password_hash, p.email_verified_at, f.status
         FROM parents p JOIN families f ON f.id = p.family_id
        WHERE p.email = $1`,
      [body.email.toLowerCase()],
    );
    const parent = result.rows[0];
    const passwordOk = await verifyPasswordConstantish(
      parent?.password_hash,
      body.password,
    );
    if (!parent || parent.status !== "active" || !passwordOk) {
      return reply.code(401).send({ error: "Неверный email или пароль" });
    }
    if (!parent.email_verified_at) {
      return reply.code(403).send({ error: "Сначала подтвердите почту" });
    }
    await createSession(parent.id, reply);
    return { ok: true };
  },
);

app.post("/api/auth/logout", async (request, reply) => {
  const token = request.cookies?.[SESSION_COOKIE];
  if (token) {
    await db.query("DELETE FROM sessions WHERE token_hash=$1", [hashToken(token)]);
  }
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
  return { ok: true };
});

app.register(async (secured) => {
  secured.addHook("preHandler", requireParent);

  secured.get("/api/me", async (request) => {
    const parent = parentOf(request);
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

  secured.post("/api/children", async (request, reply) => {
    const parent = parentOf(request);
    const body = z
      .object({
        name: z.string().min(1).max(40),
        pin: z.string().regex(/^\d{4}$/),
        birthYear: z.number().int().min(2010).max(2030).optional(),
        theme: z.string().max(30).default("aviation"),
      })
      .parse(request.body);
    const id = randomUUID();
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO children(id,family_id,name,pin_hash,birth_year,theme) VALUES($1,$2,$3,$4,$5,$6)",
        [id, parent.family_id, body.name, await hashPassword(body.pin), body.birthYear ?? null, body.theme],
      );
      await client.query("INSERT INTO progress(child_id,payload) VALUES($1,'{}'::jsonb)", [id]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    return reply.code(201).send({ id, name: body.name, theme: body.theme });
  });

  secured.post(
    "/api/children/:id/unlock",
    { config: { rateLimit: { max: 15, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      const parent = parentOf(request);
      const params = idParams.parse(request.params);
      const body = z.object({ pin: z.string().regex(/^\d{4}$/) }).parse(request.body);
      const child = await db.query<{ id: string; pin_hash: string }>(
        "SELECT id,pin_hash FROM children WHERE id=$1 AND family_id=$2",
        [params.id, parent.family_id],
      );
      const ok = await verifyPasswordConstantish(child.rows[0]?.pin_hash, body.pin);
      if (!child.rows[0] || !ok) return reply.code(401).send({ error: "Неверный PIN" });
      return { childId: child.rows[0].id, unlocked: true };
    },
  );

  secured.get("/api/children/:id/progress", async (request, reply) => {
    const parent = parentOf(request);
    const params = idParams.parse(request.params);
    const result = await db.query(
      `SELECT p.payload, p.revision, p.updated_at
         FROM progress p JOIN children c ON c.id = p.child_id
        WHERE c.id = $1 AND c.family_id = $2`,
      [params.id, parent.family_id],
    );
    if (!result.rows[0]) return reply.code(404).send({ error: "Профиль не найден" });
    return result.rows[0];
  });

  secured.put("/api/children/:id/progress", async (request, reply) => {
    const parent = parentOf(request);
    const params = idParams.parse(request.params);
    const body = z
      .object({
        payload: z.record(z.string(), z.unknown()),
        revision: z.number().int().positive(),
      })
      .parse(request.body);
    const result = await db.query(
      `UPDATE progress p
          SET payload = $1, revision = revision + 1, updated_at = now()
         FROM children c
        WHERE p.child_id = c.id AND c.id = $2 AND c.family_id = $3 AND p.revision = $4
      RETURNING p.revision, p.updated_at`,
      [body.payload, params.id, parent.family_id, body.revision],
    );
    if (!result.rows[0]) {
      return reply.code(409).send({
        error: "Прогресс изменился на другом устройстве. Обновите страницу.",
      });
    }
    return result.rows[0];
  });

  /**
   * Удаление профиля ребёнка. SECURITY.md обещает минимизацию данных, но до
   * этого маршрута удалить их было нечем: прогресс и PIN оставались навсегда.
   */
  secured.delete("/api/children/:id", async (request, reply) => {
    const parent = parentOf(request);
    const params = idParams.parse(request.params);
    const result = await db.query(
      "DELETE FROM children WHERE id=$1 AND family_id=$2 RETURNING id",
      [params.id, parent.family_id],
    );
    if (!result.rows[0]) return reply.code(404).send({ error: "Профиль не найден" });
    return reply.code(204).send();
  });

  /** Полное удаление семьи по требованию родителя, вместе со всеми сессиями. */
  secured.delete("/api/me", async (request, reply) => {
    const parent = parentOf(request);
    await db.query("DELETE FROM families WHERE id=$1", [parent.family_id]);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.code(204).send();
  });
});

app.post("/api/admin/families/:id/block", async (request, reply) => {
  if (!isAdmin(request)) return reply.code(403).send({ error: "Нет доступа" });
  const params = idParams.parse(request.params);
  await db.query("UPDATE families SET status='blocked' WHERE id=$1", [params.id]);
  await db.query(
    "DELETE FROM sessions WHERE parent_id IN (SELECT id FROM parents WHERE family_id=$1)",
    [params.id],
  );
  return { ok: true };
});

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof z.ZodError) {
    return reply.code(400).send({ error: "Проверьте заполнение полей", details: error.issues });
  }
  // Обработчик обязан уважать статус, который выставил плагин. Без этого
  // срабатывание ограничителя частоты отдавало 500 «Внутренняя ошибка»:
  // родитель, трижды ошибившийся паролем, видел поломку сервера вместо
  // понятного «слишком много попыток».
  const status = (error as { statusCode?: number }).statusCode ?? 500;
  if (status === 429) {
    return reply
      .code(429)
      .send({ error: "Слишком много попыток. Подождите немного и повторите." });
  }
  if (status === 413) {
    return reply.code(413).send({ error: "Слишком большой запрос" });
  }
  if (status >= 400 && status < 500) {
    // Текст ошибки Fastify технический, наружу отдаём нейтральный.
    return reply.code(status).send({ error: "Некорректный запрос" });
  }
  app.log.error(error);
  return reply.code(500).send({ error: "Внутренняя ошибка" });
});

await warmUpPasswordTiming();
const applied = await migrate();
if (applied.length) app.log.info({ applied }, "миграции применены");

const purgeSessions = async () => {
  try {
    await db.query("DELETE FROM sessions WHERE expires_at <= now()");
    await db.query(
      "DELETE FROM email_verification_tokens WHERE expires_at <= now() OR used_at < now() - interval '7 days'",
    );
  } catch (error) {
    app.log.warn({ error }, "не удалось очистить протухшие сессии");
  }
};
await purgeSessions();
// Раньше чистка выполнялась один раз при старте: на долгоживущем сервере
// таблица сессий росла месяцами.
const purgeTimer = setInterval(purgeSessions, 6 * 60 * 60 * 1000);
purgeTimer.unref();

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    clearInterval(purgeTimer);
    app.close().then(() => db.end()).finally(() => process.exit(0));
  });
}

await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT || 4000) });
