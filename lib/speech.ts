import type { Task } from "../content/types.ts";

/**
 * Готовит текст к синтезу: браузерные голоса читают «5+3» и «[к]» как мусор,
 * а дефис в «са-мо-лёт» проглатывают вместе с паузой.
 */
export function prepareSpeech(text: string): string {
  return text
    .replace(/(\d+)\s*\+\s*(\d+)/g, "$1 плюс $2")
    .replace(/(\d+)\s*[−–-]\s*(\d+)/g, "$1 минус $2")
    .replace(/=/g, " равно ")
    .replace(/\bсм\b/g, "сантиметров")
    .replace(/\[([^\]]+)\]/g, "звук $1")
    .replace(/([А-Яа-яЁё])-(?=[А-Яа-яЁё])/g, "$1, ")
    .replace(/[▲●■]/g, " фигура ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Полная реплика для задачи: текст для чтения, вопрос и варианты ответа. */
export function speechForTask(task: Task): string {
  if (task.speech) return task.speech;
  const variants = task.options.length
    ? ` Варианты ответа: ${task.options
        .map((option, index) => `${index + 1}. ${option}`)
        .join(". ")}.`
    : " Введи ответ в поле.";
  return `${task.read ? `${task.read}. ` : ""}${task.prompt}.${variants}`;
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

function russianVoice(): SpeechSynthesisVoice | null {
  const voices = (
    cachedVoices.length ? cachedVoices : speechSynthesis.getVoices()
  ).filter((voice) => voice.lang.toLowerCase().startsWith("ru"));
  return (
    voices.find((voice) => /milena|katya|alena|yuri|russian/i.test(voice.name)) ??
    voices[0] ??
    null
  );
}

export function cancelSpeech(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    speechSynthesis.cancel();
  }
}

export function speakTask(task: Task, slow = false): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(
    prepareSpeech(speechForTask(task)),
  );
  utterance.lang = "ru-RU";
  utterance.rate = slow ? 0.68 : 0.78;
  utterance.pitch = 1.03;
  utterance.voice = russianVoice();
  speechSynthesis.speak(utterance);
}
