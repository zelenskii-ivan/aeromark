/**
 * Банк слов. Слоги разделены дефисом — по нему экран раскрашивает слоги,
 * а упражнение «собери слово» режет слово на плитки.
 *
 * Слова отобраны так, чтобы их можно было нарисовать одной картинкой и чтобы
 * ребёнок 7 лет знал их на слух. Ударение не размечено: озвучка идёт готовыми
 * записями, где ударение уже поставлено.
 */

export type WordShape =
  /** Один закрытый слог: кот, дом. */
  | "cvc"
  /** Два открытых слога: ма-ма. */
  | "open2"
  /** Два слога с закрытым: ли-мон, ут-ка. */
  | "mixed2"
  /** Три и больше слогов или стечение согласных: ма-ши-на, слон. */
  | "long";

export type Word = {
  /** Слово со слогами через дефис, строчными. */
  syllables: string;
  picture: string;
  shape: WordShape;
};

export const WORDS: readonly Word[] = [
  // Один слог
  { syllables: "кот", picture: "🐱", shape: "cvc" },
  { syllables: "кит", picture: "🐋", shape: "cvc" },
  { syllables: "дом", picture: "🏠", shape: "cvc" },
  { syllables: "дым", picture: "💨", shape: "cvc" },
  { syllables: "сок", picture: "🧃", shape: "cvc" },
  { syllables: "сыр", picture: "🧀", shape: "cvc" },
  { syllables: "нос", picture: "👃", shape: "cvc" },
  { syllables: "рот", picture: "👄", shape: "cvc" },
  { syllables: "рак", picture: "🦞", shape: "cvc" },
  { syllables: "лук", picture: "🧅", shape: "cvc" },
  { syllables: "жук", picture: "🪲", shape: "cvc" },
  { syllables: "шар", picture: "🎈", shape: "cvc" },
  { syllables: "лес", picture: "🌲", shape: "cvc" },
  { syllables: "мёд", picture: "🍯", shape: "cvc" },
  { syllables: "суп", picture: "🍲", shape: "cvc" },
  { syllables: "бык", picture: "🐂", shape: "cvc" },
  // Два открытых слога
  { syllables: "ма-ма", picture: "👩", shape: "open2" },
  { syllables: "па-па", picture: "👨", shape: "open2" },
  { syllables: "ли-са", picture: "🦊", shape: "open2" },
  { syllables: "ры-ба", picture: "🐟", shape: "open2" },
  { syllables: "со-ва", picture: "🦉", shape: "open2" },
  { syllables: "лу-на", picture: "🌙", shape: "open2" },
  { syllables: "ко-за", picture: "🐐", shape: "open2" },
  { syllables: "ру-ка", picture: "✋", shape: "open2" },
  { syllables: "но-ги", picture: "🦵", shape: "open2" },
  { syllables: "ва-за", picture: "🏺", shape: "open2" },
  { syllables: "зи-ма", picture: "❄️", shape: "open2" },
  { syllables: "ро-за", picture: "🌹", shape: "open2" },
  { syllables: "ру-ки", picture: "🙌", shape: "open2" },
  { syllables: "ке-ды", picture: "👟", shape: "open2" },
  { syllables: "ка-ша", picture: "🥣", shape: "open2" },
  { syllables: "ре-ка", picture: "🏞️", shape: "open2" },
  // Два слога, один закрытый
  { syllables: "ли-мон", picture: "🍋", shape: "mixed2" },
  { syllables: "ба-нан", picture: "🍌", shape: "mixed2" },
  { syllables: "ут-ка", picture: "🦆", shape: "mixed2" },
  { syllables: "ар-буз", picture: "🍉", shape: "mixed2" },
  { syllables: "са-лют", picture: "🎆", shape: "mixed2" },
  { syllables: "ди-ван", picture: "🛋️", shape: "mixed2" },
  { syllables: "ка-ток", picture: "⛸️", shape: "mixed2" },
  { syllables: "по-езд", picture: "🚆", shape: "mixed2" },
  { syllables: "ко-ты", picture: "🐈", shape: "open2" },
  { syllables: "ве-дро", picture: "🪣", shape: "mixed2" },
  { syllables: "ру-чей", picture: "💧", shape: "mixed2" },
  { syllables: "пи-лот", picture: "🧑‍✈️", shape: "mixed2" },
  { syllables: "лен-та", picture: "🎀", shape: "mixed2" },
  { syllables: "ко-ро-на", picture: "👑", shape: "long" },
  // Длинные
  { syllables: "слон", picture: "🐘", shape: "long" },
  { syllables: "волк", picture: "🐺", shape: "long" },
  { syllables: "торт", picture: "🎂", shape: "long" },
  { syllables: "зонт", picture: "☂️", shape: "long" },
  { syllables: "флаг", picture: "🚩", shape: "long" },
  { syllables: "хлеб", picture: "🍞", shape: "long" },
  { syllables: "ма-ши-на", picture: "🚗", shape: "long" },
  { syllables: "ра-ке-та", picture: "🚀", shape: "long" },
  { syllables: "со-ба-ка", picture: "🐕", shape: "long" },
  { syllables: "мо-ло-ко", picture: "🥛", shape: "long" },
  { syllables: "ба-ра-бан", picture: "🥁", shape: "long" },
  { syllables: "са-мо-лёт", picture: "✈️", shape: "long" },
  { syllables: "ку-ри-ца", picture: "🐔", shape: "long" },
  { syllables: "ко-ро-ва", picture: "🐄", shape: "long" },
  { syllables: "ба-боч-ка", picture: "🦋", shape: "long" },
  { syllables: "ля-гуш-ка", picture: "🐸", shape: "long" },
  { syllables: "ка-ран-даш", picture: "✏️", shape: "long" },
  { syllables: "вер-то-лёт", picture: "🚁", shape: "long" },
  { syllables: "че-ре-па-ха", picture: "🐢", shape: "long" },
  { syllables: "ве-ло-си-пед", picture: "🚲", shape: "long" },
];

export const plainWord = (word: Word): string => word.syllables.replace(/-/g, "");
export const wordParts = (word: Word): string[] => word.syllables.split("-");

export const wordByText = new Map(WORDS.map((word) => [plainWord(word), word]));

/** Расстояние Левенштейна — для отвлекающих слов, похожих на написанное. */
export function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j]!;
      row[j] = Math.min(
        row[j]! + 1,
        row[j - 1]! + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous = current;
    }
  }
  return row[b.length]!;
}
