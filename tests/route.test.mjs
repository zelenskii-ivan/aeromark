import assert from "node:assert/strict";
import test from "node:test";
import { initialProgress, migrateProgress } from "../lib/progress.ts";
import {
  activeCoupons,
  balance,
  bestWords,
  buyPrize,
  cancelCoupon,
  completeStation,
  currentStation,
  isReturnTrip,
  makeCouponCode,
  minuteTextFor,
  pickForDay,
  recordReadingCheck,
  redeemCoupon,
  splitSyllables,
  stationStatus,
  storyFor,
} from "../lib/route.ts";
import {
  CHECK_STARS,
  ENDING_ITEMS,
  LAP_STARS,
  PRIZES,
  RECORD_STARS,
  STATION_STARS,
  STATIONS,
  STORIES,
} from "../content/route.ts";

const ids = STATIONS.map((station) => station.id);

test("старое сохранение без полей маршрута дочитывается", () => {
  const migrated = migrateProgress({ stars: 12, completed: [1] });
  assert.equal(migrated.routeLap, 0);
  assert.deepEqual(migrated.routeDone, []);
  assert.deepEqual(migrated.coupons, []);
  assert.equal(migrated.spent, 0);
  assert.equal(balance(migrated), 12);
});

test("маршрут идёт по порядку, а на обратном круге — в обратную сторону", () => {
  let saved = initialProgress;
  assert.equal(currentStation(saved).id, "parking");
  assert.equal(stationStatus(saved, "school"), "locked");
  for (const id of ids) saved = completeStation(saved, id, "2026-10-07").next;
  assert.equal(saved.routeLap, 1);
  assert.ok(isReturnTrip(saved));
  assert.deepEqual(saved.routeDone, []);
  assert.equal(currentStation(saved).id, "skver");
});

test("за остановку звёзды раз в день, за круг — бонус", () => {
  let saved = initialProgress;
  const first = completeStation(saved, "parking", "2026-10-07");
  assert.equal(first.starsEarned, STATION_STARS);
  const again = completeStation(first.next, "parking", "2026-10-07");
  assert.equal(again.starsEarned, 0);
  const tomorrow = completeStation(again.next, "parking", "2026-10-08");
  assert.equal(tomorrow.starsEarned, STATION_STARS);

  saved = initialProgress;
  let total = 0;
  for (const id of ids) {
    const outcome = completeStation(saved, id, "2026-10-07");
    saved = outcome.next;
    total += outcome.starsEarned;
  }
  assert.equal(total, ids.length * STATION_STARS + LAP_STARS);
  assert.equal(saved.stars, total);
});

test("неизвестная остановка ничего не меняет", () => {
  const outcome = completeStation(initialProgress, "nowhere");
  assert.equal(outcome.next, initialProgress);
});

test("минута чтения: звёзды раз в день, рекорд считается от прошлых замеров и школы", () => {
  const first = recordReadingCheck(initialProgress, { words: 11, errors: 2 }, "2026-10-09", 8);
  assert.ok(first.record);
  assert.equal(first.starsEarned, CHECK_STARS + RECORD_STARS);
  // Перемер в тот же день заменяет результат, но звёзд больше не даёт.
  const redo = recordReadingCheck(first.next, { words: 12, errors: 1 }, "2026-10-09", 8);
  assert.equal(redo.starsEarned, 0);
  assert.equal(redo.next.readingChecks.length, 1);
  assert.equal(redo.next.readingChecks[0].words, 12);
  const slower = recordReadingCheck(redo.next, { words: 10, errors: 3 }, "2026-10-16", 8);
  assert.equal(slower.record, false);
  assert.equal(slower.starsEarned, CHECK_STARS);
  assert.equal(bestWords(slower.next, 8), 12);
  const belowSchool = recordReadingCheck(initialProgress, { words: 7, errors: 0 }, "2026-10-09", 8);
  assert.equal(belowSchool.record, false);
});

test("приз нельзя купить без звёзд; покупка списывает, отмена возвращает", () => {
  const cocoa = PRIZES.find((prize) => prize.id === "cocoa");
  assert.equal(buyPrize({ ...initialProgress, stars: 5 }, cocoa), null);
  const bought = buyPrize({ ...initialProgress, stars: 20 }, cocoa, {
    code: "4827",
    now: new Date("2026-10-07T15:00:00Z"),
  });
  assert.ok(bought);
  assert.equal(balance(bought.next), 5);
  assert.equal(bought.next.stars, 20, "заработанные звёзды не уменьшаются");
  assert.equal(bought.coupon.code, "4827");
  const cancelled = cancelCoupon(bought.next, bought.coupon.id);
  assert.equal(balance(cancelled), 20);
  assert.deepEqual(cancelled.coupons, []);
});

test("выданный купон нельзя отменить и выдать второй раз", () => {
  const cocoa = PRIZES.find((prize) => prize.id === "cocoa");
  const bought = buyPrize({ ...initialProgress, stars: 20 }, cocoa, { code: "1111" });
  const redeemed = redeemCoupon(bought.next, bought.coupon.id, new Date("2026-10-08T08:00:00Z"));
  assert.equal(activeCoupons(redeemed).length, 0);
  const stamp = redeemed.coupons[0].redeemedAt;
  const twice = redeemCoupon(redeemed, bought.coupon.id, new Date("2026-10-09T08:00:00Z"));
  assert.equal(twice.coupons[0].redeemedAt, stamp);
  assert.equal(cancelCoupon(redeemed, bought.coupon.id), redeemed);
});

