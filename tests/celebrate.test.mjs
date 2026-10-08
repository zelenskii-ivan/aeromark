import assert from "node:assert/strict";
import test from "node:test";
import {
  isSoundOn,
  makeParticles,
  playMiss,
  playWin,
  setSoundOn,
  SOUND_KEY,
} from "../lib/celebrate.ts";

/** Простое хранилище вместо localStorage: в тестах окна нет. */
function fakeStore() {
  const data = new Map();
  return {
    read: (key) => data.get(key) ?? null,
    write: (key, value) => void data.set(key, value),
    data,
  };
}

test("звук включён, пока родитель не выключил его явно", () => {
  const store = fakeStore();
  assert.equal(isSoundOn(store.read), true, "по умолчанию должен звучать");
  setSoundOn(false, store.write);
  assert.equal(isSoundOn(store.read), false);
  setSoundOn(true, store.write);
  assert.equal(isSoundOn(store.read), true);
  assert.equal(store.data.get(SOUND_KEY), "on");
});

test("любое непонятное значение считается включённым звуком", () => {
  // Выключение — это осознанное действие; мусор в хранилище не должен
  // молча лишать ребёнка отклика.
  assert.equal(isSoundOn(() => null), true);
  assert.equal(isSoundOn(() => ""), true);
  assert.equal(isSoundOn(() => "off"), false);
});

/** Предсказуемый «случайный» ряд, чтобы раскладка проверялась, а не угадывалась. */
const seeded = (start = 0.123) => {
  let value = start;
  return () => {
    value = (value * 9301 + 49297) % 233280 / 233280;
    return value;
  };
};

test("салют не улетает за края карточки", () => {
  for (const seed of [0.01, 0.4, 0.77, 0.99]) {
    for (const item of makeParticles(14, seeded(seed))) {
      assert.ok(item.left >= 4 && item.left <= 96, `шар на ${item.left}%`);
      assert.ok(item.duration > 0.9 && item.duration < 2.4, `длительность ${item.duration}`);
      assert.ok(Math.abs(item.drift) <= 35, `снос ${item.drift}`);
      assert.ok(item.delay >= 0 && item.delay < 0.4, `задержка ${item.delay}`);
    }
  }
});

test("шары распределены по ширине, а не сбиты в кучу", () => {
  // Случайное `left` для каждого элемента оставляло половину карточки пустой;
  // поэтому позиции идут полосами с небольшим разбросом.
  const items = makeParticles(14, seeded());
  const left = items.filter((item) => item.left < 50).length;
  assert.ok(left >= 5 && left <= 9, `слева ${left} из ${items.length}`);
  const sorted = [...items].sort((a, b) => a.left - b.left);
  for (let i = 1; i < sorted.length; i += 1) {
    assert.ok(sorted[i].left - sorted[i - 1].left > 0.5, "две частицы слиплись");
  }
});

test("в салюте есть и шары, и конфетти", () => {
  const items = makeParticles(14, seeded());
  const balloons = items.filter((item) => item.balloon).length;
  assert.ok(balloons > 0 && balloons < items.length, `шаров ${balloons}`);
});

test("звук не падает там, где нет Web Audio", () => {
  // Тесты идут в Node, окна нет вовсе. Приложение обязано пережить и это:
  // отклик — украшение, ронять из-за него занятие нельзя.
  assert.doesNotThrow(() => playWin());
  assert.doesNotThrow(() => playMiss());
});
