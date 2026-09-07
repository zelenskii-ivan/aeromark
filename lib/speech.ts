import type { Task } from "../content/types.ts";

/**
 * Озвучка собирается из частей и очищается, а не читается «как написано».
 *
 * Прошлая версия отдавала синтезатору исходный текст задания, и русский голос
 * честно проговаривал всё подряд: «двоеточие», «кавычка», «многоточие»,
 * «тире», а список вариантов превращался в «один точка четыре точка два точка
 * пять». Отдельно ломались задания на фигуры: ▲, ● и ■ заменялись одним
 * словом «фигура», и на слух ряд был неразличим.
 */

/** Символы, у которых есть человеческое название. */
const SHAPES: Record<string, string> = {
  "▲": "треугольник",
  "●": "круг",
  "■": "квадрат",
};

const MARKS: Record<string, string> = {
  ".": "точка",
  "?": "вопросительный знак",
  "!": "восклицательный знак",
  ",": "запятая",
};

const ORDINALS = [
  "Первый вариант",
  "Второй вариант",
  "Третий вариант",
  "Четвёртый вариант",
  "Пятый вариант",
];

const VOWEL_NAMES: Record<string, string> = {
  а: "а", е: "е", ё: "ё", и: "и", о: "о", у: "у", ы: "ы", э: "э", ю: "ю", я: "я",
};

/** Знак ударения (U+0301) синтезатор не воспроизводит — проговариваем словами. */
function spellStress(text: string): string {
  const index = text.indexOf("́");
  if (index < 0) return text;
  const vowel = text[index - 1]?.toLowerCase() ?? "";
  const clean = text.replace(/́/g, "");
  const name = VOWEL_NAMES[vowel];
  return name ? `${clean}, с ударением на ${name}` : clean;
}

/**
 * Приводит фрагмент к произносимому виду: без служебных знаков, эмодзи и
 * подряд идущей пунктуации.
 */
