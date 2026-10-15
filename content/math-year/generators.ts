import { choiceTask, inputTask } from "../types.ts";
import type { Lesson, Step } from "../lesson.ts";

/**
 * Генераторы уроков математики на год.
 *
 * Урок по составу числа устроен одинаково для любого числа — меняются только
 * числа и сюжет. Поэтому он не пишется руками девять раз, а собирается по той
 * же 11-фазной модели, что и «Десять заклёпок» (docs/METHODOLOGY.md):
 * задача, которую нечем решить → домик руками → схема → запись → правило →
 * отработка со схемой → сам → перенос → «что теперь умею».
 *
 * Всё детерминировано: никакого Math.random, иначе урок менялся бы от
 * перезагрузки, а тесты не могли бы его проверить.
 */

type Story = {
  character: string;
  /** Что раскладываем: формы для 1 / 2–4 / 5+ и родительный падеж мн. ч. */
  thing: readonly [one: string, few: string, many: string];
  boxes: string;
  first: string;
  second: string;
};

const STORIES: readonly Story[] = [
  { character: "Механик Гром", thing: ["гайка", "гайки", "гаек"], boxes: "два ящика", first: "в первом ящике", second: "во втором" },
  { character: "Стюардесса Лиза", thing: ["пассажир", "пассажира", "пассажиров"], boxes: "два ряда кресел", first: "в первом ряду", second: "во втором" },
  { character: "Штурман Ветер", thing: ["флажок", "флажка", "флажков"], boxes: "две карты", first: "на первой карте", second: "на второй" },
  { character: "Диспетчер Ника", thing: ["самолёт", "самолёта", "самолётов"], boxes: "две стоянки", first: "на первой стоянке", second: "на второй" },
];

