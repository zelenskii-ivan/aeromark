"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { skillOfItem } from "@/content/academy/curriculum";
import { buildExercise, difficultyFor, hashSeed, type PlanStep } from "@/lib/academy/session";
import type { Academy } from "@/lib/academy/state";
import { stopAudio } from "@/lib/academy/audio";
import { readValue, removeValue, writeValue } from "@/lib/storage";
import { ExerciseView, usePreload, type ExerciseResult } from "./exercises";
import { RateToggle } from "./ui";

/**
 * Полёт — последовательность заданий урока или свободной тренировки.
 *
 * Незаконченный полёт сохраняется на устройстве после каждого задания: если
 * вкладку закрыли или перезагрузили, ребёнок продолжит с того же места, а
 * уже данные ответы не потеряются.
 */

export const FLIGHT_KEY = "aeromark-academy-flight";

export type FlightState = {
  sessionId: string;
  lessonId: string | null;
  title: string;
  plan: PlanStep[];
  results: ExerciseResult[][];
};

export function loadFlight(): FlightState | null {
  try {
    const raw = readValue(FLIGHT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as FlightState;
    if (!data?.sessionId || !Array.isArray(data.plan) || !Array.isArray(data.results)) return null;
    if (data.results.length >= data.plan.length) return null;
    return data;
  } catch {
    return null;
  }
}

export const saveFlight = (state: FlightState) => writeValue(FLIGHT_KEY, JSON.stringify(state));
export const clearFlight = () => removeValue(FLIGHT_KEY);

export function Flight({
  academy,
  flight,
  onFinish,
  onExit,
}: {
  academy: Academy;
  flight: FlightState;
  onFinish: (results: ExerciseResult[]) => void;
  onExit: () => void;
}) {
  const [results, setResults] = useState<ExerciseResult[][]>(flight.results);
  const index = results.length;
  const step = flight.plan[index];

  // Трудность пересчитывается перед каждым заданием по ходу полёта.
  const exercise = useMemo(() => {
    if (!step) return null;
    const recent = results.flat().map((result) => result.correct);
    const skill = skillOfItem(step.item) ?? "letters";
    const difficulty = difficultyFor(academy, skill, recent);
    return buildExercise(step, academy, difficulty, hashSeed(`${flight.sessionId}:${index}`));
  }, [academy, flight.sessionId, index, results, step]);

  const upcoming = useMemo(
    () =>
      flight.plan
        .slice(index + 1, index + 3)
        .map((next, offset) => buildExercise(next, academy, 2, hashSeed(`${flight.sessionId}:${index + 1 + offset}`))),
    [academy, flight.plan, flight.sessionId, index],
  );
  usePreload(upcoming);

  const done = (answer: ExerciseResult[]) => {
    const next = [...results, answer];
    setResults(next);
    if (next.length >= flight.plan.length) {
      clearFlight();
      onFinish(next.flat());
    } else {
      saveFlight({ ...flight, results: next });
    }
  };

  return (
    <main className="ac-screen ac-flight">
      <header className="ac-flight-head">
        <button
          type="button"
          className="ac-icon-btn"
          aria-label="Прервать полёт (ответы сохранятся)"
          onClick={() => {
            stopAudio();
            onExit();
          }}
        >
          <X aria-hidden="true" />
        </button>
        <div className="ac-flight-progress" aria-label={`Задание ${Math.min(index + 1, flight.plan.length)} из ${flight.plan.length}`}>
          <span className="ac-flight-title">{flight.title}</span>
          <div className="ac-runway">
            <div className="ac-runway-fill" style={{ width: `${(index / flight.plan.length) * 100}%` }} />
            <span className="ac-runway-plane" style={{ left: `${(index / flight.plan.length) * 100}%` }} aria-hidden="true">
              ✈️
            </span>
          </div>
        </div>
        <RateToggle />
      </header>
      {exercise ? <ExerciseView key={`${flight.sessionId}:${index}`} exercise={exercise} onDone={done} /> : null}
    </main>
  );
}
