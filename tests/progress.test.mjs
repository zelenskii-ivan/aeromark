import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAnswer,
  initialProgress,
  loadProgress,
  migrateProgress,
  parseExport,
  serializeExport,
  skillRows,
  touchStreak,
} from "../lib/progress.ts";

const task = (id, skill = "Счёт") => ({
  id,
  skill,
  prompt: "тест",
  options: ["1", "2"],
  answer: "2",
  hint: "подсказка",
});

test("сохранение старой версии дочитывается, а не роняет приложение", () => {
  // Ровно тот случай, что ломал прежнюю загрузку: полей gameWins/earned нет.
  const legacy = { stars: 4, completed: [1], attempts: {}, diagnosticDone: true };
  const migrated = migrateProgress(legacy);
  assert.equal(migrated.stars, 4);
  assert.deepEqual(migrated.completed, [1]);
  assert.deepEqual(migrated.gameWins, []);
  assert.deepEqual(migrated.mistakes, []);
  assert.equal(migrated.streak, 0);
});

test("мусор в хранилище превращается в чистый прогресс", () => {
  assert.deepEqual(loadProgress(() => "{не json"), initialProgress);
  assert.deepEqual(loadProgress(() => null), initialProgress);
});

test("запрет на доступ к хранилищу не роняет загрузку", () => {
  // Именно этот случай навсегда оставлял приложение на заставке: обращение
  // к localStorage бросает SecurityError в приватном режиме и в изолированном
  // iframe, и происходило это вне try/catch.
  const forbidden = () => {
    throw new DOMException("доступ запрещён", "SecurityError");
  };
  assert.deepEqual(loadProgress(forbidden), initialProgress);
});

test("поле неверного типа заменяется значением по умолчанию", () => {
  const migrated = migrateProgress({ stars: "много", mistakes: "d1" });
  assert.equal(migrated.stars, 0);
  assert.deepEqual(migrated.mistakes, []);
});

test("звезда выдаётся один раз за задачу", () => {
  const first = applyAnswer(initialProgress, task("d1"), true);
  assert.equal(first.starEarned, true);
  assert.equal(first.next.stars, 1);
  const second = applyAnswer(first.next, task("d1"), true);
  assert.equal(second.starEarned, false);
  assert.equal(second.next.stars, 1);
});

test("сгенерированные задачи звёзд не дают и в список ошибок не попадают", () => {
  const wrong = applyAnswer(initialProgress, task("gen:42"), false);
  assert.equal(wrong.starEarned, false);
  assert.deepEqual(wrong.next.mistakes, []);
  const right = applyAnswer(wrong.next, task("gen:42"), true);
  assert.equal(right.next.stars, 0);
  assert.equal(right.next.attempts["Счёт"].total, 2);
});

test("ошибка попадает в список и уходит после верного ответа", () => {
  const wrong = applyAnswer(initialProgress, task("m1a"), false);
  assert.deepEqual(wrong.next.mistakes, ["m1a"]);
  const again = applyAnswer(wrong.next, task("m1a"), false);
  assert.deepEqual(again.next.mistakes, ["m1a"], "дубликатов быть не должно");
  const fixed = applyAnswer(again.next, task("m1a"), true);
  assert.deepEqual(fixed.next.mistakes, []);
});

test("навыки сортируются от самого слабого", () => {
  let state = initialProgress;
  state = applyAnswer(state, task("a", "Счёт"), true).next;
  state = applyAnswer(state, task("b", "Слоги"), false).next;
  const rows = skillRows(state);
  assert.equal(rows[0].skill, "Слоги");
  assert.equal(rows[0].pct, 0);
  assert.equal(rows[1].pct, 100);
});

test("серия дней растёт только за соседние дни", () => {
  const day1 = touchStreak(initialProgress, "2026-09-01");
  assert.equal(day1.streak, 1);
  const day2 = touchStreak(day1, "2026-09-02");
  assert.equal(day2.streak, 2);
  const sameDay = touchStreak(day2, "2026-09-02");
  assert.equal(sameDay.streak, 2);
  const afterGap = touchStreak(day2, "2026-09-05");
  assert.equal(afterGap.streak, 1);
});

test("экспорт и импорт сохраняют прогресс", () => {
  const state = applyAnswer(initialProgress, task("d1"), true).next;
  const restored = parseExport(serializeExport(state));
  assert.equal(restored.stars, state.stars);
  assert.deepEqual(restored.earned, state.earned);
});

test("чужой файл прогресса отклоняется", () => {
  assert.throws(() => parseExport(JSON.stringify({ app: "другое", progress: {} })));
  assert.throws(() => parseExport("не json"));
});
