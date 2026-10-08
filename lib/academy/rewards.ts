import { LESSONS, LEVELS, lessonById } from "../../content/academy/curriculum.ts";
import { SOUNDING } from "../../content/academy/letters.ts";
import { completedLessons, isMastered, levelProgress, skillSummary, updateItem } from "./mastery.ts";
import { MAX_SESSIONS, type Academy } from "./state.ts";

/**
 * Награды Академии.
 *
 * Принципы:
 *  - награда за обучение, а не вместо него: звезда — за верный ответ с первой
 *    попытки, монеты — за впервые пройденный урок и уровень;
 *  - ошибка ничего не отнимает: ни звёзд, ни монет, ни прогресса;
 *  - каждая разовая награда записывается в журнал (ledger) и второй раз не
 *    выдаётся, даже если полёт отправлен повторно (двойной клик, повтор
 *    синхронизации);
 *  - у звёзд есть дневной потолок, чтобы не «фармить» лёгкий урок ради
 *    счётчика. Сам урок повторять можно сколько угодно.
 */

export const DAILY_STAR_CAP = 60;
export const LESSON_PASS = 70;
export const COINS = { lesson: 10, level: 30, achievement: 5 } as const;

export type Result = { item: string; correct: boolean; hinted: boolean };

export type Achievement = { id: string; title: string; text: string; icon: string };

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: "first-flight", title: "Первый вылет", text: "Пройден первый полёт", icon: "🛫" },
  { id: "letters-10", title: "Знаток букв", text: "Усвоено 10 букв", icon: "🔤" },
  { id: "all-letters", title: "Весь алфавит", text: "Усвоены все буквы", icon: "🏅" },
  { id: "syllables-10", title: "Мастер слогов", text: "Усвоено 10 слогов", icon: "🧩" },
  { id: "first-word", title: "Первое слово", text: "Прочитано первое слово", icon: "📖" },
  { id: "words-20", title: "Читатель", text: "Усвоено 20 слов", icon: "📚" },
  { id: "first-story", title: "Первый рассказ", text: "Прочитан первый рассказ", icon: "📜" },
  { id: "detective", title: "Следопыт", text: "10 раз нашёл ответ в тексте", icon: "🔎" },
  { id: "streak-3", title: "Три дня в небе", text: "Занимался 3 дня подряд", icon: "🔥" },
  { id: "streak-7", title: "Неделя полётов", text: "Занимался 7 дней подряд", icon: "🌟" },
  { id: "flight-test", title: "Лётные испытания", text: "Пройден первый лётный тест", icon: "⏱️" },
  { id: "personal-best", title: "Личный рекорд", text: "Прочитал быстрее, чем раньше, и без потери точности", icon: "🚀" },
];

export type Aircraft = {
  id: string;
  name: string;
  /** Открывается по завершению уровня-аэропорта или за монеты. */
  unlock: { level: number } | { coins: number } | { start: true };
  color: string;
};

export const AIRCRAFT: readonly Aircraft[] = [
  { id: "kukuruznik", name: "Кукурузник", unlock: { start: true }, color: "#3a9d5d" },
  { id: "yak", name: "Як-52", unlock: { level: 1 }, color: "#d97b29" },
  { id: "an2", name: "Ан-2 «Пчёлка»", unlock: { level: 2 }, color: "#e2b417" },
  { id: "superjet", name: "Суперджет", unlock: { level: 3 }, color: "#2a6fb5" },
  { id: "il114", name: "Ил-114", unlock: { level: 4 }, color: "#7a4fb5" },
  { id: "ms21", name: "МС-21", unlock: { level: 5 }, color: "#0b8a8a" },
  { id: "il96", name: "Ил-96", unlock: { level: 6 }, color: "#b8323a" },
  { id: "balloon", name: "Воздушный шар", unlock: { coins: 40 }, color: "#e0567f" },
  { id: "heli", name: "Вертолёт Ми-8", unlock: { coins: 80 }, color: "#4c7a2b" },
  { id: "rocket", name: "Ракета", unlock: { coins: 150 }, color: "#5a6475" },
];

export function isAircraftOpen(academy: Academy, plane: Aircraft): boolean {
  if ("start" in plane.unlock) return true;
  if ("level" in plane.unlock) return levelProgress(academy, plane.unlock.level).complete;
  return academy.ledger.includes(`plane:${plane.id}`);
}

/** Покупка самолёта за монеты. Повторная покупка невозможна. */
export function buyAircraft(academy: Academy, id: string): Academy | null {
  const plane = AIRCRAFT.find((item) => item.id === id);
  if (!plane || !("coins" in plane.unlock)) return null;
  if (academy.ledger.includes(`plane:${id}`)) return null;
  if (academy.coins < plane.unlock.coins) return null;
  return {
    ...academy,
    coins: academy.coins - plane.unlock.coins,
    ledger: [...academy.ledger, `plane:${id}`],
    plane: id,
  };
}

/** Серия дней: вчера занимались — +1, пропуск — заново с 1. */
export function touchDay(academy: Academy, day: number): Academy {
  if (academy.lastDay === day) return academy;
  const streak = academy.lastDay === day - 1 ? academy.streak + 1 : 1;
  return { ...academy, lastDay: day, streak };
}

