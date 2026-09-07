"use client";

import { useState } from "react";
import { Cloud, CloudOff, LogOut, MailCheck, RefreshCw, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MISSIONS_NOUN, STARS_NOUN, withCount } from "@/content/types";
import type { Saved } from "@/lib/progress";
import type { useSync } from "@/lib/sync";

type Sync = ReturnType<typeof useSync>;

export function SyncPanel({ sync, saved }: { sync: Sync; saved: Saved }) {
  const { state } = sync;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [childName, setChildName] = useState("");
  const [childPin, setChildPin] = useState("");

  if (state.phase === "unknown") return null;

  if (state.phase === "offline") {
    return (
      <section className="panel">
        <span className="eyebrow">СИНХРОНИЗАЦИЯ</span>
        <h2>
          <CloudOff className="inline-icon" /> Сервер недоступен
        </h2>
        <p className="lead">
          Прогресс сохраняется на этом устройстве. Перенести его на другое
          можно файлом — кнопки ниже.
        </p>
      </section>
    );
  }

  if (state.phase === "anonymous") {
    return (
      <section className="panel account-panel">
        <span className="eyebrow">ЛИЧНЫЙ КАБИНЕТ СЕМЬИ</span>
        <h2>{mode === "login" ? "Вход для взрослого" : "Создать семейный кабинет"}</h2>
        <p className="lead">
          Взрослый управляет кабинетом, а внутри создаёт отдельные профили
          детей. Прогресс открывается на любом устройстве.
        </p>
        <div className="sync-tabs">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            Вход
          </button>
          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => setMode("register")}
          >
            Регистрация
          </button>
        </div>
        <div className="sync-form">
          <label>
            Почта
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="parent@example.com"
            />
          </label>
          <label>
            Пароль
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="не короче 10 знаков"
            />
          </label>
          {mode === "register" && (
            <label>
              Как вас зовут
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Иван"
              />
            </label>
          )}
        </div>
        <div className="parent-actions">
          <Button
            disabled={
              state.busy ||
              !email ||
              password.length < 10 ||
              (mode === "register" && displayName.trim().length < 2)
            }
            onClick={() =>
              mode === "login"
                ? sync.signIn(email, password)
                : sync.signUp({ email, password, displayName })
            }
          >
            {mode === "login" ? <Cloud /> : <MailCheck />}
            {mode === "login" ? "Войти" : "Создать и получить письмо"}
          </Button>
          {mode === "register" && email && (
            <Button
              variant="outline"
              disabled={state.busy}
              onClick={() => sync.resendVerification(email)}
            >
              Отправить письмо ещё раз
            </Button>
          )}
        </div>
        <div aria-live="polite">
          {state.message && <strong className="pin-error">{state.message}</strong>}
        </div>
      </section>
    );
  }

  const active = state.account?.children.find((child) => child.id === state.childId);

  return (
    <section className="panel">
      <div className="parent-title">
        <div>
          <span className="eyebrow">ЛИЧНЫЙ КАБИНЕТ</span>
          <h2>
            <Cloud className="inline-icon" /> {state.account?.parent.displayName}
          </h2>
        </div>
        <Button variant="outline" onClick={() => void sync.signOut()}>
          <LogOut />
          Выйти
        </Button>
      </div>

      {state.choice && (
        <div className="sync-choice">
          <strong>На сервере уже есть прогресс, и он отличается.</strong>
          <p>
            На сервере: {withCount(state.choice.remote.stars, STARS_NOUN)},{" "}
            {withCount(state.choice.remote.completed.length, MISSIONS_NOUN)}. На
            этом устройстве: {withCount(saved.stars, STARS_NOUN)},{" "}
            {withCount(saved.completed.length, MISSIONS_NOUN)}. Ничего не будет
            перезаписано, пока вы не выберете.
          </p>
          <div className="parent-actions">
            <Button onClick={sync.takeRemote}>Взять серверный</Button>
            <Button variant="outline" onClick={sync.keepLocal}>
              Оставить этот и отправить
            </Button>
          </div>
        </div>
      )}

      {state.conflict && (
        <div className="sync-choice">
          <strong>Прогресс изменился на другом устройстве.</strong>
          <p>
            Чтобы не потерять чужие звёзды, отправка приостановлена. Загрузите
            свежую версию или сначала сохраните этот прогресс файлом.
          </p>
          <div className="parent-actions">
            <Button onClick={() => void sync.pull()} disabled={state.busy}>
              <RefreshCw />
              Загрузить с сервера
            </Button>
          </div>
        </div>
      )}

      <div className="child-list">
        {state.account?.children.length ? (
          state.account.children.map((child) => (
            <button
              key={child.id}
              type="button"
              className={`child-chip ${child.id === state.childId ? "active" : ""}`}
              onClick={() => void sync.selectChild(child.id)}
              disabled={state.busy}
            >
              {child.name}
              {child.id === state.childId && <span> · синхронизируется</span>}
            </button>
          ))
        ) : (
          <p className="lead">Профилей пока нет — создайте первый.</p>
        )}
      </div>

      <div className="sync-form compact-form">
        <label>
          Имя нового профиля
          <input
            aria-label="Имя нового профиля"
            value={childName}
            maxLength={40}
            onChange={(event) => setChildName(event.target.value)}
            placeholder="Марк"
          />
        </label>
        <label>
          PIN профиля
          <input
            aria-label="PIN нового профиля"
            inputMode="numeric"
            maxLength={4}
            value={childPin}
            onChange={(event) => setChildPin(event.target.value.replace(/\D/g, ""))}
            placeholder="4 цифры"
          />
        </label>
      </div>
      <div className="parent-actions">
        <Button
          variant="outline"
          disabled={state.busy || !childName.trim() || childPin.length !== 4}
          onClick={() => {
            void sync.addChild(childName.trim(), childPin);
            setChildName("");
            setChildPin("");
          }}
        >
          <UserPlus />
          Добавить профиль
        </Button>
        {state.childId && (
          <>
            <Button variant="outline" onClick={() => void sync.pull()} disabled={state.busy}>
              <RefreshCw />
              Загрузить с сервера
            </Button>
            <Button variant="outline" onClick={sync.disconnect}>
              Отключить это устройство
            </Button>
          </>
        )}
      </div>

      <div aria-live="polite" className="sync-status">
        {state.message && <span>{state.message}</span>}
        {!state.message && active && state.savedAt && (
          <span>
            {active.name}: сохранено на сервере в {state.savedAt}
          </span>
        )}
        {!state.message && active && !state.savedAt && (
          <span>{active.name}: подключён, изменений пока нет</span>
        )}
      </div>
    </section>
  );
}
