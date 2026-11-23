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

export const MISSIONS: readonly Mission[] = [
  {
    id: "radio", title: "Радиосвязь", mode: "values",
    instruction: "Передай в эфир «Готов к взлёту!»",
    speech: "Команда принт показывает сообщение. Выбери фразу «Готов к взлёту».",
    hint: "Поменяй слова внутри кавычек.",
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

export const COURSE = [
  { name: "Первые команды", missions: MISSIONS.slice(0, 1) },
  { name: "Переменные", missions: MISSIONS.slice(1, 2) },
  { name: "Условия if / else", missions: MISSIONS.slice(2, 3) },
  { name: "Координаты", missions: MISSIONS.slice(3, 4) },
  { name: "Циклы", missions: MISSIONS.slice(4, 5) },
  { name: "Самостоятельный полёт", missions: MISSIONS.slice(5) },
];

export const missionKey = (id: string) => `python-flight:${id}`;

export function assemble(mission: Mission, values: readonly string[]) {
  return mission.parts.map((part, i) => part + (values[i] ?? "")).join("");
}

export function isUnlocked(wins: readonly string[], id: string) {
  const index = MISSIONS.findIndex((mission) => mission.id === id);
  return index >= 0 && (index === 0 || wins.includes(missionKey(MISSIONS[index - 1]!.id)));
}

export function grantMission<T extends { gameWins: string[]; stars: number }>(progress: T, id: string): T {
  const key = missionKey(id);
  if (!isUnlocked(progress.gameWins, id) || progress.gameWins.includes(key)) return progress;
  return { ...progress, gameWins: [...progress.gameWins, key], stars: progress.stars + 1 };
}
