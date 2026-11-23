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

const MORE_PRINT = [
  printMission({
    id: "radio-silent", title: "Тихая строка", mode: "values",
    instruction: "Включи сигнал «Маяк!».",
    speech: "Решётка в начале строки превращает её в заметку. Питон её пропускает. Убери решётку, чтобы включить маяк.",
    hint: "Строка с решёткой в начале не выполняется.",
    parts: ['print("Связь включена")\n', 'print("Маяк!")'],
    slots: [slots("Начало строки", "# ", "# ", "")],
    predict: question("Что покажет пример с решёткой?", ["Два сигнала", "Только «Связь включена»"], 1),
    explain: question("Почему теперь появился сигнал?", ["Убрали решётку", "Поменяли слово в кавычках"], 0),
  }, "Связь включена", "Маяк!"),
  printMission({
    id: "radio-compare", title: "Две разные команды", mode: "complete",
    instruction: "В первой строке передай «1», во второй — «Один».",
    speech: "Сравни число один и слово один. Выбери команду, которая напечатает слово во второй строке.",
    hint: "Число пишем без кавычек. Слово пишем в кавычках.",
    parts: ["print(1)\n", ""],
    slots: [slots("Вторая команда", "print(1)", "print(1)", 'print("Один")', 'print("1")')],
    predict: question("Что напечатает пример?", ["Два раза 1", "1 и Один"], 0),
    explain: question("Почему вторая строка стала другой?", ["Терминал перевёл число", "Вторая команда получила слово"], 1),
  }, "1", "Один"),
  printMission({
    id: "radio-bracket", title: "Закрой скобку", mode: "complete",
    instruction: "Найди пропущенный знак. Передай «Слышу!».",
    speech: "У команды принт есть открывающая и закрывающая скобки. Найди недостающий знак в конце строки.",
    hint: "Кавычки уже на месте. Посмотри на круглые скобки.",
    parts: ['print("Слышу!"', ""],
    slots: [slots("Последний знак", "", ")", "(", '"')],
    predict: question("Какой знак остался без пары?", ["Кавычка", "Открывающая скобка"], 1),
    explain: question("Что сделала скобка справа?", ["Закончила вызов print", "Добавила знак к сообщению"], 0),
  }, "Слышу!"),
  printMission({
    id: "radio-codeword", title: "Секретный позывной", mode: "complete",
    instruction: "Передай «Сокол» между словами «База» и «Приём».",
    speech: "В терминале должны быть по порядку: База, Сокол, Приём. Вставь одну команду в середину.",
    hint: 'Чтобы передать слово, напиши print("Сокол").',
    parts: ['print("База")\n', '\nprint("Приём")'],
    slots: [slots("Средняя строка", "# Твоя команда")],
    predict: question("Где нужна новая команда?", ["После «Приём»", "Между двумя командами"], 1),
    explain: question("Почему «Сокол» появился вторым?", ["Команда стояла второй", "Терминал отсортировал слова"], 0),
  }, "База", "Сокол", "Приём"),
];

const VARIABLE_PRACTICE = printMission({
  id: "value-twice", title: "Один запас, два сигнала", mode: "values",
  instruction: "Измени запас так, чтобы обе команды напечатали 4.",
  speech: "Две команды читают одну переменную. Измени только значение запаса.",
  hint: "Обе команды print берут значение из одной переменной tank.",
  parts: ["tank = ", "\nprint(tank)\nprint(tank)"],
  slots: [slots("Запас", "2", "2", "4", "6")],
  predict: question("Что напечатает пример?", ["2 и 2", "2 и 4"], 0),
  explain: question("Почему изменились обе строки?", ["У них одна переменная", "Вторая команда копирует первую"], 0),
}, "4", "4");

