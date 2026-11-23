import type { Flight, MapSpec } from "../../lib/python/flight.ts";
import { execute } from "../../lib/python/interpreter.ts";

type Question = { prompt: string; choices: readonly string[]; correct: number };
type Slot = { label: string; initial: string; choices?: readonly string[] };
export type Mission = {
  id: string;
  title: string;
  instruction: string;
  speech: string;
  hint: string;
  mode: "values" | "complete" | "free";
  parts: readonly string[];
  slots: readonly Slot[];
  map: MapSpec;
  predict: Question;
  explain: Question;
  passes: (flight: Flight, source: string) => boolean;
};

const question = (prompt: string, choices: string[], correct: number): Question => ({ prompt, choices, correct });
const slots = (label: string, initial: string, ...choices: string[]): Slot => ({ label, initial, choices });
const where = (goal: MapSpec["goal"]): MapSpec => ({ start: [0, 0], goal });
const finish = (flight: Flight, source: string) => {
  if (!flight.landed || flight.problem) return false;
  const dryRun = execute(source, { fuel: 0 });
  return dryRun.ok && !dryRun.commands.some((command) => command.kind === "takeoff");
};

const CORE_MISSIONS: readonly Mission[] = [
  {
    id: "radio", title: "Радиосвязь", mode: "values",
    instruction: "Передай в эфир «Готов к взлёту!»",
    speech: "Команда принт показывает сообщение. Выбери фразу «Готов к взлёту».",
    hint: "Сначала ответь, где появится сообщение. Потом нажми кнопку с нужной фразой.",
    parts: ['print("', '")'], slots: [slots("Фраза", "Привет, Марк!", "Привет, Марк!", "Готов к взлёту!", "Вижу облако!")],
    map: where([0, 0]),
    predict: question("Где появится новая фраза?", ["На карте", "В терминале"], 1),
    explain: question("Что показала команда print?", ["Текст в кавычках", "Число клеток"], 0),
    passes: (flight) => flight.output.includes("Готов к взлёту!"),
  },
  {
    id: "settings", title: "Высота и скорость", mode: "values",
    instruction: "Поднимись на высоту 2. Поставь скорость 3.",
    speech: "Спид — скорость. Хайт — высота. Выбери высоту два и скорость три.",
    hint: "Число справа от знака «равно» — новое значение.",
    parts: ["speed = ", "\nheight = ", ""], slots: [slots("Скорость", "1", "1", "2", "3", "4"), slots("Высота", "1", "0", "1", "2", "3", "4")],
    map: where([0, 2]),
    predict: question("Что изменит height?", ["Высоту", "Сообщение"], 0),
    explain: question("Почему самолёт поднялся на две клетки?", ["Потому что speed = 3", "Потому что height = 2"], 1),
    passes: (flight) => flight.arrived && flight.speed === 3,
  },
  {
    id: "fuel", title: "Проверка топлива", mode: "values",
    instruction: "Бак пуст. Покажи «Нужна заправка!»",
    speech: "Иф значит «если». Элс значит «иначе». Поставь ноль топлива, чтобы проверить пустой бак.",
    hint: "Попробуй fuel = 0. Ноль больше нуля?",
    parts: ["fuel = ", '\nif fuel > 0:\n    print("Взлетаем!")\n    takeoff()\nelse:\n    print("Нужна заправка!")'],
    slots: [slots("Топливо", "10", "10", "5", "0")], map: { ...where([0, 0]), needsTakeoff: true },
    predict: question("Что скажет диспетчер при пустом баке?", ["Взлетаем!", "Нужна заправка!"], 1),
    explain: question("Почему сработала ветка else?", ["Ноль не больше нуля", "В баке есть топливо"], 0),
    passes: (flight) => flight.output.includes("Нужна заправка!"),
  },
  {
    id: "map", title: "Координаты", mode: "complete",
    instruction: "Из (0, 0) долети до (3, 2).",
    speech: "Райт — вправо, лефт — влево, ап — вверх, даун — вниз. Укажи направление и число клеток.",
    hint: 'Сначала вправо на 3. Следующая команда — move("up", 2).',
    parts: ['direction = "', '"\nsteps = ', '\nmove(direction, steps)\n', ''],
    slots: [slots("Направление", "", "right", "left", "up", "down"), slots("Клетки", ""), slots("Вторая команда", "")],
    map: where([3, 2]),
    predict: question("Как попасть в (3, 2)?", ["Вправо 3, вверх 2", "Влево 3, вниз 2"], 0),
    explain: question("Что делает второй аргумент move?", ["Задаёт направление", "Задаёт число клеток"], 1),
    passes: (flight) => flight.arrived,
  },
  {
    id: "loop", title: "Повтори манёвр", mode: "complete",
    instruction: "Повтори шаг вправо и шаг вверх. Цель — (3, 3).",
    speech: "Фор повторяет команды с отступом. Рейндж задаёт число повторов.",
    hint: 'Добавь move("up", 1) в тело цикла. Один повтор даёт по клетке вправо и вверх.',
    parts: ['for i in range(', '):\n    move("right", 1)\n    ', ''],
    slots: [slots("Повторов", ""), slots("Вторая команда в цикле", "")], map: where([3, 3]),
    predict: question("Сколько раз нужен манёвр?", ["Два", "Три"], 1),
    explain: question("Почему движение вверх тоже повторилось?", ["Команда с отступом внутри for", "Так делает любой move"], 0),
    passes: (flight) => flight.arrived,
  },
  ...([
    { id: "solo", title: "Первый маршрут", goal: [4, 0], storm: [[2, 0]], route: "Поднимись на 1, лети вправо на 4 и спустись на 1.", starter: "fuel = 5\nif fuel > 0:\n    takeoff()\n    # Добавь маршрут и посадку здесь\n" },
    { id: "storm", title: "Две грозы", goal: [5, 0], storm: [[2, 0], [2, 1]], route: "Поднимись выше двух гроз, потом лети над ними.", starter: "fuel = 5\nif fuel > 0:\n    # Добавь взлёт, маршрут и посадку\n" },
    { id: "captain", title: "Полёт капитана", goal: [6, 2], storm: [[2, 0], [2, 1], [2, 2], [4, 3]], route: "Попробуй облететь грозы по верхнему ряду.", starter: "fuel = 5\n# Добавь проверку топлива и программу полёта\n" },
  ] as const).map(({ id, title, goal, storm, route, starter }): Mission => ({
    id, title, mode: "free",
    instruction: "Проверь топливо, взлети, облети грозу и сядь на аэродроме.",
    speech: "Проверь топливо через иф. Взлети командой тэйк оф. Облети грозу с помощью мув. На аэродроме вызови лэнд.",
    hint: route,
    parts: [starter],
    slots: [], map: { ...where(goal), obstacles: storm, needsTakeoff: true },
    predict: question("Что делать перед грозой?", ["Лететь прямо", "Изменить маршрут"], 1),
    explain: question("Зачем поставить взлёт внутри if?", ["Чтобы взлетать только с топливом", "Чтобы полететь быстрее"], 0),
    passes: finish,
  })),
];

