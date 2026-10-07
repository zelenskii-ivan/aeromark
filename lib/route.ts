import {
  CHECK_STARS,
  LAP_STARS,
  MINUTE_TEXTS,
  RECORD_STARS,
  STATION_STARS,
  STATIONS,
  STORIES,
  type Prize,
  type Station,
  type Story,
} from "../content/route.ts";
import { today, type Saved } from "./progress.ts";

/**
 * Логика раздела «Путь к Перспективе». Чистые функции над Saved — как
 * applyAnswer в progress.ts, — чтобы их можно было проверить тестами.
 *
 * Звёзды здесь две разные величины. `stars` — сколько заработано за всё
 * время (это достижение, оно не уменьшается). `spent` — сколько потрачено на
 * призы. Тратить можно только разницу.
 */

export type Coupon = Saved["coupons"][number];
export type ReadingCheck = Saved["readingChecks"][number];
export type StationStatus = "done" | "current" | "locked";

/** Звёзды, которые можно потратить. */
export const balance = (saved: Saved): number =>
  Math.max(0, saved.stars - saved.spent);

/**
 * Порядок остановок на текущем круге. Чётный круг — от парковки к скверу,
 * нечётный — обратно: из сквера к школе и к машине.
 */
export function routeOrder(saved: Saved): Station[] {
  const forward = [...STATIONS];
  return saved.routeLap % 2 === 0 ? forward : forward.reverse();
}

export const isReturnTrip = (saved: Saved): boolean => saved.routeLap % 2 === 1;

export function currentStation(saved: Saved): Station {
  const order = routeOrder(saved);
  return order.find((station) => !saved.routeDone.includes(station.id)) ?? order[0] ?? STATIONS[0]!;
}

export function stationStatus(saved: Saved, id: string): StationStatus {
  if (saved.routeDone.includes(id)) return "done";
  return currentStation(saved).id === id ? "current" : "locked";
}

/** Рассказ для сквера: один на весь круг, чтобы читать его несколько дней. */
export const storyFor = (saved: Saved): Story =>
  STORIES[saved.routeLap % STORIES.length] ?? STORIES[0]!;

export type StationOutcome = {
  next: Saved;
  starsEarned: number;
  lapDone: boolean;
};

/**
 * Отмечает остановку пройденной. Звёзды за остановку — раз в день, иначе
 * ребёнок будет прокликивать лёгкую остановку ради приза. Пройти её повторно
 * можно всегда: повторение здесь и есть тренировка.
 */
export function completeStation(
  saved: Saved,
  id: string,
  date = today(),
): StationOutcome {
  if (!STATIONS.some((station) => station.id === id)) {
    return { next: saved, starsEarned: 0, lapDone: false };
  }
  const rewardedToday = saved.routeRewarded[id] === date;
  let starsEarned = rewardedToday ? 0 : STATION_STARS;
  const done = saved.routeDone.includes(id) ? saved.routeDone : [...saved.routeDone, id];
  const lapDone = STATIONS.every((station) => done.includes(station.id));
  if (lapDone) starsEarned += LAP_STARS;
  return {
    starsEarned,
    lapDone,
    next: {
      ...saved,
      stars: saved.stars + starsEarned,
      routeRewarded: rewardedToday
        ? saved.routeRewarded
        : { ...saved.routeRewarded, [id]: date },
      routeDone: lapDone ? [] : done,
      routeLap: lapDone ? saved.routeLap + 1 : saved.routeLap,
    },
  };
}

/** Лучший результат минуты чтения, включая школьный замер. */
export function bestWords(saved: Saved, baseline = 0): number {
  return saved.readingChecks.reduce((best, check) => Math.max(best, check.words), baseline);
}

export type CheckOutcome = {
  next: Saved;
  starsEarned: number;
  record: boolean;
};

/**
 * Записывает минуту чтения. Повторный замер в тот же день заменяет прежний —
 * родитель мог ошибиться, — но звёзды за день даются один раз. Рекорд
 * считается от лучшего прошлого результата, а не от сегодняшнего.
 */
