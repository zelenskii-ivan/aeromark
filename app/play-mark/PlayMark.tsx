"use client";
import { useEffect, useRef, useState } from "react";
import { assemblyStars, installPart, stageOf, type Assembly } from "../../lib/play-mark/state";
import { createAirfield, type Hud } from "./engine";
import "./play-mark.css";

type Props = { state: Assembly; update: (fn: (s: Assembly) => Assembly) => void; onExit: () => void };
export default function PlayMark({ state, update, onExit }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const engine = useRef<ReturnType<typeof createAirfield> | null>(null);
  const callbacks = useRef({ update });
  const [hud, setHud] = useState<Hud>({ carrying: "", action: "Найди деталь", canAct: false, flying: false, finished: false });
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { callbacks.current = { update }; }, [update]);
  useEffect(() => {
    if (!mount.current) return;
    try {
      engine.current = createAirfield(mount.current, setHud,
        id => callbacks.current.update(s => installPart(s, id)),
        () => callbacks.current.update(s => s.installed.length === 20 ? { ...s, flown: true } : s),
        () => setError(true));
    } catch { queueMicrotask(() => setError(true)); }
    return () => { engine.current?.dispose(); engine.current = null; };
  }, [attempt]);
  useEffect(() => { engine.current?.setState(state); }, [state, attempt]);
  useEffect(() => { engine.current?.setPaused(paused); }, [paused, attempt]);
  const count = state.installed.length;
  return <main className="mark-game">
    <div ref={mount} className="mark-scene" />
    <header className="mark-top">
      <button onClick={onExit} aria-label="Вернуться в кабинет">← В кабинет</button>
      <div className="mark-title"><span>АЭРОМАРК · МАСТЕРСКАЯ 01</span><h1>Поиграй с Марком</h1></div>
      <button onClick={() => setPaused(v => !v)} disabled={error}>{paused ? "Продолжить" : "Пауза"}</button>
    </header>
    <aside className="mark-progress" aria-label="Прогресс сборки">
      <div><span>{count === 20 ? "Самолёт готов" : `Этап ${stageOf(state) + 1} из 4`}</span><strong>★ {assemblyStars(state)} <small>/ 30</small></strong></div>
      <h2>{count === 20 ? "Небо ждёт!" : "Мой первый самолёт"}</h2>
      <div className="mark-stages">{[0, 1, 2, 3].map(n => <span key={n} className={count >= (n + 1) * 5 ? "done" : stageOf(state) === n ? "active" : ""}>{n + 1}</span>)}</div>
      <progress max={20} value={count} aria-label="Установлено деталей" />
      <p aria-live="polite">{count} из 20 деталей</p>
    </aside>
    <div className="mark-bottom">
      <div className="mark-pad" aria-label="Управление движением">
        {[["ArrowUp", "↑", "Вперёд"], ["ArrowLeft", "←", "Влево"], ["ArrowDown", "↓", "Назад"], ["ArrowRight", "→", "Вправо"]].map(([code, glyph, label]) =>
          <button key={code} aria-label={label} className={code} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); engine.current?.control(code!, true); }} onPointerUp={() => engine.current?.control(code!, false)} onPointerCancel={() => engine.current?.control(code!, false)} onLostPointerCapture={() => engine.current?.control(code!, false)} onKeyDown={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); engine.current?.control(code!, true); } }} onKeyUp={() => engine.current?.control(code!, false)} onBlur={() => engine.current?.control(code!, false)}>{glyph}</button>)}
      </div>
      <div className="mark-action">
        <span aria-live="polite">{hud.carrying || (hud.flying ? "Первый полёт Марка" : "Собираем приключение")}</span>
        <button disabled={!hud.canAct || paused || error} onClick={() => engine.current?.act()}>{hud.action} <kbd>E</kbd></button>
        {hud.carrying && <button className="mark-drop" onClick={() => engine.current?.drop()}>Вернуть деталь <kbd>Q</kbd></button>}
      </div>
      <p className="mark-keys">WASD / стрелки — идти<br />Shift — бежать · пробел — прыгать</p>
    </div>
    {(paused || error || hud.finished) && <div className="mark-overlay"><section role="dialog" aria-modal="true" aria-label={error ? "Ошибка 3D" : paused ? "Пауза" : "Самолёт собран"}>
      <span className="mark-medal">{error ? "☁" : paused ? "Ⅱ" : "★"}</span>
      <h2>{error ? "Не удалось открыть 3D" : paused ? "Небо подождёт" : "Твой самолёт летает!"}</h2>
      <p>{error ? "Прогресс сохранён. Попробуй открыть аэродром снова." : paused ? "Продолжим, когда будешь готов." : "20 деталей · 30 звёзд"}</p>
      {error ? <button onClick={() => { setError(false); setAttempt(v => v + 1); }}>Попробовать снова</button> : paused ? <button onClick={() => setPaused(false)}>Продолжить</button> : <button onClick={() => engine.current?.replay()}>Ещё один полёт</button>}
      <button onClick={onExit}>В кабинет</button>
    </section></div>}
  </main>;
}
