"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, Check, ChevronRight, Lightbulb, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  bondIsConsistent,
  expectedAnswer,
  isInteractive,
  PHASE_TITLE,
  SOUND_COLOR,
  stepSkill,
  type Lesson,
  type SoundKind,
  type Step,
} from "@/content/lesson";
import { isCorrect } from "@/content/types";
import { cancelSpeech, speakTask } from "@/lib/speech";

type Props = {
  lesson: Lesson;
  onExit: () => void;
  /** Сообщает наружу результат шага: навык и верность ответа. */
  onAnswer: (step: Step, correct: boolean) => void;
  onFinish: () => void;
  stars: number;
};

const SOUND_ORDER: SoundKind[] = ["гласный", "твёрдый", "мягкий"];

/** Перемешивание с фиксированным зерном: порядок не скачет при перерисовке. */
function shuffled<T>(items: T[], seed: number): T[] {
  const copy = [...items];
  let state = seed || 1;
  for (let i = copy.length - 1; i > 0; i--) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const j = state % (i + 1);
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

export function LessonPlayer({ lesson, onExit, onAnswer, onFinish, stars }: Props) {
  const [index, setIndex] = useState(0);
  const [checked, setChecked] = useState(false);
  const [right, setRight] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  // Ответы разных типов шагов: выбор, ввод, домик, порядок, схема, пары.
  const [picked, setPicked] = useState("");
  const [typed, setTyped] = useState("");
  const [sequence, setSequence] = useState<string[]>([]);
  const [chips, setChips] = useState<SoundKind[]>([]);
  const [links, setLinks] = useState<Record<string, string>>({});

  const step = lesson.steps[index];
  const total = lesson.steps.length;

  // Речь не должна продолжаться поверх следующего шага. Состояние ответа
  // сбрасывается в обработчиках перехода, а не здесь: сброс в эффекте вызывает
  // лишний каскад перерисовок.
  useEffect(() => cancelSpeech, [index]);

  const clearAnswer = () => {
    setChecked(false);
    setRight(false);
    setHintOpen(false);
    setPicked("");
    setTyped("");
    setSequence([]);
    setChips([]);
    setLinks({});
  };

  const rule = useMemo(() => {
    // Эталон остаётся доступным до конца урока — так требует методика.
    const shown = lesson.steps.slice(0, index + 1).filter((s) => s.kind === "rule");
    return shown.length ? shown[shown.length - 1] : null;
  }, [lesson.steps, index]);

  if (!step) return null;

  const speakCurrent = () => {
    if (step.kind === "ask") {
      speakTask(step.task);
      return;
    }
    const text =
      step.kind === "say"
        ? (step.speech ?? step.text)
        : step.kind === "rule"
          ? `${step.title}. ${step.text}`
          : "prompt" in step
            ? step.prompt
            : "";
    if (!text) return;
    speakTask({
      id: step.id,
      skill: "Понимание текста",
      prompt: text,
      options: [],
      answer: "",
      hint: "",
      speech: text,
    });
  };

  const answerReady = (): boolean => {
    switch (step.kind) {
      case "ask":
        return step.task.options.length ? Boolean(picked) : Boolean(typed.trim());
      case "bond":
        return Boolean(typed.trim());
      case "order":
        return sequence.length === step.items.length;
      case "scheme":
        return chips.length === step.sounds.length;
      case "match":
        return Object.keys(links).length === step.pairs.length;
      default:
        return true;
    }
  };

  const evaluate = (): boolean => {
    switch (step.kind) {
      case "ask":
        return isCorrect(step.task.options.length ? picked : typed, step.task);
      case "bond":
        return typed.trim() === expectedAnswer(step);
      case "order":
        return sequence.join(" ") === step.items.join(" ");
      case "scheme":
        return chips.join(" ") === step.sounds.join(" ");
      case "match":
        return step.pairs.every(([left, rightSide]) => links[left] === rightSide);
      default:
        return true;
    }
  };

  const check = () => {
    if (!answerReady()) return;
    const ok = evaluate();
    setRight(ok);
    setChecked(true);
    onAnswer(step, ok);
  };

  const next = () => {
    clearAnswer();
    if (index < total - 1) setIndex(index + 1);
    else onFinish();
  };

  const retry = clearAnswer;

  return (
    <main className="lesson">
      <section>
        <header>
          <Button variant="outline" onClick={onExit}>
            ← Выйти
          </Button>
          <div className="lesson-progress">
            <div>
              <b>{lesson.title}</b>
              <span>{PHASE_TITLE[step.phase]}</span>
            </div>
            <Progress value={((index + 1) / total) * 100} />
          </div>
          <div className="star-pill">⭐ {stars}</div>
        </header>

        <article className="task-card">
          <div className="task-top">
            <span className="skill-chip">{lesson.subject}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Прочитать вслух"
              onClick={speakCurrent}
            >
              <Volume2 />
            </Button>
          </div>

          {step.kind === "say" && (
            <div className="teach-say">
              <div className="teach-avatar">🧑‍✈️</div>
              <div>
                <strong>{step.character}</strong>
                <p>{step.text}</p>
              </div>
            </div>
          )}

          {step.kind === "rule" && (
            <div className="teach-rule">
              <span className="eyebrow">ЗАПОМИНАЕМ</span>
              <h1>{step.title}</h1>
              <p>{step.text}</p>
            </div>
          )}

          {step.kind === "ask" && (
            <>
              {step.task.read && (
                <div className="reading-box">
                  <BookOpen />
                  <p>{step.task.read}</p>
                </div>
              )}
              <h1>{step.task.prompt}</h1>
              {step.task.options.length ? (
                <div className="answers" role="radiogroup" aria-label="Варианты ответа">
                  {step.task.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={picked === option}
                      disabled={checked}
                      onClick={() => setPicked(option)}
                      className={`answer ${picked === option ? "selected" : ""} ${
                        checked && option === step.task.answer ? "correct" : ""
                      } ${
                        checked && picked === option && option !== step.task.answer
                          ? "wrong"
                          : ""
                      }`}
                    >
                      <span>{option}</span>
                      {checked && option === step.task.answer && <Check />}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="input-answer">
                  <label htmlFor="lesson-answer">Ответ пилота</label>
                  <input
                    id="lesson-answer"
                    autoFocus
                    disabled={checked}
                    value={typed}
                    onChange={(event) => setTyped(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && check()}
                    placeholder="Напиши ответ"
                  />
                </div>
              )}
            </>
          )}

          {step.kind === "bond" && (
            <>
              <h1>{step.prompt}</h1>
              <div className="bond">
                <div className={`bond-whole ${step.missing === "whole" ? "empty" : ""}`}>
                  {step.missing === "whole" ? (
                    <input
                      inputMode="numeric"
                      placeholder="?"
                      aria-label="Целое"
                      disabled={checked}
                      value={typed}
                      onChange={(e) => setTyped(e.target.value.replace(/\D/g, ""))}
                      onKeyDown={(e) => e.key === "Enter" && check()}
                    />
                  ) : (
                    step.whole
                  )}
                  <span>целое</span>
                </div>
                <div className="bond-legs" aria-hidden="true" />
                <div className="bond-parts">
                  {(["left", "right"] as const).map((side, i) => (
                    <div
                      key={side}
                      className={`bond-part ${step.missing === side ? "empty" : ""}`}
                    >
                      {step.missing === side ? (
                        <input
                          inputMode="numeric"
                          placeholder="?"
                          aria-label={side === "left" ? "Первая часть" : "Вторая часть"}
                          disabled={checked}
                          value={typed}
                          onChange={(e) => setTyped(e.target.value.replace(/\D/g, ""))}
                          onKeyDown={(e) => e.key === "Enter" && check()}
                        />
                      ) : (
                        step.parts[i]
                      )}
                      <span>часть</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {step.kind === "order" && (
            <>
              <h1>{step.prompt}</h1>
              <div className="order-slots">
                {sequence.map((item, position) => (
                  <button
                    key={item}
                    type="button"
                    className="order-chip placed"
                    disabled={checked}
                    onClick={() => setSequence(sequence.filter((x) => x !== item))}
                  >
                    <b>{position + 1}</b> {item}
                  </button>
                ))}
                {sequence.length === 0 && (
                  <p className="order-empty">Нажимай карточки по порядку</p>
                )}
              </div>
              <div className="order-pool">
                {shuffled(step.items, step.id.length * 7).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="order-chip"
                    disabled={checked || sequence.includes(item)}
                    onClick={() => setSequence([...sequence, item])}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </>
          )}

          {step.kind === "scheme" && (
            <>
              <h1>{step.prompt}</h1>
              <div className="scheme-word">{step.word}</div>
              <div className="scheme-slots">
                {step.sounds.map((_, position) => {
                  const value = chips[position];
                  return (
                    <button
                      key={position}
                      type="button"
                      className="scheme-slot"
                      style={value ? { background: SOUND_COLOR[value] } : undefined}
                      disabled={checked}
                      aria-label={`Звук ${position + 1}${value ? `: ${value}` : ""}`}
                      onClick={() => setChips(chips.slice(0, position))}
                    >
                      {value ? "" : position + 1}
                    </button>
                  );
                })}
              </div>
              <div className="scheme-palette">
                {SOUND_ORDER.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className="scheme-chip"
                    style={{ background: SOUND_COLOR[kind] }}
                    disabled={checked || chips.length >= step.sounds.length}
                    onClick={() => setChips([...chips, kind])}
                  >
                    {kind}
                  </button>
                ))}
              </div>
            </>
          )}

          {step.kind === "match" && (
            <>
              <h1>{step.prompt}</h1>
              <div className="match-grid">
                {step.pairs.map(([left]) => (
                  <div key={left} className="match-row">
                    <span className="match-left">{left}</span>
                    <div className="match-options">
                      {shuffled(
                        step.pairs.map(([, r]) => r),
                        step.id.length * 13,
                      ).map((option) => (
                        <button
                          key={option}
                          type="button"
                          disabled={checked}
                          className={`match-option ${links[left] === option ? "selected" : ""} ${
                            checked &&
                            links[left] === option &&
                            step.pairs.some(([l, r]) => l === left && r === option)
                              ? "correct"
                              : ""
                          } ${
                            checked &&
                            links[left] === option &&
                            !step.pairs.some(([l, r]) => l === left && r === option)
                              ? "wrong"
                              : ""
                          }`}
                          onClick={() => setLinks({ ...links, [left]: option })}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div aria-live="polite">
            {checked && isInteractive(step) && (
              <div className={`feedback ${right ? "good" : "try"}`}>
                <strong>
                  {right ? "Верно! Так и есть." : "Пока не так. Давай разберёмся."}
                </strong>
                <p>{right ? "Идём дальше." : hintFor(step)}</p>
                {!right && (
                  <p>
                    Правильный ответ: <b>{expectedAnswer(step)}</b>
                  </p>
                )}
              </div>
            )}
          </div>

          {!checked && isInteractive(step) && hintFor(step) && (
            <div className="hint-box">
              {hintOpen ? (
                <p>
                  <Lightbulb /> {hintFor(step)}
                </p>
              ) : (
                <button type="button" onClick={() => setHintOpen(true)}>
                  <Lightbulb />
                  Подсказка
                </button>
              )}
            </div>
          )}

          {rule && step.kind !== "rule" && (
            <details className="rule-recall">
              <summary>Напомнить правило</summary>
              <p>
                <b>{rule.title}.</b> {rule.text}
              </p>
            </details>
          )}

          <footer>
            {!isInteractive(step) ? (
              <Button size="lg" onClick={next}>
                Понятно
                <ChevronRight />
              </Button>
            ) : !checked ? (
              <Button size="lg" disabled={!answerReady()} onClick={check}>
                Проверить
              </Button>
            ) : right ? (
              <Button size="lg" onClick={next}>
                {index === total - 1 ? "Закончить урок" : "Дальше"}
                <ChevronRight />
              </Button>
            ) : (
              <>
                <Button size="lg" onClick={retry}>
                  Попробовать снова
                </Button>
                <Button size="lg" variant="outline" onClick={next}>
                  Дальше
                </Button>
              </>
            )}
          </footer>
        </article>
      </section>
    </main>
  );
}

function hintFor(step: Step): string {
  return "hint" in step ? step.hint : step.kind === "ask" ? step.task.hint : "";
}

export { stepSkill, bondIsConsistent };
