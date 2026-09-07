import assert from "node:assert/strict";
import test from "node:test";
import { diagnostic, missions } from "../content/tasks.ts";
import {
  DAYS_NOUN,
  isCorrect,
  MISSIONS_NOUN,
  normalizeAnswer,
  plural,
  SKILLS,
  STARS_NOUN,
  TASKS_NOUN,
  withCount,
} from "../content/types.ts";
import {
  canGenerate,
  generateSession,
  generateTask,
} from "../content/generator.ts";
import {
  isClimbable,
  isPartReachable,
  MAX_JUMP_HEIGHT,
  OBSTACLES,
  PART_POSITIONS,
} from "../app/game/layout.ts";
import { prepareSpeech, speechForTask } from "../lib/speech.ts";

const allTasks = [...diagnostic, ...missions.flatMap((m) => m.tasks)];

test("у всех задач уникальные id", () => {
  const ids = allTasks.map((task) => task.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("правильный ответ есть среди вариантов", () => {
  for (const task of allTasks) {
    if (!task.options.length) continue;
    assert.ok(
      task.options.includes(task.answer),
      `${task.id}: ответ «${task.answer}» отсутствует в вариантах`,
    );
    assert.equal(new Set(task.options).size, task.options.length, `${task.id}: дубликаты вариантов`);
  }
});

test("каждая задача имеет подсказку и известный навык", () => {
  for (const task of allTasks) {
    assert.ok(task.hint.length > 3, `${task.id}: пустая подсказка`);
    assert.ok(SKILLS.includes(task.skill), `${task.id}: неизвестный навык ${task.skill}`);
  }
});

test("ответ ребёнка сравнивается снисходительно", () => {
  const task = { id: "x", skill: "Счёт", prompt: "", options: [], answer: "Ёлка", hint: "" };
  assert.ok(isCorrect("  елка ", task));
  assert.ok(isCorrect("ЕЛКА.", task));
  assert.ok(!isCorrect("елки", task));
  assert.equal(normalizeAnswer("Самолёт  летит!"), "самолет летит");
});

test("генератор детерминирован по семени", () => {
  assert.deepEqual(generateTask(123), generateTask(123));
  // Часть заданий имеет постоянную формулировку («Выбери правильно записанное
  // предложение»), поэтому различие ищем во всей задаче, а не только в тексте.
  const shape = (task) => JSON.stringify([task.prompt, task.answer, task.options, task.read]);
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => shape(generateTask(n * 977)));
  assert.ok(new Set(seeds).size >= 7, "разные семена должны давать разные задачи");
});

test("сгенерированные задачи корректны", () => {
  for (const task of generateSession(200, 1)) {
    assert.ok(task.id.startsWith("gen:"), "у сгенерированной задачи должен быть префикс gen:");
    assert.ok(task.prompt.length > 5);
    assert.ok(task.hint.length > 3);
    if (task.options.length) {
      assert.ok(task.options.includes(task.answer), `${task.prompt}: ответа нет в вариантах`);
      assert.equal(new Set(task.options).size, task.options.length);
      assert.ok(task.options.length >= 2);
    }
  }
});

test("арифметика в сгенерированных задачах сходится", () => {
  for (const task of generateSession(300, 77)) {
    // «прилетел ещё один» — слово вместо цифры, поэтому единица подставляется.
    const numbers = task.prompt.match(/\d+/g)?.map(Number) ?? [];
    const second = numbers.length > 1 ? numbers[1] : 1;
    if (/прилетел/.test(task.prompt) || /выдали ещё/.test(task.prompt)) {
      assert.equal(
        Number(task.answer),
        numbers[0] + second,
        `не сходится: ${task.prompt} → ${task.answer}`,
      );
    }
    if (/унесли/.test(task.prompt)) {
      assert.equal(
        Number(task.answer),
        numbers[0] - second,
        `не сходится: ${task.prompt} → ${task.answer}`,
      );
      assert.ok(Number(task.answer) >= 0);
    }
  }
});

test("фокус на навыке смещает выбор задач", () => {
  const session = generateSession(60, 5, "Слоги");
  const syllables = session.filter((task) => task.skill === "Слоги").length;
  assert.ok(syllables > session.length / 2, `ожидали перевес слогов, получили ${syllables}/60`);
});

test("речь очищается от знаков, которые синтезатор читает как мусор", () => {
  assert.equal(prepareSpeech("5 + 3 = 8"), "5 плюс 3 равно 8");
  assert.equal(prepareSpeech("9 − 2"), "9 минус 2");
  assert.equal(prepareSpeech("звук [к]"), "звук звук к");
  assert.equal(prepareSpeech("са-мо-лёт"), "са, мо, лёт");
  // Именно это голос и проговаривал вслух: «двоеточие», «кавычка», «тире».
  assert.equal(prepareSpeech("Раздели слово «ракета»:"), "Раздели слово ракета");
  assert.equal(prepareSpeech("Началось…"), "Началось");
  assert.equal(prepareSpeech("Марк — пилот"), "Марк, пилот");
  assert.equal(prepareSpeech("✈️ ✈️"), "");
});

test("фигуры называются по-разному, иначе на слух ряд неразличим", () => {
  assert.equal(prepareSpeech("▲ ● ■"), "треугольник круг квадрат");
});

test("одиночный знак препинания произносится словом", () => {
  assert.equal(prepareSpeech("."), "точка");
  assert.equal(prepareSpeech("?"), "вопросительный знак");
  assert.equal(prepareSpeech("!"), "восклицательный знак");
});

test("ударение проговаривается словами", () => {
  assert.equal(prepareSpeech("пило́т"), "пилот, с ударением на о");
  assert.equal(prepareSpeech("пи́лот"), "пилот, с ударением на и");
});

test("варианты ответа перечисляются словами, а не номерами с точкой", () => {
  const speech = speechForTask(diagnostic[0]);
  assert.match(speech, /Первый вариант/);
  assert.match(speech, /Второй вариант/);
  assert.doesNotMatch(speech, /1\./, "«1.» читается как «один точка»");
});

test("в реплику не попадает ничего, кроме букв, цифр и обычной пунктуации", () => {
  const all = [
    ...diagnostic,
    ...missions.flatMap((mission) => mission.tasks),
    ...generateSession(300, 5),
  ];
  for (const task of all) {
    const speech = speechForTask(task);
    const stray = [...speech].filter((ch) => !/[А-Яа-яЁё0-9 .,?!]/.test(ch));
    assert.equal(
      stray.length,
      0,
      `${task.id}: посторонние символы ${JSON.stringify(stray)} в «${speech}»`,
    );
    assert.doesNotMatch(
      speech,
      /[,.?!]\s*[,.?!]/,
      `${task.id}: сдвоенная пунктуация в «${speech}»`,
    );
    assert.ok(speech.length > 5, `${task.id}: пустая реплика`);
  }
});

test("существительные согласуются с числом", () => {
  const planes = ["самолёт", "самолёта", "самолётов"];
  const cases = [
    [1, 0], [2, 1], [3, 1], [4, 1], [5, 2], [10, 2],
    [11, 2], [12, 2], [14, 2], [15, 2],
    [21, 0], [22, 1], [25, 2], [101, 0], [111, 2],
  ];
  for (const [count, form] of cases) {
    assert.equal(plural(count, planes), planes[form], `${count} → ожидали «${planes[form]}»`);
  }
});

test("в сгенерированных задачах нет сломанных окончаний", () => {
  const FORMS = {
    "самолёт": ["самолёт", "самолёта", "самолётов"],
    "вертолёт": ["вертолёт", "вертолёта", "вертолётов"],
    "планер": ["планер", "планера", "планеров"],
    "дирижабл": ["дирижабль", "дирижабля", "дирижаблей"],
    "детал": ["деталь", "детали", "деталей"],
    "карт": ["карта", "карты", "карт"],
  };
  // Ровно те дефекты, что вылезли на первом прогоне: «13 дирижабльов»,
  // «2 самолётов», «после числом 10».
  const broken = [/дирижабльов/, /планеровов/, /после числом/, /перед числа /];

  for (const task of generateSession(400, 31)) {
    for (const pattern of broken) {
      assert.ok(!pattern.test(task.prompt), `«${task.prompt}» — ${pattern}`);
    }
    const pairs = task.prompt.matchAll(
      /(\d+) (самолёт[а-яё]*|вертолёт[а-яё]*|планер[а-яё]*|дирижабл[а-яё]*|детал[а-яё]*|карт[а-яё]*)/g,
    );
    for (const [, count, word] of pairs) {
      const stem = Object.keys(FORMS).find((key) => word.startsWith(key));
      const expected = plural(Number(count), FORMS[stem]);
      assert.equal(
        word,
        expected,
        `«${task.prompt}»: при ${count} нужно «${expected}», а стоит «${word}»`,
      );
    }
  }
});

test("маршрут в игре проходим: каждая деталь достижима", () => {
  // Проверка, которой не хватало: при высоте прыжка 1.68 последнее препятствие
  // высотой 1.8 было непреодолимым, пятая деталь не собиралась, и миссии 3-5
  // не открывались вообще.
  assert.ok(MAX_JUMP_HEIGHT > 1.5, `высота прыжка ${MAX_JUMP_HEIGHT}`);
  assert.equal(OBSTACLES.length, PART_POSITIONS.length);
  OBSTACLES.forEach((obstacle, i) => {
    assert.ok(
      isClimbable(obstacle),
      `препятствие ${i} высотой ${obstacle.height} выше прыжка ${MAX_JUMP_HEIGHT.toFixed(2)}`,
    );
    assert.ok(
      isPartReachable(PART_POSITIONS[i], obstacle),
      `деталь ${i} в ${JSON.stringify(PART_POSITIONS[i])} не достаётся с препятствия ${JSON.stringify(obstacle)}`,
    );
  });
});

test("подписи интерфейса согласуются с числом", () => {
  const cases = [
    [1, "задание"], [2, "задания"], [4, "задания"], [5, "заданий"],
    [11, "заданий"], [15, "заданий"], [21, "задание"], [22, "задания"],
  ];
  for (const [count, expected] of cases) {
    assert.equal(withCount(count, TASKS_NOUN), `${count} ${expected}`);
  }
  assert.equal(withCount(1, STARS_NOUN), "1 звезда");
  assert.equal(withCount(3, STARS_NOUN), "3 звезды");
  assert.equal(withCount(9, STARS_NOUN), "9 звёзд");
  assert.equal(withCount(1, DAYS_NOUN), "1 день");
  assert.equal(withCount(3, DAYS_NOUN), "3 дня");
  assert.equal(plural(0, MISSIONS_NOUN), "миссий");
});

test("у каждой задачи с вариантами ровно один верный ответ", () => {
  // Снисходительное сравнение обрезало регистр и конечную пунктуацию, из-за
  // чего пять заданий на заглавную букву и знак в конце засчитывали любой
  // выбор: «стадион большой» приносил звезду наравне с «Большой стадион.».
  const all = [
    ...diagnostic,
    ...missions.flatMap((mission) => mission.tasks),
    ...generateSession(400, 7),
  ];
  const withOptions = all.filter((task) => task.options.length);
  assert.ok(withOptions.length > 400, "выборка слишком мала");
  for (const task of withOptions) {
    const correct = task.options.filter((option) => isCorrect(option, task));
    assert.equal(
      correct.length,
      1,
      `${task.id}: «${task.prompt}» ${JSON.stringify(task.options)} — верных ${correct.length}`,
    );
  }
});

test("свободный ввод по-прежнему прощает регистр, ё и точку", () => {
  const typed = { id: "t", skill: "Задачи", prompt: "", options: [], answer: "Ёлка", hint: "" };
  assert.ok(isCorrect("  елка. ", typed));
  assert.ok(isCorrect("ЕЛКА", typed));
});

test("генератор покрывает все навыки, которые обещает интерфейс", () => {
  // Иначе кнопка «Тренировать эту тему» открывала бы тренировку по другой теме.
  for (const skill of SKILLS) {
    assert.ok(canGenerate(skill), `для навыка «${skill}» нет ни одного генератора`);
  }
});

test("фокус на теме действительно даёт задачи этой темы", () => {
  for (const skill of SKILLS) {
    const session = generateSession(80, 11, skill);
    const hit = session.filter((task) => task.skill === skill).length;
    assert.ok(hit > 40, `«${skill}»: только ${hit} из 80 задач по теме`);
  }
});
