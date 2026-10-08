import { AUDIO_MANIFEST } from "../../content/academy/audio-manifest.ts";
import { readValue, writeValue } from "../storage.ts";
import { speakText } from "../speech.ts";
import { audioKey } from "./audio-key.ts";

/**
 * Озвучка Академии.
 *
 * Основной путь — готовые записи (public/audio/academy): одинаково звучат на
 * любом устройстве, правильно произносят отдельный слог, работают офлайн.
 * Запасной — синтезатор браузера (lib/speech.ts), для фраз без записи.
 *
 * Скорость регулируется playbackRate с сохранением высоты голоса: медленно —
 * без «пьяного» баса. Один элемент <audio> на всё приложение: новая реплика
 * обрывает старую, а не накладывается.
 */

export const RATE_KEY = "aeromark-voice-rate";
export const RATES = [
  { value: 0.75, label: "Медленно" },
  { value: 1, label: "Обычно" },
] as const;

export function getRate(): number {
  const raw = Number(readValue(RATE_KEY));
  return RATES.some((rate) => rate.value === raw) ? raw : 0.75;
}

export function setRate(value: number): void {
  writeValue(RATE_KEY, String(value));
}

export const clipFor = (text: string): string | null => {
  const entry = AUDIO_MANIFEST[audioKey(text)];
  return entry ? `/audio/academy/${entry.file}` : null;
};

export const hasClip = (text: string): boolean => clipFor(text) !== null;

let element: HTMLAudioElement | null = null;
let token = 0;
let sequence = 0;

function audioElement(): HTMLAudioElement | null {
  if (typeof window === "undefined" || typeof Audio === "undefined") return null;
  if (!element) {
    element = new Audio();
    element.preload = "auto";
    const pitch = element as HTMLAudioElement & { webkitPreservesPitch?: boolean; mozPreservesPitch?: boolean };
    pitch.preservesPitch = true;
    pitch.webkitPreservesPitch = true;
    pitch.mozPreservesPitch = true;
  }
  return element;
}

/**
 * iOS Safari разрешает звук только элементу, который хоть раз запускали из
 * обработчика нажатия. Вызывается из нажатия «Поехали» — после этого
 * реплики можно запускать и из эффектов.
 */
export function unlockAudio(): void {
  const audio = audioElement();
  if (!audio) return;
  const first = Object.values(AUDIO_MANIFEST)[0];
  if (!first) return;
  audio.muted = true;
  audio.src = `/audio/academy/${first.file}`;
  void audio
    .play()
    .then(() => {
      audio.pause();
      audio.muted = false;
    })
    .catch(() => {
      audio.muted = false;
    });
}

export function stopAudio(): void {
  token += 1;
  sequence += 1;
  if (element) {
    element.pause();
    element.onended = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) speechSynthesis.cancel();
}

/** Воспроизводит одну реплику. Промис завершается, когда она отзвучала. */
export function play(text: string, rate = getRate()): Promise<void> {
  stopAudio();
  const mine = ++token;
  const src = clipFor(text);
  const audio = audioElement();
  if (!src || !audio) {
    speakText(text, rate < 1);
    return new Promise((resolve) => setTimeout(resolve, Math.min(4000, 400 + text.length * 70)));
  }
  return new Promise((resolve) => {
    const done = () => {
      if (mine === token) audio.onended = null;
      resolve();
    };
    audio.onended = done;
    audio.src = src;
    audio.playbackRate = rate;
    audio.play().catch(() => {
      // Браузер не дал играть (нет жеста, ошибка сети) — говорим синтезатором.
      if (mine === token) speakText(text, rate < 1);
      setTimeout(done, 600);
    });
  });
}

/** Несколько реплик подряд с паузой — «послушай два слога». */
export async function playSequence(texts: string[], gapMs = 450, rate = getRate()): Promise<void> {
  stopAudio();
  const mine = sequence;
  for (let i = 0; i < texts.length; i += 1) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, gapMs));
    // Кто-то запустил другую реплику — эту последовательность бросаем.
    if (sequence !== mine) return;
    const before = sequence;
    await play(texts[i]!, rate);
    if (sequence !== before + 1) return;
    sequence = before;
  }
}

/**
 * Подгружает записи следующих заданий заранее: короткая задержка перед
 * звуком сбивает ребёнка сильнее, чем кажется. Service worker кладёт их в
 * кеш, поэтому повторно они грузятся мгновенно и офлайн.
 */
export function preload(texts: string[]): void {
  if (typeof window === "undefined") return;
  for (const text of texts) {
    const src = clipFor(text);
    if (src) void fetch(src).catch(() => {});
  }
}
