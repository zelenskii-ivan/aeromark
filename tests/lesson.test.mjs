import assert from "node:assert/strict";
import test from "node:test";
import {
  bondIsConsistent,
  expectedAnswer,
  isInteractive,
  PHASE_ORDER,
  SUBJECTS,
  stepSkill,
} from "../content/lesson.ts";
import { lessons, lessonById, lessonsBySubject } from "../content/lessons/index.ts";
import { isCorrect, SKILLS } from "../content/types.ts";
import { speechForTask, splitByScript } from "../lib/speech.ts";

const allSteps = lessons.flatMap((lesson) =>
  lesson.steps.map((step) => ({ lesson, step })),
);

test("каждый предмет закрыт хотя бы одним уроком", () => {
  for (const subject of SUBJECTS) {
    assert.ok(
      lessonsBySubject(subject).length > 0,
      `нет ни одного урока по предмету «${subject}»`,
    );
  }
});

test("у уроков и шагов уникальные идентификаторы", () => {
  const lessonIds = lessons.map((lesson) => lesson.id);
  assert.equal(new Set(lessonIds).size, lessonIds.length);
  const stepIds = allSteps.map(({ step }) => step.id);
  assert.equal(new Set(stepIds).size, stepIds.length);
  for (const id of lessonIds) assert.ok(lessonById(id));
});

test("фазы идут по порядку и не перескакивают назад", () => {
  // Порядок фаз — это и есть методика: правило не может стоять раньше пробного
  // действия, отработка — раньше правила.
  for (const lesson of lessons) {
    let previous = -1;
    for (const step of lesson.steps) {
      const position = PHASE_ORDER.indexOf(step.phase);
      assert.ok(position >= 0, `${step.id}: неизвестная фаза ${step.phase}`);
      assert.ok(
        position >= previous,
        `${lesson.id}: шаг ${step.id} (${step.phase}) стоит после более поздней фазы`,
      );
      previous = position;
    }
  }
});

test("в каждом уроке есть обязательные фазы", () => {
  // Без пробного действия ребёнок не упрётся в задачу; без правила ему нечего
  // будет вспомнить; без переноса не проверить понимание.
  for (const lesson of lessons) {
    const phases = new Set(lesson.steps.map((step) => step.phase));
    for (const required of ["hook", "trial", "rule", "practice", "transfer", "reflect"]) {
      assert.ok(
        phases.has(required),
        `${lesson.id}: не хватает фазы «${required}»`,
      );
    }
  }
});

test("правило появляется не раньше, чем ребёнок сам попробовал", () => {
  for (const lesson of lessons) {
    const ruleAt = lesson.steps.findIndex((step) => step.kind === "rule");
    const trialAt = lesson.steps.findIndex((step) => step.phase === "trial");
    assert.ok(ruleAt > trialAt, `${lesson.id}: правило стоит раньше пробного действия`);
  }
});

test("у каждого интерактивного шага есть ожидаемый ответ и подсказка", () => {
  for (const { lesson, step } of allSteps) {
    if (!isInteractive(step)) continue;
    const answer = expectedAnswer(step);
    assert.ok(answer, `${lesson.id}/${step.id}: нет ожидаемого ответа`);
    const hint = "hint" in step ? step.hint : step.task.hint;
    assert.ok(hint && hint.length > 5, `${lesson.id}/${step.id}: пустая подсказка`);
    const skill = stepSkill(step);
    assert.ok(skill && SKILLS.includes(skill), `${lesson.id}/${step.id}: навык не задан`);
  }
});

test("числовые домики сходятся: части дают целое", () => {
  for (const { lesson, step } of allSteps) {
    if (step.kind !== "bond") continue;
    assert.ok(
      bondIsConsistent(step),
      `${lesson.id}/${step.id}: ${step.parts[0]} и ${step.parts[1]} не дают ${step.whole}`,
    );
  }
});

test("в звуковых схемах число фишек совпадает с числом звуков", () => {
  for (const { lesson, step } of allSteps) {
    if (step.kind !== "scheme") continue;
    assert.ok(step.sounds.length >= 2, `${lesson.id}/${step.id}: слишком короткая схема`);
    assert.ok(
      step.sounds.some((sound) => sound === "гласный"),
      `${lesson.id}/${step.id}: в слове «${step.word}» нет ни одного гласного`,
    );
    // Схема строится по звукам, но для слов без ь и йотированных число
    // звуков совпадает с числом букв — это ловит опечатки в данных.
    if (!/[ьъяёюе]/.test(step.word)) {
      assert.equal(
        step.sounds.length,
        step.word.length,
        `${lesson.id}/${step.id}: в слове «${step.word}» ${step.word.length} букв, а фишек ${step.sounds.length}`,
      );
    }
  }
});

