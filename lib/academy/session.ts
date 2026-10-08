import {
  ALL_SYLLABLES,
  LESSONS,
  letterKey,
  skillOfItem,
  type ExerciseKind,
  type Lesson,
  type SkillId,
} from "../../content/academy/curriculum.ts";
import {
  CONFUSABLE,
  FORBIDDEN_SYLLABLES,
  LETTERS,
  SOUNDING,
  letterByChar,
  letterSpeech,
} from "../../content/academy/letters.ts";
import { SENTENCES, STORIES, type Sentence, type Story } from "../../content/academy/texts.ts";
import { WORDS, editDistance, plainWord, wordByText, wordParts } from "../../content/academy/words.ts";
import { accuracy, isDue, needsPractice, skillSummary } from "./mastery.ts";
import type { Academy } from "./state.ts";

/**
 * Сборка полёта (урока) из заданий.
 *
 * 1. План: какие единицы и каким упражнением. Около двух третей — материал
 *    текущего урока, треть — повторение: то, что пора повторить по интервалу,
 *    и то, что даётся трудно. Одна единица — не больше двух раз за полёт и
 *    никогда два раза подряд.
 * 2. Задание собирается прямо перед показом, с текущей трудностью: после
 *    двух ошибок подряд вариантов становится меньше, при уверенном навыке —
 *    больше и они похожее.
 *
 * Всё детерминировано от «зерна»: один и тот же полёт собирается одинаково,
 * это упрощает тесты и разбор ошибок.
 */

export type Rng = () => number;

export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const hashSeed = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export function shuffle<T>(list: readonly T[], rng: Rng): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const pick = <T,>(list: readonly T[], rng: Rng): T => list[Math.floor(rng() * list.length)]!;

// ---------- План полёта ----------

export type PlanStep = { item: string; kind: ExerciseKind };

/** Каким упражнением повторять единицу вне её урока. */
const REVIEW_KIND: Record<SkillId, ExerciseKind[]> = {
  letters: ["hear-letter", "letter-picture"],
  phonemes: ["first-sound", "has-letter"],
  syllables: ["read-syllable", "hear-syllable"],
  words: ["word-picture", "build-word"],
  sentences: ["sentence"],
  stories: [],
};

/** Пул повторения: что пора повторить и что даётся трудно, кроме фокуса. */
export function reviewPool(academy: Academy, day: number, exclude: Set<string>): string[] {
  return Object.entries(academy.items)
    .filter(([key]) => !exclude.has(key))
    .filter(([key]) => {
      const skill = skillOfItem(key);
      return skill !== null && REVIEW_KIND[skill].length > 0;
    })
    .filter(([, stat]) => needsPractice(stat) || isDue(stat, day))
    .sort((a, b) => {
      const weakA = needsPractice(a[1]) ? 0 : 1;
      const weakB = needsPractice(b[1]) ? 0 : 1;
      return weakA - weakB || a[1][3] - b[1][3] || a[1][4] - b[1][4];
    })
    .map(([key]) => key);
}

/** Раскладывает список так, чтобы одинаковые единицы не стояли рядом. */
function spread(steps: PlanStep[], rng: Rng): PlanStep[] {
  const pool = shuffle(steps, rng);
  const out: PlanStep[] = [];
  const remaining = (item: string) => pool.filter((step) => step.item === item).length;
  while (pool.length) {
    const last = out[out.length - 1]?.item;
    // Сначала то, чего осталось больше всего: иначе повторы скапливаются в
    // конце и неизбежно встают рядом.
    let best = -1;
    for (let i = 0; i < pool.length; i += 1) {
      if (pool[i]!.item === last) continue;
      if (best === -1 || remaining(pool[i]!.item) > remaining(pool[best]!.item)) best = i;
    }
    out.push(...pool.splice(best === -1 ? 0 : best, 1));
  }
  return out;
}

