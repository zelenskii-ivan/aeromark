import { migrateProgress, type Saved } from "./progress.ts";

/**
 * Клиент семейного API. Сервер живёт на том же домене за обратным прокси
 * (Caddy отдаёт /api и /health на api:4000), поэтому базовый путь относительный
 * и никакой настройки от родителя не требует.
 */
const BASE = "/api";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Сеть недоступна — приложение обязано продолжать работать локально. */
export class OfflineError extends Error {
  constructor() {
    super("Сервер недоступен");
    this.name = "OfflineError";
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      credentials: "include",
      // Ответы API описывают текущее состояние семьи — кеш здесь только вредит.
      cache: "no-store",
      headers: init.body
        ? { "content-type": "application/json", ...init.headers }
        : init.headers,
    });
  } catch {
    throw new OfflineError();
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      // Пришёл не JSON — значит по этому пути отвечает не API, а, например,
      // страница 404 самого сайта: обратный прокси не настроен. Для приложения
      // это то же самое, что недоступный сервер, и разбирать HTML нечего.
      throw new OfflineError();
    }
  }
  if (!response.ok) {
    throw new ApiError(
      typeof data.error === "string" ? data.error : "Ошибка сервера",
      response.status,
    );
  }
  return data as T;
}

export type Child = {
  id: string;
  name: string;
  birth_year: number | null;
  theme: string;
};

export type Account = {
  parent: { id: string; email: string; displayName: string };
  children: Child[];
};

export const login = (email: string, password: string) =>
  request<{ ok: true }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const register = (input: {
  email: string;
  password: string;
  displayName: string;
}) =>
  request<{ ok: true; needsVerification: true }>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const verifyEmail = (token: string) =>
  request<{ ok: true }>("/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token }),
  });

export const resendVerification = (email: string) =>
  request<{ ok: true; message: string }>("/auth/resend-verification", {
    method: "POST",
    body: JSON.stringify({ email }),
  });

export const logout = () => request<{ ok: true }>("/auth/logout", { method: "POST" });

export const me = () => request<Account>("/me");

export const createChild = (name: string, pin: string) =>
  request<Child>("/children", {
    method: "POST",
    body: JSON.stringify({ name, pin }),
  });

export type RemoteProgress = {
  payload: Record<string, unknown>;
  revision: number;
  updated_at: string;
};

export const fetchProgress = (childId: string) =>
  request<RemoteProgress>(`/children/${childId}/progress`);

export const pushProgress = (
  childId: string,
  payload: Saved,
  revision: number,
) =>
  request<{ revision: number; updated_at: string }>(
    `/children/${childId}/progress`,
    { method: "PUT", body: JSON.stringify({ payload, revision }) },
  );

/** Прогресс с сервера приводится к текущей схеме теми же правилами, что и локальный. */
export const remoteToSaved = (remote: RemoteProgress): Saved =>
  migrateProgress(remote.payload);
