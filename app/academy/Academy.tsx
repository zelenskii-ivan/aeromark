"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Coins, Lock, Play, RotateCcw, Shuffle, Star, Timer, Warehouse } from "lucide-react";
import { LEVELS, SKILL_TITLE, type Lesson } from "@/content/academy/curriculum";
import { currentLesson, isUnlocked, levelProgress } from "@/lib/academy/mastery";
import { planLesson, planPractice } from "@/lib/academy/session";
import {
  ACHIEVEMENTS,
  AIRCRAFT,
  buyAircraft,
  finishSession,
  isAircraftOpen,
  type SessionReport,
} from "@/lib/academy/rewards";
import { dayNumber, type Academy as AcademyState } from "@/lib/academy/state";
import { play, unlockAudio } from "@/lib/academy/audio";
import { Cheer } from "@/app/cheer";
import { clearFlight, Flight, loadFlight, saveFlight, type FlightState } from "./Flight";
import { SpeedTest } from "./SpeedTest";
import { PlaneIcon, RateToggle } from "./ui";
import "./academy.css";

/**
 * Академия пилотов — раздел обучения чтению.
 *
 * Карта — шесть аэропортов по уровням программы. Уроки открываются по
 * порядку, пройденные можно повторять сколько угодно, свободный полёт
 * доступен всегда. Всё состояние — в `saved.academy`, сохранение и
 * синхронизация общие с остальным приложением.
 */

type View =
  | { name: "map" }
  | { name: "flight"; flight: FlightState }
  | { name: "result"; report: SessionReport; lesson: Lesson | null }
  | { name: "hangar" }
  | { name: "speed" };

