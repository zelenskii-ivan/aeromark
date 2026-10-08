import assert from "node:assert/strict";
import test from "node:test";
import { initialProgress, migrateProgress } from "../lib/progress.ts";
import { initialAcademy, migrateAcademy } from "../lib/academy/state.ts";
import {
  ALL_SYLLABLES,
  LESSONS,
  LEVELS,
  lessonById,
} from "../content/academy/curriculum.ts";
import { FORBIDDEN_SYLLABLES, LETTERS, SOUNDING } from "../content/academy/letters.ts";
import { WORDS, plainWord, wordParts } from "../content/academy/words.ts";
import { FLIGHT_TEXTS, SENTENCES, STORIES } from "../content/academy/texts.ts";
import {
  currentLesson,
  isDue,
  isMastered,
  isUnlocked,
  needsPractice,
  skillSummary,
  updateItem,
} from "../lib/academy/mastery.ts";
import { buildExercise, difficultyFor, planLesson, planPractice } from "../lib/academy/session.ts";
import {
  AIRCRAFT,
  DAILY_STAR_CAP,
  buyAircraft,
  finishSession,
  isAircraftOpen,
} from "../lib/academy/rewards.ts";
import { recordSpeedRun, sentencesOf, validateRun, wcpm, wpm } from "../lib/academy/speed.ts";
import { buildReport, letterGrid } from "../lib/academy/report.ts";

const DAY = 20_000;

// ---------- Содержание ----------

test("программа: шесть уровней по порядку, уроки с уникальными id", () => {
  assert.deepEqual(LEVELS.map((level) => level.id), [1, 2, 3, 4, 5, 6]);
  const ids = LESSONS.map((lesson) => lesson.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const lesson of LESSONS) {
    assert.ok(lesson.focus.length > 0, lesson.id);
    assert.ok(lesson.exercises.length > 0, lesson.id);
  }
});

test("буквы: все звучащие буквы входят в уровень 1, у каждой есть опорное слово", () => {
  const level1 = LEVELS[0].lessons.flatMap((lesson) => lesson.focus);
  for (const letter of SOUNDING) assert.ok(level1.includes(`L:${letter.char}`), letter.char);
  for (const letter of LETTERS) assert.ok(letter.anchor && letter.picture, letter.char);
  // Опорное слово согласной начинается с этой буквы.
  for (const letter of LETTERS.filter((l) => l.kind === "consonant")) {
    assert.equal(letter.anchor[0], letter.char.toLowerCase(), letter.char);
  }
});

test("слоги: в программе нет запрещённых сочетаний", () => {
  for (const syllable of ALL_SYLLABLES) assert.ok(!FORBIDDEN_SYLLABLES.has(syllable), syllable);
  assert.ok(ALL_SYLLABLES.includes("ма") && ALL_SYLLABLES.includes("ам"));
});

test("слова: слоги складываются в слово, картинки не повторяются", () => {
  const pictures = new Set();
  for (const word of WORDS) {
    assert.equal(wordParts(word).join(""), plainWord(word));
    assert.ok(!pictures.has(word.picture), `картинка ${word.picture} у двух слов`);
    pictures.add(word.picture);
  }
});

test("тексты: ответы есть среди вариантов, улики указывают на существующее предложение", () => {
  for (const sentence of SENTENCES) {
    if (sentence.kind !== "yesno") assert.ok(sentence.options.includes(sentence.answer), sentence.id);
  }
  for (const story of STORIES) {
    for (const q of story.questions) {
      assert.ok(q.options.includes(q.answer), story.id);
      assert.ok(q.evidence >= 0 && q.evidence < story.sentences.length, `${story.id}: ${q.question}`);
    }
  }
  for (const text of FLIGHT_TEXTS) {
    const parts = sentencesOf(text.text);
    for (const q of text.questions) {
      assert.ok(q.options.includes(q.answer), text.id);
      assert.ok(q.evidence < parts.length, `${text.id}: ${q.question}`);
    }
  }
});

// ---------- Модель усвоения ----------

test("коробки: верно без подсказки растёт, с подсказкой стоит, ошибка опускает на два", () => {
  let stat = updateItem(undefined, { correct: true, hinted: false }, DAY);
  assert.equal(stat[3], 1);
  stat = updateItem(stat, { correct: true, hinted: false }, DAY);
  stat = updateItem(stat, { correct: true, hinted: false }, DAY);
  assert.equal(stat[3], 3);
  assert.ok(isMastered(stat));
  const hinted = updateItem(stat, { correct: true, hinted: true }, DAY);
  assert.equal(hinted[3], 3);
  assert.equal(hinted[2], 1);
  const wrong = updateItem(stat, { correct: false, hinted: false }, DAY);
  assert.equal(wrong[3], 1);
  assert.equal(wrong[5], 0);
});

