import { readValue, writeValue } from "./storage.ts";

/**
 * Реакция на ответ: короткий звук и салют из шаров.
 *
 * Просили пользователи: ребёнку нужен ощутимый отклик, а не только строчка
 * «Верно». Два ограничения, из которых выросло всё остальное.
 *
 * Первое: сторонние библиотеки и файлы со звуком исключены. На сайте стоит
 * CSP `script-src 'self'`, а приложение обязано работать офлайн — значит ни
 * конфетти с CDN, ни mp3, который надо скачать. Звук синтезируется на месте
 * Web Audio, шары рисуются CSS.
 *
 * Второе: неверный ответ не наказывают. Ребёнок семи лет ошибается постоянно,
 * и резкий «проигрышный» звук за каждую ошибку отучает пробовать. Поэтому на
 * ошибку — мягкий низкий отклик и лёгкое покачивание карточки, без сирены и
 * без красного мигания.
 */

export const SOUND_KEY = "aeromark-sound";

/** Звук включён, пока родитель не выключил его явно. */
export function isSoundOn(read: (key: string) => string | null = readValue): boolean {
  return read(SOUND_KEY) !== "off";
}

export function setSoundOn(
  value: boolean,
  write: (key: string, value: string) => void = writeValue,
): void {
  write(SOUND_KEY, value ? "on" : "off");
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Ctor = new () => AudioContext;

let audio: AudioContext | null = null;

/**
 * Контекст создаётся при первом ответе, а не при загрузке страницы: браузер
 * разрешает звук только после действия пользователя, и контекст, созданный
 * раньше, остаётся навсегда приостановленным.
 */
function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx: Ctor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
  if (!Ctx) return null;
  try {
    audio ??= new Ctx();
    if (audio.state === "suspended") void audio.resume();
    return audio;
  } catch {
    return null;
  }
}

type Note = { hz: number; at: number; length: number; gain: number };

/** Одна нота с плавным нарастанием и спадом: без них слышен щелчок. */
function tone(ctx: AudioContext, note: Note, wave: OscillatorType): void {
  const start = ctx.currentTime + note.at;
  const osc = ctx.createOscillator();
  const level = ctx.createGain();
  osc.type = wave;
  osc.frequency.value = note.hz;
  level.gain.setValueAtTime(0.0001, start);
  level.gain.exponentialRampToValueAtTime(note.gain, start + 0.015);
  level.gain.exponentialRampToValueAtTime(0.0001, start + note.length);
  osc.connect(level).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + note.length + 0.02);
}

function play(notes: Note[], wave: OscillatorType): void {
  if (!isSoundOn()) return;
  const ctx = context();
  if (!ctx) return;
  for (const note of notes) tone(ctx, note, wave);
}

/** Короткое восходящее трезвучие — «получилось». Примерно треть секунды. */
export function playWin(): void {
  play(
    [
      { hz: 783.99, at: 0, length: 0.1, gain: 0.11 },
      { hz: 1046.5, at: 0.09, length: 0.1, gain: 0.11 },
      { hz: 1318.51, at: 0.18, length: 0.22, gain: 0.12 },
    ],
    "triangle",
  );
}

/** Две мягкие нисходящие ноты — «не вышло, пробуем ещё». Не порицание. */
export function playMiss(): void {
  play(
    [
      { hz: 392, at: 0, length: 0.16, gain: 0.07 },
      { hz: 311.13, at: 0.14, length: 0.24, gain: 0.06 },
    ],
    "sine",
  );
}

export type Particle = {
  /** Отступ слева в процентах ширины карточки. */
  left: number;
  /** Задержка старта в секундах — чтобы шары не летели строем. */
  delay: number;
  duration: number;
  /** Горизонтальный снос в пикселях: шар качает по дороге вверх. */
  drift: number;
  /** Поворот для конфетти в градусах. */
  spin: number;
  hue: number;
  balloon: boolean;
};

const PALETTE = [4, 30, 48, 140, 200, 260, 320];

/**
 * Раскладка салюта. Вынесена отдельно и детерминирована при заданном
 * генераторе — иначе проверить, что шары не улетают за карточку и не стоят
 * в одну линию, можно было бы только глазами.
 */
export function makeParticles(count: number, random: () => number = Math.random): Particle[] {
  const items: Particle[] = [];
  for (let index = 0; index < count; index += 1) {
    const balloon = index % 3 !== 0;
    // Позиции распределяются по полосам, а не случайно по всей ширине:
    // случайные числа сбиваются в кучу, и половина карточки остаётся пустой.
    const band = (index + 0.5) / count;
    const jitter = (random() - 0.5) * (0.8 / count);
    items.push({
      left: Math.min(0.96, Math.max(0.04, band + jitter)) * 100,
      delay: random() * 0.35,
      duration: balloon ? 1.6 + random() * 0.7 : 1.1 + random() * 0.5,
      drift: (random() - 0.5) * 70,
      spin: (random() - 0.5) * 720,
      hue: PALETTE[Math.floor(random() * PALETTE.length)] ?? 200,
      balloon,
    });
  }
  return items;
}