const newSessionId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function Academy({
  academy,
  update,
  pilotName,
  onExit,
}: {
  academy: AcademyState;
  update: (fn: (current: AcademyState) => AcademyState) => void;
  pilotName: string;
  onExit: () => void;
}) {
  const [view, setView] = useState<View>({ name: "map" });
  const [resume, setResume] = useState<FlightState | null>(null);
  const [openLevel, setOpenLevel] = useState<number>(() => currentLesson(academy).level);

  useEffect(() => {
    // Незаконченный полёт после перезагрузки страницы.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResume(loadFlight());
  }, [view.name]);

  const startLesson = (lesson: Lesson) => {
    unlockAudio();
    const sessionId = newSessionId();
    const flight: FlightState = {
      sessionId,
      lessonId: lesson.id,
      title: lesson.title,
      plan: planLesson(academy, lesson, dayNumber(), Date.now() % 1_000_000),
      results: [],
    };
    saveFlight(flight);
    setView({ name: "flight", flight });
  };

  const startPractice = () => {
    unlockAudio();
    const flight: FlightState = {
      sessionId: newSessionId(),
      lessonId: null,
      title: "Свободный полёт",
      plan: planPractice(academy, dayNumber(), Date.now() % 1_000_000),
      results: [],
    };
    saveFlight(flight);
    setView({ name: "flight", flight });
  };

  const finish = (flight: FlightState, results: Parameters<typeof finishSession>[1]["results"]) => {
    const input = { sessionId: flight.sessionId, lessonId: flight.lessonId, results, day: dayNumber() };
    // Отчёт для экрана считаем от текущего состояния, а сохраняем через
    // функцию-обновление: если за время полёта прогресс пришёл с сервера,
    // засчитываем поверх свежего. Повторный зачёт того же полёта невозможен —
    // finishSession сверяет sessionId.
    const { report } = finishSession(academy, input);
    update((current) => finishSession(current, input).next);
    const lesson = LEVELS.flatMap((level) => level.lessons).find((item) => item.id === flight.lessonId) ?? null;
    setView({ name: "result", report, lesson });
  };

  if (view.name === "flight") {
    return (
      <Flight
        academy={academy}
        flight={view.flight}
        onFinish={(results) => finish(view.flight, results)}
        onExit={() => setView({ name: "map" })}
      />
    );
  }

  if (view.name === "result") {
    return <ResultScreen report={view.report} lesson={view.lesson} onMap={() => setView({ name: "map" })} onAgain={view.lesson ? () => startLesson(view.lesson!) : startPractice} />;
  }

  if (view.name === "hangar") {
    return <Hangar academy={academy} update={update} onBack={() => setView({ name: "map" })} />;
  }

  if (view.name === "speed") {
    return <SpeedTest academy={academy} update={update} onBack={() => setView({ name: "map" })} />;
  }

  const next = currentLesson(academy);
  const plane = AIRCRAFT.find((item) => item.id === academy.plane) ?? AIRCRAFT[0]!;

  return (
    <main className="ac-screen ac-map-screen">
      <header className="ac-top">
        <button type="button" className="ac-icon-btn" aria-label="Выйти из Академии" onClick={onExit}>
          <ChevronLeft aria-hidden="true" />
        </button>
        <div className="ac-top-title">
          <span className="ac-eyebrow">АКАДЕМИЯ ПИЛОТОВ</span>
          <h1>Пилот {pilotName}</h1>
        </div>
        <div className="ac-wallet">
          <span aria-label={`Звёзд: ${academy.stars}`}>
            <Star aria-hidden="true" className="ac-star" />
            {academy.stars}
          </span>
          <span aria-label={`Монет: ${academy.coins}`}>
            <Coins aria-hidden="true" className="ac-coin" />
            {academy.coins}
          </span>
        </div>
        <RateToggle />
      </header>

      {resume ? (
        <section className="ac-resume">
          <p>
            Полёт «{resume.title}» не закончен: {resume.results.length} из {resume.plan.length}.
          </p>
          <div className="ac-actions">
            <button type="button" className="ac-btn soft" onClick={() => { clearFlight(); setResume(null); }}>
              Начать заново
            </button>
            <button type="button" className="ac-btn go" onClick={() => { unlockAudio(); setView({ name: "flight", flight: resume }); }}>
              <Play aria-hidden="true" />
              Продолжить
            </button>
          </div>
        </section>
      ) : null}

      <section className="ac-hero">
        <PlaneIcon color={plane.color} size={72} />
        <div>
          <span className="ac-eyebrow">СЛЕДУЮЩИЙ ПОЛЁТ</span>
          <h2>{next.title}</h2>
          <p>{next.goal}</p>
        </div>
        <button type="button" className="ac-btn go big" onClick={() => startLesson(next)}>
          Лететь
          <ChevronRight aria-hidden="true" />
        </button>
      </section>

      <nav className="ac-tiles" aria-label="Разделы Академии">
        <button type="button" onClick={startPractice}>
          <Shuffle aria-hidden="true" />
          <b>Свободный полёт</b>
          <span>повторяем трудное</span>
        </button>
        <button type="button" onClick={() => setView({ name: "speed" })}>
          <Timer aria-hidden="true" />
          <b>Лётный тест</b>
          <span>чтение на время</span>
        </button>
        <button type="button" onClick={() => setView({ name: "hangar" })}>
          <Warehouse aria-hidden="true" />
          <b>Ангар</b>
          <span>самолёты и награды</span>
        </button>
      </nav>

      <ol className="ac-route" aria-label="Карта аэропортов">
        {LEVELS.map((level) => {
          const progress = levelProgress(academy, level.id);
          const firstLesson = level.lessons[0]!;
          const open = isUnlocked(academy, firstLesson);
          const expanded = openLevel === level.id;
          return (
            <li key={level.id} className={`ac-airport ${progress.complete ? "done" : open ? "open" : "locked"}`}>
              <button
                type="button"
                className="ac-airport-head"
                aria-expanded={expanded}
                onClick={() => setOpenLevel(expanded ? 0 : level.id)}
              >
                <span className="ac-airport-badge">{progress.complete ? "✓" : open ? level.id : <Lock aria-hidden="true" />}</span>
                <span className="ac-airport-name">
                  <b>{level.airport}</b>
                  <small>
                    {SKILL_TITLE[level.skill]} · {progress.done} из {progress.total}
                  </small>
                </span>
                <span className="ac-airport-bar" aria-hidden="true">
                  <span style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                </span>
              </button>
              {expanded ? (
                <div className="ac-lessons">
                  {level.lessons.map((lesson) => {
                    const stat = academy.lessons[lesson.id];
                    const unlocked = isUnlocked(academy, lesson);
                    const current = lesson.id === next.id;
                    return (
                      <button
                        key={lesson.id}
                        type="button"
                        disabled={!unlocked}
                        className={`ac-lesson ${stat?.done ? "done" : ""} ${current ? "current" : ""}`}
                        onClick={() => startLesson(lesson)}
                        aria-label={`${lesson.title}. ${stat?.done ? `Пройден, лучший результат ${stat.best}%` : unlocked ? "Открыт" : "Закрыт"}`}
                      >
                        <span className="ac-lesson-mark" aria-hidden="true">
                          {stat?.done ? "✓" : current ? "✈" : unlocked ? "•" : "🔒"}
                        </span>
                        <span className="ac-lesson-title">{lesson.title}</span>
                        {stat?.done ? (
                          <span className="ac-lesson-best">
                            <RotateCcw aria-hidden="true" />
                            {stat.best}%
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </main>
  );
}

function ResultScreen({
  report,
  lesson,
  onMap,
  onAgain,
}: {
  report: SessionReport;
  lesson: Lesson | null;
  onMap: () => void;
  onAgain: () => void;
}) {
  const headline = report.duplicate
    ? "Полёт уже засчитан"
    : report.lessonFirstTime
      ? "Урок пройден!"
      : lesson && !report.lessonDone
        ? "Хороший полёт!"
        : "Полёт завершён!";
  useEffect(() => {
    void play(report.lessonFirstTime ? "Урок пройден!" : "Полёт завершён!");
  }, [report.lessonFirstTime]);
  const burst = useMemo(() => (report.duplicate ? 0 : 1), [report.duplicate]);
  return (
    <main className="ac-screen ac-result">
      <Cheer burst={burst} />
      <div className="ac-result-plane" aria-hidden="true">
        ✈️
      </div>
      <h1>{headline}</h1>
      {!report.duplicate ? (
        <>
          <p className="ac-result-score">
            С первой попытки: {report.firstTry} из {report.total}
          </p>
          <div className="ac-result-rewards">
            <span>
              <Star aria-hidden="true" className="ac-star" />+{report.stars}
            </span>
            {report.coins > 0 ? (
              <span>
                <Coins aria-hidden="true" className="ac-coin" />+{report.coins}
              </span>
            ) : null}
          </div>
          {lesson && !report.lessonDone ? (
            <p className="ac-note">
              Ещё один полёт — и урок будет пройден. Нужно {70}% с первой попытки, сейчас {report.score}%.
            </p>
          ) : null}
          {report.capped ? <p className="ac-note">На сегодня звёзд достаточно — тренироваться можно дальше, завтра звёзды снова будут.</p> : null}
          {report.levelDone ? <p className="ac-badge-line">🛬 Аэропорт пройден! В ангаре новый самолёт.</p> : null}
          {report.achievements.map((achievement) => (
            <p key={achievement.id} className="ac-badge-line">
              {achievement.icon} {achievement.title}: {achievement.text}
            </p>
          ))}
        </>
      ) : null}
      <div className="ac-actions">
        <button type="button" className="ac-btn soft" onClick={onAgain}>
          <RotateCcw aria-hidden="true" />
          Ещё раз
        </button>
        <button type="button" className="ac-btn go" autoFocus onClick={onMap}>
          На карту
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </main>
  );
}

function Hangar({
  academy,
  update,
  onBack,
}: {
  academy: AcademyState;
  update: (fn: (current: AcademyState) => AcademyState) => void;
  onBack: () => void;
}) {
  return (
    <main className="ac-screen">
      <header className="ac-top">
        <button type="button" className="ac-icon-btn" aria-label="Назад" onClick={onBack}>
          <ChevronLeft aria-hidden="true" />
        </button>
        <div className="ac-top-title">
          <span className="ac-eyebrow">АНГАР</span>
          <h1>Самолёты и награды</h1>
        </div>
        <div className="ac-wallet">
          <span>
            <Coins aria-hidden="true" className="ac-coin" />
            {academy.coins}
          </span>
        </div>
      </header>
      <div className="ac-planes">
        {AIRCRAFT.map((plane) => {
          const open = isAircraftOpen(academy, plane);
          const chosen = academy.plane === plane.id;
          const price = "coins" in plane.unlock ? plane.unlock.coins : null;
          return (
            <article key={plane.id} className={`ac-plane ${open ? "" : "locked"} ${chosen ? "chosen" : ""}`}>
              <PlaneIcon color={open ? plane.color : "#b8c4cf"} size={64} />
              <b>{plane.name}</b>
              {open ? (
                <button
                  type="button"
                  className="ac-btn soft small"
                  disabled={chosen}
                  onClick={() => update((current) => ({ ...current, plane: plane.id }))}
                >
                  {chosen ? "Твой самолёт" : "Выбрать"}
                </button>
              ) : price !== null ? (
                <button
                  type="button"
                  className="ac-btn go small"
                  disabled={academy.coins < price}
                  onClick={() => update((current) => buyAircraft(current, plane.id) ?? current)}
                >
                  <Coins aria-hidden="true" />
                  {price}
                </button>
              ) : (
                <small>Пройди аэропорт {"level" in plane.unlock ? plane.unlock.level : ""}</small>
              )}
            </article>
          );
        })}
      </div>
      <h2 className="ac-section-title">Награды</h2>
      <div className="ac-achievements">
        {ACHIEVEMENTS.map((achievement) => {
          const got = academy.ledger.includes(`ach:${achievement.id}`);
          return (
            <article key={achievement.id} className={`ac-achievement ${got ? "got" : ""}`}>
              <span aria-hidden="true">{got ? achievement.icon : "🔒"}</span>
              <b>{achievement.title}</b>
              <small>{achievement.text}</small>
            </article>
          );
        })}
      </div>
    </main>
  );
}