export function recordReadingCheck(
  saved: Saved,
  result: { words: number; errors: number },
  date = today(),
  baseline = 0,
): CheckOutcome {
  const words = Math.max(0, Math.round(result.words));
  const errors = Math.max(0, Math.round(result.errors));
  const earlier = saved.readingChecks.filter((check) => check.date !== date);
  const sameDay = earlier.length !== saved.readingChecks.length;
  const previousBest = earlier.reduce((best, check) => Math.max(best, check.words), baseline);
  const record = words > previousBest;
  const alreadyPaid = sameDay;
  const starsEarned = alreadyPaid ? 0 : CHECK_STARS + (record ? RECORD_STARS : 0);
  const readingChecks = [...earlier, { date, words, errors }].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  return {
    record,
    starsEarned,
    next: { ...saved, readingChecks, stars: saved.stars + starsEarned },
  };
}

/** Текст минуты чтения меняется раз в неделю (по номеру недели от эпохи). */
export function minuteTextFor(date = today()): string {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  const week = Math.floor((day + 3) / 7);
  const count = MINUTE_TEXTS.length;
  return MINUTE_TEXTS[((week % count) + count) % count] ?? MINUTE_TEXTS[0]!;
}

/** Четырёхзначный код, которого нет среди невыданных купонов. */
export function makeCouponCode(
  saved: Saved,
  random: () => number = Math.random,
): string {
  const taken = new Set(
    saved.coupons.filter((coupon) => !coupon.redeemedAt).map((coupon) => coupon.code),
  );
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const code = String(1000 + Math.floor(random() * 9000));
    if (!taken.has(code)) return code;
  }
  return String(Date.now()).slice(-4);
}

/** Покупка приза. null — если звёзд не хватает. */
export function buyPrize(
  saved: Saved,
  prize: Prize,
  options: { code?: string; now?: Date; random?: () => number } = {},
): { next: Saved; coupon: Coupon } | null {
  if (prize.price > balance(saved)) return null;
  const now = options.now ?? new Date();
  const coupon: Coupon = {
    id: `${prize.id}-${now.getTime()}`,
    prizeId: prize.id,
    title: prize.title,
    price: prize.price,
    code: options.code ?? makeCouponCode(saved, options.random),
    createdAt: now.toISOString(),
    redeemedAt: null,
  };
  return {
    coupon,
    next: {
      ...saved,
      spent: saved.spent + prize.price,
      coupons: [...saved.coupons, coupon],
    },
  };
}

/** Взрослый отметил, что приз выдан. Код после этого не работает. */
export function redeemCoupon(saved: Saved, couponId: string, now = new Date()): Saved {
  return {
    ...saved,
    coupons: saved.coupons.map((coupon) =>
      coupon.id === couponId && !coupon.redeemedAt
        ? { ...coupon, redeemedAt: now.toISOString() }
        : coupon,
    ),
  };
}

/**
 * Взрослый отменил невыданный купон (ребёнок передумал) — звёзды
 * возвращаются. Выданный купон отменить нельзя.
 */
export function cancelCoupon(saved: Saved, couponId: string): Saved {
  const coupon = saved.coupons.find((item) => item.id === couponId);
  if (!coupon || coupon.redeemedAt) return saved;
  return {
    ...saved,
    spent: Math.max(0, saved.spent - coupon.price),
    coupons: saved.coupons.filter((item) => item.id !== couponId),
  };
}

export const activeCoupons = (saved: Saved): Coupon[] =>
  saved.coupons.filter((coupon) => !coupon.redeemedAt);

/** Детерминированная выборка: одна и та же в течение дня, разная по дням. */
export function pickForDay<T>(items: readonly T[], count: number, seed: string): T[] {
  let state = 0;
  for (const char of seed) state = (state * 31 + char.charCodeAt(0)) >>> 0;
  const next = () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, Math.min(count, pool.length));
}

/** Разбивает текст со слогами через дефис на слова и слоги. */
export function splitSyllables(text: string): string[][] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.split("-").filter(Boolean));
}