export function planLesson(academy: Academy, lesson: Lesson, day: number, seed: number): PlanStep[] {
  const rng = seeded(seed);
  if (lesson.exercises.includes("story")) {
    return [{ item: lesson.focus[0]!, kind: "story" }];
  }
  const focusSet = new Set(lesson.focus);
  const review = reviewPool(academy, day, focusSet);
  const reviewCount = Math.min(Math.floor(lesson.length / 3), review.length);
  const focusCount = lesson.length - reviewCount;

  // Сначала то, чего ребёнок ещё не видел и что слабее всего.
  const focusOrder = [...lesson.focus].sort((a, b) => {
    const sa = academy.items[a];
    const sb = academy.items[b];
    return (sa ? sa[3] : -1) - (sb ? sb[3] : -1);
  });
  const steps: PlanStep[] = [];
  const used = new Map<string, number>();
  let cursor = 0;
  while (steps.length < focusCount && cursor < focusOrder.length * 2) {
    const item = focusOrder[cursor % focusOrder.length]!;
    cursor += 1;
    if ((used.get(item) ?? 0) >= 2) continue;
    used.set(item, (used.get(item) ?? 0) + 1);
    steps.push({ item, kind: lesson.exercises[steps.length % lesson.exercises.length]! });
  }
  for (const item of shuffle(review.slice(0, Math.max(reviewCount * 2, reviewCount)), rng).slice(0, reviewCount)) {
    const skill = skillOfItem(item)!;
    steps.push({ item, kind: pick(REVIEW_KIND[skill], rng) });
  }
  return spread(steps, rng);
}

/** Свободный полёт: слабое и «пора повторить» по всем открытым навыкам, плюс новое. */
export function planPractice(academy: Academy, day: number, seed: number, length = 10): PlanStep[] {
  const rng = seeded(seed);
  const pool = reviewPool(academy, day, new Set());
  const steps: PlanStep[] = pool.slice(0, length).map((item) => ({
    item,
    kind: pick(REVIEW_KIND[skillOfItem(item)!], rng),
  }));
  if (steps.length < length) {
    // Добираем из текущего урока, а если и он пуст — из первого.
    const lesson = LESSONS.find((item) => !academy.lessons[item.id]?.done) ?? LESSONS[0]!;
    const extra = planLesson(academy, lesson, day, seed + 1).filter((step) => step.kind !== "story");
    steps.push(...extra.slice(0, length - steps.length));
  }
  if (steps.length < length) {
    // Совсем новичок: повторяем первые буквы.
    for (const letter of SOUNDING.slice(0, length - steps.length)) {
      steps.push({ item: letterKey(letter.char), kind: "hear-letter" });
    }
  }
  return spread(steps, rng);
}

// ---------- Трудность ----------

/** 1 — облегчённо (2 варианта), 2 — обычно (3), 3 — уверенно (4, похожие). */
export type Difficulty = 1 | 2 | 3;

/**
 * Базовая трудность — по навыку в целом, затем поправка по ходу полёта:
 * две ошибки подряд — проще, четыре верных подряд — сложнее.
 */
export function difficultyFor(academy: Academy, skill: SkillId, recent: boolean[]): Difficulty {
  const summary = skillSummary(academy, skill);
  let base: Difficulty = 2;
  if (summary.attempts >= 10 && summary.accuracy < 0.6) base = 1;
  else if (summary.seen >= 5 && summary.mastery >= 0.7 && summary.accuracy >= 0.85) base = 3;
  const last = recent.slice(-4);
  if (last.length >= 2 && !last[last.length - 1] && !last[last.length - 2]) return 1;
  if (last.length === 4 && last.every(Boolean) && base < 3) return (base + 1) as Difficulty;
  return base;
}

const optionCount = (difficulty: Difficulty) => difficulty + 1;

// ---------- Задания ----------

export type Picture = { word: string; picture: string };

export type Exercise =
  | { kind: "hear-letter"; item: string; letter: string; say: string; options: string[] }
  | { kind: "letter-picture"; item: string; letter: string; options: Picture[]; answer: string }
  | { kind: "first-sound"; item: string; word: string; picture: string; options: string[]; answer: string }
  | { kind: "same-different"; item: string; a: string; b: string; same: boolean }
  | { kind: "has-letter"; item: string; word: string; picture: string; letter: string; answer: boolean }
  | { kind: "merge"; item: string; consonant: string; vowel: string; syllable: string; options: string[] }
  | { kind: "read-syllable"; item: string; syllable: string; options: string[] }
  | { kind: "hear-syllable"; item: string; syllable: string; options: string[] }
  | { kind: "word-picture"; item: string; word: string; parts: string[]; options: Picture[] }
  | { kind: "build-word"; item: string; word: string; parts: string[]; picture: string; tiles: string[] }
  | { kind: "sentence"; item: string; sentence: Sentence }
  | { kind: "story"; item: string; story: Story };

