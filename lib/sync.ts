"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "./api.ts";
import type { Saved } from "./progress.ts";
import { readValue, removeValue, writeValue } from "./storage.ts";

const CHILD_KEY = "aeromark-child-id";
const PUSH_DELAY = 1500;
const SYNC_ENABLED = process.env.NEXT_PUBLIC_SYNC_ENABLED !== "0";

export type SyncPhase =
  | "unknown" // ещё не спрашивали сервер
  | "offline" // сервера нет — работаем локально
  | "anonymous" // сервер есть, но родитель не вошёл
  | "signed-in"; // вошёл; ребёнок может быть ещё не выбран

export type SyncState = {
  phase: SyncPhase;
  account: api.Account | null;
  childId: string | null;
  revision: number | null;
  /** Прогресс на сервере разошёлся с локальным — решает родитель. */
  choice: { remote: Saved; revision: number } | null;
  conflict: boolean;
  busy: boolean;
  message: string;
  savedAt: string;
};

const emptyState: SyncState = {
  phase: SYNC_ENABLED ? "unknown" : "offline",
  account: null,
  childId: null,
  revision: null,
  choice: null,
  conflict: false,
  busy: false,
  message: SYNC_ENABLED
    ? ""
    : "Серверная синхронизация появится после запуска VPS.",
  savedAt: "",
};

function describe(error: unknown): string {
  if (error instanceof api.OfflineError) return "Сервер недоступен — работаем локально.";
  if (error instanceof api.ApiError) return error.message;
  return "Непредвиденная ошибка.";
}

/**
 * Синхронизация прогресса с семейным сервером.
 *
 * Правила, которые важнее удобства:
 *  1. Источник правды — устройство. Сеть может отвалиться в любой момент,
 *     и ребёнок обязан продолжать заниматься.
 *  2. Ничего не перезаписывается молча. Если на сервере уже есть прогресс,
 *     отличающийся от локального, выбор делает родитель.
 *  3. Конфликт ревизий (занимались на двух устройствах) показывается, а не
 *     разрешается угадыванием.
 */
