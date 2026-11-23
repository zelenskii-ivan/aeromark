"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { READING_TEXTS, prepareText, type ReadingText } from "@/content/karaoke/texts";
import { advance, appendRun, cues, metrics, recommend, nextTextId, type ReadingMode, type ReadingRun } from "@/lib/karaoke/model";
import type { Academy } from "@/lib/academy/state";
import "./karaoke.css";

const TEXT_IDS = READING_TEXTS.map(text => text.id);
const MODES = { manual: "В своём темпе", syllables: "Караоке по слогам", words: "Караоке целыми словами" };
type Props = { academy: Academy; update: (fn: (a: Academy) => Academy) => void; onBack: () => void };

export function Karaoke({ academy, update, onBack }: Props) {
  const [textId, setTextId] = useState(() => nextTextId(TEXT_IDS, academy.karaoke));
  const [mode, setMode] = useState<ReadingMode>("manual");
  const [pace, setPace] = useState(15);
  const [active, setActive] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const text = READING_TEXTS.find(t => t.id === textId)!;
  const advice = recommend(academy.karaoke, textId, pace);
  if (active) return <Reading key={attempt} text={text} mode={mode} initialPace={pace}
    onSave={run => update(a => ({ ...a, karaoke: appendRun(a.karaoke, run) }))}
    onNext={() => { setTextId(nextTextId(TEXT_IDS, academy.karaoke, textId)); setAttempt(a => a + 1); }}
    onAgain={() => setAttempt(a => a + 1)} onBack={() => setActive(false)} />;
  return <main className="ac-screen kr-screen">
    <button className="ac-btn soft" onClick={onBack}>← В Академию</button>
    <header className="kr-heading"><span className="ac-eyebrow">ЧИТАЕМ И ПОНИМАЕМ</span><h1>Чтение-караоке</h1>
      <p>Сначала спокойно и точно. Скорость придёт с практикой.</p></header>
    <div className="kr-setup">
      <section className="kr-card"><h2>Выбери рассказ · {READING_TEXTS.length} вариантов</h2><p>Выбирай длинный рассказ или классику. Для нового занятия предлагаем текст, который ты ещё не читал.</p><button className="ac-btn soft" onClick={() => setTextId(TEXT_IDS[(TEXT_IDS.indexOf(textId) + 1) % TEXT_IDS.length]!)}>Другой рассказ</button><p aria-live="polite">Выбран рассказ «{text.title}»</p><div className="kr-library">
        {READING_TEXTS.map(t => <button key={t.id} aria-pressed={t.id === textId} onClick={() => setTextId(t.id)}>
          <span>{t.level}</span><strong>{t.title}</strong><small>{prepareText(t).words.length} слов · {t.author}</small>
        </button>)}
      </div></section>
      <section className="kr-card"><h2>Как будем читать?</h2>
        <label>Режим<select value={mode} onChange={e => setMode(e.target.value as ReadingMode)}>
          {Object.entries(MODES).map(([value, title]) => <option key={value} value={value}>{title}</option>)}
        </select></label>
        {mode !== "manual" && <label>Темп подсветки: {pace} слов/мин<input type="range" min={5} max={90} value={pace} onChange={e => setPace(Number(e.target.value))} /></label>}
        <p>{advice.message}</p>
        {mode !== "manual" && <button className="ac-btn soft" onClick={() => setPace(advice.pace)}>Применить совет: {advice.pace} слов/мин</button>}
        <button className="ac-btn go big" onClick={() => setActive(true)}>Открыть рассказ →</button>
        <p className="kr-muted">Можно остановиться в любой момент. Микрофон не нужен. Для замера чтения взрослый слушает и отмечает результат.</p>
      </section>
    </div>
    <details className="kr-card"><summary>Текст, программа и права</summary><p>{text.curriculum}</p><p>{text.rights}</p>
      {text.source && <a href={text.source} target="_blank" rel="noreferrer">Источник текста</a>}
      <p><a href="https://edsoo.ru/wp-content/uploads/2025/07/2025_noo_frp_literaturnoe-chtenie_1-4.pdf" target="_blank" rel="noreferrer">Федеральная рабочая программа</a></p>
    </details>
  </main>;
}

