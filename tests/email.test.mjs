import assert from "node:assert/strict";
import test from "node:test";
import {
  verificationEmailHtml,
  verificationExpiresAt,
  verificationUrl,
} from "../server/src/email.ts";

test("ссылка подтверждения ведёт на собственный домен и сохраняет токен", () => {
  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://aeromark.example.com";
  const url = new URL(verificationUrl("token-with-symbols_123"));
  assert.equal(url.origin, "https://aeromark.example.com");
  assert.equal(url.searchParams.get("verify_email"), "token-with-symbols_123");
  if (previous === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = previous;
});

test("письмо экранирует имя и ссылку", () => {
  const html = verificationEmailHtml("<Иван>", "https://example.com/?a=1&b=2");
  assert.equal(html.includes("<Иван>"), false);
  assert.match(html, /&lt;Иван&gt;/);
  assert.match(html, /a=1&amp;b=2/);
});

test("ссылка подтверждения действует 24 часа", () => {
  const now = new Date("2026-09-07T10:00:00.000Z");
  assert.equal(
    verificationExpiresAt(now).toISOString(),
    "2026-09-08T10:00:00.000Z",
  );
});