/** Отвлекающие буквы: при высокой трудности — похожие, иначе — любые знакомые. */
function letterOptions(target: string, difficulty: Difficulty, rng: Rng, pool: string[]): string[] {
  const similar = difficulty === 3 ? [...(CONFUSABLE[target] ?? [])] : [];
  const others = shuffle(pool.filter((char) => char !== target && !similar.includes(char)), rng);
  const distractors = [...shuffle(similar, rng), ...others].slice(0, optionCount(difficulty) - 1);
  return shuffle([target, ...distractors], rng);
}

/** Слова, похожие на целевое написанием, — их картинки и будут вариантами. */
function similarWords(target: string, count: number, rng: Rng, close: boolean): string[] {
  const candidates = WORDS.map(plainWord).filter((word) => word !== target);
  const targetPicture = wordByText.get(target)?.picture;
  const usable = candidates.filter((word) => wordByText.get(word)?.picture !== targetPicture);
  if (!close) return shuffle(usable, rng).slice(0, count);
  return shuffle(usable, rng)
    .sort((a, b) => editDistance(a, target) - editDistance(b, target))
    .slice(0, count);
}

function syllableOptions(target: string, difficulty: Difficulty, rng: Rng): string[] {
  const vowelSwap = ALL_SYLLABLES.filter((s) => s !== target && s[0] === target[0]);
  const consonantSwap = ALL_SYLLABLES.filter((s) => s !== target && s.slice(1) === target.slice(1));
  const near = difficulty >= 2 ? [...vowelSwap, ...consonantSwap] : [];
  const far = ALL_SYLLABLES.filter((s) => s !== target && !near.includes(s));
  const distractors = [...shuffle(near, rng), ...shuffle(far, rng)];
  const unique = [...new Set(distractors)].slice(0, optionCount(difficulty) - 1);
  return shuffle([target, ...unique], rng);
}

const knownLetters = (academy: Academy): string[] => {
  const seen = SOUNDING.map((letter) => letter.char).filter((char) => academy.items[letterKey(char)]);
  return seen.length >= 4 ? seen : SOUNDING.slice(0, 8).map((letter) => letter.char);
};

