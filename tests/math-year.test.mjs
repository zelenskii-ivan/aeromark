import assert from "node:assert/strict";
import test from "node:test";
import { MATH_YEAR, mathYearLessons } from "../content/math-year/plan.ts";
import { bondLesson } from "../content/math-year/generators.ts";
import { bondIsConsistent, expectedAnswer } from "../content/lesson.ts";
import { lessonById } from "../content/lessons/index.ts";
import {
  earnedAircraft,
  nextTopic,
  quarterJustCompleted,
  quarterOfLesson,
  quarterProgress,
  topicStatus,
} from "../lib/math-year.ts";
import { prepareSpeech } from "../lib/speech.ts";

const ids = (quarter) => quarter.topics.flatMap((t) => (t.lesson ? [t.lesson.id] : []));

test("в году четыре четверти, у тем уникальные id, каждый урок находится", () => {
  assert.deepEqual(MATH_YEAR.map((q) => q.number), [1, 2, 3, 4]);
  const topicIds = MATH_YEAR.flatMap((q) => q.topics.map((t) => t.id));
  assert.equal(new Set(topicIds).size, topicIds.length);
  for (const lesson of mathYearLessons) assert.equal(lessonById(lesson.id), lesson);
  assert.ok(mathYearLessons.length >= 11, "готовых уроков меньше одиннадцати");
});

test("состав числа: пары во всех домиках и ответах дают это число", () => {
  for (let total = 2; total <= 9; total++) {
    const lesson = bondLesson(total);
    for (const step of lesson.steps) {
      if (step.kind === "bond") {
        assert.equal(step.whole, total, `${step.id}: целое не ${total}`);
        assert.ok(bondIsConsistent(step), step.id);
      }
      if (step.kind === "match") {
        for (const [left, right] of step.pairs) assert.equal(Number(left) + Number(right), total, step.id);
      }
      if (step.kind === "ask" && step.phase === "practice") {
        const [, part] = step.task.prompt.match(/это (\d+) и/) ?? [];
        assert.equal(Number(part) + Number(expectedAnswer(step)), total, step.id);
      }
    }
  }
  assert.throws(() => bondLesson(10));
  assert.throws(() => bondLesson(1));
});

test("в практике состава — части, которых не было в уроке раньше, если они есть", () => {
  const lesson = bondLesson(9);
  const practice = lesson.steps.filter((s) => s.phase === "practice").map((s) => s.task.prompt);
  assert.equal(practice.length, 2);
  for (const prompt of practice) assert.doesNotMatch(prompt, /это (1|2|7|8) и/);
});

test("следующая тема — первая непройденная, «готовится» пропускается", () => {
  assert.equal(nextTopic([])?.id, "y-compare");
  assert.equal(nextTopic(["math-compare"])?.id, "y-neighbors");
  const all = mathYearLessons.map((l) => l.id);
  assert.equal(nextTopic(all), null);
});

test("статусы тем", () => {
  const [props, , , compare, neighbors] = MATH_YEAR[0].topics;
  assert.equal(topicStatus(props, [], "y-compare"), "soon");
  assert.equal(topicStatus(compare, [], "y-compare"), "next");
  assert.equal(topicStatus(neighbors, [], "y-compare"), "open");
  assert.equal(topicStatus(compare, ["math-compare"], "y-neighbors"), "done");
});

test("четверть закрывается, когда пройдены все её готовые уроки", () => {
  const q1 = MATH_YEAR[0];
  const allButLast = ids(q1).slice(0, -1);
  assert.equal(quarterProgress(q1, allButLast).complete, false);
  assert.equal(quarterProgress(q1, ids(q1)).complete, true);
  assert.equal(quarterJustCompleted(allButLast, ids(q1))?.id, "q1");
  // Повторное прохождение не даёт второго праздника.
  assert.equal(quarterJustCompleted(ids(q1), ids(q1)), null);
  assert.deepEqual(earnedAircraft(ids(q1)).map((q) => q.id), ["q1"]);
});

test("четверть без готовых уроков не считается пройденной", () => {
  const q4 = MATH_YEAR[3];
  assert.equal(quarterProgress(q4, []).ready, 0);
  assert.equal(quarterProgress(q4, []).complete, false);
});

test("«Десять заклёпок» относится ко второй четверти", () => {
  assert.equal(quarterOfLesson("math-bond-10")?.id, "q2");
});

test("знаки сравнения произносятся словами", () => {
  assert.equal(prepareSpeech("Лиза записала: 2 > 5."), "Лиза записала, 2 больше 5.");
  assert.equal(prepareSpeech("3 < 8"), "3 меньше 8");
});
