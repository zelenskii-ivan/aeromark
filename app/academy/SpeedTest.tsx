"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Flag, Gauge, Play, Square } from "lucide-react";
import { FLIGHT_TEXTS, countWords, type FlightText } from "@/content/academy/texts";
import { accuracyPct, recordSpeedRun, sentencesOf, validateRun, wcpm, wpm } from "@/lib/academy/speed";
import type { Academy, SpeedRun } from "@/lib/academy/state";
import { play, stopAudio } from "@/lib/academy/audio";
import { today } from "@/lib/progress";
import { Cheer } from "@/app/cheer";

/**
 * Лётный тест: добровольная проверка скорости чтения.
 *
 * Два режима:
 *  - «Тренировка» — без часов: читаем, слушаем трудные предложения,
 *    отвечаем на вопросы;
 *  - «Лётный тест» — с секундомером. Ребёнок читает вслух, взрослый
 *    отмечает слова с ошибкой и слово, где остановились. Без взрослого
 *    экран не может знать, прочитано ли слово верно, поэтому тест так и
 *    называется — совместный.
 *
 * Главная цифра — верные слова в минуту. Скорость без точности и понимания
 * успехом не считается.
 */

/** Школьный замер 30.09.2026 — точка отсчёта графика. */
const SCHOOL_BASELINE = { date: "2026-09-30", wcpm: 8 };

type Phase =
  | { name: "choose" }
  | { name: "practice"; text: FlightText }
  | { name: "ready"; text: FlightText }
  | { name: "running"; text: FlightText; started: number }
  | { name: "mark-end"; text: FlightText; seconds: number }
  | { name: "questions"; text: FlightText; seconds: number; words: number; practice: boolean }
  | { name: "result"; run: SpeedRun | null; record: boolean; practice: boolean; comprehension: [number, number] };

const format = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