test("интервалы: усвоенное не повторяется каждый день", () => {
  const box3 = [5, 5, 0, 3, DAY, 3];
  assert.equal(isDue(box3, DAY + 1), false);
  assert.equal(isDue(box3, DAY + 4), true);
  assert.equal(isDue([1, 0, 0, 0, DAY, 0], DAY), true);
});

test("трудное: низкая точность после трёх попыток — требует практики", () => {
  assert.equal(needsPractice([2, 0, 0, 0, DAY, 0]), false, "двух попыток мало для вывода");
  assert.equal(needsPractice([4, 1, 0, 0, DAY, 0]), true);
  assert.equal(needsPractice([5, 5, 0, 4, DAY, 5]), false);
});

test("уроки открываются по порядку, пройденный можно открыть снова", () => {
  const first = LESSONS[0];
  const second = LESSONS[1];
  assert.ok(isUnlocked(initialAcademy, first));
  assert.equal(isUnlocked(initialAcademy, second), false);
  const done = { ...initialAcademy, lessons: { [first.id]: { done: true, best: 90, runs: 1 } } };
  assert.ok(isUnlocked(done, second));
  assert.ok(isUnlocked(done, first), "пройденный урок остаётся открытым");
  assert.equal(currentLesson(done).id, second.id);
});

// ---------- Сборка полёта ----------

test("план: длина урока, не больше двух раз одна единица, не подряд", () => {
  for (const lesson of LESSONS.filter((l) => l.level < 6)) {
    const plan = planLesson(initialAcademy, lesson, DAY, 7);
    assert.ok(plan.length > 0 && plan.length <= lesson.length, lesson.id);
    const counts = new Map();
    plan.forEach((step, i) => {
      counts.set(step.item, (counts.get(step.item) ?? 0) + 1);
      if (i > 0 && plan.length > lesson.focus.length) {
        assert.notEqual(step.item, plan[i - 1].item, `${lesson.id}: подряд ${step.item}`);
      }
    });
    for (const [item, count] of counts) assert.ok(count <= 2, `${lesson.id}: ${item} ×${count}`);
  }
});

test("план: в урок подмешивается повторение трудного", () => {
  const lesson = lessonById.get("l1-3");
  const academy = { ...initialAcademy, items: { "L:А": [5, 1, 0, 0, DAY, 0], "L:У": [5, 1, 0, 0, DAY, 0] } };
  const plan = planLesson(academy, lesson, DAY, 3);
  assert.ok(plan.some((step) => step.item === "L:А" || step.item === "L:У"));
});

test("свободный полёт для новичка не пуст", () => {
  const plan = planPractice(initialAcademy, DAY, 1);
  assert.equal(plan.length, 10);
});

test("каждое задание любого урока собирается: ответ среди вариантов, варианты без повторов", () => {
  for (const lesson of LESSONS) {
    for (const difficulty of [1, 2, 3]) {
      const plan = planLesson(initialAcademy, lesson, DAY, difficulty);
      plan.forEach((step, i) => {
        const ex = buildExercise(step, initialAcademy, difficulty, i + difficulty * 100);
        const where = `${lesson.id}/${ex.kind}/${step.item}`;
        switch (ex.kind) {
          case "hear-letter":
            assert.ok(ex.options.includes(ex.letter), where);
            assert.equal(new Set(ex.options).size, ex.options.length, where);
            assert.equal(ex.options.length, difficulty + 1, where);
            break;
          case "first-sound":
            assert.ok(ex.options.includes(ex.answer), where);
            assert.equal(new Set(ex.options).size, ex.options.length, where);
            break;
          case "letter-picture":
          case "word-picture": {
            const words = ex.options.map((o) => o.word);
            assert.ok(words.includes(ex.kind === "word-picture" ? ex.word : ex.answer), where);
            assert.equal(new Set(ex.options.map((o) => o.picture)).size, ex.options.length, where);
            break;
          }
          case "read-syllable":
          case "hear-syllable":
          case "merge":
            assert.ok(ex.options.includes(ex.syllable), where);
            assert.equal(new Set(ex.options).size, ex.options.length, where);
            for (const option of ex.options) assert.ok(!FORBIDDEN_SYLLABLES.has(option), `${where}: ${option}`);
            break;
          case "build-word":
            for (const part of ex.parts) assert.ok(ex.tiles.includes(part), where);
            break;
          case "same-different":
            assert.equal(ex.same, ex.a === ex.b, where);
            break;
          case "has-letter":
            assert.equal(ex.answer, ex.word.includes(ex.letter.toLowerCase()), where);
            break;
          default:
            break;
        }
      });
    }
  }
});