test("код купона четырёхзначный и не совпадает с невыданными", () => {
  const cocoa = PRIZES.find((prize) => prize.id === "cocoa");
  const bought = buyPrize({ ...initialProgress, stars: 50 }, cocoa, { code: "5000" });
  let calls = 0;
  // Первая попытка выдаёт занятый код 5000, вторая — свободный.
  const code = makeCouponCode(bought.next, () => (calls++ === 0 ? 4000 / 9000 : 0.1));
  assert.match(code, /^\d{4}$/);
  assert.notEqual(code, "5000");
});

test("рассказ один на круг, тексты минуты меняются по неделям", () => {
  assert.equal(storyFor(initialProgress).id, STORIES[0].id);
  assert.equal(storyFor({ ...initialProgress, routeLap: 1 }).id, STORIES[1].id);
  assert.equal(minuteTextFor("2026-10-05"), minuteTextFor("2026-10-11"));
  assert.notEqual(minuteTextFor("2026-10-05"), minuteTextFor("2026-10-12"));
});

test("выборка на день стабильна и без повторов", () => {
  const a = pickForDay(ENDING_ITEMS, 5, "2026-10-07");
  const b = pickForDay(ENDING_ITEMS, 5, "2026-10-07");
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, 5);
});

test("содержание: у каждого вопроса ответ есть среди вариантов, слоги размечены", () => {
  for (const item of ENDING_ITEMS) assert.ok(item.options.includes(item.answer), item.text);
  for (const story of STORIES) {
    assert.ok(story.options.includes(story.answer), story.id);
    const words = splitSyllables(story.text);
    assert.ok(words.some((word) => word.length > 1), story.id);
    assert.ok(words.every((word) => word.every((part) => part.length > 0)), story.id);
  }
});

import {
  formatSeconds,
  minSeconds,
  recordTimedRun,
  storyTimedTarget,
  tableTimedTarget,
  timedHistory,
} from "../lib/route.ts";
import { TIMED_RECORD_STARS, TIMED_STARS } from "../content/route.ts";

test("чтение на время: первый заход ставит рекорд, но бонус только за побитый", () => {
  const target = storyTimedTarget(STORIES[0]);
  const first = recordTimedRun(initialProgress, target, 46.27, "2026-10-08");
  assert.equal(first.tooFast, false);
  assert.equal(first.record, false);
  assert.equal(first.starsEarned, TIMED_STARS);
  assert.equal(first.next.timedBest[target.key], 46.3);
  // Тот же день: рекорд обновляется, звёзд больше нет.
  const sameDay = recordTimedRun(first.next, target, 40, "2026-10-08");
  assert.equal(sameDay.record, true);
  assert.equal(sameDay.starsEarned, 0);
  assert.equal(sameDay.next.timedBest[target.key], 40);
  // Новый день, быстрее больше чем на секунду — звёзды и бонус.
  const tomorrow = recordTimedRun(sameDay.next, target, 35.5, "2026-10-09");
  assert.equal(tomorrow.record, true);
  assert.equal(tomorrow.starsEarned, TIMED_STARS + TIMED_RECORD_STARS);
  assert.equal(tomorrow.previousBest, 40);
  // Медленнее рекорда — звёзды за чтение есть, рекорд прежний.
  const slower = recordTimedRun(tomorrow.next, target, 50, "2026-10-10");
  assert.equal(slower.record, false);
  assert.equal(slower.starsEarned, TIMED_STARS);
  assert.equal(slower.next.timedBest[target.key], 35.5);
  assert.equal(timedHistory(slower.next, target.key).length, 4);
});

test("чтение на время: на десятые доли рекорд не «дожимается»", () => {
  const target = storyTimedTarget(STORIES[0]);
  const first = recordTimedRun(initialProgress, target, 40, "2026-10-08").next;
  const almost = recordTimedRun(first, target, 39.4, "2026-10-09");
  assert.equal(almost.record, false);
  assert.equal(almost.starsEarned, TIMED_STARS);
  assert.equal(almost.next.timedBest[target.key], 39.4, "лучшее время всё равно сохраняется");
});

test("чтение на время: слишком быстро — не засчитывается", () => {
  const target = tableTimedTarget(12);
  assert.equal(minSeconds(target), 6);
  const fast = recordTimedRun(initialProgress, target, 2, "2026-10-08");
  assert.ok(fast.tooFast);
  assert.equal(fast.starsEarned, 0);
  assert.equal(fast.next, initialProgress);
});

test("формат секундомера", () => {
  assert.equal(formatSeconds(65.34), "1:05,3");
  assert.equal(formatSeconds(9.99, false), "0:09");
});

test("старое сохранение без секундомера дочитывается", () => {
  const migrated = migrateProgress({ stars: 3 });
  assert.deepEqual(migrated.timedBest, {});
  assert.deepEqual(migrated.timedRuns, []);
});
