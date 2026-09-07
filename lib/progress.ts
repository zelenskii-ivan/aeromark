import { z } from "zod";
import { readValue } from "./storage.ts";
import type { Skill, Task } from "../content/types.ts";

export const PROGRESS_KEY = "aeromark-progress";
export const PIN_KEY = "aeromark-parent-pin";
export const PROGRESS_VERSION = 2;

const attemptSchema = z.object({
  right: z.number().int().min(0),
  total: z.number().int().min(0),
});

/**
 * Схема намеренно снисходительна: каждое поле имеет значение по умолчанию,
 * поэтому сохранение от старой версии приложения (или частично испорченное)
 * дочитывается, а не роняет первый рендер.
 */
export const savedSchema = z.object({
  version: z.number().int().default(1),
  stars: z.number().int().min(0).catch(0).default(0),
  completed: z.array(z.number().int()).catch([]).default([]),
  attempts: z.record(z.string(), attemptSchema).catch({}).default({}),
  mistakes: z.array(z.string()).catch([]).default([]),
  diagnosticDone: z.boolean().catch(false).default(false),
  earned: z.array(z.string()).catch([]).default([]),
  gameWins: z.array(z.string()).catch([]).default([]),
  completedLessons: z.array(z.string()).catch([]).default([]),
  practiceAnswered: z.number().int().min(0).catch(0).default(0),
  lastPlayed: z.string().catch("").default(""),
  streak: z.number().int().min(0).catch(0).default(0),
});

export type Saved = z.infer<typeof savedSchema>;

export const initialProgress: Saved = savedSchema.parse({});

/** Локальная календарная дата в формате YYYY-MM-DD (не UTC — важно для серии дней). */
export function today(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Приводит любое сохранение к текущей схеме. Возвращает дефолт, если разобрать
 * не удалось, — прогресс ребёнка терять неприятно, но белый экран хуже.
 */
export function migrateProgress(raw: unknown): Saved {
  const parsed = savedSchema.safeParse(raw);
  const value = parsed.success ? parsed.data : initialProgress;
  return { ...value, version: PROGRESS_VERSION };
}

export function loadProgress(read: (key: string) => string | null = readValue): Saved {
  try {
    const raw = read(PROGRESS_KEY);
    if (!raw) return initialProgress;
    return migrateProgress(JSON.parse(raw));
  } catch {
    return initialProgress;
  }
}

/** Отмечает заход в приложение и обновляет серию дней подряд. */
export function touchStreak(saved: Saved, date = today()): Saved {
  if (saved.lastPlayed === date) return saved;
  const gap = daysBetween(saved.lastPlayed, date);
  return { ...saved, lastPlayed: date, streak: gap === 1 ? saved.streak + 1 : 1 };
}

export type AnswerOutcome = { next: Saved; starEarned: boolean };

/**
 * Единственное место, где меняется прогресс после ответа. Звезда выдаётся один
 * раз за задачу; сгенерированные задачи (id начинается с `gen:`) звёзд не дают,
 * иначе счётчик обесценивается, зато идут в статистику навыка.
 */
export function applyAnswer(
  saved: Saved,
  task: Task,
  correct: boolean,
): AnswerOutcome {
  const rewardable = !task.id.startsWith("gen:");
  const alreadyEarned = saved.earned.includes(task.id);
  const starEarned = correct && rewardable && !alreadyEarned;
  const previous = saved.attempts[task.skill] ?? { right: 0, total: 0 };
  return {
    starEarned,
    next: {
      ...saved,
      stars: saved.stars + (starEarned ? 1 : 0),
      earned: starEarned ? [...saved.earned, task.id] : saved.earned,
      practiceAnswered: saved.practiceAnswered + 1,
      attempts: {
        ...saved.attempts,
        [task.skill]: {
          right: previous.right + (correct ? 1 : 0),
          total: previous.total + 1,
        },
      },
      mistakes: correct
        ? saved.mistakes.filter((id) => id !== task.id)
        : rewardable && !saved.mistakes.includes(task.id)
          ? [...saved.mistakes, task.id]
          : saved.mistakes,
    },
  };
}

export type SkillRow = {
  skill: Skill;
  right: number;
  total: number;
  pct: number;
};

/** Навыки от самого слабого к самому сильному — на этом строится совет штурмана. */
export function skillRows(saved: Saved): SkillRow[] {
  return Object.entries(saved.attempts)
    .filter(([, value]) => value.total > 0)
    .map(([skill, value]) => ({
      skill: skill as Skill,
      right: value.right,
      total: value.total,
      pct: Math.round((value.right / value.total) * 100),
    }))
    .sort((a, b) => a.pct - b.pct || b.total - a.total);
}

export const EXPORT_FORMAT = "aeromark";

export function serializeExport(saved: Saved): string {
  return JSON.stringify(
    {
      app: EXPORT_FORMAT,
      version: PROGRESS_VERSION,
      exportedAt: new Date().toISOString(),
      progress: saved,
    },
    null,
    2,
  );
}

export function parseExport(text: string): Saved {
  const data = JSON.parse(text) as { app?: string; progress?: unknown };
  if (data?.app !== EXPORT_FORMAT || data.progress === undefined) {
    throw new Error("Файл не похож на выгрузку Аэромарка");
  }
  return migrateProgress(data.progress);
}
