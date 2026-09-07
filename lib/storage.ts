/**
 * Безопасный доступ к localStorage.
 *
 * Само обращение к window.localStorage бросает SecurityError, если браузер
 * запретил сайту хранить данные: приватный режим Firefox, блокировка сторонних
 * данных, страница внутри изолированного iframe. Раньше это обращение стояло
 * вне try/catch, эффект падал до setLoaded(true), и приложение навсегда
 * оставалось на заставке с самолётиком — белый экран без единого сообщения.
 */
type Storageish = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const memory = new Map<string, string>();

/** Запасное хранилище в памяти: прогресс живёт до перезагрузки, но живёт. */
const fallback: Storageish = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => void memory.set(key, value),
  removeItem: (key) => void memory.delete(key),
};

let resolved: Storageish | null = null;

export function storage(): Storageish {
  if (resolved) return resolved;
  try {
    const probe = "__aeromark__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    resolved = window.localStorage;
  } catch {
    resolved = fallback;
  }
  return resolved;
}

/** Доступно ли постоянное хранилище — для честного сообщения родителю. */
export const isPersistent = (): boolean => storage() !== fallback;

export const readValue = (key: string): string | null => {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
};

export const writeValue = (key: string, value: string): void => {
  try {
    storage().setItem(key, value);
  } catch {
    /* переполнено — прогресс останется в памяти на время сессии */
  }
};

export const removeValue = (key: string): void => {
  try {
    storage().removeItem(key);
  } catch {
    /* нечего чистить */
  }
};
