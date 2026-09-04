import {
  choiceTask,
  inputTask,
  withCount,
  type Noun,
  type Skill,
  type Task,
} from "./types.ts";

/**
 * Детерминированный ГПСЧ (mulberry32). Нужен, чтобы тренировку можно было
 * воспроизвести в тестах и чтобы у одного ребёнка не выпадали два одинаковых
 * примера подряд из-за перерисовки компонента.
 */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(random: () => number, items: readonly T[]): T =>
  items[Math.floor(random() * items.length) % items.length] as T;

const intBetween = (random: () => number, min: number, max: number): number =>
  min + Math.floor(random() * (max - min + 1));

/** Варианты ответа: правильный плюс правдоподобные соседи, без повторов. */
function numericOptions(
  random: () => number,
  answer: number,
  spread = 3,
): string[] {
  const options = new Set<number>([answer]);
  let guard = 0;
  while (options.size < 3 && guard++ < 40) {
    const delta = intBetween(random, -spread, spread);
    const candidate = answer + delta;
    if (candidate >= 0 && candidate !== answer) options.add(candidate);
  }
  return shuffle(random, [...options]).map(String);
}

function shuffle<T>(random: () => number, items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

/**
 * Формы существительного для 1 / 2-4 / 5+. Приложение учит русскому языку,
 * поэтому «13 дирижабльов» и «2 самолётов» здесь недопустимы.
 */
const PLANES: readonly Noun[] = [
  ["самолёт", "самолёта", "самолётов"],
  ["вертолёт", "вертолёта", "вертолётов"],
  ["планер", "планера", "планеров"],
  ["дирижабль", "дирижабля", "дирижаблей"],
];

const PARTS: Noun = ["деталь", "детали", "деталей"];
const CARDS: Noun = ["карта", "карты", "карт"];

const SYLLABLE_WORDS: ReadonlyArray<{ word: string; syllables: string }> = [
  { word: "самолёт", syllables: "са-мо-лёт" },
  { word: "пилот", syllables: "пи-лот" },
  { word: "ракета", syllables: "ра-ке-та" },
  { word: "ангар", syllables: "ан-гар" },
  { word: "полоса", syllables: "по-ло-са" },
  { word: "крыло", syllables: "кры-ло" },
  { word: "штурман", syllables: "штур-ман" },
  { word: "кабина", syllables: "ка-би-на" },
  { word: "маршрут", syllables: "марш-рут" },
  { word: "турбина", syllables: "тур-би-на" },
];

const SOUND_WORDS = [
  "крыло",
  "полёт",
  "штурвал",
  "ангар",
  "трап",
  "мотор",
  "шасси",
  "борт",
] as const;

const VOWELS = "аеёиоуыэюя";

const countSyllables = (word: string): number =>
  [...word.toLowerCase()].filter((letter) => VOWELS.includes(letter)).length;

/** Первый звук слова в школьной записи — [к], [ш]… */
const firstSound = (word: string): string => `[${word[0]?.toLowerCase() ?? ""}]`;

type Generator = (random: () => number, id: string) => Task;

const addition: Generator = (random, id) => {
  const limit = random() < 0.5 ? 10 : 20;
  const left = intBetween(random, 2, limit - 2);
  const right = intBetween(random, 1, limit - left);
  const answer = left + right;
  const plane = pick(random, PLANES);
  const arrived =
    right === 1 ? "прилетел ещё один" : `прилетело ещё ${right}`;
  return choiceTask(
    id,
    "Счёт",
    `На полосе стояло ${withCount(left, plane)}, ${arrived}. Сколько стало?`,
    numericOptions(random, answer),
    String(answer),
    `Прибавь ${right} к ${left}. Можно посчитать по одному.`,
  );
};

const subtraction: Generator = (random, id) => {
  const total = intBetween(random, 4, 20);
  const gone = intBetween(random, 1, total - 1);
  const answer = total - gone;
  const taken =
    gone === 1 ? "одну унесли" : `${withCount(gone, PARTS)} унесли`;
  return choiceTask(
    id,
    "Счёт",
    `В ангаре было ${withCount(total, PARTS)}, ${taken}. Сколько осталось?`,
    numericOptions(random, answer),
    String(answer),
    `От ${total} убери ${gone}.`,
  );
};

const wordProblem: Generator = (random, id) => {
  const first = intBetween(random, 2, 9);
  const second = intBetween(random, 1, 9);
  const answer = first + second;
  const given =
    second === 1 ? "выдали ещё одну" : `выдали ещё ${withCount(second, CARDS)}`;
  const prompt = `У штурмана ${withCount(first, CARDS)}, и ему ${given}. Сколько карт стало?`;
  return inputTask(
    id,
    "Задачи",
    prompt,
    String(answer),
    "Слово «ещё» подсказывает: нужно сложить.",
    `${prompt} Введи ответ в поле.`,
  );
};

const neighbourNumber: Generator = (random, id) => {
  const value = intBetween(random, 2, 19);
  const after = random() < 0.5;
  const answer = after ? value + 1 : value - 1;
  return choiceTask(
    id,
    "Счёт",
    // «после числом» — прежняя формулировка не согласовывалась по падежу.
    `Какое число идёт сразу ${after ? "после" : "перед"} числ${after ? "а" : "ом"} ${value}?`,
    numericOptions(random, answer, 2),
    String(answer),
    `Назови числа по порядку рядом с ${value}.`,
  );
};

const syllableCount: Generator = (random, id) => {
  const entry = pick(random, SYLLABLE_WORDS);
  const answer = countSyllables(entry.word);
  return choiceTask(
    id,
    "Слоги",
    `Сколько слогов в слове «${entry.word}»?`,
    shuffle(random, [answer, answer + 1, Math.max(1, answer - 1)]
      .filter((value, index, all) => all.indexOf(value) === index)
      .map(String)),
    String(answer),
    `Произнеси по слогам: ${entry.syllables}. Сколько гласных — столько и слогов.`,
  );
};

const firstSoundTask: Generator = (random, id) => {
  const word = pick(random, SOUND_WORDS);
  const answer = firstSound(word);
  // Разные слова дают одинаковый первый звук («шасси» и «штурвал» — оба [ш]),
  // поэтому отвлекающие варианты дедуплицируются, иначе в списке был бы дубль.
  const distractors = [
    ...new Set(
      shuffle(random, [...SOUND_WORDS])
        .map(firstSound)
        .filter((sound) => sound !== answer),
    ),
  ].slice(0, 2);
  return choiceTask(
    id,
    "Звуки",
    `С какого звука начинается слово «${word}»?`,
    shuffle(random, [answer, ...distractors]),
    answer,
    `Протяни первый звук: ${word[0]}-${word[0]}-${word}.`,
  );
};

/* --- Логика --- */

const SHAPES = ["▲", "●", "■"] as const;

const patternTask: Generator = (random, id) => {
  // Период 2 или 3: длиннее первоклассник уже не удерживает в голове.
  const period = random() < 0.6 ? 2 : 3;
  const base = shuffle(random, [...SHAPES]).slice(0, period);
  const length = period === 2 ? 6 : 6;
  const row = Array.from({ length }, (_, i) => base[i % period] as string);
  const answer = base[length % period] as string;
  return choiceTask(
    id,
    "Логика",
    `Продолжи ряд: ${row.join(" ")} …`,
    shuffle(random, [...SHAPES]),
    answer,
    `Фигуры повторяются по ${period === 2 ? "две" : "три"}. Посмотри, с чего начинается ряд.`,
  );
};

const ODD_SETS: ReadonlyArray<{ theme: string; fits: readonly string[]; odd: readonly string[] }> = [
  {
    theme: "нужно пилоту в полёте",
    fits: ["карта", "шлем", "компас", "рация"],
    odd: ["кастрюля", "подушка", "лейка", "тапочки"],
  },
  {
    theme: "часть самолёта",
    fits: ["крыло", "хвост", "шасси", "иллюминатор"],
    odd: ["парус", "колокол", "вилка", "ветка"],
  },
  {
    theme: "бывает в небе",
    fits: ["облако", "радуга", "птица", "звезда"],
    odd: ["диван", "морковь", "чайник", "ботинок"],
  },
];

const oddOneOutTask: Generator = (random, id) => {
  const set = pick(random, ODD_SETS);
  const odd = pick(random, set.odd);
  const fits = shuffle(random, [...set.fits]).slice(0, 2);
  return choiceTask(
    id,
    "Логика",
    "Что здесь лишнее?",
    shuffle(random, [...fits, odd]),
    odd,
    `Два слова подходят к теме «${set.theme}», а одно — нет.`,
  );
};

/* --- Предложение --- */

const SENTENCES = [
  "Самолёт летит высоко",
  "Пилот проверил приборы",
  "Ракета поднялась в небо",
  "Штурман открыл карту",
  "Механик починил мотор",
] as const;

const sentenceWritingTask: Generator = (random, id) => {
  const sentence = pick(random, SENTENCES);
  const lower = sentence[0]!.toLocaleLowerCase("ru") + sentence.slice(1);
  return choiceTask(
    id,
    "Предложение",
    "Выбери правильно записанное предложение.",
    shuffle(random, [`${sentence}.`, `${lower}.`, sentence]),
    `${sentence}.`,
    "Первое слово — с большой буквы, в конце предложения — точка.",
  );
};

const PUNCTUATION: ReadonlyArray<{ text: string; mark: string; why: string }> = [
  { text: "Куда летит этот самолёт", mark: "?", why: "Это вопрос." },
  { text: "Как высоко мы поднялись", mark: "!", why: "Это восклицание." },
  { text: "Самолёт стоит в ангаре", mark: ".", why: "Это спокойное сообщение." },
  { text: "Кто сегодня ведёт борт", mark: "?", why: "Это вопрос." },
  { text: "Какой красивый закат", mark: "!", why: "Это восклицание." },
  { text: "Механик проверил шасси", mark: ".", why: "Это спокойное сообщение." },
];

const punctuationTask: Generator = (random, id) => {
  const item = pick(random, PUNCTUATION);
  return choiceTask(
    id,
    "Предложение",
    `Какой знак нужен в конце: «${item.text}…»`,
    shuffle(random, [".", "?", "!"]),
    item.mark,
    item.why,
  );
};

/* --- Понимание текста --- */

type Person = { name: string; role: string; male: boolean };

const PEOPLE: readonly Person[] = [
  { name: "Марк", role: "пилот", male: true },
  { name: "Пётр", role: "штурман", male: true },
  { name: "Аня", role: "механик", male: false },
  { name: "Лиза", role: "инженер", male: false },
];

type Action = { m: string; f: string };

const ACTIONS: readonly Action[] = [
  { m: "проверил приборы", f: "проверила приборы" },
  { m: "включил мотор", f: "включила мотор" },
  { m: "открыл карту", f: "открыла карту" },
  { m: "надел шлем", f: "надела шлем" },
  { m: "поднял трап", f: "подняла трап" },
  { m: "закрыл иллюминатор", f: "закрыла иллюминатор" },
];

const form = (action: Action, person: Person) => (person.male ? action.m : action.f);

const readingTask: Generator = (random, id) => {
  const person = pick(random, PEOPLE);
  const [first, second, third] = shuffle(random, [...ACTIONS]) as [Action, Action, Action];
  const askFirst = random() < 0.5;
  const read = `${person.role[0]!.toLocaleUpperCase("ru")}${person.role.slice(1)} ${person.name} сначала ${form(first, person)}, потом ${form(second, person)}.`;
  return choiceTask(
    id,
    "Понимание текста",
    `Что ${person.name} ${person.male ? "сделал" : "сделала"} ${askFirst ? "сначала" : "потом"}?`,
    shuffle(random, [form(first, person), form(second, person), form(third, person)]),
    form(askFirst ? first : second, person),
    `Найди в тексте слово «${askFirst ? "сначала" : "потом"}» и посмотри, что идёт за ним.`,
    read,
  );
};

const GENERATORS: ReadonlyArray<{ skill: Skill; make: Generator }> = [
  { skill: "Счёт", make: addition },
  { skill: "Счёт", make: subtraction },
  { skill: "Счёт", make: neighbourNumber },
  { skill: "Задачи", make: wordProblem },
  { skill: "Слоги", make: syllableCount },
  { skill: "Звуки", make: firstSoundTask },
  { skill: "Логика", make: patternTask },
  { skill: "Логика", make: oddOneOutTask },
  { skill: "Предложение", make: sentenceWritingTask },
  { skill: "Предложение", make: punctuationTask },
  { skill: "Понимание текста", make: readingTask },
];

export const GENERATED_SKILLS: readonly Skill[] = [
  ...new Set(GENERATORS.map((entry) => entry.skill)),
];

/**
 * Бесконечная тренировка. `focus` смещает выбор к слабому навыку, но не делает
 * его единственным: чередование удерживает внимание ребёнка лучше, чем
 * двадцать однотипных примеров подряд.
 */
/** Есть ли для навыка процедурные задачи — интерфейс не должен обещать лишнего. */
export const canGenerate = (skill: Skill): boolean =>
  GENERATORS.some((entry) => entry.skill === skill);

export function generateTask(seed: number, focus?: Skill): Task {
  const random = createRandom(seed);
  const focused = focus
    ? GENERATORS.filter((entry) => entry.skill === focus)
    : [];
  // Тема-фокус даёт примерно семь задач из десяти: чередование удерживает
  // внимание ребёнка лучше, чем двадцать однотипных примеров подряд.
  const pool = focused.length && random() < 0.7 ? focused : GENERATORS;
  return pick(random, pool).make(random, `gen:${seed}`);
}

export function generateSession(
  count: number,
  seed: number,
  focus?: Skill,
): Task[] {
  return Array.from({ length: count }, (_, index) =>
    generateTask(seed + index * 7919, focus),
  );
}
