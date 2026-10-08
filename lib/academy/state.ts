import { z } from "zod";

/**
 * Состояние Академии внутри общего сохранения (lib/progress.ts).
 *
 * Хранится в том же JSON, что и остальной прогресс, поэтому без изменений
 * сервера синхронизируется в семейный кабинет и изолировано по семьям так же,
 * как всё остальное. Сервер принимает тело до 256 КБ, поэтому статистика по
 * единицам сжата в кортежи, а журналы обрезаются.
 *
 * Схема снисходительна: любое повреждённое поле заменяется значением по
 * умолчанию, а не роняет приложение.
 */

/**
 * Статистика единицы: [попыток, верно, с подсказкой, коробка 0–5, день
 * последнего ответа, верно подряд].
 */
export const itemStatSchema = z.tuple([
  z.number().int().min(0),
  z.number().int().min(0),
  z.number().int().min(0),
  z.number().int().min(0).max(5),
  z.number().int().min(0),
  z.number().int().min(0),
]);
export type ItemStat = z.infer<typeof itemStatSchema>;

const lessonStatSchema = z.object({
  /** Урок пройден (хотя бы раз 70% с первой попытки). */
  done: z.boolean().catch(false).default(false),
  /** Лучший результат, % верных с первой попытки. */
  best: z.number().int().min(0).max(100).catch(0).default(0),
  runs: z.number().int().min(0).catch(0).default(0),
});

export const speedRunSchema = z.object({
  date: z.string(),
  textId: z.string(),
  seconds: z.number().min(0),
  /** Сколько слов прочитано за попытку. */
  words: z.number().int().min(0),
  errors: z.number().int().min(0),
  /** Ответы на вопросы по тексту: верно / всего. */
  comprehension: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
});
export type SpeedRun = z.infer<typeof speedRunSchema>;

export const academySchema = z.object({
  v: z.literal(1).catch(1).default(1),
  // Одна испорченная запись не должна стирать всю статистику — её просто
  // выбрасываем, остальные сохраняем.
  items: z
    .record(z.string(), z.unknown())
    .transform((raw) => {
      const clean: Record<string, ItemStat> = {};
      for (const [key, value] of Object.entries(raw)) {
        const parsed = itemStatSchema.safeParse(value);
        if (parsed.success) clean[key] = parsed.data;
      }
      return clean;
    })
    .catch({})
    .default({}),
  lessons: z.record(z.string(), lessonStatSchema).catch({}).default({}),
  stars: z.number().int().min(0).catch(0).default(0),
  coins: z.number().int().min(0).catch(0).default(0),
  /** Выданные разовые награды: «lesson:l1-1», «ach:first-word», «level:2». */
  ledger: z.array(z.string()).catch([]).default([]),
  /** Завершённые полёты — повторная отправка того же полёта ничего не даёт. */
  sessions: z.array(z.string()).catch([]).default([]),
  /** Звёзды за свободную тренировку за день — у них дневной потолок. */
  practice: z
    .object({ day: z.number().int().min(0), stars: z.number().int().min(0) })
    .catch({ day: 0, stars: 0 })
    .default({ day: 0, stars: 0 }),
  speed: z.array(speedRunSchema).catch([]).default([]),
  /** Выбранный самолёт в ангаре. */
  plane: z.string().catch("kukuruznik").default("kukuruznik"),
  /** Когда последний раз занимались — дни подряд. */
  lastDay: z.number().int().min(0).catch(0).default(0),
  streak: z.number().int().min(0).catch(0).default(0),
});

export type Academy = z.infer<typeof academySchema>;

export const initialAcademy: Academy = academySchema.parse({});

export const MAX_SESSIONS = 40;
export const MAX_SPEED_RUNS = 60;

/** Номер дня по местному календарю — для интервалов повторения и серий. */
export function dayNumber(now = new Date()): number {
  const local = now.getTime() - now.getTimezoneOffset() * 60_000;
  return Math.floor(local / 86_400_000);
}

export function migrateAcademy(raw: unknown): Academy {
  const parsed = academySchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : initialAcademy;
}