function printMission(
  lesson: Omit<Mission, "map" | "passes">,
  ...expected: string[]
): Mission {
  return {
    ...lesson,
    map: where([0, 0]),
    passes: ({ output }) => output.length === expected.length && expected.every((line, index) => output[index] === line),
  };
}

const PRINT_PRACTICE = [
  printMission({
    id: "radio-order", title: "Два сигнала", mode: "values",
    instruction: "Сначала передай «Старт!», потом «Взлёт!».",
    speech: "Сначала предскажи, какая команда сработает первой. Потом расставь два сигнала по порядку.",
    hint: "Питон читает эти строки сверху вниз.",
    parts: ['print("', '")\nprint("', '")'],
    slots: [slots("Первая строка", "Взлёт!", "Старт!", "Взлёт!"), slots("Вторая строка", "Старт!", "Старт!", "Взлёт!")],
    predict: question("Что напечатает исходный код первым?", ["Старт!", "Взлёт!"], 1),
    explain: question("Почему порядок сообщений поменялся?", ["Изменили фразы в строках", "Терминал сам их переставил"], 0),
  }, "Старт!", "Взлёт!"),
  printMission({
    id: "radio-count", title: "Считаем команды", mode: "complete",
    instruction: "Добавь одну команду. Пусть терминал покажет 3, 2 и 1.",
    speech: "Посчитай команды принт в примере. Потом добавь третью команду для числа один.",
    hint: "Для последнего числа подойдёт print(1).",
    parts: ["print(3)\nprint(2)\n", ""], slots: [slots("Последняя команда", "# Добавь команду", "print(1)", "print(2)", "print(3)")],
    predict: question("Сколько строк напечатает пример?", ["Три", "Две"], 1),
    explain: question("Почему теперь строк три?", ["Запустили три команды print", "Число 3 создало три строки"], 0),
  }, "3", "2", "1"),
  printMission({
    id: "radio-space", title: "Пропавший пробел", mode: "values",
    instruction: "Передай «Взлёт разрешён». Добавь пробел между словами.",
    speech: "В примере два слова слиплись. Предскажи, что появится на экране, и добавь пробел.",
    hint: "Команда print сохраняет пробелы внутри кавычек.",
    parts: ['print("', '")'],
    slots: [slots("Фраза", "Взлётразрешён", "Взлётразрешён", "Взлёт разрешён", "Взлёт! разрешён")],
    predict: question("Что напечатает исходный код?", ["Взлёт разрешён", "Взлётразрешён"], 1),
    explain: question("Откуда взялся пробел?", ["Терминал добавил его сам", "Он уже был в выбранной фразе"], 1),
  }, "Взлёт разрешён"),
  printMission({
    id: "radio-quotes", title: "Кавычки для слов", mode: "complete",
    instruction: "Почини код. Терминал должен показать «Полоса свободна».",
    speech: "Слова в команде принт пишем в кавычках. Найди вариант с двумя кавычками.",
    hint: "Одна кавычка перед словами, другая после.",
    parts: ["print(", ")"],
    slots: [slots("Внутри скобок", "Полоса свободна", "Полоса свободна", '"Полоса свободна', '"Полоса свободна"')],
    predict: question("Что случится с кодом без кавычек?", ["Появится ошибка", "Появится фраза"], 0),
    explain: question("Что показал терминал?", ['"Полоса свободна"', "Полоса свободна"], 1),
  }, "Полоса свободна"),
  printMission({
    id: "radio-repair", title: "Точный позывной", mode: "complete",
    instruction: "Оставь первую и третью строки. Во второй напечатай «Курс 2».",
    speech: "Команда принт во второй строке выводит неверный курс. Исправь только её.",
    hint: "Прочитай вторую строку. В ней должно быть число два внутри кавычек.",
    parts: ['print("Маяк")\n', '\nprint("Конец связи")'],
    slots: [slots("Вторая команда", 'print("Курс 5")')],
    predict: question("Какая строка сейчас передаёт «Курс 5»?", ["Третья", "Вторая"], 1),
    explain: question("Почему «Конец связи» остался в эфире?", ["Третья команда не изменилась", "Терминал запомнил её с прошлого запуска"], 0),
  }, "Маяк", "Курс 2", "Конец связи"),
];

