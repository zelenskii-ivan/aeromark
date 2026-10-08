import { FORBIDDEN_SYLLABLES, LETTERS, SOUNDING, VOWELS } from "./letters.ts";
import { SENTENCES, STORIES } from "./texts.ts";
import { WORDS, plainWord, type WordShape } from "./words.ts";

/**
 * Программа Академии пилотов: шесть уровней-аэропортов, в каждом — короткие
 * уроки-полёты. Урок задаёт, ЧТО тренируем (набор единиц) и КАКИМИ
 * упражнениями; конкретные задания каждый раз собирает движок
 * (lib/academy/session.ts) с учётом того, что ребёнок уже знает.
 *
 * Единица (item) — то, что отслеживается отдельно: буква, звук в слове,
 * слог, слово, предложение, вопрос к рассказу. Ключ единицы начинается с
 * буквы навыка: L: буквы, P: звуки, S: слоги, W: слова, C: предложения,
 * Q: вопросы к рассказам.
 */

export type SkillId = "letters" | "phonemes" | "syllables" | "words" | "sentences" | "stories";

export const SKILL_PREFIX: Record<SkillId, string> = {
  letters: "L",
  phonemes: "P",
  syllables: "S",
  words: "W",
  sentences: "C",
  stories: "Q",
};

export const SKILL_TITLE: Record<SkillId, string> = {
  letters: "Буквы",
  phonemes: "Звуки",
  syllables: "Слоги",
  words: "Слова",
  sentences: "Предложения",
  stories: "Понимание рассказов",
};

export const skillOfItem = (key: string): SkillId | null => {
  const prefix = key.split(":")[0];
  const found = (Object.keys(SKILL_PREFIX) as SkillId[]).find(
    (skill) => SKILL_PREFIX[skill] === prefix,
  );
  return found ?? null;
};

export type ExerciseKind =
  /** Слышит звук (гласную или опорное слово) — находит букву. */
  | "hear-letter"
  /** Видит букву — находит картинку, слово которой начинается с этого звука. */
  | "letter-picture"
  /** Слышит слово (картинка) — выбирает первую букву. */
  | "first-sound"
  /** Слышит два слога — одинаковые или разные. */
  | "same-different"
  /** Слышит слово — есть ли в нём показанная буква. */
  | "has-letter"
  /** Сцепляет согласную с гласной и читает слог. */
  | "merge"
  /** Видит слог — выбирает, как он звучит (три кнопки-динамика). Чтение. */
  | "read-syllable"
  /** Слышит слог — находит написанный. */
  | "hear-syllable"
  /** Читает слово — выбирает картинку. Чтение, без озвучки слова. */
  | "word-picture"
  /** Слышит слово — собирает из слогов по порядку. */
  | "build-word"
  /** Читает предложение — отвечает (картинка, да/нет, пропущенное слово). */
  | "sentence"
  /** Читает рассказ — отвечает на вопросы и показывает, где написано. */
  | "story";

export type Lesson = {
  id: string;
  level: number;
  title: string;
  /** Что пилот узнает — одной фразой для карты. */
  goal: string;
  /** Единицы, которые урок вводит или тренирует. */
  focus: string[];
  exercises: ExerciseKind[];
  /** Сколько заданий в одном полёте. */
  length: number;
};

export type Level = {
  id: number;
  skill: SkillId;
  /** Название аэропорта на карте. */
  airport: string;
  title: string;
  lessons: Lesson[];
};

/**
 * Делит список на группы не больше `size`, но поровну: 17 слов по 8 дают
 * 6 + 6 + 5, а не 8 + 8 + 1 — урок из одного слова был бы бессмысленным.
 */
const chunk = <T,>(list: readonly T[], size: number): T[][] => {
  const groups = Math.max(1, Math.ceil(list.length / size));
  const base = Math.floor(list.length / groups);
  const extra = list.length % groups;
  const out: T[][] = [];
  let start = 0;
  for (let g = 0; g < groups; g += 1) {
    const length = base + (g < extra ? 1 : 0);
    out.push(list.slice(start, start + length));
    start += length;
  }
  return out;
};

