import { CLASSIC_READINGS } from "../academy/classics.ts";
import { FLIGHT_TEXTS } from "../academy/texts.ts";
import { PRACTICE_CONTINUATIONS } from "./continuations.ts";
import { PRACTICE } from "./practice.ts";
import { tokenize } from "../../lib/karaoke/model.ts";

export type ReadingText = {
  id: string; title: string; author: string; level: string;
  annotated: string; source: string; rights: string; curriculum: string;
  questions: { prompt: string; options: string[]; correct: number }[];
};

/** Vertical bars are curated instructional syllable boundaries, never word
 * separators. They are hidden in the normal/whole-word reading view. */
const ORIGINAL_READING_TEXTS: ReadingText[] = [
  {
    id: "ushinsky-kindness-v1", title: "Худо тому, кто добра не делает никому", author: "К. Д. Ушинский",
    level: "Из программы · читаем со взрослым",
    annotated: "«Гри|шень|ка! О|дол|жи мне на ми|нут|ку ка|ран|даш». А Гри|шень|ка в от|вет: «Но|си свой, мой мне са|мо|му ну|жен». «Гри|ша! По|мо|ги мне у|ло|жить кни|ги в сум|ку». А Гри|ша в от|вет: «Кни|ги тво|и, сам их и у|кла|ды|вай». Лю|би|ли ли Гри|шу то|ва|ри|щи?",
    source: "https://www.kostyor.ru/literature/liter105.html",
    rights: "Оригинальное произведение Ушинского (1823–1870), общественное достояние в РФ. Разметка слогов AeroMark — CC0. Оформление источника не воспроизводится.",
    curriculum: "Произведение прямо названо в ФРП литературного чтения, 1 класс (2025), раздел «Я и мои друзья». Полный текст; заглавие не входит в замер.",
    questions: [
      { prompt: "Что попросили у Гришеньки в первый раз?", options: ["Карандаш", "Сумку", "Книгу"], correct: 0 },
      { prompt: "Как Гриша ответил на просьбу помочь?", options: ["Помог уложить книги", "Отказался помогать", "Позвал товарища"], correct: 1 },
    ],
  },
  {
    id: "mark-cat-v1", title: "Марк и кот", author: "Авторский учебный микротекст AeroMark",
    level: "Старт · короткие слова",
    annotated: "У Мар|ка кот. Кот спит. Марк на|лил ко|ту во|ды. Кот встал и стал пить. Марк рад.",
    source: "", rights: "Создан для AeroMark; разрешены использование, изменение и распространение без ограничений (CC0).",
    curriculum: "Подготовительное упражнение: плавное слоговое чтение и понимание. Не произведение из перечня ФРП.",
    questions: [
      { prompt: "Что Марк дал коту?", options: ["Воду", "Молоко", "Кашу"], correct: 0 },
      { prompt: "Что кот делал в начале?", options: ["Бежал", "Спал", "Пил"], correct: 1 },
    ],
  },
  {
    id: "mark-boat-v1", title: "Лодка", author: "Авторский учебный микротекст AeroMark",
    level: "Следующий шаг · небольшой рассказ",
    annotated: "Ма|ма и Марк у пру|да. У Мар|ка лод|ка. Он пус|тил лод|ку на во|ду. Ве|тер пог|нал е|ё к бе|ре|гу. Там бы|ла у|тка. Марк дос|тал лод|ку и по|ма|хал у|тке.",
    source: "", rights: "Создан для AeroMark; разрешены использование, изменение и распространение без ограничений (CC0).",
    curriculum: "Подготовительное упражнение: последовательность событий, ответы на вопросы. Не произведение из перечня ФРП.",
    questions: [
      { prompt: "Куда ветер погнал лодку?", options: ["К дому", "К берегу", "В лес"], correct: 1 },
      { prompt: "Кто был у берега?", options: ["Кот", "Пёс", "Утка"], correct: 2 },
    ],
  },
  ...PRACTICE.map((row, i): ReadingText => ({
    id: `practice-${i + 1}-v1`, title: row[0],
    author: "Авторский учебный микротекст AeroMark",
    level: "Практика · новый рассказ", annotated: row[1], source: "",
    rights: "Создан для AeroMark; разрешены использование, изменение и распространение без ограничений (CC0).",
    curriculum: "Подготовительное упражнение: слоговое чтение и понимание. Не произведение из перечня ФРП.",
    questions: [
      { prompt: row[2], options: [row[3], row[4], row[5]], correct: 0 },
      { prompt: row[6], options: [row[7], row[8], row[9]], correct: 1 },
    ],
  })),
];

