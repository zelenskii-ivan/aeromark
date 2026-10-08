const VERIFY_TTL_HOURS = 24;
const RESET_TTL_MINUTES = 60;

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character] ?? character,
  );

export function verificationExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + VERIFY_TTL_HOURS * 60 * 60 * 1000);
}

/**
 * Ссылка смены пароля живёт час, а не сутки: она даёт полный доступ к кабинету
 * без знания пароля.
 */
export function resetExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + RESET_TTL_MINUTES * 60 * 1000);
}

const origin = (): string => process.env.APP_ORIGIN || "http://localhost:3000";

function linkWith(param: string, token: string): string {
  const url = new URL("/", origin());
  url.searchParams.set(param, token);
  return url.toString();
}

export const verificationUrl = (token: string): string =>
  linkWith("verify_email", token);
export const resetUrl = (token: string): string =>
  linkWith("reset_password", token);

/** Общая рамка письма: одна вёрстка на все три письма. */
function letter(input: {
  heading: string;
  intro: string;
  action?: { label: string; url: string };
  note: string;
}): string {
  const button = input.action
    ? `<p style="margin:28px 0">
        <a href="${escapeHtml(input.action.url)}" style="display:inline-block;padding:14px 22px;border-radius:12px;background:#087cb8;color:#fff;text-decoration:none;font-weight:700">${escapeHtml(input.action.label)}</a>
      </p>`
    : "";
  return `<!doctype html>
<html lang="ru">
  <body style="margin:0;background:#eaf8ff;font-family:Arial,sans-serif;color:#10243e">
    <div style="max-width:560px;margin:32px auto;padding:28px;background:#fff;border-radius:24px">
      <p style="font-size:13px;font-weight:700;letter-spacing:.08em;color:#087cb8">АЭРОМАРК</p>
      <h1 style="font-size:28px;margin:12px 0">${escapeHtml(input.heading)}</h1>
      <p style="font-size:17px;line-height:1.55">${escapeHtml(input.intro)}</p>
      ${button}
      <p style="font-size:14px;line-height:1.5;color:#5c7185">${escapeHtml(input.note)}</p>
    </div>
  </body>
</html>`;
}

/**
 * Текстовая версия обязательна: письмо только в HTML часть фильтров штрафует,
 * а некоторые клиенты показывают вместо него пустоту.
 */
function plain(input: { intro: string; url?: string; note: string }): string {
  return [input.intro, "", input.url ?? "", input.url ? "" : null, input.note]
    .filter((line) => line !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

export function verificationEmailHtml(displayName: string, url: string): string {
  return letter({
    heading: "Подтвердите почту",
    intro: `Здравствуйте, ${displayName}! Подтвердите адрес, чтобы открыть семейный кабинет и сохранять прогресс детей.`,
    action: { label: "Подтвердить почту", url },
    note: "Ссылка действует 24 часа. Если вы не регистрировались в Аэромарке, просто проигнорируйте письмо.",
  });
}

export function resetEmailHtml(displayName: string, url: string): string {
  return letter({
    heading: "Новый пароль",
    intro: `Здравствуйте, ${displayName}! Вы запросили смену пароля в Аэромарке. Задайте новый по ссылке.`,
    action: { label: "Задать новый пароль", url },
    note: "Ссылка действует час и срабатывает один раз. Если вы ничего не запрашивали, письмо можно удалить: пароль останется прежним.",
  });
}

/**
 * Письмо владельцу уже занятого адреса. Регистрация отвечает одинаково на
 * свободный и занятый адрес, иначе по форме можно проверить, кто здесь
 * зарегистрирован. Владелец узнаёт о попытке отсюда.
 */
export function existingAccountEmailHtml(displayName: string): string {
  return letter({
    heading: "Аккаунт уже существует",
    intro: `Здравствуйте, ${displayName}! Кто-то попытался зарегистрировать кабинет Аэромарка на этот адрес, но он уже занят вашим аккаунтом. Новый кабинет не создан.`,
    note: "Если это были вы — просто войдите. Забыли пароль — воспользуйтесь ссылкой «Забыли пароль» на экране входа.",
  });
}

type Letter = { subject: string; html: string; text: string };

async function deliver(to: string, mail: Letter): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY и EMAIL_FROM должны быть настроены");
    }
    // В локальной разработке ссылка нужна разработчику, но в production токен
    // никогда не попадает в журнал.
    console.info({ to, subject: mail.subject, text: mail.text }, "email");
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Resend вернул ${response.status}: ${details.slice(0, 300)}`);
  }
}

export async function sendVerificationEmail(input: {
  email: string;
  displayName: string;
  token: string;
}): Promise<void> {
  const url = verificationUrl(input.token);
  await deliver(input.email, {
    subject: "Подтвердите почту в Аэромарке",
    html: verificationEmailHtml(input.displayName, url),
    text: plain({
      intro: `Здравствуйте, ${input.displayName}! Подтвердите адрес, чтобы открыть семейный кабинет Аэромарка:`,
      url,
      note: "Ссылка действует 24 часа. Если вы не регистрировались, письмо можно удалить.",
    }),
  });
}

export async function sendPasswordResetEmail(input: {
  email: string;
  displayName: string;
  token: string;
}): Promise<void> {
  const url = resetUrl(input.token);
  await deliver(input.email, {
    subject: "Новый пароль в Аэромарке",
    html: resetEmailHtml(input.displayName, url),
    text: plain({
      intro: `Здравствуйте, ${input.displayName}! Вы запросили смену пароля в Аэромарке. Задать новый:`,
      url,
      note: "Ссылка действует час и срабатывает один раз. Если вы ничего не запрашивали, пароль останется прежним.",
    }),
  });
}

export async function sendExistingAccountEmail(input: {
  email: string;
  displayName: string;
}): Promise<void> {
  await deliver(input.email, {
    subject: "Аккаунт Аэромарка уже существует",
    html: existingAccountEmailHtml(input.displayName),
    text: plain({
      intro: `Здравствуйте, ${input.displayName}! Кто-то попытался зарегистрировать кабинет Аэромарка на этот адрес, но он уже занят вашим аккаунтом. Новый кабинет не создан.`,
      note: "Если это были вы — просто войдите. Забыли пароль — воспользуйтесь ссылкой «Забыли пароль» на экране входа.",
    }),
  });
}
