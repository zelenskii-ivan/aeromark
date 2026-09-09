import assert from "node:assert/strict";
import test from "node:test";
import {
  existingAccountEmailHtml,
  resetEmailHtml,
  resetExpiresAt,
  resetUrl,
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

test("ссылка смены пароля ведёт на свой домен и отличается параметром", () => {
  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://aeromark.example.com";
  const url = new URL(resetUrl("reset-token_42"));
  assert.equal(url.origin, "https://aeromark.example.com");
  assert.equal(url.searchParams.get("reset_password"), "reset-token_42");
  assert.equal(url.searchParams.get("verify_email"), null);
  if (previous === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = previous;
});

test("ссылка смены пароля живёт час, а не сутки", () => {
  // Она даёт полный доступ к кабинету без знания пароля — срок короче.
  const now = new Date("2026-09-07T10:00:00.000Z");
  assert.equal(resetExpiresAt(now).toISOString(), "2026-09-07T11:00:00.000Z");
  assert.ok(resetExpiresAt(now) < verificationExpiresAt(now));
});

test("письма про пароль экранируют имя и ссылку", () => {
  const html = resetEmailHtml("<Иван>", "https://example.com/?a=1&b=2");
  assert.equal(html.includes("<Иван>"), false);
  assert.match(html, /&lt;Иван&gt;/);
  assert.match(html, /a=1&amp;b=2/);
});

test("письмо о занятом адресе не выдаёт ссылок и не зовёт никуда входить по токену", () => {
  const html = existingAccountEmailHtml("Иван");
  assert.match(html, /уже занят/);
  assert.doesNotMatch(html, /verify_email|reset_password/);
});