export const letterKey = (char: string) => `L:${char}`;
export const phonemeKey = (char: string) => `P:${char}`;
export const syllableKey = (syllable: string) => `S:${syllable}`;
export const wordKey = (word: string) => `W:${word}`;
export const sentenceKey = (id: string) => `C:${id}`;
export const questionKey = (storyId: string, index: number) => `Q:${storyId}:${index}`;

/** Буквы, по которым можно спрашивать первый звук слова (есть слово на эту букву). */
const FIRST_SOUND = SOUNDING.filter((letter) => !["Ы", "Ь"].includes(letter.char));

// ---------- Уровень 1: буквы ----------
const letterGroups = chunk(SOUNDING, 4);
const level1: Level = {
  id: 1,
  skill: "letters",
  airport: "Аэродром «Азбука»",
  title: "Буквы",
  lessons: letterGroups.map((group, index) => ({
    id: `l1-${index + 1}`,
    level: 1,
    title: group.map((letter) => letter.char).join(" "),
    goal: `Узнаём буквы ${group.map((letter) => letter.char).join(", ")} на слух и на вид`,
    focus: group.map((letter) => letterKey(letter.char)),
    exercises: ["hear-letter", "letter-picture"],
    length: 8,
  })),
};

// ---------- Уровень 2: звуки ----------
const phonemeGroups = chunk(FIRST_SOUND, 6);
const level2: Level = {
  id: 2,
  skill: "phonemes",
  airport: "Аэропорт «Эхо»",
  title: "Звуки",
  lessons: phonemeGroups.map((group, index) => ({
    id: `l2-${index + 1}`,
    level: 2,
    title: `Слушаем звуки ${index + 1}`,
    goal: "Слышим первый звук слова и отличаем похожие слоги",
    focus: group.map((letter) => phonemeKey(letter.char)),
    exercises: ["first-sound", "same-different", "has-letter"],
    length: 8,
  })),
};

// ---------- Уровень 3: слоги ----------
const hardVowels = ["а", "о", "у", "ы", "э"];
const softVowels = ["и", "е", "я", "ю", "ё"];

const cv = (letters: string[], vowels: string[]) =>
  letters.flatMap((c) => vowels.map((v) => c.toLowerCase() + v)).filter((s) => !FORBIDDEN_SYLLABLES.has(s));

/** Все слоги, которые встречаются в программе (для озвучки). */
export const ALL_SYLLABLES: string[] = [];

const syllableLessons: { title: string; goal: string; syllables: string[] }[] = [
  { title: "МА МО МУ", goal: "Сливаем М, Н с гласными", syllables: cv(["М", "Н"], hardVowels) },
  { title: "ЛА РА", goal: "Сливаем Л, Р с гласными", syllables: cv(["Л", "Р"], hardVowels) },
  { title: "СА ТА КА", goal: "Слоги с С, Т, К", syllables: cv(["С", "Т", "К"], ["а", "о", "у", "ы"]) },
  { title: "ПА ХА ША", goal: "Слоги с П, Х, Ш", syllables: cv(["П", "Х", "Ш"], ["а", "о", "у", "ы", "и"]) },
  { title: "ЗА ДА ГА", goal: "Звонкие З, Д, Г", syllables: cv(["З", "Д", "Г"], ["а", "о", "у", "ы"]) },
  { title: "БА ВА ЖА", goal: "Звонкие Б, В, Ж", syllables: cv(["Б", "В", "Ж"], ["а", "о", "у", "ы", "и"]) },
  { title: "МИ НЕ ЛЯ", goal: "Мягкие слоги: И, Е, Я, Ю, Ё", syllables: cv(["М", "Н", "Л", "Р"], softVowels) },
  { title: "ТИ ДЕ БЮ", goal: "Ещё мягкие слоги", syllables: cv(["Т", "Д", "Б", "П", "В", "С"], ["и", "е", "я"]) },
  { title: "ЧА ЩУ ЦА", goal: "Ч, Щ, Ц и Ф", syllables: cv(["Ч", "Щ", "Ц", "Ф"], ["а", "у", "и", "о"]) },
  {
    title: "АМ ОН УК",
    goal: "Обратные слоги: гласная впереди",
    syllables: ["а", "о", "у", "ы", "и"].flatMap((v) => ["м", "н", "к", "с", "т"].map((c) => v + c)).filter((s) => !s.startsWith("ы") || ["ым", "ын", "ыт"].includes(s)),
  },
];
for (const group of syllableLessons) ALL_SYLLABLES.push(...group.syllables);

