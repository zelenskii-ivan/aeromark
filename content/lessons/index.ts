import type { Lesson, Subject } from "../lesson.ts";
import { mathYearLessons } from "../math-year/plan.ts";
import { mathBond10 } from "./math-bond-10.ts";
import { russianSoft } from "./russian-soft.ts";
import { readingHangar } from "./reading-hangar.ts";
import { englishCommands } from "./english-commands.ts";

/** Витрина на главном экране: по одному уроку на предмет. */
export const lessons: readonly Lesson[] = [
  mathBond10,
  russianSoft,
  readingHangar,
  englishCommands,
];

/**
 * Все уроки приложения: витрина и «Математика на год». Один и тот же урок
 * может быть и там, и там («Десять заклёпок») — дубли убираются по id.
 */
export const allLessons: readonly Lesson[] = [...lessons, ...mathYearLessons].filter(
  (lesson, index, list) => list.findIndex((other) => other.id === lesson.id) === index,
);

export const lessonsBySubject = (subject: Subject): Lesson[] =>
  allLessons.filter((lesson) => lesson.subject === subject);

export const lessonById = (id: string): Lesson | undefined =>
  allLessons.find((lesson) => lesson.id === id);
