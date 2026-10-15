import { MATH_YEAR, type Quarter, type Topic } from "../content/math-year/plan.ts";

/**
 * Прогресс по «Математике на год». Отдельного состояния нет: тема пройдена,
 * если её урок есть в общем `completedLessons`. Поэтому синхронизация,
 * экспорт и старые сохранения работают без миграций.
 */

export type TopicStatus = "done" | "next" | "open" | "soon";

export function topicStatus(item: Topic, completed: readonly string[], nextId: string | null): TopicStatus {
  if (!item.lesson) return "soon";
  if (completed.includes(item.lesson.id)) return "done";
  return item.id === nextId ? "next" : "open";
}

/** Первая по порядку тема с уроком, которую ещё не прошли. */
export function nextTopic(completed: readonly string[]): Topic | null {
  for (const quarter of MATH_YEAR) {
    for (const item of quarter.topics) {
      if (item.lesson && !completed.includes(item.lesson.id)) return item;
    }
  }
  return null;
}

export type QuarterProgress = { done: number; ready: number; total: number; complete: boolean };

/**
 * Четверть пройдена, когда пройдены все её готовые уроки. Темы «готовится»
 * не блокируют награду: ребёнок не виноват, что урока ещё нет.
 */
export function quarterProgress(quarter: Quarter, completed: readonly string[]): QuarterProgress {
  const ready = quarter.topics.filter((item) => item.lesson);
  const done = ready.filter((item) => completed.includes(item.lesson!.id)).length;
  return {
    done,
    ready: ready.length,
    total: quarter.topics.length,
    complete: ready.length > 0 && done === ready.length,
  };
}

export function earnedAircraft(completed: readonly string[]): Quarter[] {
  return MATH_YEAR.filter((quarter) => quarterProgress(quarter, completed).complete);
}

/**
 * Какую четверть только что закрыл этот урок: была не пройдена до него и стала
 * пройдена после. Нужна, чтобы праздник показался ровно один раз.
 */
export function quarterJustCompleted(
  before: readonly string[],
  after: readonly string[],
): Quarter | null {
  return (
    MATH_YEAR.find(
      (quarter) =>
        !quarterProgress(quarter, before).complete && quarterProgress(quarter, after).complete,
    ) ?? null
  );
}

export function quarterOfLesson(lessonId: string): Quarter | null {
  return MATH_YEAR.find((quarter) => quarter.topics.some((item) => item.lesson?.id === lessonId)) ?? null;
}