test("трудность: две ошибки подряд — проще, уверенный навык — сложнее", () => {
  assert.equal(difficultyFor(initialAcademy, "letters", [true, false, false]), 1);
  const strong = Object.fromEntries(SOUNDING.slice(0, 8).map((l) => [`L:${l.char}`, [6, 6, 0, 4, DAY, 6]]));
  const academy = { ...initialAcademy, items: strong };
  assert.equal(difficultyFor(academy, "letters", []), 3);
  assert.equal(difficultyFor(initialAcademy, "letters", [true, true, true, true]), 3);
});

// ---------- Награды ----------

const results = (n, correct) =>
  Array.from({ length: n }, (_, i) => ({ item: `L:${SOUNDING[i % 4].char}`, correct: i < correct, hinted: false }));

test("полёт засчитывается один раз: повтор той же отправки ничего не даёт", () => {
  const input = { sessionId: "s1", lessonId: "l1-1", results: results(8, 8), day: DAY };
  const first = finishSession(initialAcademy, input);
  assert.equal(first.report.stars, 8);
  assert.ok(first.report.lessonFirstTime);
  const again = finishSession(first.next, input);
  assert.ok(again.report.duplicate);
  assert.equal(again.next, first.next);
});

test("урок пройден от 70%, ошибки не отнимают звёзд и монет", () => {
  const low = finishSession(initialAcademy, { sessionId: "a", lessonId: "l1-1", results: results(10, 6), day: DAY });
  assert.equal(low.report.lessonDone, false);
  assert.equal(low.report.stars, 6);
  assert.equal(low.next.coins, 5, "только достижение «Первый вылет»");
  const pass = finishSession(low.next, { sessionId: "b", lessonId: "l1-1", results: results(10, 7), day: DAY });
  assert.ok(pass.report.lessonDone);
  assert.ok(pass.report.lessonFirstTime);
  const repeat = finishSession(pass.next, { sessionId: "c", lessonId: "l1-1", results: results(10, 10), day: DAY });
  assert.ok(repeat.report.lessonDone);
  assert.equal(repeat.report.lessonFirstTime, false, "монеты за урок — только первый раз");
  assert.equal(repeat.next.lessons["l1-1"].best, 100);
});

test("дневной потолок звёзд", () => {
  let academy = initialAcademy;
  let total = 0;
  for (let i = 0; i < 10; i += 1) {
    const out = finishSession(academy, { sessionId: `p${i}`, lessonId: null, results: results(10, 10), day: DAY });
    academy = out.next;
    total += out.report.stars;
  }
  assert.equal(total, DAILY_STAR_CAP);
  const tomorrow = finishSession(academy, { sessionId: "next", lessonId: null, results: results(10, 10), day: DAY + 1 });
  assert.equal(tomorrow.report.stars, 10);
});

test("уровень и самолёт: прохождение всех уроков уровня открывает самолёт один раз", () => {
  let academy = initialAcademy;
  let levelDone = null;
  for (const lesson of LEVELS[0].lessons) {
    const out = finishSession(academy, { sessionId: lesson.id, lessonId: lesson.id, results: results(8, 8), day: DAY });
    academy = out.next;
    levelDone = out.report.levelDone ?? levelDone;
  }
  assert.equal(levelDone, 1);
  assert.ok(isAircraftOpen(academy, AIRCRAFT.find((p) => p.id === "yak")));
  assert.equal(academy.ledger.filter((key) => key === "level:1").length, 1);
});

test("самолёт за монеты: не хватает — нельзя, купленный второй раз не купить", () => {
  assert.equal(buyAircraft({ ...initialAcademy, coins: 10 }, "balloon"), null);
  const bought = buyAircraft({ ...initialAcademy, coins: 50 }, "balloon");
  assert.equal(bought.coins, 10);
  assert.equal(bought.plane, "balloon");
  assert.equal(buyAircraft({ ...bought, coins: 500 }, "balloon"), null);
});

