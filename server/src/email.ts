const VERIFY_TTL_HOURS = 24;

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

export function verificationUrl(token: string): string {
  const origin = process.env.APP_ORIGIN || "http://localhost:3000";
  const url = new URL("/", origin);
  url.searchParams.set("verify_email", token);
  return url.toString();
}

export function verificationEmailHtml(displayName: string, url: string): string {
  return `<!doctype html>
<html lang="ru">
  <body style="margin:0;background:#eaf8ff;font-family:Arial,sans-serif;color:#10243e">
    <div style="max-width:560px;margin:32px auto;padding:28px;background:#fff;border-radius:24px">
      <p style="font-size:13px;font-weight:700;letter-spacing:.08em;color:#087cb8">АЭРОМАРК</p>
      <h1 style="font-size:28px;margin:12px 0">Подтвердите почту</h1>
      <p style="font-size:17px;line-height:1.55">Здравствуйте, ${escapeHtml(displayName)}! Подтвердите адрес, чтобы открыть семейный кабинет и сохранять прогресс детей.</p>
      <p style="margin:28px 0">
        <a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 22px;border-radius:12px;background:#087cb8;color:#fff;text-decoration:none;font-weight:700">Подтвердить почту</a>
      </p>
      <p style="font-size:14px;line-height:1.5;color:#5c7185">Ссылка действует 24 часа. Если вы не регистрировались в Аэромарке, просто проигнорируйте письмо.</p>
    </div>
  </body>
</html>`;
}

export async function sendVerificationEmail(input: {
  email: string;
  displayName: string;
  token: string;
}): Promise<void> {
  const url = verificationUrl(input.token);
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY и EMAIL_FROM должны быть настроены");
    }
    // В локальной разработке ссылка нужна разработчику, но в production токен
    // никогда не попадает в журнал.
    console.info({ email: input.email, verificationUrl: url }, "email verification");
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
      to: [input.email],
      subject: "Подтвердите почту в Аэромарке",
      html: verificationEmailHtml(input.displayName, url),
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Resend вернул ${response.status}: ${details.slice(0, 300)}`);
  }
}