const level3: Level = {
  id: 3,
  skill: "syllables",
  airport: "Аэропорт «Слог»",
  title: "Слоги",
  lessons: syllableLessons.map((group, index) => ({
    id: `l3-${index + 1}`,
    level: 3,
    title: group.title,
    goal: group.goal,
    focus: group.syllables.map(syllableKey),
    exercises: index === syllableLessons.length - 1 ? ["read-syllable", "hear-syllable"] : ["merge", "read-syllable", "hear-syllable"],
    length: 9,
  })),
};

// ---------- Уровень 4: слова ----------
const wordStages: { shape: WordShape; title: string; goal: string }[] = [
  { shape: "cvc", title: "Короткие слова", goal: "Слова из одного слога: кот, дом" },
  { shape: "open2", title: "Два слога", goal: "Слова из двух открытых слогов: ма-ма" },
  { shape: "mixed2", title: "Слова посложнее", goal: "Два слога, один закрытый: ли-мон" },
  { shape: "long", title: "Длинные слова", goal: "Три слога и стечения согласных" },
];
const level4: Level = {
  id: 4,
  skill: "words",
  airport: "Аэропорт «Слово»",
  title: "Слова",
  lessons: wordStages.flatMap((stage, stageIndex) => {
    const words = WORDS.filter((word) => word.shape === stage.shape);
    return chunk(words, 8).map((group, index) => ({
      id: `l4-${stageIndex + 1}-${index + 1}`,
      level: 4,
      title: chunk(words, 8).length > 1 ? `${stage.title} ${index + 1}` : stage.title,
      goal: stage.goal,
      focus: group.map((word) => wordKey(plainWord(word))),
      exercises: ["word-picture", "build-word"] as ExerciseKind[],
      length: 8,
    }));
  }),
};

// ---------- Уровень 5: предложения ----------
const level5: Level = {
  id: 5,
  skill: "sentences",
  airport: "Аэропорт «Фраза»",
  title: "Предложения",
  lessons: chunk(SENTENCES, 6).map((group, index) => ({
    id: `l5-${index + 1}`,
    level: 5,
    title: `Предложения ${index + 1}`,
    goal: "Читаем предложение и понимаем его смысл",
    focus: group.map((sentence) => sentenceKey(sentence.id)),
    exercises: ["sentence"] as ExerciseKind[],
    length: 6,
  })),
};

// ---------- Уровень 6: рассказы ----------
const level6: Level = {
  id: 6,
  skill: "stories",
  airport: "Международный аэропорт «Рассказ»",
  title: "Рассказы",
  lessons: STORIES.map((story, index) => ({
    id: `l6-${index + 1}`,
    level: 6,
    title: story.title,
    goal: "Читаем рассказ, отвечаем и показываем, где это написано",
    focus: story.questions.map((_, q) => questionKey(story.id, q)),
    exercises: ["story"] as ExerciseKind[],
    length: 1,
  })),
};

export const LEVELS: readonly Level[] = [level1, level2, level3, level4, level5, level6];

export const LESSONS: readonly Lesson[] = LEVELS.flatMap((level) => level.lessons);

export const lessonById = new Map(LESSONS.map((lesson) => [lesson.id, lesson]));

export const ALL_LETTERS = LETTERS.map((letter) => letter.char);
export { VOWELS };