const continuations = {
  "mark-cat-v1": "Кот подошёл к окну. На ветке сидела птица. Кот хотел её поймать, но окно было закрыто. Он сел на тёплый коврик. Марк провёл рукой по его спине. Кот замурлыкал и снова закрыл глаза. Марк поставил миску рядом с ковриком.",
  "mark-boat-v1": "Утка проплыла мимо и скрылась за камышами. Марк поставил лодку на камень и проверил, не набрала ли она воды. Лодка была сухая. Тогда Марк выбрал место, где ветер дул вдоль берега. Мама держала край верёвочки, которую они привязали к лодке. Лодка пошла ровно, не поворачивая к камышам. Марк потянул за верёвочку, и она подплыла обратно. Потом он нашёл на земле маленькую палочку. Он поставил её на лодку как мачту. Дома Марк захотел сделать для мачты цветной флаг.",
};

/** Adds reading cues to new prose. Preserve the editorial cues on the original
 * opening paragraphs and keep й, ь and ъ with the preceding sound group. */
function annotate(text: string) {
  function chunk(word: string) {
    const vowels = [...word.matchAll(/[аеёиоуыэюя]/gi)].map(match => match.index!);
    let result = "";
    let from = 0;
    for (let i = 1; i < vowels.length; i++) {
      const previous = vowels[i - 1]!;
      const current = vowels[i]!;
      let cut = previous + 1;
      while (cut < current && /[йьъ]/i.test(word[cut]!)) cut++;
      if (cut + 1 < current && /[ьъ]/i.test(word[cut + 1]!)) cut += 2;
      result += word.slice(from, cut) + "|";
      from = cut;
    }
    return result + word.slice(from);
  }
  return text.replace(/[а-яё]+(?:[-‑][а-яё]+)*/gi, word => word.split(/(?<=[-‑])/).map(chunk).join("|"));
}

const LONG_PRACTICE = ORIGINAL_READING_TEXTS.slice(1).map((text, index): ReadingText => {
  const continuation = index < 2 ? continuations[text.id as keyof typeof continuations] : PRACTICE_CONTINUATIONS[index - 2]!;
  return {
    ...text,
    id: text.id.replace(/-v1$/, "-v2"),
    level: "Практика · длинный рассказ",
    annotated: text.annotated + "\n\n" + annotate(continuation),
  };
});

const LONG_CLASSICS = CLASSIC_READINGS.map((text): ReadingText => ({
  id: text.id,
  title: text.title,
  author: text.form === "retelling" ? `По мотивам · ${text.author}` : text.author,
  level: text.form === "retelling" ? "Классика · пересказ" : text.form === "excerpt" ? "Классика · отрывок" : "Классика · оригинал",
  annotated: annotate(text.text),
  source: text.source,
  rights: text.form === "retelling" ? "Учебный пересказ AeroMark. Ссылка ведёт к произведению." :
    "Произведение Л. Н. Толстого в общественном достоянии. Использован текст из собрания сочинений.",
  curriculum: "Текст для практики чтения вслух, плавности и понимания.",
  questions: text.questions.map(q => ({ prompt: q.question, options: q.options, correct: q.options.indexOf(q.answer) })),
}));

const TIMED_PRACTICE = FLIGHT_TEXTS.filter(text => !text.author).map((text): ReadingText => ({
  id: text.id, title: text.title === "Утро" ? "Утро перед школой" : text.title,
  author: "Учебный рассказ AeroMark", level: "Практика · длинный рассказ",
  annotated: annotate(text.text), source: "",
  rights: "Учебный рассказ AeroMark.",
  curriculum: "Текст для практики чтения вслух, плавности и понимания.",
  questions: text.questions.map(q => ({ prompt: q.question, options: q.options, correct: q.options.indexOf(q.answer) })),
}));

export const READING_TEXTS = [...LONG_PRACTICE, ...LONG_CLASSICS, ...TIMED_PRACTICE];
export const READING_TEXT_ARCHIVE = [...READING_TEXTS, ...ORIGINAL_READING_TEXTS];

export function prepareText(item: ReadingText) {
  const plain = item.annotated.replaceAll("|", "");
  const words = tokenize(plain);
  // Map manually reviewed boundaries onto lexical tokens; no heuristic Russian syllabifier.
  const boundaries: number[] = [];
  let offset = 0;
  for (const char of item.annotated) {
    if (char === "|") boundaries.push(offset);
    else offset += char.length;
  }
  const parts = words.map(word => {
    const cuts = [word.start, ...boundaries.filter(b => b > word.start && b < word.end), word.end];
    return cuts.slice(1).map((end, i) => plain.slice(cuts[i], end));
  });
  return { plain, words, parts };
}
