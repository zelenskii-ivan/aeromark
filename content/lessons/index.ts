import type { Lesson, Subject } from "../lesson.ts";
import { mathBond10 } from "./math-bond-10.ts";
import { russianSoft } from "./russian-soft.ts";
import { readingHangar } from "./reading-hangar.ts";
import { englishCommands } from "./english-commands.ts";

export const lessons: readonly Lesson[] = [
  mathBond10,
  russianSoft,
  readingHangar,
  englishCommands,
];

export const lessonsBySubject = (subject: Subject): Lesson[] =>
  lessons.filter((lesson) => lesson.subject === subject);

export const lessonById = (id: string): Lesson | undefined =>
  lessons.find((lesson) => lesson.id === id);