test("в заданиях с вариантами ровно один верный", () => {
  for (const { lesson, step } of allSteps) {
    if (step.kind !== "ask" || !step.task.options.length) continue;
    const correct = step.task.options.filter((option) => isCorrect(option, step.task));
    assert.equal(
      correct.length,
      1,
      `${lesson.id}/${step.id}: верных вариантов ${correct.length}`,
    );
  }
});

test("в парах на соединение нет одинаковых правых частей", () => {
  // Иначе у задания два верных решения.
  for (const { lesson, step } of allSteps) {
    if (step.kind !== "match") continue;
    const rights = step.pairs.map(([, right]) => right);
    assert.equal(new Set(rights).size, rights.length, `${lesson.id}/${step.id}: дубли`);
    assert.ok(step.pairs.length >= 2, `${lesson.id}/${step.id}: пар меньше двух`);
  }
});

test("в заданиях на порядок нет повторов", () => {
  for (const { lesson, step } of allSteps) {
    if (step.kind !== "order") continue;
    assert.equal(
      new Set(step.items).size,
      step.items.length,
      `${lesson.id}/${step.id}: повторяющиеся карточки`,
    );
    assert.ok(step.items.length >= 3, `${lesson.id}/${step.id}: слишком мало карточек`);
  }
});

test("реплики уроков озвучиваются без посторонних символов", () => {
  for (const { lesson, step } of allSteps) {
    if (step.kind !== "ask") continue;
    const speech = speechForTask(step.task);
    // Латиница допустима: английские куски произносятся английским голосом.
    const stray = [...speech].filter((ch) => !/[А-Яа-яЁёA-Za-z0-9 .,?!'’-]/.test(ch));
    assert.equal(
      stray.length,
      0,
      `${lesson.id}/${step.id}: в озвучке ${JSON.stringify(stray)}`,
    );
  }
});

test("реплика делится по алфавитам, чтобы каждый кусок читал свой голос", () => {
  assert.deepEqual(splitByScript("Капитан сказал: Open the door. Что делаем?"), [
    { text: "Капитан сказал:", lang: "ru" },
    { text: "Open the door", lang: "en" },
    { text: ". Что делаем?", lang: "ru" },
  ]);
  assert.deepEqual(splitByScript("Просто по-русски"), [
    { text: "Просто по-русски", lang: "ru" },
  ]);
  assert.deepEqual(splitByScript("push the button"), [
    { text: "push the button", lang: "en" },
  ]);
});

test("в английских шагах есть что произнести по-английски", () => {
  const english = lessonsBySubject("Английский");
  const hasEnglishAudio = english.some((lesson) =>
    lesson.steps.some((step) => {
      const text =
        step.kind === "ask"
          ? speechForTask(step.task)
          : step.kind === "say"
            ? (step.speech ?? step.text)
            : "";
      return splitByScript(text).some((segment) => segment.lang === "en");
    }),
  );
  assert.ok(hasEnglishAudio, "в уроке английского нет ни одного английского фрагмента");
});

test("в первом уроке английского нет латиницы как объекта чтения", () => {
  // Решение методики: первые полгода ребёнок опирается на слух, а не на
  // написание. Английские слова на экране есть, но всегда с русским пояснением
  // в подсказке — читать их не требуется.
  const english = lessonsBySubject("Английский");
  assert.ok(english.length > 0);
  for (const lesson of english) {
    for (const step of lesson.steps) {
      if (!isInteractive(step)) continue;
      const hint = "hint" in step ? step.hint : step.task.hint;
      assert.match(
        hint,
        /[А-Яа-яЁё]/,
        `${lesson.id}/${step.id}: подсказка обязана быть по-русски`,
      );
    }
  }
});

test("уроки посильны по длине: 10–20 шагов", () => {
  for (const lesson of lessons) {
    assert.ok(
      lesson.steps.length >= 10 && lesson.steps.length <= 20,
      `${lesson.id}: ${lesson.steps.length} шагов`,
    );
    assert.ok(lesson.goal.length > 20, `${lesson.id}: цель урока не описана`);
    assert.ok(lesson.requires.length > 3, `${lesson.id}: не указано, что нужно знать до`);
  }
});