export function useSync(saved: Saved, restore: (next: Saved) => void) {
  const [state, setState] = useState<SyncState>(emptyState);
  const patch = useCallback(
    (next: Partial<SyncState>) => setState((current) => ({ ...current, ...next })),
    [],
  );
  const revisionRef = useRef<number | null>(null);
  const pushedRef = useRef<string>("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadAccount = useCallback(async () => {
    try {
      const account = await api.me();
      patch({ phase: "signed-in", account, message: "" });
      return account;
    } catch (error) {
      if (error instanceof api.OfflineError) {
        patch({ phase: "offline", message: describe(error) });
      } else {
        patch({ phase: "anonymous", account: null });
      }
      return null;
    }
  }, [patch]);

  // Один тихий запрос при старте: есть ли вообще сервер и открыта ли сессия.
  // Состояние здесь меняется по ответу сети, а не синхронно в теле эффекта,
  // но правило этого не различает.
  useEffect(() => {
    if (!SYNC_ENABLED) return;
    // Запрос выполняется асинхронно, но правило видит вызов setState внутри helper.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAccount();
  }, [loadAccount]);

  /** Подключает профиль ребёнка: тянет серверный прогресс и сравнивает. */
  const selectChild = useCallback(
    async (childId: string) => {
      patch({ busy: true, message: "" });
      try {
        const remote = await api.fetchProgress(childId);
        const remoteSaved = api.remoteToSaved(remote);
        revisionRef.current = remote.revision;
        writeValue(CHILD_KEY, childId);
        const serverEmpty = Object.keys(remote.payload).length === 0;
        const same = JSON.stringify(remoteSaved) === JSON.stringify(saved);
        if (serverEmpty || same) {
          // На сервере пусто или ровно то же самое — спрашивать не о чем.
          patch({
            childId,
            revision: remote.revision,
            choice: null,
            conflict: false,
            busy: false,
            message: serverEmpty ? "Профиль подключён. Отправляю прогресс." : "Прогресс совпадает.",
          });
          pushedRef.current = serverEmpty ? "" : JSON.stringify(saved);
        } else {
          patch({
            childId,
            revision: remote.revision,
            choice: { remote: remoteSaved, revision: remote.revision },
            conflict: false,
            busy: false,
            message: "",
          });
        }
      } catch (error) {
        patch({ busy: false, message: describe(error) });
      }
    },
    [patch, saved],
  );

  const disconnect = useCallback(() => {
    revisionRef.current = null;
    pushedRef.current = "";
    removeValue(CHILD_KEY);
    patch({ childId: null, revision: null, choice: null, conflict: false, message: "" });
  }, [patch]);

  /** Родитель выбрал серверную версию. */
  const takeRemote = useCallback(() => {
    setState((current) => {
      if (current.choice) {
        restore(current.choice.remote);
        pushedRef.current = JSON.stringify(current.choice.remote);
      }
      return { ...current, choice: null, conflict: false, message: "Загружено с сервера." };
    });
  }, [restore]);

  /** Родитель выбрал версию этого устройства. */
  const keepLocal = useCallback(() => {
    pushedRef.current = "";
    patch({ choice: null, conflict: false, message: "Отправляю прогресс этого устройства." });
  }, [patch]);

  const pull = useCallback(async () => {
    const childId = state.childId;
    if (!childId) return;
    patch({ busy: true });
    try {
      const remote = await api.fetchProgress(childId);
      revisionRef.current = remote.revision;
      const remoteSaved = api.remoteToSaved(remote);
      restore(remoteSaved);
      pushedRef.current = JSON.stringify(remoteSaved);
      patch({ busy: false, revision: remote.revision, conflict: false, message: "Загружено с сервера." });
    } catch (error) {
      patch({ busy: false, message: describe(error) });
    }
  }, [patch, restore, state.childId]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      patch({ busy: true, message: "" });
      try {
        await api.login(email, password);
        const account = await loadAccount();
        patch({ busy: false });
        const remembered = readValue(CHILD_KEY);
        if (account && remembered && account.children.some((c) => c.id === remembered)) {
          await selectChild(remembered);
        }
      } catch (error) {
        patch({ busy: false, message: describe(error) });
      }
    },
    [loadAccount, patch, selectChild],
  );

  const signUp = useCallback(
    async (input: { email: string; password: string; inviteCode: string; displayName: string }) => {
      patch({ busy: true, message: "" });
      try {
        await api.register(input);
        await loadAccount();
        patch({ busy: false });
      } catch (error) {
        patch({ busy: false, message: describe(error) });
      }
    },
    [loadAccount, patch],
  );

  const signOut = useCallback(async () => {
    patch({ busy: true });
    try {
      await api.logout();
    } catch {
      /* даже если сервер не ответил, локальную привязку снимаем */
    }
    revisionRef.current = null;
    pushedRef.current = "";
    removeValue(CHILD_KEY);
    setState({ ...emptyState, phase: "anonymous" });
  }, [patch]);

  const addChild = useCallback(
    async (name: string, pin: string) => {
      patch({ busy: true, message: "" });
      try {
        const child = await api.createChild(name, pin);
        await loadAccount();
        patch({ busy: false });
        await selectChild(child.id);
      } catch (error) {
        patch({ busy: false, message: describe(error) });
      }
    },
    [loadAccount, patch, selectChild],
  );

  // Автоматическая отправка прогресса. Ждём паузы в занятии, чтобы не слать
  // запрос после каждого ответа ребёнка.
  useEffect(() => {
    if (state.phase !== "signed-in" || !state.childId || state.choice || state.conflict) return;
    if (revisionRef.current === null) return;
    const snapshot = JSON.stringify(saved);
    if (snapshot === pushedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const childId = state.childId;
      const revision = revisionRef.current;
      if (!childId || revision === null) return;
      api
        .pushProgress(childId, saved, revision)
        .then((result) => {
          revisionRef.current = result.revision;
          pushedRef.current = snapshot;
          patch({
            revision: result.revision,
            message: "",
            savedAt: new Date().toLocaleTimeString("ru-RU", {
              hour: "2-digit",
              minute: "2-digit",
            }),
          });
        })
        .catch((error: unknown) => {
          if (error instanceof api.ApiError && error.status === 409) {
            patch({ conflict: true, message: error.message });
          } else {
            patch({ message: describe(error) });
          }
        });
    }, PUSH_DELAY);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [saved, state.phase, state.childId, state.choice, state.conflict, patch]);

  return {
    state,
    signIn,
    signUp,
    signOut,
    addChild,
    selectChild,
    disconnect,
    takeRemote,
    keepLocal,
    pull,
  };
}
