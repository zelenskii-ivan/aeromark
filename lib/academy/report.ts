import { LESSONS, SKILL_TITLE, skillOfItem, type SkillId } from "../../content/academy/curriculum.ts";
import { SOUNDING } from "../../content/academy/letters.ts";
import { accuracy, ALL_SKILLS, currentLesson, isMastered, needsPractice, skillSummary, type SkillSummary } from "./mastery.ts";
import { accuracyPct, wcpm, wpm } from "./speed.ts";
import type { Academy } from "./state.ts";

/**
 * Отчёт для взрослого. Только наблюдаемые факты: сколько попыток, сколько
 * верно, где подсказки. Никаких выводов о диагнозах — тренажёр видит ответы
 * на кнопки, а не ребёнка.
 */

export type LetterCell = { char: string; status: "new" | "practice" | "learning" | "mastered"; accuracy: number; attempts: number };

export function letterGrid(academy: Academy): LetterCell[] {
  return SOUNDING.map((letter) => {
    const stats = [academy.items[`L:${letter.char}`], academy.items[`P:${letter.char}`]].filter(Boolean);
    const attempts = stats.reduce((sum, stat) => sum + stat![0], 0);
    const correct = stats.reduce((sum, stat) => sum + stat![1], 0);
    const main = academy.items[`L:${letter.char}`];
    let status: LetterCell["status"] = "new";
    if (attempts > 0) status = "learning";
    if (stats.some((stat) => needsPractice(stat))) status = "practice";
    else if (isMastered(main)) status = "mastered";
    return { char: letter.char, status, accuracy: attempts ? correct / attempts : 0, attempts };
  });
}

/** Читаемое название единицы для списка «что потренировать». */
export function itemLabel(key: string): string {
  const [prefix, ...rest] = key.split(":");
  const value = rest.join(":");
  switch (prefix) {
    case "L":
      return `буква ${value}`;
    case "P":
      return `звук ${value} в начале слова`;
    case "S":
      return `слог «${value.toUpperCase()}»`;
    case "W":
      return `слово «${value}»`;
    case "C":
      return "понимание предложения";
    case "Q":
      return "вопрос к рассказу";
    default:
      return key;
  }
}

export type Recommendation = { title: string; text: string };

/**
 * Что делать дальше — простые правила, по одному на ситуацию:
 *  1. есть единицы с низкой точностью — повторить их в свободном полёте;
 *  2. часто нужна подсказка — читать вместе, проговаривая слоги;
 *  3. всё ровно — продолжать программу с текущего урока;
 *  4. давно не было лётного теста — сделать замер.
 */
export function recommendations(academy: Academy, today: string): Recommendation[] {
  const out: Recommendation[] = [];
  const weak = Object.entries(academy.items)
    .filter(([, stat]) => needsPractice(stat))
    .sort((a, b) => accuracy(a[1]) - accuracy(b[1]))
    .slice(0, 4)
    .map(([key]) => itemLabel(key));
  if (weak.length) {
    out.push({
      title: "Повторить трудное",
      text: `Даётся труднее всего: ${weak.join(", ")}. «Свободный полёт» сам подмешивает эти задания.`,
    });
  }
  const totals = ALL_SKILLS.map((skill) => skillSummary(academy, skill)).filter((s) => s.attempts >= 10);
  const hinted = totals.filter((s) => s.hints / s.attempts > 0.3);
  if (hinted.length) {
    out.push({
      title: "Читать вместе",
      text: `В разделах «${hinted.map((s) => SKILL_TITLE[s.skill]).join("», «")}» подсказка нужна больше чем в трети заданий. Полезно читать вместе: взрослый показывает слоги пальцем, ребёнок читает.`,
    });
  }
  const next = currentLesson(academy);
  out.push({
    title: "Следующий полёт",
    text: `Урок «${next.title}»: ${next.goal.toLowerCase()}. 10–15 минут в день достаточно.`,
  });
  const last = academy.speed[academy.speed.length - 1];
  const daysSince = last ? Math.round((Date.parse(today) - Date.parse(last.date)) / 86_400_000) : Infinity;
  if (daysSince >= 7) {
    out.push({
      title: "Лётный тест",
      text: last
        ? "Последний замер скорости был больше недели назад. Раз в неделю достаточно — чаще не нужно."
        : "Замеров скорости ещё не было. Сделайте первый — он станет точкой отсчёта.",
    });
  }
  return out;
}

export type AcademyReport = {
  completed: number;
  totalLessons: number;
  skills: SkillSummary[];
  letters: LetterCell[];
  hintRate: number;
  comprehension: { correct: number; total: number };
  speed: { date: string; wpm: number; wcpm: number; accuracy: number; comprehension: [number, number] }[];
  practice: string[];
  recommendations: Recommendation[];
};

export function buildReport(academy: Academy, today: string): AcademyReport {
  const skills = ALL_SKILLS.map((skill) => skillSummary(academy, skill));
  const attempts = skills.reduce((sum, s) => sum + s.attempts, 0);
  const hints = skills.reduce((sum, s) => sum + s.hints, 0);
  const comprehensionSkills: SkillId[] = ["sentences", "stories"];
  const comp = skills.filter((s) => comprehensionSkills.includes(s.skill));
  const speedComp = academy.speed.reduce<[number, number]>((acc, run) => [acc[0] + run.comprehension[0], acc[1] + run.comprehension[1]], [0, 0]);
  return {
    completed: LESSONS.filter((lesson) => academy.lessons[lesson.id]?.done).length,
    totalLessons: LESSONS.length,
    skills,
    letters: letterGrid(academy),
    hintRate: attempts ? hints / attempts : 0,
    comprehension: {
      correct: comp.reduce((sum, s) => sum + s.correct, 0) + speedComp[0],
      total: comp.reduce((sum, s) => sum + s.attempts, 0) + speedComp[1],
    },
    speed: academy.speed.map((run) => ({
      date: run.date,
      wpm: wpm(run),
      wcpm: wcpm(run),
      accuracy: accuracyPct(run),
      comprehension: run.comprehension,
    })),
    practice: Object.entries(academy.items)
      .filter(([key, stat]) => needsPractice(stat) && skillOfItem(key))
      .sort((a, b) => accuracy(a[1]) - accuracy(b[1]))
      .slice(0, 8)
      .map(([key]) => itemLabel(key)),
    recommendations: recommendations(academy, today),
  };
}