const CONDITION_PRACTICE = printMission({
  id: "fuel-threshold", title: "Ровно на границе", mode: "values",
  instruction: "Правило изменилось. При запасе ровно 3 взлёт разрешён.",
  speech: "Знак больше пропускает только числа выше трёх. Знак больше или равно пропускает и само число три.",
  hint: "Сравни знаки > и >=. Второй означает «больше или равно».",
  parts: ["fuel = 3\nif fuel ", ' 3:\n    print("Летим!")\nelse:\n    print("Ждём")'],
  slots: [slots("Знак сравнения", ">", ">", ">=", "<")],
  predict: question("Что напечатает исходный код?", ["Летим!", "Ждём"], 1),
  explain: question("Почему мы можем лететь с запасом 3?", ["3 больше 3", "3 равно 3, и новый знак это разрешает"], 1),
}, "Летим!");

const COORDINATE_PRACTICE: Mission = {
  id: "map-return", title: "Поворот назад", mode: "complete",
  instruction: "Ты в (4, 3). Долети до (1, 1).",
  speech: "Первое число уменьшается, когда летим влево. Второе уменьшается, когда снижаемся.",
  hint: 'Попробуй move("left", 3), затем move("down", 2).',
  parts: ["move(", ", 3)\nmove(", ", 2)"],
  slots: [slots("Первое направление", '"right"', '"right"', '"left"'), slots("Второе направление", '"up"', '"up"', '"down"')],
  map: { start: [4, 3], goal: [1, 1] },
  predict: question("Как меняются обе координаты?", ["Становятся меньше", "Становятся больше"], 0),
  explain: question("Какой манёвр изменил вторую координату?", ["Полёт влево", "Снижение"], 1),
  passes: flight => flight.arrived,
};

const LOOP_PRACTICE: Mission = {
  id: "loop-pairs", title: "Два шага за повтор", mode: "values",
  instruction: "За один повтор самолёт летит на 2 клетки. Достигни (6, 0).",
  speech: "Каждый повтор даёт две клетки. Посчитай: два, четыре, шесть. Сколько повторов понадобилось?",
  hint: "После одного повтора самолёт в клетке 2, после двух — в клетке 4.",
  parts: ["for i in range(", '):\n    move("right", 2)'],
  slots: [slots("Повторов", "2", "2", "3", "4")],
  map: where([6, 0]),
  predict: question("Где остановится исходная программа?", ["В клетке 2", "В клетке 4"], 1),
  explain: question("Как получились 6 клеток?", ["Три раза по две клетки", "Три раза по одной клетке"], 0),
  passes: flight => flight.arrived,
};

export const COURSE = [
  { name: "Первые команды", missions: [CORE_MISSIONS[0]!, ...PRINT_PRACTICE, ...MORE_PRINT] },
  { name: "Переменные", missions: [CORE_MISSIONS[1]!, VARIABLE_PRACTICE] },
  { name: "Условия if / else", missions: [CORE_MISSIONS[2]!, CONDITION_PRACTICE] },
  { name: "Координаты", missions: [CORE_MISSIONS[3]!, COORDINATE_PRACTICE] },
  { name: "Циклы", missions: [CORE_MISSIONS[4]!, LOOP_PRACTICE] },
  { name: "Самостоятельный полёт", missions: CORE_MISSIONS.slice(5) },
];

export const MISSIONS = COURSE.flatMap(stage => stage.missions);

export function programBadgeEarned(wins: readonly string[]) {
  return CORE_MISSIONS.every(mission => wins.includes(missionKey(mission.id)));
}

export const missionKey = (id: string) => `python-flight:${id}`;

export function assemble(mission: Mission, values: readonly string[]) {
  return mission.parts.map((part, i) => part + (values[i] ?? "")).join("");
}

export function isUnlocked(wins: readonly string[], id: string) {
  const coreIndex = CORE_MISSIONS.findIndex(mission => mission.id === id);
  if (coreIndex >= 0) return coreIndex === 0 || wins.includes(missionKey(CORE_MISSIONS[coreIndex - 1]!.id));
  const stage = COURSE.find(item => item.missions.some(mission => mission.id === id));
  return !!stage && wins.includes(missionKey(stage.missions[0]!.id));
}

export function grantMission<T extends { gameWins: string[]; stars: number }>(progress: T, id: string): T {
  const key = missionKey(id);
  if (!isUnlocked(progress.gameWins, id) || progress.gameWins.includes(key)) return progress;
  return { ...progress, gameWins: [...progress.gameWins, key], stars: progress.stars + 1 };
}
