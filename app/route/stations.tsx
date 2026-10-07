"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Volume2 } from "lucide-react";
import {
  COUPLE_CONSONANTS,
  COUPLE_GOAL,
  COUPLE_VOWELS,
  ENDING_ITEMS,
  ENDINGS_PER_SESSION,
  SYLLABLE_WORDS,
  TABLE_SIZE,
  TABLE_SYLLABLES,
  WORDS_PER_SESSION,
  type Story,
} from "@/content/route";
import { pickForDay, splitSyllables } from "@/lib/route";
import { speakText } from "@/lib/speech";

/**
 * Упражнения остановок. Озвучивается только задание: варианты ответа и сам
 * текст для чтения ребёнок читает сам — иначе он будет слушать, а не читать.
 * Кнопка «Проверить себя» проговаривает уже прочитанное, чтобы ребёнок мог
 * сверить себя без взрослого.
 */

type DoneProps = { onDone: () => void; seed: string };

export function SpeakButton({ text, label = "Послушать задание" }: { text: string; label?: string }) {
  return (
    <button type="button" className="route-speak" onClick={() => speakText(text)}>
      <Volume2 aria-hidden="true" />
      {label}
    </button>
  );
}

function Dots({ done, total }: { done: number; total: number }) {
  return (
    <div className="route-dots" aria-label={`Готово ${done} из ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < done ? "on" : ""} />
      ))}
    </div>
  );
}

/** Парковка: согласная-вагон + гласная-буква = слог. */
export function CoupleStation({ onDone }: DoneProps) {
  const [c, setC] = useState<string>(COUPLE_CONSONANTS[0]);
  const [v, setV] = useState<string>(COUPLE_VOWELS[0]);
  const [read, setRead] = useState<string[]>([]);
  const syllable = c + v;
  const already = read.includes(syllable);

  const confirm = () => {
    if (already) return;
    const next = [...read, syllable];
    setRead(next);
    if (next.length >= COUPLE_GOAL) onDone();
  };

  return (
    <div className="route-exercise">
      <Dots done={read.length} total={COUPLE_GOAL} />
      <div className="tram" aria-live="polite">
        <span className="tram-car cons">{c}</span>
        <span className="tram-hitch" aria-hidden="true" />
        <span className="tram-car vow">{v}</span>
        <i className="rails" aria-hidden="true" />
      </div>
      <p className="route-label">Вагон</p>
      <div className="letter-row" role="radiogroup" aria-label="Вагон">
        {COUPLE_CONSONANTS.map((letter) => (
          <button
            key={letter}
            type="button"
            role="radio"
            aria-checked={letter === c}
            className={`letter cons ${letter === c ? "on" : ""}`}
            onClick={() => setC(letter)}
          >
            {letter}
          </button>
        ))}
      </div>
      <p className="route-label">Буква</p>
      <div className="letter-row" role="radiogroup" aria-label="Буква">
        {COUPLE_VOWELS.map((letter) => (
          <button
            key={letter}
            type="button"
            role="radio"
            aria-checked={letter === v}
            className={`letter vow ${letter === v ? "on" : ""}`}
            onClick={() => setV(letter)}
          >
            {letter}
          </button>
        ))}
      </div>
      <div className="big-syllable">{syllable}</div>
      <div className="route-actions">
        <button type="button" className="route-btn soft" onClick={() => speakText(syllable.toLowerCase())}>
          Проверить себя
        </button>
        <button type="button" className="route-btn go" disabled={already} onClick={confirm}>
          {already ? "Этот слог уже был" : "Прочитал!"}
        </button>
      </div>
      {read.length > 0 && <p className="route-note">Прочитано: {read.join(", ")}</p>}
    </div>
  );
}

/** Школа: слоговая таблица, подсвеченный слог читается вслух. */
export function TableStation({ onDone, seed }: DoneProps) {
  const cells = useMemo(() => pickForDay(TABLE_SYLLABLES, TABLE_SIZE, seed), [seed]);
  const [index, setIndex] = useState(0);
  const [started, setStarted] = useState<number | null>(null);
  const [seconds, setSeconds] = useState<number | null>(null);

  const next = () => {
    const now = Date.now();
    const start = started ?? now;
    if (started === null) setStarted(now);
    if (index >= cells.length - 1) {
      setSeconds(Math.max(1, Math.round((now - start) / 1000)));
      setIndex(cells.length);
      onDone();
      return;
    }
    setIndex(index + 1);
  };

  return (
    <div className="route-exercise">
      <Dots done={Math.min(index, cells.length)} total={cells.length} />
      <div className="syllable-grid">
        {cells.map((cell, i) => (
          <span key={cell} className={i === index ? "lit" : i < index ? "past" : ""}>
            {cell}
          </span>
        ))}
      </div>
      {seconds !== null ? (
        <p className="route-note strong">Вся таблица за {seconds} сек. Завтра попробуй быстрее!</p>
      ) : (
        <div className="route-actions">
          <button type="button" className="route-btn go" onClick={next}>
            {index === 0 && started === null ? "Начать" : "Дальше"}
          </button>
        </div>
      )}
    </div>
  );
}

/** Остановка «Каляева»: слоги склеиваются в слово. */
export function WordsStation({ onDone, seed }: DoneProps) {
  const words = useMemo(
    () => pickForDay(SYLLABLE_WORDS, WORDS_PER_SESSION, seed).map((word) => word.split("-")),
    [seed],
  );
  const [index, setIndex] = useState(0);
  const [part, setPart] = useState(0);
  const word = words[index] ?? [];
  const joined = part >= word.length;

  const advance = () => {
    if (!joined) {
      setPart(part + 1);
      return;
    }
    if (index >= words.length - 1) {
      onDone();
      return;
    }
    setIndex(index + 1);
    setPart(0);
  };

  return (
    <div className="route-exercise">
      <Dots done={index + (joined ? 1 : 0)} total={words.length} />
      <div className={`word-train ${joined ? "joined" : ""}`}>
        {word.map((syllable, i) => (
          <span key={i} className={i < part ? "read" : i === part ? "lit" : ""}>
            {syllable}
          </span>
        ))}
      </div>
      {joined && <div className="big-syllable">{word.join("")}</div>}
      <div className="route-actions">
        {joined && (
          <button
            type="button"
            className="route-btn soft"
            onClick={() => speakText(word.join("").toLowerCase())}
          >
            Проверить себя
          </button>
        )}
        <button type="button" className="route-btn go" onClick={advance}>
          {!joined
            ? part === word.length - 1
              ? "Прочитал — склеить"
              : "Прочитал слог"
            : index === words.length - 1
              ? "Готово!"
              : "Следующее слово"}
        </button>
      </div>
    </div>
  );
}

/** Остановка «Октябрьская»: какое слово подходит к предложению. */
export function EndingsStation({ onDone, seed }: DoneProps) {
  const items = useMemo(() => pickForDay(ENDING_ITEMS, ENDINGS_PER_SESSION, seed), [seed]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const item = items[index] ?? ENDING_ITEMS[0]!;
  const right = picked === item.answer;
  const [before, after] = item.text.split("___");

  const next = () => {
    if (index >= items.length - 1) {
      onDone();
      return;
    }
    setIndex(index + 1);
    setPicked(null);
  };

  return (
    <div className="route-exercise">
      <Dots done={index + (right ? 1 : 0)} total={items.length} />
      <p className="sentence">
        {before}
        <b className={right ? "filled" : "blank"}>{right ? item.answer : "…"}</b>
        {after}
      </p>
      <div className="choice-row">
        {item.options.map((option) => (
          <button
            key={option}
            type="button"
            disabled={right}
            className={`choice ${picked === option ? (option === item.answer ? "good" : "try") : ""}`}
            onClick={() => setPicked(option)}
          >
            {option}
          </button>
        ))}
      </div>
      <div aria-live="polite">
        {picked && !right && (
          <p className="route-note">Прочитай предложение ещё раз вместе с этим словом. Звучит?</p>
        )}
      </div>
      {right && (
        <div className="route-actions">
          <button type="button" className="route-btn go" onClick={next}>
            {index === items.length - 1 ? "Готово!" : "Дальше"}
          </button>
        </div>
      )}
    </div>
  );
}

/** Сквер: рассказ со слогами по цветам и вопрос на понимание. */
export function StoryStation({ onDone, story }: { onDone: () => void; story: Story }) {
  const [readDone, setReadDone] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const words = useMemo(() => splitSyllables(story.text), [story.text]);
  let counter = 0;

  return (
    <div className="route-exercise">
      <div className="story-card">
        {words.map((word, w) => (
          <span key={w} className="story-word">
            {word.map((part, p) => (
              <span key={p} className={counter++ % 2 ? "syl-b" : "syl-a"}>
                {part}
              </span>
            ))}
          </span>
        ))}
      </div>
      {!readDone ? (
        <div className="route-actions">
          <button type="button" className="route-btn go" onClick={() => setReadDone(true)}>
            Я прочитал
          </button>
        </div>
      ) : (
        <>
          <div className="question-row">
            <SpeakButton text={story.question} label="Вопрос" />
            <h3>{story.question}</h3>
          </div>
          <div className="choice-row three">
            {story.options.map((option) => (
              <button
                key={option}
                type="button"
                disabled={picked === story.answer}
                className={`choice ${picked === option ? (option === story.answer ? "good" : "try") : ""}`}
                onClick={() => {
                  setPicked(option);
                  if (option === story.answer) onDone();
                }}
              >
                {option}
              </button>
            ))}
          </div>
          <div aria-live="polite">
            {picked && picked !== story.answer && (
              <p className="route-note">Найди ответ в рассказе и попробуй ещё раз.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Минута чтения — режим для взрослого. Ребёнок читает вслух, взрослый
 * тапает по словам с ошибкой, а в конце — по слову, где остановились.
 */
export function MinuteCheck({
  text,
  onSave,
}: {
  text: string;
  onSave: (result: { words: number; errors: number }) => void;
}) {
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  const [left, setLeft] = useState(60);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<"err" | "stop">("err");
  const [errors, setErrors] = useState<Set<number>>(new Set());
  const [stop, setStop] = useState<number | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    timer.current = window.setInterval(() => {
      setLeft((value) => {
        if (value <= 1) {
          setRunning(false);
          setMode("stop");
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [running]);

  const tap = (i: number) => {
    if (mode === "stop") {
      setStop(i);
      // Дочитал раньше минуты — останавливаем часы, скорость пересчитаем.
      setRunning(false);
      return;
    }
    setErrors((current) => {
      const next = new Set(current);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const readCount = stop === null ? 0 : stop + 1;
  const errorCount = [...errors].filter((i) => stop === null || i <= stop).length;
  const elapsed = 60 - left;
  // Дочитал весь текст раньше минуты — приводим к словам в минуту. В любом
  // другом случае считаем прочитанные слова как есть: взрослый мог нажать
  // «Тут остановились» заранее, и пересчёт дал бы неправдоподобную скорость.
  const finishedEarly = stop === words.length - 1 && elapsed >= 10 && elapsed < 60;
  const perMinute = finishedEarly ? Math.round((readCount * 60) / elapsed) : readCount;

  return (
    <div className="route-exercise minute">
      <div className="minute-top">
        <div className="minute-clock" aria-live="off">
          {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
        </div>
        <p>
          {left === 60 && !running
            ? "Нажмите «Старт», когда ребёнок начнёт читать."
            : left === 0
              ? "Время! Нажмите на слово, где остановились."
              : "Нажимайте на слова, где была ошибка."}
        </p>
      </div>
      <div className="mode-row">
        {left === 60 && !running ? (
          <button type="button" className="route-btn go" onClick={() => setRunning(true)}>
            Старт
          </button>
        ) : (
          <>
            <button
              type="button"
              aria-pressed={mode === "err"}
              className={`mode ${mode === "err" ? "on" : ""}`}
              onClick={() => setMode("err")}
            >
              Ошибка
            </button>
            <button
              type="button"
              aria-pressed={mode === "stop"}
              className={`mode ${mode === "stop" ? "on" : ""}`}
              onClick={() => setMode("stop")}
            >
              Тут остановились
            </button>
          </>
        )}
      </div>
      <div className="minute-text">
        {words.map((word, i) => (
          <button
            key={i}
            type="button"
            onClick={() => tap(i)}
            className={`${errors.has(i) ? "err" : ""} ${stop === i ? "stopword" : ""} ${
              stop !== null && i > stop ? "after" : ""
            }`}
          >
            {word}
          </button>
        ))}
      </div>
      <div className="minute-stats">
        <div>
          <b>{readCount}</b>
          <span>слов</span>
        </div>
        <div>
          <b>{errorCount}</b>
          <span>ошибок</span>
        </div>
        <div>
          <b>{perMinute}</b>
          <span>слов в минуту</span>
        </div>
      </div>
      <div className="route-actions">
        <button
          type="button"
          className="route-btn go"
          disabled={stop === null}
          onClick={() => onSave({ words: perMinute, errors: errorCount })}
        >
          <Check aria-hidden="true" />
          Сохранить результат
        </button>
      </div>
    </div>
  );
}