export const MISSIONS = [CORE_MISSIONS[0]!, ...PRINT_PRACTICE, ...CORE_MISSIONS.slice(1)];

export function programBadgeEarned(wins: readonly string[]) {
  return CORE_MISSIONS.every(mission => wins.includes(missionKey(mission.id)));
}

export const COURSE = [
  { name: "Первые команды", missions: [CORE_MISSIONS[0]!, ...PRINT_PRACTICE] },
  { name: "Переменные", missions: CORE_MISSIONS.slice(1, 2) },
  { name: "Условия if / else", missions: CORE_MISSIONS.slice(2, 3) },
  { name: "Координаты", missions: CORE_MISSIONS.slice(3, 4) },
  { name: "Циклы", missions: CORE_MISSIONS.slice(4, 5) },
  { name: "Самостоятельный полёт", missions: CORE_MISSIONS.slice(5) },
];

export const missionKey = (id: string) => `python-flight:${id}`;

export function assemble(mission: Mission, values: readonly string[]) {
  return mission.parts.map((part, i) => part + (values[i] ?? "")).join("");
}

export function isUnlocked(wins: readonly string[], id: string) {
  if (PRINT_PRACTICE.some(mission => mission.id === id)) return wins.includes(missionKey("radio"));
  const index = CORE_MISSIONS.findIndex(mission => mission.id === id);
  return index >= 0 && (index === 0 || wins.includes(missionKey(CORE_MISSIONS[index - 1]!.id)));
}

export function grantMission<T extends { gameWins: string[]; stars: number }>(progress: T, id: string): T {
  const key = missionKey(id);
  if (!isUnlocked(progress.gameWins, id) || progress.gameWins.includes(key)) return progress;
  return { ...progress, gameWins: [...progress.gameWins, key], stars: progress.stars + 1 };
}
