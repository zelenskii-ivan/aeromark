"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Flag, Gauge, Play, Square } from "lucide-react";
import { FLIGHT_TEXTS, type FlightText } from "@/content/academy/texts";
import { accuracyPct, questionsWithinReading, recordSpeedRun, sentencesOf, validateRun, wcpm, wordsForSpeedTest, wpm } from "@/lib/academy/speed";
import { nextTextId } from "@/lib/karaoke/model";
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
const FLIGHT_IDS = FLIGHT_TEXTS.map(text => text.id);
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
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ name: "choose" });
  const [errors, setErrors] = useState<Set<number>>(new Set());
  const [lastWord, setLastWord] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [problem, setProblem] = useState("");

  const suggestedId = useMemo(() => nextTextId(FLIGHT_IDS, academy.speed), [academy.speed]);
  const suggested = FLIGHT_TEXTS.find(text => text.id === (chosenId ?? suggestedId))!;


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

  const words = (text: FlightText) => wordsForSpeedTest(text.text);
  const finishQuestions = (item: Extract<Phase, { name: "questions" }>, checked: boolean[]) => {
    const comprehension: [number, number] = [checked.filter(Boolean).length, checked.length];
    if (item.practice) {
      setPhase({ name: "result", run: null, record: false, practice: true, comprehension });
      return;
    }
    const run: SpeedRun = {
      date: today(),
      textId: item.text.id,
      seconds: Math.round(item.seconds * 10) / 10,
      words: item.words,
      errors: [...errors].filter(index => index < item.words).length,
      comprehension,
    };
    const invalid = validateRun(run);
    if (invalid) {
      setProblem(invalid);
      setPhase({ name: "result", run: null, record: false, practice: false, comprehension });
      return;
    }
    const outcome = recordSpeedRun(academy, run);
    update(current => recordSpeedRun(current, run).next);
    setChosenId(null);
    setPhase({ name: "result", run, record: outcome.record, practice: false, comprehension });
  };

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
        <div className="ac-flight-selector">
          <label htmlFor="ac-flight-text">Текст для чтения</label>
          <select id="ac-flight-text" value={suggested.id} onChange={event => setChosenId(event.target.value)}>
            {FLIGHT_TEXTS.map(text => <option key={text.id} value={text.id}>
              {text.title}{text.author ? ` · ${text.author}` : ""} · {words(text).length} слов
            </option>)}
          </select>
        </div>
        <p className="ac-note">{words(suggested).length} слов{suggested.author ? ` · ${suggested.author}` : ""}
          {suggested.form === "retelling" ? " · учебный пересказ" : suggested.form === "excerpt" ? " · отрывок" : ""}
          {suggested.source && <> · <a href={suggested.source} target="_blank" rel="noreferrer">Источник</a></>}
        </p>
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
            onClick={() => setPhase({ name: "questions", text: phase.text, seconds: 0, words: words(phase.text).length, practice: true })}
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
        <div className="ac-actions ac-flight-stop">
          <output role="timer" aria-label={`Прошло ${format(seconds)}`}>{format(seconds)}</output>
          <button
            type="button"
            className="ac-btn stop big"
            onClick={() => setPhase({ name: "mark-end", text: phase.text, seconds: (Date.now() - phase.started) / 1000 })}
          >
            <Square aria-hidden="true" />
            Стоп
          </button>
        </div>
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

      </main>
    );
  }

  if (phase.name === "mark-end") {
    const list = words(phase.text);
    const end = lastWord ?? -1;
    const read = end + 1;
    const errorCount = [...errors].filter((index) => index <= end).length;
    const reachedQuestions = questionsWithinReading(phase.text, read);
    return (
      <main className="ac-screen">
        {header("Где остановились?", () => setPhase({ name: "choose" }))}
        <p className="ac-note">
          Время: {format(phase.seconds)}. Нажмите на последнее прочитанное слово.
        </p>
        <div className="ac-words">
          {list.map((word, index) => (
            <button
              key={index}
              type="button"
              className={`ac-word-btn ${errors.has(index) ? "err" : ""} ${index === end ? "end" : ""} ${end >= 0 && index > end ? "after" : ""}`}
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
          <button type="button" className="ac-btn soft" onClick={() => setLastWord(list.length - 1)}>Весь текст</button>
          <button
            type="button"
            className="ac-btn go"
            disabled={!read}
            onClick={() => {
              const item = { name: "questions", text: phase.text, seconds: phase.seconds, words: read, practice: false } as const;
              if (reachedQuestions.length) setPhase(item);
              else finishQuestions(item, []);
            }}
          >
            <Flag aria-hidden="true" />
            {read && !reachedQuestions.length ? "К результату" : "К вопросам"}
          </button>
        </div>
      </main>
    );
  }

  if (phase.name === "questions") {
    const questions = phase.practice ? phase.text.questions : questionsWithinReading(phase.text, phase.words);
    const question = questions[qIndex]!;
    const answer = (option: string) => {
      const next = [...answers, option === question.answer];
      setAnswers(next);
      void play(option === question.answer ? "Точно в цель!" : "Ничего страшного. Давай ещё разок.");
      if (qIndex + 1 < questions.length) {
        setQIndex(qIndex + 1);
        return;
      }
      finishQuestions(phase, next);
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
          Вопрос {qIndex + 1} из {questions.length}
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
            <span>{phase.comprehension[1] ? "вопросы" : "вопросы пропущены"}</span>
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