function noun(count: number, forms: Story["thing"]): string {
  const abs = Math.abs(count) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

const n = (count: number, story: Story) => `${count} ${noun(count, story.thing)}`;

/** Три разных неверных варианта к числу, все в пределах 0–20 и не равные ему. */
function distractors(right: number, pool: number[]): string[] {
  const out: string[] = [];
  for (const value of pool) {
    if (value !== right && value >= 0 && value <= 20 && !out.includes(String(value))) {
      out.push(String(value));
    }
    if (out.length === 2) break;
  }
  return out;
}

/** Варианты ответа в стабильном, но не всегда одинаковом порядке. */
function arrange(right: string, wrong: string[], seed: number): string[] {
  const all = [right, ...wrong];
  const shift = seed % all.length;
  return [...all.slice(shift), ...all.slice(0, shift)];
}

/**
 * «Состав числа N» для N от 2 до 9. Число 10 — отдельный, написанный вручную
 * урок «Десять заклёпок».
 */
export function bondLesson(total: number): Lesson {
  if (!Number.isInteger(total) || total < 2 || total > 9) {
    throw new Error(`bondLesson: число должно быть от 2 до 9, получено ${total}`);
  }
  const story = STORIES[total % STORIES.length]!;
  const id = `math-bond-${total}`;
  const p = (suffix: string) => `mb${total}-${suffix}`;
  // Пара для пробного действия: не 1 и не половина — её труднее угадать.
  const a = total >= 4 ? total - 2 : 1;
  // Вторая часть для отработки со схемой: 2, если число позволяет.
  const g2 = total >= 4 ? 2 : 1;
  const pairs = Array.from({ length: total - 1 }, (_, i) => [i + 1, total - i - 1] as const);

  const steps: Step[] = [
    {
      id: p("hook"),
      phase: "hook",
      kind: "say",
      character: story.character,
      text: `У меня ${n(total, story)} и ${story.boxes}. Я раскладываю их по-разному, но всего всегда ${total}. Помоги понять, сколько ${story.second}.`,
    },
    {
      id: p("warm-1"),
      phase: "warmup",
      kind: "ask",
      task: choiceTask(
        p("warm-1"),
        "Счёт",
        `Какое число идёт после ${total - 1}?`,
        arrange(String(total), distractors(total, [total + 1, total - 2, total + 2]), total),
        String(total),
        `Посчитай по порядку: ${total - 1}, а потом?`,
      ),
    },
    {
      id: p("warm-2"),
      phase: "warmup",
      kind: "ask",
      task: choiceTask(
        p("warm-2"),
        "Счёт",
        `Что больше: ${total} или ${total - 1}?`,
        arrange(String(total), [String(total - 1)], total + 1),
        String(total),
        "Больше то число, которое при счёте называют позже.",
      ),
    },
    {
      id: p("trial"),
      phase: "trial",
      kind: "ask",
      task: inputTask(
        p("trial"),
        "Счёт",
        `${capital(story.first)} ${a}, а всего ${total}. Сколько ${story.second}?`,
        String(total - a),
        "Пока это трудно — так и должно быть. Сейчас разберёмся вместе.",
        `${capital(story.first)} ${a}, а всего ${total}. Сколько ${story.second}? Введи ответ в поле.`,
      ),
    },
    {
      id: p("explore-say"),
      phase: "explore",
      kind: "say",
      character: story.character,
      text: `Смотри: все ${total} вместе — это целое. ${capital(story.boxes)} — это части. Части вместе всегда дают целое.`,
    },
    {
      id: p("explore-1"),
      phase: "explore",
      kind: "bond",
      skill: "Счёт",
      prompt: `${capital(story.first)} ${a}. Сколько ${story.second}, если всего ${total}?`,
      whole: total,
      parts: [a, total - a],
      missing: "right",
      hint: `Отсчитай от ${a} до ${total} и посчитай шаги.`,
    },
    {
      id: p("model"),
      phase: "model",
      kind: "bond",
      skill: "Счёт",
      prompt: `Части ${total - a} и ${a}. Какое целое?`,
      whole: total,
      parts: [total - a, a],
      missing: "whole",
      hint: "Целое — это всё вместе. Сложи части.",
    },
    {
      id: p("sign"),
      phase: "sign",
      kind: "ask",
      task: choiceTask(
        p("sign"),
        "Счёт",
        `Схему «целое ${total}, части ${a} и ${total - a}» записывают так:`,
        arrange(
          `${a} + ${total - a} = ${total}`,
          [`${total} + ${a} = ${total - a}`, `${a} − ${total - a} = ${total}`],
          total + 2,
        ),
        `${a} + ${total - a} = ${total}`,
        "Части складываем — получаем целое.",
      ),
    },
    {
      id: p("rule"),
      phase: "rule",
      kind: "rule",
      title: `Состав числа ${total}`,
      text: `${total} — это ${pairs.map(([x, y]) => `${x} и ${y}`).join(", ")}. Если знаешь одну часть, вторую найдёшь по домику.`,
    },
    {
      id: p("guided-1"),
      phase: "guided",
      kind: "bond",
      skill: "Счёт",
      prompt: `Всего ${total}. Одна часть 1. Какая вторая?`,
      whole: total,
      parts: [1, total - 1],
      missing: "right",
      hint: `Число перед ${total} — это ${total - 1}.`,
    },
    {
      id: p("guided-2"),
      phase: "guided",
      kind: "bond",
      skill: "Счёт",
      prompt: `Всего ${total}. Вторая часть ${g2}. Какая первая?`,
      whole: total,
      parts: [total - g2, g2],
      missing: "left",
      hint: "Посмотри на правило: там все пары.",
    },
  ];

  // Самостоятельно: свободный ввод, без схемы на экране.
  // Части, которых ещё не было в этом уроке, — иначе ребёнок отвечает по памяти.
  const used = new Set([a, total - a, 1, total - 1, g2, total - g2]);
  const fresh = pairs.map(([x]) => x).filter((x) => !used.has(x));
  const practiceX = (fresh.length ? fresh : [total - 1, 1]).slice(0, 2);
  practiceX.map((x) => [x, total - x] as const).forEach(([x, y], i) => {
    steps.push({
      id: p(`practice-${i + 1}`),
      phase: "practice",
      kind: "ask",
      task: inputTask(
        p(`practice-${i + 1}`),
        "Счёт",
        `${total} — это ${x} и сколько?`,
        String(y),
        `Представь домик: целое ${total}, часть ${x}.`,
        `${total} — это ${x} и сколько? Введи ответ в поле.`,
      ),
    });
  });

  // Перенос: найти чужую ошибку. Ответ «нет», потому что пара неверная.
  const wrong = total - a + 1;
  steps.push({
    id: p("transfer-error"),
    phase: "transfer",
    kind: "ask",
    task: choiceTask(
      p("transfer-error"),
      "Логика",
      `${story.character} говорит: «${total} — это ${a} и ${wrong}». Прав ли он?`,
      ["Прав", "Ошибся"],
      "Ошибся",
      `Сложи ${a} и ${wrong} и сравни с ${total}.`,
    ),
  });

  if (pairs.length >= 2) {
    const shown = pairs.slice(0, Math.min(3, pairs.length));
    steps.push({
      id: p("transfer-match"),
      phase: "transfer",
      kind: "match",
      skill: "Счёт",
      prompt: `Соедини части, которые вместе дают ${total}.`,
      pairs: shown.map(([x, y]) => [String(x), String(y)]),
      hint: `Для каждой части ищи ту, с которой получится ${total}.`,
    });
  }

  steps.push({
    id: p("reflect"),
    phase: "reflect",
    kind: "say",
    character: story.character,
    text: `Теперь ты знаешь, из каких частей состоит число ${total}, и находишь вторую часть по первой — без пальцев.`,
  });

  return {
    id,
    subject: "Математика",
    title: `Состав числа ${total}`,
    goal: `Знать все пары чисел, которые вместе дают ${total}, и находить вторую часть по первой`,
    requires: total === 2 ? "Счёт до 5" : `Состав числа ${total - 1}`,
    steps,
  };
}

/** «Соседи числа»: прибавить и вычесть 1 в пределах 10. */
export function neighborsLesson(): Lesson {
  const p = (suffix: string) => `mn-${suffix}`;
  const steps: Step[] = [
    {
      id: p("hook"),
      phase: "hook",
      kind: "say",
      character: "Диспетчер Ника",
      text: "На полосе стоят самолёты с номерами по порядку. Мне нужно быстро знать, кто стоит перед самолётом и кто за ним.",
    },
    {
      id: p("warm"),
      phase: "warmup",
      kind: "order",
      skill: "Счёт",
      prompt: "Поставь номера самолётов по порядку.",
      items: ["4", "5", "6", "7"],
      hint: "Начни с самого маленького числа.",
    },
    {
      id: p("trial"),
      phase: "trial",
      kind: "ask",
      task: inputTask(p("trial"), "Счёт", "Какой номер у самолёта, который стоит сразу перед номером 8?", "7", "Пока это трудно — так и должно быть. Сейчас разберёмся вместе."),
    },
    {
      id: p("explore-say"),
      phase: "explore",
      kind: "say",
      character: "Диспетчер Ника",
      text: "У каждого числа есть два соседа. Перед ним — на один меньше. После него — на один больше.",
    },
    {
      id: p("explore"),
      phase: "explore",
      kind: "bond",
      skill: "Счёт",
      prompt: "К 6 подъехал ещё 1 самолёт. Сколько стало?",
      whole: 7,
      parts: [6, 1],
      missing: "whole",
      hint: "Это следующее число после 6.",
    },
    {
      id: p("model"),
      phase: "model",
      kind: "bond",
      skill: "Счёт",
      prompt: "Было 9 самолётов, 1 улетел. Сколько осталось?",
      whole: 9,
      parts: [8, 1],
      missing: "left",
      hint: "Это число перед 9.",
    },
    {
      id: p("sign"),
      phase: "sign",
      kind: "ask",
      task: choiceTask(p("sign"), "Счёт", "Как записать: «к 6 прибавили 1, стало 7»?", ["6 + 1 = 7", "7 + 1 = 6", "6 − 1 = 7"], "6 + 1 = 7", "Было 6, прибавили 1, получилось 7."),
    },
    {
      id: p("rule"),
      phase: "rule",
      kind: "rule",
      title: "Соседи числа",
      text: "Прибавить 1 — значит назвать следующее число. Вычесть 1 — назвать предыдущее.",
    },
    {
      id: p("guided"),
      phase: "guided",
      kind: "bond",
      skill: "Счёт",
      prompt: "Было 4, добавили 1. Сколько стало?",
      whole: 5,
      parts: [4, 1],
      missing: "whole",
      hint: "Назови число после 4.",
    },
    {
      id: p("practice-1"),
      phase: "practice",
      kind: "ask",
      task: inputTask(p("practice-1"), "Счёт", "Сколько будет 8 + 1?", "9", "Какое число идёт после 8?", "Сколько будет 8 плюс 1? Введи ответ в поле."),
    },
    {
      id: p("practice-2"),
      phase: "practice",
      kind: "ask",
      task: inputTask(p("practice-2"), "Счёт", "Сколько будет 5 − 1?", "4", "Какое число стоит перед 5?", "Сколько будет 5 минус 1? Введи ответ в поле."),
    },
    {
      id: p("transfer"),
      phase: "transfer",
      kind: "match",
      skill: "Счёт",
      prompt: "Соедини пример и ответ.",
      pairs: [
        ["3 + 1", "4"],
        ["9 − 1", "8"],
        ["6 − 1", "5"],
      ],
      hint: "Плюс один — следующее число, минус один — предыдущее.",
    },
    {
      id: p("reflect"),
      phase: "reflect",
      kind: "say",
      character: "Диспетчер Ника",
      text: "Теперь ты знаешь соседей любого числа до десяти и прибавляешь и вычитаешь один без счёта на пальцах.",
    },
  ];
  return {
    id: "math-neighbors",
    subject: "Математика",
    title: "Соседи числа: ±1",
    goal: "Прибавлять и вычитать 1, называя следующее и предыдущее число",
    requires: "Счёт до 10 и обратно",
    steps,
  };
}

/** «Больше, меньше, поровну»: сравнение чисел до 10 и знаки >, <, =. */
export function compareLesson(): Lesson {
  const p = (suffix: string) => `mc-${suffix}`;
  const steps: Step[] = [
    {
      id: p("hook"),
      phase: "hook",
      kind: "say",
      character: "Стюардесса Лиза",
      text: "В салоне 7 пассажиров, а пледов только 5. Хватит ли всем? Давай научимся сравнивать числа.",
    },
    {
      id: p("warm"),
      phase: "warmup",
      kind: "ask",
      task: choiceTask(p("warm"), "Счёт", "Какое число при счёте называют позже: 3 или 6?", ["3", "6"], "6", "Посчитай от одного и послушай, что прозвучит позже."),
    },
    {
      id: p("trial"),
      phase: "trial",
      kind: "ask",
      task: choiceTask(p("trial"), "Логика", "Пассажиров 7, пледов 5. Хватит всем?", ["Хватит", "Не хватит"], "Не хватит", "Пока это трудно — так и должно быть. Сейчас разберёмся вместе."),
    },
    {
      id: p("explore-say"),
      phase: "explore",
      kind: "say",
      character: "Стюардесса Лиза",
      text: "Дадим каждому пассажиру по пледу, пока пледы не кончатся. Пять пассажиров получили плед, а двое остались без пледа. Значит, пассажиров больше.",
    },
    {
      id: p("explore"),
      phase: "explore",
      kind: "bond",
      skill: "Счёт",
      prompt: "Пассажиров 7. С пледом 5. Сколько остались без пледа?",
      whole: 7,
      parts: [5, 2],
      missing: "right",
      hint: "Сколько не хватает от 5 до 7?",
    },
    {
      id: p("model"),
      phase: "model",
      kind: "order",
      skill: "Счёт",
      prompt: "Расставь числа от меньшего к большему.",
      items: ["2", "5", "7", "9"],
      hint: "Меньшее число называют при счёте раньше.",
    },
    {
      id: p("sign"),
      phase: "sign",
      kind: "ask",
      task: choiceTask(p("sign"), "Счёт", "Какой знак поставить: 7 … 5?", [">", "<", "="], ">", "Острый носик знака смотрит на меньшее число."),
    },
    {
      id: p("rule"),
      phase: "rule",
      kind: "rule",
      title: "Больше, меньше, поровну",
      text: "Знак «больше» и знак «меньше» острым носиком смотрят на меньшее число. Знак «равно» ставят, если чисел поровну.",
    },
    {
      id: p("guided"),
      phase: "guided",
      kind: "ask",
      task: choiceTask(p("guided"), "Счёт", "Какой знак поставить: 3 … 8?", ["<", ">", "="], "<", "Меньшее число 3. Носик смотрит на него."),
    },
    {
      id: p("practice-1"),
      phase: "practice",
      kind: "ask",
      task: choiceTask(p("practice-1"), "Счёт", "Какой знак поставить: 6 … 6?", ["=", ">", "<"], "=", "Числа одинаковые."),
    },
    {
      id: p("practice-2"),
      phase: "practice",
      kind: "ask",
      task: choiceTask(p("practice-2"), "Счёт", "Какой знак поставить: 9 … 4?", [">", "<", "="], ">", "Меньшее число 4. Носик смотрит на него."),
    },
    {
      id: p("transfer"),
      phase: "transfer",
      kind: "ask",
      task: choiceTask(p("transfer"), "Логика", "Лиза записала: 2 > 5. Права ли она?", ["Права", "Ошиблась"], "Ошиблась", "Что больше: 2 или 5?"),
    },
    {
      id: p("reflect"),
      phase: "reflect",
      kind: "say",
      character: "Стюардесса Лиза",
      text: "Теперь ты сравниваешь числа до десяти и ставишь знаки «больше», «меньше» и «равно».",
    },
  ];
  return {
    id: "math-compare",
    subject: "Математика",
    title: "Больше, меньше, поровну",
    goal: "Сравнивать числа до 10 и ставить знаки >, < и =",
    requires: "Счёт до 10",
    steps,
  };
}

function capital(text: string): string {
  return text.charAt(0).toLocaleUpperCase("ru") + text.slice(1);
}