test("достижения выдаются один раз", () => {
  const a = finishSession(initialAcademy, { sessionId: "x", lessonId: null, results: results(4, 4), day: DAY });
  assert.ok(a.report.achievements.some((item) => item.id === "first-flight"));
  const b = finishSession(a.next, { sessionId: "y", lessonId: null, results: results(4, 4), day: DAY });
  assert.ok(!b.report.achievements.some((item) => item.id === "first-flight"));
});

test("серия дней", () => {
  let academy = finishSession(initialAcademy, { sessionId: "d1", lessonId: null, results: results(2, 2), day: DAY }).next;
  academy = finishSession(academy, { sessionId: "d2", lessonId: null, results: results(2, 2), day: DAY + 1 }).next;
  academy = finishSession(academy, { sessionId: "d3", lessonId: null, results: results(2, 2), day: DAY + 2 }).next;
  assert.equal(academy.streak, 3);
  assert.ok(academy.ledger.includes("ach:streak-3"));
  academy = finishSession(academy, { sessionId: "d5", lessonId: null, results: results(2, 2), day: DAY + 5 }).next;
  assert.equal(academy.streak, 1);
});

// ---------- Скорость ----------

test("скорость: слов в минуту и верных слов в минуту", () => {
  const run = { date: "2026-10-08", textId: "ft-fox", seconds: 60, words: 12, errors: 2, comprehension: [2, 2] };
  assert.equal(wpm(run), 12);
  assert.equal(wcpm(run), 10);
  assert.equal(validateRun(run), null);
  assert.ok(validateRun({ ...run, seconds: 2 }));
  assert.ok(validateRun({ ...run, errors: 20 }));
  assert.ok(validateRun({ ...run, words: 0 }));
  assert.ok(validateRun({ ...run, seconds: 5, words: 30 }), "360 слов в минуту — это ошибка замера");
});

test("рекорд скорости — только без потери точности", () => {
  const base = { date: "2026-10-01", textId: "ft-fox", seconds: 60, words: 10, errors: 0, comprehension: [2, 2] };
  const first = recordSpeedRun(initialAcademy, base);
  assert.equal(first.record, false, "первый замер — точка отсчёта, а не рекорд");
  const sloppy = recordSpeedRun(first.next, { ...base, date: "2026-10-08", words: 20, errors: 8 });
  assert.equal(sloppy.record, false, "быстрее, но с ошибками — не рекорд");
  const better = recordSpeedRun(first.next, { ...base, date: "2026-10-08", words: 14, errors: 0 });
  assert.equal(better.record, true);
  assert.ok(better.next.ledger.includes("ach:personal-best"));
});

// ---------- Сохранение и отчёт ----------

test("старое сохранение без Академии дочитывается, испорченная запись не стирает остальные", () => {
  const migrated = migrateProgress({ stars: 4, completed: [1] });
  assert.equal(migrated.academy.stars, 0);
  assert.deepEqual(migrated.academy.items, {});
  const academy = migrateAcademy({ items: { "L:А": [1, 1, 0, 1, 1, 1], "L:Б": "мусор" }, stars: 3 });
  assert.deepEqual(Object.keys(academy.items), ["L:А"]);
  assert.equal(academy.stars, 3);
  assert.deepEqual(migrateAcademy(null), initialAcademy);
  assert.ok(initialProgress.academy);
});

test("размер сохранения укладывается в лимит сервера при полной программе", () => {
  const items = {};
  for (const lesson of LESSONS) for (const key of lesson.focus) items[key] = [99, 80, 10, 5, DAY, 9];
  const academy = { ...initialAcademy, items, ledger: Array.from({ length: 200 }, (_, i) => `x:${i}`) };
  const size = JSON.stringify({ ...initialProgress, academy }).length;
  assert.ok(size < 100_000, `сохранение ${size} байт`);
});

test("отчёт родителю: сетка букв и рекомендации", () => {
  const academy = {
    ...initialAcademy,
    items: { "L:М": [6, 6, 0, 4, DAY, 6], "L:Б": [5, 1, 2, 0, DAY, 0] },
  };
  const grid = letterGrid(academy);
  assert.equal(grid.find((c) => c.char === "М").status, "mastered");
  assert.equal(grid.find((c) => c.char === "Б").status, "practice");
  assert.equal(grid.find((c) => c.char === "Ж").status, "new");
  const report = buildReport(academy, "2026-10-08");
  assert.ok(report.practice.includes("буква Б"));
  assert.ok(report.recommendations.some((r) => r.title === "Повторить трудное"));
  assert.ok(report.recommendations.some((r) => r.title === "Лётный тест"));
  assert.equal(skillSummary(academy, "letters").mastered, 1);
});
