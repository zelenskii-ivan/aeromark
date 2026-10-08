import { checkAchievements, type Achievement } from "./rewards.ts";
import { MAX_SPEED_RUNS, type Academy, type SpeedRun } from "./state.ts";

/**
 * Лётный тест — добровольная проверка скорости чтения.
 *
 * Считаем две величины:
 *  - слов в минуту (WPM) — сколько слов прочитано;
 *  - верных слов в минуту (WCPM) — прочитано минус ошибки. Это главная
 *    цифра: скорость без точности успехом не считается.
 *
 * Экран сам не знает, прочитано ли слово верно, — ошибки отмечает взрослый,
 * который слушает чтение вслух. Без отметок взрослого тест не засчитывается
 * как проверка точности, и экран говорит об этом прямо.
 */

export const wpm = (run: Pick<SpeedRun, "words" | "seconds">): number =>
  run.seconds > 0 ? Math.round((run.words * 60) / run.seconds) : 0;

export const wcpm = (run: Pick<SpeedRun, "words" | "seconds" | "errors">): number =>
  run.seconds > 0 ? Math.round((Math.max(0, run.words - run.errors) * 60) / run.seconds) : 0;

export const accuracyPct = (run: Pick<SpeedRun, "words" | "errors">): number =>
  run.words > 0 ? Math.round((Math.max(0, run.words - run.errors) / run.words) * 100) : 0;

/** Слишком короткий замер не измеряет ничего — меньше 5 секунд не пишем. */
export const MIN_SECONDS = 5;

export function validateRun(run: SpeedRun): string | null {
  if (!Number.isFinite(run.seconds) || run.seconds < MIN_SECONDS) return "Замер короче 5 секунд — попробуйте ещё раз.";
  if (run.words <= 0) return "Отметьте слово, на котором ребёнок остановился.";
  if (run.errors > run.words) return "Ошибок не может быть больше, чем прочитанных слов.";
  if (wpm(run) > 200) return "Так быстро вслух не читают — похоже, «Стоп» нажат раньше времени.";
  return null;
}

export type SpeedOutcome = {
  next: Academy;
  /** Новый личный рекорд по верным словам в минуту при точности не ниже прежней. */
  record: boolean;
  achievements: Achievement[];
};

/** Записывает замер. Рекорд — только если выросла скорость и не упала точность. */
export function recordSpeedRun(academy: Academy, run: SpeedRun): SpeedOutcome {
  const previousBest = academy.speed.reduce<SpeedRun | null>(
    (best, item) => (best === null || wcpm(item) > wcpm(best) ? item : best),
    null,
  );
  const record =
    previousBest !== null &&
    wcpm(run) > wcpm(previousBest) &&
    accuracyPct(run) >= Math.min(95, accuracyPct(previousBest));
  let next: Academy = { ...academy, speed: [...academy.speed, run].slice(-MAX_SPEED_RUNS) };
  const unlocked: Achievement[] = [];
  if (record && !next.ledger.includes(`speed:${run.date}`)) {
    // Награда за рекорд — не чаще раза в день, чтобы не гонять тест подряд.
    next = { ...next, coins: next.coins + 5, ledger: [...next.ledger, `speed:${run.date}`] };
    if (!next.ledger.includes("ach:personal-best")) {
      next = { ...next, ledger: [...next.ledger, "ach:personal-best"], coins: next.coins + 5 };
      unlocked.push({ id: "personal-best", title: "Личный рекорд", text: "Прочитал быстрее, чем раньше, и без потери точности", icon: "🚀" });
    }
  }
  const checked = checkAchievements(next);
  return { next: checked.next, record, achievements: [...unlocked, ...checked.unlocked] };
}

/** Разбивает текст на предложения — для вопросов «где это написано». */
export const sentencesOf = (text: string): string[] =>
  text.match(/[^.!?]+[.!?]+/g)?.map((sentence) => sentence.trim()) ?? [text];