export function prepareSpeech(text: string): string {
  let result = text;
  // Отдельно стоящий знак препинания — это и есть содержание реплики.
  const solo = result.trim();
  if (MARKS[solo]) return MARKS[solo];

  result = spellStress(result);
  // Эмодзи, вариационные селекторы и невидимые символы убираем целиком:
  // ребёнок видит их на экране, произносить их незачем.
  result = result.replace(
    /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200B}-\u{200D}\u{2190}-\u{21FF}]/gu,
    " ",
  );
  for (const [shape, word] of Object.entries(SHAPES)) {
    result = result.split(shape).join(` ${word} `);
  }
  result = result
    .replace(/(\d+)\s*\+\s*(\d+)/g, "$1 плюс $2")
    .replace(/(\d+)\s*[−–—-]\s*(\d+)/g, "$1 минус $2")
    .replace(/=/g, " равно ")
    .replace(/\bсм\b/g, "сантиметров")
    .replace(/\[([^\]]+)\]/g, "звук $1")
    // «Ракета» → Ракета: кавычки не произносятся.
    .replace(/[«»„“”"']/g, " ")
    // Слоговой дефис между буквами даёт паузу, а не слово «тире».
    .replace(/([А-Яа-яЁё])[-–—]([А-Яа-яЁё])/g, "$1, $2")
    .replace(/[—–]/g, ", ")
    .replace(/…/g, ", ")
    .replace(/:/g, ", ")
    .replace(/[();"'*_#№@%]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Схлопываем подряд идущую пунктуацию: «слога?.» читалось двумя знаками.
  result = result
    .replace(/\s+([,.?!])/g, "$1")
    .replace(/([.?!,])[.,]+/g, "$1")
    .replace(/,\s*([.?!])/g, "$1")
    .replace(/\s+/g, " ")
    // Хвостовая запятая — след от многоточия или двоеточия, паузу даст точка.
    .replace(/[\s,]+$/, "")
    .trim();
  return result;
}

/**
 * Заканчивает фразу точкой. Хвостовые запятые сначала срезаются: многоточие
 * в конце вопроса превращалось в запятую, и фраза кончалась на «,.».
 */
const finish = (text: string): string => {
  const trimmed = text.replace(/[\s,]+$/, "");
  if (!trimmed) return "";
  return /[.?!]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

/** Полная реплика для задачи: текст для чтения, вопрос и варианты ответа. */
export function speechForTask(task: Task): string {
  if (task.speech) return prepareSpeech(task.speech);
  const parts: string[] = [];
  if (task.read) parts.push(finish(prepareSpeech(task.read)));
  parts.push(finish(prepareSpeech(task.prompt)));
  if (task.options.length) {
    task.options.forEach((option, index) => {
      const label = ORDINALS[index] ?? `Вариант ${index + 1}`;
      parts.push(finish(`${label}, ${prepareSpeech(option)}`));
    });
  } else {
    parts.push("Введи ответ в поле.");
  }
  return parts.filter(Boolean).join(" ");
}

export type SpeechSegment = { text: string; lang: "ru" | "en" };

/**
 * Делит реплику на куски по алфавиту.
 *
 * В уроке английского фраза «Капитан сказал: Open the door» наполовину
 * русская, наполовину английская. Один голос прочитает её неверно в любом
 * случае: русский исказит английское, английский — русское. Поэтому куски
 * произносятся по очереди, каждый своим голосом.
 */
export function splitByScript(text: string): SpeechSegment[] {
  const segments: SpeechSegment[] = [];
  // Латинский кусок вместе с прилегающими пробелами и апострофами.
  const parts = text.split(/([A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*)*)/);
  for (const part of parts) {
    if (!part.trim()) continue;
    const lang: "ru" | "en" = /^[A-Za-z]/.test(part.trim()) ? "en" : "ru";
    const previous = segments[segments.length - 1];
    if (previous && previous.lang === lang) previous.text += ` ${part.trim()}`;
    else segments.push({ text: part.trim(), lang });
  }
  return segments;
}

let cachedVoices: SpeechSynthesisVoice[] = [];

/**
 * В Chrome первый вызов getVoices() возвращает пустой список, а голоса
 * доезжают позже событием voiceschanged. Без этой подписки русский голос
 * молча не выбирается и задание читает английский синтезатор.
 */
export function primeVoices(): () => void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return () => {};
  }
  const refresh = () => {
    const voices = speechSynthesis.getVoices();
    if (voices.length) cachedVoices = voices;
  };
  refresh();
  speechSynthesis.addEventListener("voiceschanged", refresh);
  return () => speechSynthesis.removeEventListener("voiceschanged", refresh);
}

function voiceFor(lang: "ru" | "en"): SpeechSynthesisVoice | null {
  const all = cachedVoices.length ? cachedVoices : speechSynthesis.getVoices();
  const voices = all.filter((voice) => voice.lang.toLowerCase().startsWith(lang));
  const preferred =
    lang === "ru" ? /milena|katya|alena|yuri|russian/i : /samantha|daniel|karen|google uk|google us/i;
  return voices.find((voice) => preferred.test(voice.name)) ?? voices[0] ?? null;
}

const russianVoice = (): SpeechSynthesisVoice | null => voiceFor("ru");

/** Есть ли в системе русский голос — чтобы не обещать озвучку впустую. */
export const hasRussianVoice = (): boolean => russianVoice() !== null;

export function cancelSpeech(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    speechSynthesis.cancel();
  }
}

export function speakText(text: string, slow = false): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  for (const segment of splitByScript(text)) {
    const utterance = new SpeechSynthesisUtterance(segment.text);
    utterance.lang = segment.lang === "ru" ? "ru-RU" : "en-GB";
    // Английское произносится медленнее: ребёнок слышит его впервые.
    utterance.rate = slow ? 0.62 : segment.lang === "en" ? 0.7 : 0.82;
    utterance.pitch = 1.03;
    utterance.voice = voiceFor(segment.lang);
    speechSynthesis.speak(utterance);
  }
}

export function speakTask(task: Task, slow = false): void {
  speakText(speechForTask(task), slow);
}
