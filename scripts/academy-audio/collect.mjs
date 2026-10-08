/**
 * Собирает все реплики Академии, которые должны звучать готовой записью.
 * Запуск: node --experimental-strip-types scripts/academy-audio/collect.mjs > list.json
 *
 * Категории задают темп синтеза:
 *  - unit — звук, слог, слово: медленно и чётко;
 *  - text — предложение или вопрос: спокойный темп чтения;
 *  - voice — реплики штурмана: обычный темп.
 */
import { ALL_SYLLABLES } from "../../content/academy/curriculum.ts";
import { FORBIDDEN_SYLLABLES, LETTERS, SOUNDING } from "../../content/academy/letters.ts";
import { WORDS, plainWord } from "../../content/academy/words.ts";
import { FLIGHT_TEXTS, SENTENCES, STORIES } from "../../content/academy/texts.ts";
import { INSTRUCTIONS, PRAISE, RETRY, UI_PHRASES } from "../../content/academy/phrases.ts";
import { audioKey } from "../../lib/academy/audio-key.ts";

const out = new Map();
const add = (text, category) => {
  const key = audioKey(text);
  if (!key || out.has(key)) return;
  out.set(key, { key, text, category });
};

for (const letter of LETTERS) {
  if (letter.kind === "vowel") add(letter.char.toLowerCase(), "unit");
  add(letter.anchor, "unit");
}
// Все допустимые открытые слоги (слоговая таблица, «одинаковые/разные») и обратные.
const vowels = ["а", "о", "у", "ы", "э", "и", "е", "я", "ю", "ё"];
for (const consonant of SOUNDING.filter((l) => l.kind === "consonant" && l.char !== "Й")) {
  for (const vowel of vowels) {
    const syllable = consonant.char.toLowerCase() + vowel;
    if (!FORBIDDEN_SYLLABLES.has(syllable)) add(syllable, "unit");
  }
}
for (const syllable of ALL_SYLLABLES) add(syllable, "unit");
for (const word of WORDS) {
  add(plainWord(word), "unit");
  for (const part of word.syllables.split("-")) add(part, "unit");
}
for (const sentence of SENTENCES) {
  add(sentence.kind === "complete" ? sentence.text.replace("___", sentence.answer) : sentence.text, "text");
  if (sentence.kind === "yesno") add(sentence.question, "voice");
}
for (const story of STORIES) {
  add(story.title, "text");
  for (const line of story.sentences) add(line, "text");
  for (const q of story.questions) add(q.question, "voice");
}
for (const text of FLIGHT_TEXTS) {
  add(text.title, "text");
  for (const line of text.text.match(/[^.!?]+[.!?]+/g) ?? []) add(line.trim(), "text");
  for (const q of text.questions) add(q.question, "voice");
}
for (const line of [...Object.values(INSTRUCTIONS), ...PRAISE, ...RETRY, ...UI_PHRASES]) add(line, "voice");

process.stdout.write(JSON.stringify([...out.values()], null, 1));
