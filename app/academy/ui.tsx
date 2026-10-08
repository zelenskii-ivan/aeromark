"use client";

import { useEffect, useState } from "react";
import { Rabbit, Snail, Volume2 } from "lucide-react";
import { getRate, play, RATES, setRate } from "@/lib/academy/audio";

/**
 * Общие детали интерфейса Академии.
 *
 * Цвета букв — школьные (docs/METHODOLOGY.md): гласная красная, твёрдая
 * согласная синяя, мягкая зелёная. Ребёнок видит их и в букваре, и здесь.
 */

const VOWELS = new Set("аоуыэяёюие");
const SOFTENERS = new Set("яёюиеь");
const ALWAYS_SOFT = new Set("чщй");
const ALWAYS_HARD = new Set("жшц");

export type LetterTone = "vowel" | "hard" | "soft" | "sign";

export function letterTones(text: string): LetterTone[] {
  const lower = text.toLocaleLowerCase("ru");
  return [...lower].map((char, index) => {
    if (VOWELS.has(char)) return "vowel";
    if (char === "ь" || char === "ъ") return "sign";
    if (ALWAYS_SOFT.has(char)) return "soft";
    if (ALWAYS_HARD.has(char)) return "hard";
    return SOFTENERS.has(lower[index + 1] ?? "") ? "soft" : "hard";
  });
}

/** Слово или слог, буквы раскрашены по школьным правилам. */
export function Colored({ text, className = "" }: { text: string; className?: string }) {
  const tones = letterTones(text);
  return (
    <span className={`ac-colored ${className}`} aria-label={text}>
      {[...text].map((char, index) => (
        <span key={index} className={`tone-${tones[index]}`} aria-hidden="true">
          {char}
        </span>
      ))}
    </span>
  );
}

/** Слово, разбитое на слоги, — подсказка «читай по кусочкам». */
export function SyllableSplit({ parts }: { parts: string[] }) {
  return (
    <span className="ac-split">
      {parts.map((part, index) => (
        <span key={index} className="ac-split-part">
          <Colored text={part} />
        </span>
      ))}
    </span>
  );
}

/** Большая кнопка «послушать». */
export function SpeakButton({
  text,
  label = "Послушать",
  big = false,
  onPlay,
}: {
  text: string | string[];
  label?: string;
  big?: boolean;
  onPlay?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    onPlay?.();
    setBusy(true);
    const list = Array.isArray(text) ? text : [text];
    for (const item of list) await play(item);
    setBusy(false);
  };
  return (
    <button
      type="button"
      className={`ac-speak ${big ? "big" : ""} ${busy ? "busy" : ""}`}
      onClick={run}
      aria-label={label}
    >
      <Volume2 aria-hidden="true" />
      {big ? null : <span>{label}</span>}
    </button>
  );
}

/** Переключатель скорости озвучки: улитка / кролик. */
export function RateToggle() {
  const [rate, setValue] = useState<number>(1);
  useEffect(() => {
    // Читаем после монтирования: на сервере localStorage нет.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue(getRate());
  }, []);
  const next = rate === RATES[0].value ? RATES[1].value : RATES[0].value;
  const slow = rate < 1;
  return (
    <button
      type="button"
      className="ac-rate"
      onClick={() => {
        setRate(next);
        setValue(next);
      }}
      aria-label={slow ? "Голос медленно. Сделать обычно" : "Голос обычно. Сделать медленно"}
      title={slow ? "Медленно" : "Обычно"}
    >
      {slow ? <Snail aria-hidden="true" /> : <Rabbit aria-hidden="true" />}
    </button>
  );
}

/** Самолёт для карты и ангара — простой силуэт, раскрашенный цветом модели. */
export function PlaneIcon({ color = "#0866a5", size = 48 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="ac-plane-icon">
      <path
        d="M32 4c2.6 0 4 2.4 4 5.5V24l22 12v6l-22-6v13l7 5v5l-11-3-11 3v-5l7-5V36L6 42v-6l22-12V9.5C28 6.4 29.4 4 32 4z"
        fill={color}
        stroke="#10243e"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="14" r="2.6" fill="#eaf8ff" />
    </svg>
  );
}