export function buildExercise(
  step: PlanStep,
  academy: Academy,
  difficulty: Difficulty,
  seed: number,
): Exercise {
  const rng = seeded(seed);
  const [prefix, ...rest] = step.item.split(":");
  const value = rest.join(":");

  if (prefix === "L" || prefix === "P") {
    const letter = letterByChar.get(value) ?? LETTERS[0]!;
    const pool = Array.from(new Set([...knownLetters(academy), ...SOUNDING.slice(0, 12).map((l) => l.char)]));
    const kind = step.kind;
    if (kind === "letter-picture") {
      const others = shuffle(
        LETTERS.filter((l) => l.char !== letter.char && l.kind !== "sign" && l.char !== "Ы"),
        rng,
      ).slice(0, optionCount(difficulty) - 1);
      return {
        kind,
        item: step.item,
        letter: letter.char,
        answer: letter.anchor,
        options: shuffle(
          [{ word: letter.anchor, picture: letter.picture }, ...others.map((l) => ({ word: l.anchor, picture: l.picture }))],
          rng,
        ),
      };
    }
    if (kind === "first-sound" || (kind === "same-different" && letter.char === "Й")) {
      return {
        kind: "first-sound",
        item: step.item,
        word: letter.anchor,
        picture: letter.picture,
        answer: letter.char,
        options: letterOptions(letter.char, difficulty, rng, pool.filter((c) => c !== "Ы")),
      };
    }
    if (kind === "same-different" && letter.char !== "Й") {
      const vowel = pick(["а", "о", "у"], rng);
      const make = (char: string) =>
        letterByChar.get(char)?.kind === "vowel" ? `м${char.toLowerCase()}` : `${char.toLowerCase()}${vowel}`;
      const a = make(letter.char);
      const candidates = (CONFUSABLE[letter.char] ?? [])
        .filter((char) => letterByChar.get(char)?.kind === letter.kind && char !== "Й")
        .map(make)
        .filter((syllable) => syllable !== a && !FORBIDDEN_SYLLABLES.has(syllable));
      const different = candidates.length ? pick(candidates, rng) : a === "ма" ? "на" : "ма";
      const same = rng() < 0.5;
      return { kind, item: step.item, a, b: same ? a : different, same };
    }
    if (kind === "has-letter") {
      const yes = rng() < 0.5;
      const containing = WORDS.filter((w) => plainWord(w).includes(letter.char.toLowerCase()));
      const missing = WORDS.filter((w) => !plainWord(w).includes(letter.char.toLowerCase()));
      const source = yes && containing.length ? containing : missing;
      const word = pick(source.length ? source : WORDS, rng);
      return {
        kind,
        item: step.item,
        word: plainWord(word),
        picture: word.picture,
        letter: letter.char,
        answer: plainWord(word).includes(letter.char.toLowerCase()),
      };
    }
    // hear-letter (по умолчанию)
    return {
      kind: "hear-letter",
      item: step.item,
      letter: letter.char,
      say: letterSpeech(letter),
      options: letterOptions(letter.char, difficulty, rng, pool),
    };
  }

  if (prefix === "S") {
    const syllable = value;
    if (step.kind === "hear-syllable") {
      return { kind: "hear-syllable", item: step.item, syllable, options: syllableOptions(syllable, difficulty, rng) };
    }
    if (step.kind === "merge" && syllable.length === 2 && !"аоуыэиеяюё".includes(syllable[0]!)) {
      return {
        kind: "merge",
        item: step.item,
        consonant: syllable[0]!,
        vowel: syllable[1]!,
        syllable,
        options: syllableOptions(syllable, Math.max(2, difficulty) as Difficulty, rng),
      };
    }
    return { kind: "read-syllable", item: step.item, syllable, options: syllableOptions(syllable, difficulty, rng) };
  }

  if (prefix === "W") {
    const word = wordByText.get(value) ?? WORDS[0]!;
    const text = plainWord(word);
    if (step.kind === "build-word" && wordParts(word).length > 1) {
      const decoy = pick(ALL_SYLLABLES.filter((s) => !wordParts(word).includes(s)), rng);
      const tiles = difficulty === 1 ? wordParts(word) : [...wordParts(word), decoy];
      return { kind: "build-word", item: step.item, word: text, parts: wordParts(word), picture: word.picture, tiles: shuffle(tiles, rng) };
    }
    const distractors = similarWords(text, optionCount(difficulty) - 1, rng, difficulty >= 2);
    return {
      kind: "word-picture",
      item: step.item,
      word: text,
      parts: wordParts(word),
      options: shuffle(
        [word, ...distractors.map((w) => wordByText.get(w)!)].map((w) => ({ word: plainWord(w), picture: w.picture })),
        rng,
      ),
    };
  }

  if (prefix === "C") {
    const sentence = SENTENCES.find((item) => item.id === value) ?? SENTENCES[0]!;
    return { kind: "sentence", item: step.item, sentence };
  }

  const storyId = value.split(":")[0];
  const story = STORIES.find((item) => item.id === storyId) ?? STORIES[0]!;
  return { kind: "story", item: step.item, story };
}

/** Какую единицу засчитывает ответ на вопрос рассказа. */
export const storyQuestionItem = (story: Story, index: number) => `Q:${story.id}:${index}`;

/** Слабые единицы, которые стоит показать родителю как «что тренировать». */
export function hardest(academy: Academy, limit = 6): string[] {
  return Object.entries(academy.items)
    .filter(([, stat]) => stat[0] >= 2)
    .sort((a, b) => accuracy(a[1]) - accuracy(b[1]))
    .slice(0, limit)
    .map(([key]) => key);
}