function grant(academy: Academy, key: string, coins: number): { next: Academy; granted: boolean } {
  if (academy.ledger.includes(key)) return { next: academy, granted: false };
  return { next: { ...academy, ledger: [...academy.ledger, key], coins: academy.coins + coins }, granted: true };
}

/** Проверяет достижения и выдаёт новые. Возвращает выданные. */
export function checkAchievements(academy: Academy): { next: Academy; unlocked: Achievement[] } {
  const letters = skillSummary(academy, "letters");
  const syllables = skillSummary(academy, "syllables");
  const words = skillSummary(academy, "words");
  const stories = skillSummary(academy, "stories");
  const conditions: Record<string, boolean> = {
    "first-flight": academy.sessions.length > 0,
    "letters-10": letters.mastered >= 10,
    "all-letters": SOUNDING.every((letter) => isMastered(academy.items[`L:${letter.char}`])),
    "syllables-10": syllables.mastered >= 10,
    "first-word": words.correct > 0,
    "words-20": words.mastered >= 20,
    "first-story": LESSONS.some((lesson) => lesson.level === 6 && academy.lessons[lesson.id]?.done),
    detective: stories.correct >= 10,
    "streak-3": academy.streak >= 3,
    "streak-7": academy.streak >= 7,
    "flight-test": academy.speed.length > 0,
  };
  let next = academy;
  const unlocked: Achievement[] = [];
  for (const achievement of ACHIEVEMENTS) {
    if (!conditions[achievement.id]) continue;
    const result = grant(next, `ach:${achievement.id}`, COINS.achievement);
    next = result.next;
    if (result.granted) unlocked.push(achievement);
  }
  return { next, unlocked };
}

export type SessionReport = {
  /** Полёт уже был засчитан раньше — ничего не изменилось. */
  duplicate: boolean;
  firstTry: number;
  total: number;
  score: number;
  stars: number;
  coins: number;
  lessonDone: boolean;
  /** Урок пройден впервые именно сейчас. */
  lessonFirstTime: boolean;
  levelDone: number | null;
  achievements: Achievement[];
  /** Звёзды не начислены из-за дневного потолка. */
  capped: boolean;
};

/**
 * Засчитывает завершённый полёт. Единственное место, где меняется
 * прогресс Академии после ответов, — поэтому проверка на повтор тут.
 */
export function finishSession(
  academy: Academy,
  input: { sessionId: string; lessonId: string | null; results: Result[]; day: number },
): { next: Academy; report: SessionReport } {
  const empty: SessionReport = {
    duplicate: true,
    firstTry: 0,
    total: 0,
    score: 0,
    stars: 0,
    coins: 0,
    lessonDone: false,
    lessonFirstTime: false,
    levelDone: null,
    achievements: [],
    capped: false,
  };
  if (academy.sessions.includes(input.sessionId) || input.results.length === 0) {
    return { next: academy, report: empty };
  }

  let next: Academy = touchDay(academy, input.day);
  const coinsBefore = next.coins;

  // Статистика по единицам.
  const items = { ...next.items };
  for (const result of input.results) {
    items[result.item] = updateItem(items[result.item], result, input.day);
  }
  next = { ...next, items };

  // Звёзды: за каждый верный ответ с первой попытки, с дневным потолком.
  const firstTry = input.results.filter((result) => result.correct).length;
  const total = input.results.length;
  const score = Math.round((firstTry / total) * 100);
  const practice = next.practice.day === input.day ? next.practice : { day: input.day, stars: 0 };
  const room = Math.max(0, DAILY_STAR_CAP - practice.stars);
  const stars = Math.min(firstTry, room);
  next = {
    ...next,
    stars: next.stars + stars,
    practice: { day: input.day, stars: practice.stars + stars },
    sessions: [...next.sessions, input.sessionId].slice(-MAX_SESSIONS),
  };

  // Урок.
  let lessonDone = false;
  let lessonFirstTime = false;
  let levelDone: number | null = null;
  const lesson = input.lessonId ? lessonById.get(input.lessonId) : undefined;
  if (lesson) {
    const before = next.lessons[lesson.id] ?? { done: false, best: 0, runs: 0 };
    lessonDone = before.done || score >= LESSON_PASS;
    next = {
      ...next,
      lessons: {
        ...next.lessons,
        [lesson.id]: { done: lessonDone, best: Math.max(before.best, score), runs: before.runs + 1 },
      },
    };
    if (lessonDone) {
      const result = grant(next, `lesson:${lesson.id}`, COINS.lesson);
      next = result.next;
      lessonFirstTime = result.granted;
    }
    const level = LEVELS.find((item) => item.id === lesson.level)!;
    if (levelProgress(next, level.id).complete) {
      const result = grant(next, `level:${level.id}`, COINS.level);
      next = result.next;
      if (result.granted) levelDone = level.id;
    }
  }

  const checked = checkAchievements(next);
  next = checked.next;

  return {
    next,
    report: {
      duplicate: false,
      firstTry,
      total,
      score,
      stars,
      coins: next.coins - coinsBefore,
      lessonDone,
      lessonFirstTime,
      levelDone,
      achievements: checked.unlocked,
      capped: stars < firstTry,
    },
  };
}

export const academyComplete = (academy: Academy): boolean =>
  completedLessons(academy) === LESSONS.length;