function Reading({ text, mode, initialPace, onSave, onAgain, onNext, onBack }: {
  text: ReadingText; mode: ReadingMode; initialPace: number;
  onSave: (r: ReadingRun) => void; onAgain: () => void; onNext: () => void; onBack: () => void;
}) {
  const prepared = useMemo(() => prepareText(text), [text]);
  const timeline = useMemo(() => cues(prepared.parts, mode), [prepared.parts, mode]);
  const engine = useRef({ elapsed: 0, last: 0, index: 0, fraction: 0, running: false, pace: initialPace });
  const [clock, setClock] = useState({ elapsed: 0, last: 0, index: 0, fraction: 0, running: false, pace: initialPace });
  const [phase, setPhase] = useState<"reading" | "review" | "saved">("reading");
  const [ribbon, setRibbon] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [syllables, setSyllables] = useState(mode !== "words");
  const [attempted, setAttempted] = useState(0);
  const [errors, setErrors] = useState<number[]>([]);
  const [verified, setVerified] = useState(false);
  const [answers, setAnswers] = useState<(number | null)[]>(text.questions.map(() => null));
  const [savedRun, setSavedRun] = useState<ReadingRun | null>(null);
  const [notice, setNotice] = useState("");
  const viewport = useRef<HTMLDivElement>(null);
  const currentWord = timeline[clock.index]?.word;
  const id = useRef("");

  const tick = useCallback((now: number) => {
    const e = engine.current;
    if (!e.running) return;
    const delta = Math.max(0, now - e.last);
    e.last = now;
    // A suspended device must not produce a fictitious multi-minute reading.
    if (delta > 2000) {
      e.running = false;
      setNotice("Пауза: устройство было неактивно. Продолжите, когда будете готовы.");
    } else {
      e.elapsed += delta;
      if (mode !== "manual" && e.index < timeline.length) {
        const next = advance(timeline, e.index, e.fraction, delta, e.pace);
        e.index = next.index; e.fraction = next.fraction;
        if (e.index === timeline.length) {
          e.running = false;
          setNotice("Подсветка дошла до конца. Если чтение ещё идёт, продолжите таймер; затем нажмите «Завершить».");
        }
      }
    }
    setClock({ ...e });
  }, [mode, timeline]);

  useEffect(() => {
    const interval = window.setInterval(() => tick(performance.now()), 50);
    const hide = () => {
      if (document.hidden) {
        tick(performance.now());
        engine.current.running = false;
        setClock({ ...engine.current });
        setNotice("Пауза: вы переключились на другую вкладку.");
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", hide); };
  }, [tick]);

  useEffect(() => {
    const box = viewport.current;
    const word = box?.querySelector<HTMLElement>(`[data-word="${currentWord}"]`);
    if (!box || !word) return;
    // Only scroll the reading viewport; never move the surrounding page/buttons.
    if (ribbon) box.scrollTo({ left: word.offsetLeft - box.offsetLeft - box.clientWidth / 3, behavior: "instant" });
    else box.scrollTo({ top: word.offsetTop - box.offsetTop - box.clientHeight / 3, behavior: "instant" });
  }, [currentWord, ribbon]);

  const pause = () => { tick(performance.now()); engine.current.running = false; setClock({ ...engine.current }); };
  const toggle = () => {
    if (engine.current.running) pause();
    else { engine.current.running = true; engine.current.last = performance.now(); setClock({ ...engine.current }); setNotice(""); }
  };
  const end = () => { pause(); setPhase("review"); };
  const setEndWord = (count: number) => { setAttempted(count); setErrors(es => es.filter(i => i < count)); };
  const save = () => {
    const run: ReadingRun = {
      id: id.current || (id.current = crypto.randomUUID()), date: new Date().toISOString(), textId: text.id,
      mode, pace: clock.pace, elapsedMs: clock.elapsed, totalWords: prepared.words.length,
      attempted: verified ? attempted : 0, errors: verified ? errors : [], verified,
      answers: answers.flatMap((a, i) => a === null ? [] : [a === text.questions[i]!.correct]),
    };
    onSave(run); setSavedRun(run); setPhase("saved");
  };
  const result = savedRun && metrics(savedRun);
  return <main className="ac-screen kr-screen">
    <header className="kr-top"><button className="ac-btn soft" onClick={() => { pause(); onBack(); }}>← К рассказам</button><span>{MODES[mode]}</span></header>
    <h1 className="kr-title">{text.title}</h1><p>{text.author} · {prepared.words.length} слов</p>
    {phase === "reading" ? <>
      <div className="kr-options">
        <label><input type="checkbox" checked={ribbon} onChange={e => setRibbon(e.target.checked)} /> Бегущая строка</label>
        <label><input type="checkbox" checked={syllables} disabled={mode === "syllables"} onChange={e => setSyllables(e.target.checked)} /> Видеть слоги</label>
        <label><input type="checkbox" checked={showTime} onChange={e => setShowTime(e.target.checked)} /> Показать таймер</label>
      </div>
      <div ref={viewport} className={`kr-reader ${ribbon ? "ribbon" : ""}`} tabIndex={0} aria-label="Текст для чтения">
        {prepared.words.map((word, wi) => <span key={wi}>
          {prepared.plain.slice(wi === 0 ? 0 : prepared.words[wi - 1]!.end, word.start)}
          <span data-word={wi} className={`kr-word ${currentWord === wi ? "current" : ""}`}>
            {prepared.parts[wi]!.map((part, pi) => <span key={pi}>
              {syllables && pi > 0 && <span className="kr-divider" aria-hidden="true">·</span>}
              <span className={currentWord === wi && (mode !== "syllables" || timeline[clock.index]?.part === pi) ? "lit" : ""}>{part}</span>
            </span>)}
          </span>
          {wi === prepared.words.length - 1 ? prepared.plain.slice(word.end) : ""}
        </span>)}
      </div>
      <div className="kr-controls">
        <button className="ac-btn go big" onClick={toggle}>{clock.running ? "Пауза" : clock.elapsed ? "Продолжить" : "Начать читать"}</button>
        {mode === "manual" && <button className="ac-btn soft" disabled={!clock.running || clock.index >= timeline.length - 1} onClick={() => { tick(performance.now()); engine.current.index++; setClock({ ...engine.current }); }}>Следующее слово →</button>}
        <button className="ac-btn soft" disabled={clock.elapsed < 1000} onClick={end}>Завершить</button>
        {showTime && <output aria-label="Активное время">{(clock.elapsed / 1000).toFixed(1)} с</output>}
      </div>
      {mode !== "manual" && <label className="kr-pace">Темп подсветки: {clock.pace} слов/мин
        <input aria-label="Темп подсветки" type="range" min={5} max={90} value={clock.pace} onChange={e => { tick(performance.now()); engine.current.pace = Number(e.target.value); setClock({ ...engine.current }); }} />
      </label>}
      <p role="status">{notice}</p><p className="kr-muted">Подсветка — помощник. Она не измеряет, сколько слов прочитано. Нужна передышка — нажми «Пауза».</p>
    </> : phase === "review" ? <section className="kr-card">
      <h2>Обсудим рассказ</h2><p>Найдите в тексте, где об этом сказано. Непрочитанные вопросы можно пропустить.</p>
      <details><summary>Посмотреть текст</summary><p className="kr-review-text">{prepared.plain}</p></details>
      {text.questions.map((q, qi) => <fieldset key={q.prompt}><legend>{q.prompt}</legend>
        {q.options.map((option, oi) => <label key={option}><input type="radio" name={`q${qi}`} checked={answers[qi] === oi} onChange={() => setAnswers(a => a.map((v, i) => i === qi ? oi : v))} />{option}</label>)}
      </fieldset>)}
      <h2>Для взрослого: как прошло чтение?</h2><p>Активное время: {(clock.elapsed / 1000).toFixed(1)} с. Паузы не учитываются. Остановка подсветки тоже ставит таймер на паузу.</p>
      <label><input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} /> Я слушал(а) всё чтение и подтверждаю отметки</label>
      {verified && <>
        <label>Сколько слов ребёнок прочитал до остановки? <input aria-label="Прочитано слов" type="number" min={0} max={prepared.words.length} value={attempted} onChange={e => setEndWord(Math.min(prepared.words.length, Math.max(0, Math.trunc(Number(e.target.value) || 0))))} /></label>
        <button className="ac-btn soft" onClick={() => setEndWord(prepared.words.length)}>Прочитан весь текст: {prepared.words.length} слов</button>
        <p>Отметьте слова с ошибкой или пропуском. Самоисправление без помощи не считаем ошибкой. Одно слово — не более одной ошибки.</p>
        <div className="kr-mark-words">{prepared.words.map((w, i) => <button key={i} disabled={i >= attempted} aria-pressed={errors.includes(i)} aria-label={`${i + 1}. ${w.text}: ${errors.includes(i) ? "ошибка" : "без ошибки"}`} onClick={() => setErrors(es => es.includes(i) ? es.filter(n => n !== i) : [...es, i])}>{i + 1}. {w.text}</button>)}</div>
      </>}
      <p className="kr-muted">Без подтверждения сохранится только факт практики и ответы. Слова/мин и точность не будут вычислены.</p>
      <button className="ac-btn go" disabled={verified && attempted === 0} onClick={save}>Сохранить занятие</button>
    </section> : <section className="kr-card" role="status"><h2>Хорошая работа!</h2><p>Занятие сохранено. Отдохни или прочитай рассказ ещё раз.</p>
      {result ? <p>{result.wpm.toFixed(1)} слов/мин · {result.wcpm.toFixed(1)} верных слов/мин · точность {(result.accuracy * 100).toFixed(1)}%</p> : <p>Практика без замера скорости.</p>}
      <div className="kr-controls"><button className="ac-btn go" onClick={onAgain}>Повторить рассказ</button><button className="ac-btn go" onClick={onNext}>Новый рассказ →</button><button className="ac-btn soft" onClick={onBack}>Выбрать другой</button></div>
    </section>}
  </main>;
}
