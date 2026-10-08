import {
  LESSONS,
  LEVELS,
  SKILL_PREFIX,
  skillOfItem,
  type Lesson,
  type SkillId,
} from "../../content/academy/curriculum.ts";
import type { Academy, ItemStat } from "./state.ts";

/**
 * Модель усвоения — намеренно простая и объяснимая родителю.
 *
 * У каждой единицы (буква, слог, слово…) есть «коробка» от 0 до 5, как в
 * карточках Лейтнера:
 *  - верно без подсказки — коробка +1;
 *  - верно с подсказкой — коробка не растёт (но и не падает);
 *  - ошибка — коробка −2 (но не ниже нуля).
 * Единица усвоена, когда она в коробке 3 и выше. Чем выше коробка, тем
 * реже её повторяем: через 0, 1, 2, 4, 7, 14 дней.
 *
 * Никаких нейросетей: каждое решение движка можно объяснить одной фразой.
 */

export const INTERVAL_DAYS = [0, 1, 2, 4, 7, 14] as const;
export const MASTERED_BOX = 3;

export const emptyStat = (): ItemStat => [0, 0, 0, 0, 0, 0];

export function updateItem(
  stat: ItemStat | undefined,
  outcome: { correct: boolean; hinted: boolean },
  day: number,
): ItemStat {
  const [attempts, correct, hints, box, , streak] = stat ?? emptyStat();
  const clean = outcome.correct && !outcome.hinted;
  const nextBox = outcome.correct
    ? clean
      ? Math.min(5, box + 1)
      : box
    : Math.max(0, box - 2);
  return [
    attempts + 1,
    correct + (outcome.correct ? 1 : 0),
    hints + (outcome.hinted ? 1 : 0),
    nextBox,
    day,
    clean ? streak + 1 : outcome.correct ? streak : 0,
  ];
}

export const isMastered = (stat: ItemStat | undefined): boolean =>
  Boolean(stat && stat[3] >= MASTERED_BOX);

export const accuracy = (stat: ItemStat | undefined): number =>
  stat && stat[0] > 0 ? stat[1] / stat[0] : 0;

/** Пора повторить: прошло не меньше интервала её коробки. */
export function isDue(stat: ItemStat | undefined, day: number): boolean {
  if (!stat) return false;
  return day - stat[4] >= INTERVAL_DAYS[stat[3]]!;
}

/** Требует практики: несколько попыток, а точность низкая или коробка внизу. */
export function needsPractice(stat: ItemStat | undefined): boolean {
  if (!stat || stat[0] < 3) return false;
  return accuracy(stat) < 0.7 || stat[3] <= 1;
}

export type SkillSummary = {
  skill: SkillId;
  /** Единиц, с которыми ребёнок уже встречался. */
  seen: number;
  mastered: number;
  practice: number;
  attempts: number;
  correct: number;
  hints: number;
  /** Доля усвоенных среди встреченных, 0–1. */
  mastery: number;
  /** Точность ответов, 0–1. */
  accuracy: number;
};

export function skillSummary(academy: Academy, skill: SkillId): SkillSummary {
  const prefix = `${SKILL_PREFIX[skill]}:`;
  let seen = 0;
  let mastered = 0;
  let practice = 0;
  let attempts = 0;
  let correct = 0;
  let hints = 0;
  for (const [key, stat] of Object.entries(academy.items)) {
    if (!key.startsWith(prefix)) continue;
    seen += 1;
    if (isMastered(stat)) mastered += 1;
    if (needsPractice(stat)) practice += 1;
    attempts += stat[0];
    correct += stat[1];
    hints += stat[2];
  }
  return {
    skill,
    seen,
    mastered,
    practice,
    attempts,
    correct,
    hints,
    mastery: seen ? mastered / seen : 0,
    accuracy: attempts ? correct / attempts : 0,
  };
}

export const ALL_SKILLS: SkillId[] = ["letters", "phonemes", "syllables", "words", "sentences", "stories"];

/** Единицы, требующие практики, от самой слабой. */
export function weakItems(academy: Academy, skill?: SkillId, limit = 10): string[] {
  return Object.entries(academy.items)
    .filter(([key, stat]) => needsPractice(stat) && (!skill || skillOfItem(key) === skill))
    .sort((a, b) => accuracy(a[1]) - accuracy(b[1]) || a[1][3] - b[1][3])
    .slice(0, limit)
    .map(([key]) => key);
}

// ---------- Последовательность уроков ----------

/** Урок открыт, если пройден предыдущий урок программы (первый открыт всегда). */
export function isUnlocked(academy: Academy, lesson: Lesson): boolean {
  const index = LESSONS.findIndex((item) => item.id === lesson.id);
  if (index <= 0) return true;
  const previous = LESSONS[index - 1]!;
  return Boolean(academy.lessons[previous.id]?.done);
}

/** Следующий непройденный урок — туда ведёт кнопка «Лететь дальше». */
export function currentLesson(academy: Academy): Lesson {
  return LESSONS.find((lesson) => !academy.lessons[lesson.id]?.done) ?? LESSONS[LESSONS.length - 1]!;
}

export function levelProgress(academy: Academy, levelId: number) {
  const level = LEVELS.find((item) => item.id === levelId)!;
  const done = level.lessons.filter((lesson) => academy.lessons[lesson.id]?.done).length;
  return { done, total: level.lessons.length, complete: done === level.lessons.length };
}

export const completedLessons = (academy: Academy): number =>
  LESSONS.filter((lesson) => academy.lessons[lesson.id]?.done).length;