function Dial({ seconds }: { seconds: number }) {
  const angle = (seconds % 60) * 6;
  return (
    <div className="ac-dial" role="timer" aria-label={`Прошло ${format(seconds)}`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="54" className="ac-dial-face" />
        {Array.from({ length: 12 }, (_, i) => (
          <line
            key={i}
            x1="60"
            y1="10"
            x2="60"
            y2={i % 3 === 0 ? 20 : 15}
            className="ac-dial-tick"
            transform={`rotate(${i * 30} 60 60)`}
          />
        ))}
        <line x1="60" y1="60" x2="60" y2="16" className="ac-dial-needle" transform={`rotate(${angle} 60 60)`} />
        <circle cx="60" cy="60" r="5" className="ac-dial-hub" />
      </svg>
      <b>{format(seconds)}</b>
    </div>
  );
}

export function SpeedTest({
  academy,
  update,
  onBack,
}: {
  academy: Academy;
  update: (fn: (current: Academy) => Academy) => void;
  onBack: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ name: "choose" });
  const [errors, setErrors] = useState<Set<number>>(new Set());
  const [lastWord, setLastWord] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [problem, setProblem] = useState("");

  // Следующий текст — тот, что читали давно или не читали вовсе.
  const suggested = useMemo(() => {
    const used = academy.speed.map((run) => run.textId);
    return FLIGHT_TEXTS.find((text) => !used.includes(text.id)) ?? FLIGHT_TEXTS[academy.speed.length % FLIGHT_TEXTS.length]!;
  }, [academy.speed]);

  useEffect(() => {
    if (phase.name !== "running") return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [phase.name]);

  useEffect(() => () => stopAudio(), []);

  const reset = () => {
    setErrors(new Set());
    setLastWord(null);
    setQIndex(0);
    setAnswers([]);
    setProblem("");
  };

  const words = (text: FlightText) => text.text.split(/\s+/).filter(Boolean);

  const header = (title: string, back = onBack) => (
    <header className="ac-top">
      <button type="button" className="ac-icon-btn" aria-label="Назад" onClick={() => { stopAudio(); back(); }}>
        <ChevronLeft aria-hidden="true" />
      </button>
      <div className="ac-top-title">
        <span className="ac-eyebrow">ЛЁТНЫЙ ТЕСТ</span>
        <h1>{title}</h1>
      </div>
    </header>
  );

  if (phase.name === "choose") {
    return (
      <main className="ac-screen">
        {header("Чтение на время")}
        <p className="ac-note">Текст: «{suggested.title}», {countWords(suggested.text)} слов.</p>
        <div className="ac-mode-cards">
          <button type="button" className="ac-mode" onClick={() => { reset(); setPhase({ name: "practice", text: suggested }); }}>
            <BookOpen aria-hidden="true" />
            <b>Тренировка</b>
            <span>Без часов. Читаем спокойно, трудное можно послушать.</span>
          </button>
          <button type="button" className="ac-mode" onClick={() => { reset(); setPhase({ name: "ready", text: suggested }); }}>
            <Gauge aria-hidden="true" />
            <b>Лётный тест</b>
            <span>С секундомером. Нужен взрослый: он слушает и отмечает ошибки.</span>
          </button>
        </div>
        <SpeedHistory academy={academy} />
      </main>
    );
  }

  if (phase.name === "practice") {
    const lines = sentencesOf(phase.text.text);
    return (
      <main className="ac-screen">
        {header(phase.text.title, () => setPhase({ name: "choose" }))}
        <p className="ac-note">Читай вслух. Если предложение трудное — нажми на него и послушай.</p>
        <div className="ac-story">
          {lines.map((line, index) => (
            <button key={index} type="button" className="ac-story-line" onClick={() => void play(line)}>
              {line}
            </button>
          ))}
        </div>
        <div className="ac-actions">
          <button
            type="button"
            className="ac-btn go"
            onClick={() => setPhase({ name: "questions", text: phase.text, seconds: 0, words: countWords(phase.text.text), practice: true })}
          >
            Я прочитал
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </main>
    );
  }

  if (phase.name === "ready") {
    return (
      <main className="ac-screen">
        {header(phase.text.title, () => setPhase({ name: "choose" }))}
        <Dial seconds={0} />
        <ol className="ac-steps">
          <li>Взрослый нажимает «Старт» — появляется текст.</li>
          <li>Ребёнок читает вслух. Взрослый нажимает на слова, где была ошибка.</li>
          <li>Дочитал или прошла минута — взрослый нажимает «Стоп».</li>
        </ol>
        <p className="ac-note">Это не экзамен. Медленно и правильно лучше, чем быстро с ошибками.</p>
        <div className="ac-actions">
          <button
            type="button"
            className="ac-btn go big"
            onClick={() => {
              const started = Date.now();
              setNow(started);
              setPhase({ name: "running", text: phase.text, started });
            }}
          >
            <Play aria-hidden="true" />
            Старт
          </button>
        </div>
      </main>
    );
  }

  if (phase.name === "running") {
    const seconds = Math.max(0, (now - phase.started) / 1000);
    const list = words(phase.text);
    return (
      <main className="ac-screen">
        {header(phase.text.title, () => setPhase({ name: "choose" }))}
        <Dial seconds={seconds} />
        <div className="ac-words" aria-label="Текст. Нажмите на слово с ошибкой">
          {list.map((word, index) => (
            <button
              key={index}
              type="button"
              aria-pressed={errors.has(index)}
              className={`ac-word-btn ${errors.has(index) ? "err" : ""}`}
              onClick={() =>
                setErrors((current) => {
                  const next = new Set(current);
                  if (next.has(index)) next.delete(index);
                  else next.add(index);
                  return next;
                })
              }
            >
              {word}
            </button>
          ))}
        </div>
        <div className="ac-actions">
          <button
            type="button"
            className="ac-btn stop big"
            onClick={() => setPhase({ name: "mark-end", text: phase.text, seconds: (Date.now() - phase.started) / 1000 })}
          >
            <Square aria-hidden="true" />
            Стоп
          </button>
        </div>
      </main>
    );
  }

  if (phase.name === "mark-end") {
    const list = words(phase.text);
    const end = lastWord ?? list.length - 1;
    const read = end + 1;
    const errorCount = [...errors].filter((index) => index <= end).length;
    return (
      <main className="ac-screen">
        {header("Где остановились?", () => setPhase({ name: "choose" }))}
        <p className="ac-note">
          Время: {format(phase.seconds)}. Если текст не дочитан — нажмите на последнее прочитанное слово.
        </p>
        <div className="ac-words">
          {list.map((word, index) => (
            <button
              key={index}
              type="button"
              className={`ac-word-btn ${errors.has(index) ? "err" : ""} ${index === end ? "end" : ""} ${index > end ? "after" : ""}`}
              onClick={() => setLastWord(index)}
            >
              {word}
            </button>
          ))}
        </div>
        <p className="ac-note">
          Прочитано слов: <b>{read}</b>, ошибок: <b>{errorCount}</b>.
        </p>
        <div className="ac-actions">
          <button
            type="button"
            className="ac-btn go"
            onClick={() => setPhase({ name: "questions", text: phase.text, seconds: phase.seconds, words: read, practice: false })}
          >
            <Flag aria-hidden="true" />
            К вопросам
          </button>
        </div>
      </main>
    );
  }

  if (phase.name === "questions") {
    const question = phase.text.questions[qIndex]!;
    const answer = (option: string) => {
      const next = [...answers, option === question.answer];
      setAnswers(next);
      void play(option === question.answer ? "Точно в цель!" : "Ничего страшного. Давай ещё разок.");
      if (qIndex + 1 < phase.text.questions.length) {
        setQIndex(qIndex + 1);
        return;
      }
      const comprehension: [number, number] = [next.filter(Boolean).length, next.length];
      if (phase.practice) {
        setPhase({ name: "result", run: null, record: false, practice: true, comprehension });
        return;
      }
      const list = words(phase.text);
      const end = lastWord ?? list.length - 1;
      const run: SpeedRun = {
        date: today(),
        textId: phase.text.id,
        seconds: Math.round(phase.seconds * 10) / 10,
        words: phase.words,
        errors: [...errors].filter((index) => index <= end).length,
        comprehension,
      };
      const invalid = validateRun(run);
      if (invalid) {
        setProblem(invalid);
        setPhase({ name: "result", run: null, record: false, practice: false, comprehension });
        return;
      }
      const outcome = recordSpeedRun(academy, run);
      update((current) => recordSpeedRun(current, run).next);
      setPhase({ name: "result", run, record: outcome.record, practice: false, comprehension });
    };
    return (
      <main className="ac-screen">
        {header("Вопросы по тексту", () => setPhase({ name: "choose" }))}
        <p className="ac-question">{question.question}</p>
        <button type="button" className="ac-btn soft small" onClick={() => void play(question.question)}>
          Послушать вопрос
        </button>
        <div className="ac-options wide">
          {question.options.map((option) => (
            <button key={option} type="button" className="ac-option" onClick={() => answer(option)}>
              <span className="ac-word-option">{option}</span>
            </button>
          ))}
        </div>
        <p className="ac-note">
          Вопрос {qIndex + 1} из {phase.text.questions.length}
        </p>
      </main>
    );
  }

  // Результат
  const run = phase.run;
  return (
    <main className="ac-screen ac-result">
      <Cheer burst={phase.record ? 1 : 0} />
      <h1>{phase.practice ? "Тренировка завершена!" : phase.record ? "Личный рекорд!" : run ? "Лётный тест пройден!" : "Замер не записан"}</h1>
      {problem ? <p className="ac-note">{problem}</p> : null}
      {run ? (
        <div className="ac-metrics">
          <div>
            <b>{wcpm(run)}</b>
            <span>верных слов в минуту</span>
          </div>
          <div>
            <b>{wpm(run)}</b>
            <span>всего слов в минуту</span>
          </div>
          <div>
            <b>{accuracyPct(run)}%</b>
            <span>точность</span>
          </div>
          <div>
            <b>
              {phase.comprehension[0]}/{phase.comprehension[1]}
            </b>
            <span>вопросы</span>
          </div>
        </div>
      ) : (
        <p className="ac-result-score">
          Ответы на вопросы: {phase.comprehension[0]} из {phase.comprehension[1]}
        </p>
      )}
      <SpeedHistory academy={academy} extra={run} />
      <div className="ac-actions">
        <button type="button" className="ac-btn go" autoFocus onClick={() => { reset(); setPhase({ name: "choose" }); }}>
          Готово
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </main>
  );
}

/** История верных слов в минуту: школьный замер, домашние тесты. */
function SpeedHistory({ academy, extra }: { academy: Academy; extra?: SpeedRun | null }) {
  // Только что записанный замер может ещё не дойти до состояния — добавляем.
  const list = extra && !academy.speed.some((run) => run.date === extra.date && run.seconds === extra.seconds && run.textId === extra.textId)
    ? [...academy.speed, extra]
    : academy.speed;
  const bars = [
    { label: "школа 30.09", value: SCHOOL_BASELINE.wcpm, school: true },
    ...list.slice(-7).map((run) => ({ label: `${run.date.slice(8, 10)}.${run.date.slice(5, 7)}`, value: wcpm(run), school: false })),
  ];
  const max = Math.max(40, ...bars.map((bar) => bar.value));
  return (
    <section className="ac-history" aria-label="История лётных тестов">
      <h2 className="ac-section-title">Верных слов в минуту</h2>
      <div className="ac-bars">
        {bars.map((bar, index) => (
          <div key={index} className="ac-bar-col">
            <b>{bar.value}</b>
            <span className={`ac-bar ${bar.school ? "school" : ""}`} style={{ height: `${(bar.value / max) * 100}%` }} />
            <small>{bar.label}</small>
          </div>
        ))}
      </div>
      {list.length === 0 ? <p className="ac-note">Пока только школьный замер. Первый лётный тест станет точкой отсчёта.</p> : null}
    </section>
  );
}
