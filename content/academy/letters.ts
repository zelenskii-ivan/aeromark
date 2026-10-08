/**
 * Буквы Академии пилотов.
 *
 * Порядок повторяет docs/METHODOLOGY.md: гласные (тянутся и сами образуют
 * слог) → сонорные М, Н, Л, Р (слияние склеивается само) → частотные глухие →
 * пары по звонкости → йотированные гласные и И → шипящие и редкие.
 *
 * Буква озвучивается только звуком, никогда названием («эм»). Синтезатор
 * отдельный согласный звук надёжно не произносит, поэтому для согласной
 * звучит опорное слово, которое с этого звука начинается, — так в букваре и
 * учат: «М — как в слове мост». Гласная звучит сама.
 */

export type LetterKind = "vowel" | "consonant" | "sign";

export type Letter = {
  /** Заглавная буква. */
  char: string;
  kind: LetterKind;
  /** Опорное слово, начинающееся с этого звука (строчными). */
  anchor: string;
  /** Картинка к опорному слову. */
  picture: string;
};

export const LETTERS: readonly Letter[] = [
  { char: "А", kind: "vowel", anchor: "арбуз", picture: "🍉" },
  { char: "У", kind: "vowel", anchor: "утка", picture: "🦆" },
  { char: "О", kind: "vowel", anchor: "облако", picture: "☁️" },
  { char: "Ы", kind: "vowel", anchor: "сыр", picture: "🧀" },
  { char: "Э", kind: "vowel", anchor: "эскимо", picture: "🍦" },
  { char: "М", kind: "consonant", anchor: "мост", picture: "🌉" },
  { char: "Н", kind: "consonant", anchor: "нос", picture: "👃" },
  { char: "Л", kind: "consonant", anchor: "лодка", picture: "🛶" },
  { char: "Р", kind: "consonant", anchor: "рыба", picture: "🐟" },
  { char: "С", kind: "consonant", anchor: "сок", picture: "🧃" },
  { char: "Т", kind: "consonant", anchor: "торт", picture: "🎂" },
  { char: "К", kind: "consonant", anchor: "кот", picture: "🐱" },
  { char: "П", kind: "consonant", anchor: "парус", picture: "⛵" },
  { char: "Х", kind: "consonant", anchor: "хлеб", picture: "🍞" },
  { char: "Ш", kind: "consonant", anchor: "шар", picture: "🎈" },
  { char: "З", kind: "consonant", anchor: "зонт", picture: "☂️" },
  { char: "Д", kind: "consonant", anchor: "дом", picture: "🏠" },
  { char: "Г", kind: "consonant", anchor: "гора", picture: "⛰️" },
  { char: "Б", kind: "consonant", anchor: "банан", picture: "🍌" },
  { char: "В", kind: "consonant", anchor: "волк", picture: "🐺" },
  { char: "Ж", kind: "consonant", anchor: "жук", picture: "🪲" },
  { char: "И", kind: "vowel", anchor: "индюк", picture: "🦃" },
  { char: "Е", kind: "vowel", anchor: "ель", picture: "🌲" },
  { char: "Я", kind: "vowel", anchor: "яблоко", picture: "🍎" },
  { char: "Ю", kind: "vowel", anchor: "юбка", picture: "👗" },
  { char: "Ё", kind: "vowel", anchor: "ёлка", picture: "🎄" },
  { char: "Й", kind: "consonant", anchor: "йогурт", picture: "🥛" },
  { char: "Ч", kind: "consonant", anchor: "чайник", picture: "🫖" },
  { char: "Щ", kind: "consonant", anchor: "щётка", picture: "🪥" },
  { char: "Ц", kind: "consonant", anchor: "цветок", picture: "🌸" },
  { char: "Ф", kind: "consonant", anchor: "флаг", picture: "🚩" },
  { char: "Ь", kind: "sign", anchor: "конь", picture: "🐴" },
];

export const letterByChar = new Map(LETTERS.map((letter) => [letter.char, letter]));

/** Звучащие буквы — у мягкого знака своего звука нет. */
export const SOUNDING = LETTERS.filter((letter) => letter.kind !== "sign");

export const VOWELS = LETTERS.filter((letter) => letter.kind === "vowel").map((l) => l.char);

/** Что звучит для буквы: гласная — сама, согласная — опорное слово. */
export const letterSpeech = (letter: Letter): string =>
  letter.kind === "vowel" ? letter.char.toLowerCase() : letter.anchor;

/**
 * Буквы, которые первоклассник путает чаще всего, — по начертанию и по звуку.
 * Из них берутся «трудные» отвлекающие варианты, когда буква уже усвоена.
 */
export const CONFUSABLE: Record<string, readonly string[]> = {
  Б: ["Д", "В", "П"],
  Д: ["Б", "Т", "Л"],
  П: ["Н", "Б", "Т"],
  Н: ["П", "И", "М"],
  И: ["Н", "Й", "Ы"],
  Й: ["И"],
  Ш: ["Щ", "Ж", "С"],
  Щ: ["Ш", "Ц", "Ч"],
  Ж: ["Ш", "З", "К"],
  З: ["С", "Ж", "Э"],
  С: ["З", "Ш", "О"],
  Т: ["Д", "П", "Г"],
  Г: ["К", "Т", "П"],
  К: ["Г", "Х", "Ж"],
  Х: ["К", "Ж"],
  Л: ["Д", "П", "М"],
  М: ["Н", "Л", "Ш"],
  Р: ["Ь", "В", "Л"],
  В: ["Б", "Ф", "Р"],
  Ф: ["В", "Р"],
  Ц: ["Щ", "Ч", "С"],
  Ч: ["Щ", "Ц", "Ш"],
  Ы: ["И", "Ь"],
  Э: ["З", "Е"],
  Е: ["Ё", "Э", "И"],
  Ё: ["Е", "О"],
  Я: ["А", "Ю"],
  Ю: ["У", "Я"],
  А: ["Я", "О"],
  О: ["Ё", "А", "У"],
  У: ["Ю", "О"],
  Ь: ["Р", "Ы"],
};

/**
 * Сочетания, которых в русском письме нет или которые первокласснику не
 * дают в слоговой таблице («жы», «шы», «чя», «щя», «кы», «гы», «хы» и т. п.).
 */
export const FORBIDDEN_SYLLABLES = new Set([
  "жы", "шы", "чы", "щы", "чя", "щя", "чю", "щю", "жя", "шя", "жю", "шю",
  "кы", "гы", "хы", "цю", "ця", "йы", "йэ", "йи", "йя", "йю", "йё", "йе",
  "жэ", "шэ", "чэ", "щэ", "цэ", "кэ", "гэ", "хэ", "цё", "жё", "шё", "чё", "щё",
  "кя", "гя", "хя", "кю", "гю", "хю", "кё", "гё", "хё",
]);
