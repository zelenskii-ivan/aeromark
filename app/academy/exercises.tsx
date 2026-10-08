"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, CircleHelp, Lightbulb, Link2, Volume2 } from "lucide-react";
import { INSTRUCTIONS, PRAISE, RETRY } from "@/content/academy/phrases";
import type { Exercise } from "@/lib/academy/session";
import { play, playSequence, preload, stopAudio } from "@/lib/academy/audio";
import { isSoundOn, playMiss, playWin } from "@/lib/celebrate";
import { Cheer } from "@/app/cheer";
import { Colored, letterTones, SpeakButton, SyllableSplit } from "./ui";

/**
 * Упражнения Академии.
 *
 * Общее правило для всех: засчитывается первая попытка. Ошибка ничего не
 * отнимает — штурман предлагает попробовать ещё раз, а после второй ошибки
 * подсвечивает верный ответ, и ребёнок нажимает его вместе со взрослым
 * («попробуем вместе»). Подсказка доступна всегда; если ею воспользовались,
 * ответ засчитывается, но единица не продвигается к «усвоено».
 */

export type ExerciseResult = { item: string; correct: boolean; hinted: boolean };

type Done = (results: ExerciseResult[]) => void;

const randomOf = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]!;

type Option = { id: string; content: React.ReactNode; aria: string; speak?: string };

function ChoiceShell({
  item,
  instruction,
  listen = [],
  stage,
  options,
  answer,
  layout,
  hint,
  praise,
  onDone,
}: {
  item: string;
  instruction: string;
  listen?: string[];
  stage: React.ReactNode;
  options: Option[];
  answer: string;
  layout: "letters" | "pictures" | "wide" | "audio" | "pair";
  hint?: { label: string; content?: React.ReactNode; onUse?: () => void } | null;
  praise?: string;
  onDone: Done;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [status, setStatus] = useState<"idle" | "wrong" | "correct">("idle");
  const [hinted, setHinted] = useState(false);
  const [burst, setBurst] = useState(0);
  const together = attempts >= 2 && status !== "correct";

  useEffect(() => {
    void playSequence([instruction, ...listen]);
    return () => stopAudio();
    // Реплика звучит один раз при показе задания.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, instruction]);

  const choose = (option: Option) => {
    if (status === "correct") return;
    setSelected(option.id);
    if (status === "wrong") setStatus("idle");
    if (option.speak) void play(option.speak);
  };

  const check = () => {
    if (!selected || status === "correct") return;
    if (selected === answer) {
      setStatus("correct");
      setBurst((value) => value + 1);
      if (isSoundOn()) playWin();
      void play(praise ?? randomOf(PRAISE.slice(0, 4)));
      return;
    }
    setAttempts((value) => value + 1);
    setStatus("wrong");
    if (isSoundOn()) playMiss();
    void play(randomOf(RETRY));
  };

  const useHint = () => {
    setHinted(true);
    hint?.onUse?.();
  };

  return (
    <div className={`ac-exercise ${status === "wrong" ? "shake" : ""}`}>
      <Cheer burst={status === "correct" ? burst : 0} />
      <div className="ac-instruction">
        <button
          type="button"
          className="ac-icon-btn"
          aria-label="Повторить задание"
          onClick={() => void playSequence([instruction, ...listen])}
        >
          <CircleHelp aria-hidden="true" />
        </button>
        <p>{instruction}</p>
      </div>
      <div className="ac-stage">{stage}</div>
      {hinted && hint?.content ? <div className="ac-hint-box">{hint.content}</div> : null}
      <div className={`ac-options ${layout}`} role="radiogroup" aria-label="Варианты ответа">
        {options.map((option) => {
          const isAnswer = option.id === answer;
          const classes = [
            "ac-option",
            selected === option.id ? "selected" : "",
            status === "correct" && isAnswer ? "correct" : "",
            status === "wrong" && selected === option.id ? "try" : "",
            together && isAnswer ? "together" : "",
          ].join(" ");
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected === option.id}
              aria-label={option.aria}
              className={classes}
              onClick={() => choose(option)}
            >
              {option.content}
            </button>
          );
        })}
      </div>
      <div className="ac-feedback" aria-live="polite">
        {status === "wrong" && (together ? "Попробуем вместе: нажми на светящийся ответ." : "Почти! Попробуй ещё раз.")}
        {status === "correct" && (attempts === 0 ? "Отличный полёт!" : "Получилось! Идём дальше.")}
      </div>
      <div className="ac-actions">
        {hint && !hinted && status !== "correct" ? (
          <button type="button" className="ac-btn soft" onClick={useHint}>
            <Lightbulb aria-hidden="true" />
            {hint.label}
          </button>
        ) : null}
        {status !== "correct" ? (
          <button type="button" className="ac-btn go" disabled={!selected} onClick={check}>
            <Check aria-hidden="true" />
            Проверить
          </button>
        ) : (
          <button
            type="button"
            className="ac-btn go"
            autoFocus
            onClick={() => {
              stopAudio();
              onDone([{ item, correct: attempts === 0, hinted }]);
            }}
          >
            Дальше
            <ChevronRight aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

const letterOption = (char: string): Option => ({
  id: char,
  aria: `Буква ${char}`,
  content: <span className="ac-letter">{char}</span>,
});

const syllableOption = (syllable: string): Option => ({
  id: syllable,
  aria: `Слог ${syllable}`,
  content: <Colored text={syllable.toUpperCase()} className="ac-syllable" />,
});

/** Кнопки-динамики: номер и цвет, без текста — иначе ответ был бы виден. */
const AUDIO_COLORS = ["#2a6fb5", "#d97b29", "#3a9d5d", "#7a4fb5"];
const audioOptions = (list: string[]): Option[] =>
  list.map((syllable, index) => ({
    id: syllable,
    speak: syllable,
    aria: `Вариант ${index + 1}, послушать`,
    content: (
      <span className="ac-audio-option" style={{ "--tint": AUDIO_COLORS[index % 4] } as React.CSSProperties}>
        <Volume2 aria-hidden="true" />
        <b>{index + 1}</b>
      </span>
    ),
  }));

const pictureOption = (word: string, picture: string): Option => ({
  id: word,
  aria: `Картинка: ${word}`,
  content: <span className="ac-picture">{picture}</span>,
});

export function ExerciseView({ exercise, onDone }: { exercise: Exercise; onDone: Done }) {
  const instruction = INSTRUCTIONS[exercise.kind];
  switch (exercise.kind) {
    case "hear-letter":
      return (
        <ChoiceShell
          key={exercise.item + exercise.kind}
          item={exercise.item}
          instruction={instruction}
          listen={[exercise.say]}
          stage={<SpeakButton text={exercise.say} label="Послушать ещё раз" big />}
          options={exercise.options.map(letterOption)}
          answer={exercise.letter}
          layout="letters"
          onDone={onDone}
        />
      );
    case "letter-picture":
      return (
        <ChoiceShell
          key={exercise.item + exercise.kind}
          item={exercise.item}
          instruction={instruction}
          stage={<span className="ac-letter hero">{exercise.letter}</span>}
          options={exercise.options.map((o) => pictureOption(o.word, o.picture))}
          answer={exercise.answer}
          layout="pictures"
          onDone={onDone}
        />
      );
    case "first-sound":
      return (
        <ChoiceShell
          key={exercise.item + exercise.kind}
          item={exercise.item}
          instruction={instruction}
          listen={[exercise.word]}
          stage={
            <div className="ac-picture-stage">
              <span className="ac-picture hero">{exercise.picture}</span>
              <SpeakButton text={exercise.word} label="Послушать слово" big />
            </div>
          }
          options={exercise.options.map(letterOption)}
          answer={exercise.answer}
          layout="letters"
          onDone={onDone}
        />
      );
    case "same-different":
      return (
        <ChoiceShell
          key={exercise.item + exercise.kind + exercise.b}
          item={exercise.item}
          instruction={instruction}
          listen={[exercise.a, exercise.b]}
          stage={<SpeakButton text={[exercise.a, exercise.b]} label="Послушать ещё раз" big />}
          options={[
            { id: "same", aria: "Одинаковые", content: <span className="ac-pair">🔵🔵<b>Одинаковые</b></span> },
            { id: "different", aria: "Разные", content: <span className="ac-pair">🔵🟠<b>Разные</b></span> },
          ]}
          answer={exercise.same ? "same" : "different"}
          layout="pair"
          onDone={onDone}
        />
      );
    case "has-letter":
      return (
        <ChoiceShell
          key={exercise.item + exercise.kind + exercise.word}
          item={exercise.item}
          instruction={instruction}
          listen={[exercise.word]}
          stage={
            <div className="ac-picture-stage">
              <span className="ac-picture hero">{exercise.picture}</span>
              <span className="ac-letter hero small">{exercise.letter}</span>
              <SpeakButton text={exercise.word} label="Послушать слово" big />
            </div>
          }
          options={[
            { id: "yes", aria: "Да", content: <span className="ac-pair">👍<b>Да</b></span> },
            { id: "no", aria: "Нет", content: <span className="ac-pair">👎<b>Нет</b></span> },
          ]}
          answer={exercise.answer ? "yes" : "no"}
          layout="pair"
          hint={{ label: "Показать слово", content: <Colored text={exercise.word.toUpperCase()} className="ac-word" /> }}
          onDone={onDone}
        />
      );
    case "merge":
      return <MergeExercise exercise={exercise} onDone={onDone} />;
    case "read-syllable":
      return (
        <ChoiceShell
          key={exercise.item + exercise.kind}
          item={exercise.item}
          instruction={instruction}
          stage={<Colored text={exercise.syllable.toUpperCase()} className="ac-syllable hero" />}
          options={audioOptions(exercise.options)}
          answer={exercise.syllable}
          layout="audio"
          hint={{ label: "Подсказка", onUse: () => void play(exercise.syllable) }}
          onDone={onDone}
        />
      );
    case "hear-syllable":
      return (
        <ChoiceShell
          key={exercise.item + exercise.kind}
          item={exercise.item}
          instruction={instruction}
          listen={[exercise.syllable]}
          stage={<SpeakButton text={exercise.syllable} label="Послушать ещё раз" big />}
          options={exercise.options.map(syllableOption)}
          answer={exercise.syllable}
          layout="letters"
          hint={{ label: "Медленнее", onUse: () => void play(exercise.syllable, 0.6) }}
          onDone={onDone}
        />
      );
    case "word-picture":
      return (
        <ChoiceShell
          key={exercise.item + exercise.kind}
          item={exercise.item}
          instruction={instruction}
          stage={<Colored text={exercise.word.toUpperCase()} className="ac-word hero" />}
          options={exercise.options.map((o) => pictureOption(o.word, o.picture))}
          answer={exercise.word}
          layout="pictures"
          hint={{
            label: "По слогам",
            content: exercise.parts.length > 1 ? <SyllableSplit parts={exercise.parts.map((p) => p.toUpperCase())} /> : null,
            onUse: () => {
              if (exercise.parts.length <= 1) void play(exercise.word, 0.6);
            },
          }}
          onDone={onDone}
        />
      );
    case "build-word":
      return <BuildWord exercise={exercise} onDone={onDone} />;
    case "sentence":
      return <SentenceExercise exercise={exercise} onDone={onDone} />;
    case "story":
      return <StoryExercise exercise={exercise} onDone={onDone} />;
  }
}

function MergeExercise({ exercise, onDone }: { exercise: Extract<Exercise, { kind: "merge" }>; onDone: Done }) {
  const [merged, setMerged] = useState(false);
  const tones = letterTones(exercise.syllable);
  if (!merged) {
    return (
      <div className="ac-exercise">
        <div className="ac-instruction">
          <button
            type="button"
            className="ac-icon-btn"
            aria-label="Повторить задание"
            onClick={() => void play(INSTRUCTIONS.merge)}
          >
            <CircleHelp aria-hidden="true" />
          </button>
          <p>{INSTRUCTIONS.merge}</p>
        </div>
        <div className="ac-stage">
          <div className="ac-merge" aria-label={`Буквы ${exercise.consonant.toUpperCase()} и ${exercise.vowel.toUpperCase()}`}>
            <span className={`ac-car tone-${tones[0]}`}>{exercise.consonant.toUpperCase()}</span>
            <span className="ac-hitch" aria-hidden="true" />
            <span className="ac-car tone-vowel">{exercise.vowel.toUpperCase()}</span>
          </div>
        </div>
        <div className="ac-actions">
          <button
            type="button"
            className="ac-btn go"
            onClick={() => {
              setMerged(true);
            }}
          >
            <Link2 aria-hidden="true" />
            Сцепить
          </button>
        </div>
      </div>
    );
  }
  return (
    <ChoiceShell
      key={exercise.item + "merged"}
      item={exercise.item}
      instruction="Какой слог получился?"
      stage={<Colored text={exercise.syllable.toUpperCase()} className="ac-syllable hero merged" />}
      options={audioOptions(exercise.options)}
      answer={exercise.syllable}
      layout="audio"
      hint={{ label: "Подсказка", onUse: () => void play(exercise.syllable) }}
      onDone={onDone}
    />
  );
}

function BuildWord({ exercise, onDone }: { exercise: Extract<Exercise, { kind: "build-word" }>; onDone: Done }) {
  const [placed, setPlaced] = useState<number[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [hinted, setHinted] = useState(false);
  const [shake, setShake] = useState(-1);
  const [burst, setBurst] = useState(0);
  const done = placed.length === exercise.parts.length;

  useEffect(() => {
    void playSequence([INSTRUCTIONS["build-word"], exercise.word]);
    return () => stopAudio();
  }, [exercise.word]);

  const tap = (index: number) => {
    if (done || placed.includes(index)) return;
    const expected = exercise.parts[placed.length];
    if (exercise.tiles[index] === expected) {
      const next = [...placed, index];
      setPlaced(next);
      void play(exercise.tiles[index]!);
      if (next.length === exercise.parts.length) {
        setBurst((value) => value + 1);
        if (isSoundOn()) playWin();
        setTimeout(() => void play(exercise.word), 500);
      }
    } else {
      setMistakes((value) => value + 1);
      setShake(index);
      if (isSoundOn()) playMiss();
      setTimeout(() => setShake(-1), 500);
    }
  };

  const nextIndex = exercise.tiles.findIndex(
    (tile, index) => !placed.includes(index) && tile === exercise.parts[placed.length],
  );

  return (
    <div className="ac-exercise">
      <Cheer burst={done ? burst : 0} />
      <div className="ac-instruction">
        <button
          type="button"
          className="ac-icon-btn"
          aria-label="Повторить задание"
          onClick={() => void playSequence([INSTRUCTIONS["build-word"], exercise.word])}
        >
          <CircleHelp aria-hidden="true" />
        </button>
        <p>{INSTRUCTIONS["build-word"]}</p>
      </div>
      <div className="ac-stage">
        <div className="ac-picture-stage">
          <span className="ac-picture hero">{exercise.picture}</span>
          <SpeakButton text={exercise.word} label="Послушать слово" big />
        </div>
        <div className="ac-slots" aria-label="Собранное слово">
          {exercise.parts.map((_, slot) => (
            <span key={slot} className={`ac-slot ${placed[slot] !== undefined ? "filled" : ""}`}>
              {placed[slot] !== undefined ? <Colored text={exercise.tiles[placed[slot]!]!.toUpperCase()} /> : null}
            </span>
          ))}
        </div>
      </div>
      <div className="ac-options letters">
        {exercise.tiles.map((tile, index) => (
          <button
            key={index}
            type="button"
            disabled={placed.includes(index)}
            aria-label={`Слог ${tile}`}
            className={`ac-option ${shake === index ? "try" : ""} ${hinted && index === nextIndex ? "together" : ""} ${placed.includes(index) ? "used" : ""}`}
            onClick={() => tap(index)}
          >
            <Colored text={tile.toUpperCase()} className="ac-syllable" />
          </button>
        ))}
      </div>
      <div className="ac-feedback" aria-live="polite">
        {shake >= 0 ? "Этот слог дальше. Послушай слово ещё раз." : done ? "Слово собрано!" : ""}
      </div>
      <div className="ac-actions">
        {!done && !hinted ? (
          <button type="button" className="ac-btn soft" onClick={() => setHinted(true)}>
            <Lightbulb aria-hidden="true" />
            Подсказка
          </button>
        ) : null}
        {done ? (
          <button
            type="button"
            className="ac-btn go"
            autoFocus
            onClick={() => {
              stopAudio();
              onDone([{ item: exercise.item, correct: mistakes === 0, hinted }]);
            }}
          >
            Дальше
            <ChevronRight aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SentenceExercise({ exercise, onDone }: { exercise: Extract<Exercise, { kind: "sentence" }>; onDone: Done }) {
  const sentence = exercise.sentence;
  const spoken = sentence.kind === "complete" ? sentence.text.replace("___", sentence.answer) : sentence.text;
  const hint = { label: "Послушать", onUse: () => void play(spoken) };
  if (sentence.kind === "picture") {
    return (
      <ChoiceShell
        key={exercise.item}
        item={exercise.item}
        instruction={INSTRUCTIONS.sentence}
        stage={<p className="ac-sentence">{sentence.text}</p>}
        options={sentence.options.map((picture) => ({ id: picture, aria: `Картинка ${picture}`, content: <span className="ac-picture">{picture}</span> }))}
        answer={sentence.answer}
        layout="pictures"
        hint={hint}
        onDone={onDone}
      />
    );
  }
  if (sentence.kind === "yesno") {
    return (
      <ChoiceShell
        key={exercise.item}
        item={exercise.item}
        instruction={INSTRUCTIONS.sentence}
        listen={[sentence.question]}
        stage={
          <>
            <p className="ac-sentence">{sentence.text}</p>
            <p className="ac-question">{sentence.question}</p>
          </>
        }
        options={[
          { id: "да", aria: "Да", content: <span className="ac-pair">👍<b>Да</b></span> },
          { id: "нет", aria: "Нет", content: <span className="ac-pair">👎<b>Нет</b></span> },
        ]}
        answer={sentence.answer}
        layout="pair"
        hint={hint}
        onDone={onDone}
      />
    );
  }
  const [before, after] = sentence.text.split("___");
  return (
    <ChoiceShell
      key={exercise.item}
      item={exercise.item}
      instruction="Прочитай предложение. Какое слово подходит?"
      stage={
        <p className="ac-sentence">
          {before}
          <span className="ac-blank">…</span>
          {after}
        </p>
      }
      options={sentence.options.map((word) => ({ id: word, aria: word, content: <span className="ac-word-option">{word}</span> }))}
      answer={sentence.answer}
      layout="wide"
      hint={hint}
      onDone={onDone}
    />
  );
}

/**
 * Рассказ: прочитать, ответить, показать, где написано («что + откуда»).
 * Засчитывается только пара: ответ без улики — возможно, угадан.
 */
function StoryExercise({ exercise, onDone }: { exercise: Extract<Exercise, { kind: "story" }>; onDone: Done }) {
  const { story } = exercise;
  const [phase, setPhase] = useState<"read" | "answer" | "evidence" | "done">("read");
  const [q, setQ] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [wrong, setWrong] = useState(false);
  const [firstTry, setFirstTry] = useState(true);
  const [listened, setListened] = useState<Set<number>>(new Set());
  const results = useRef<ExerciseResult[]>([]);
  const [burst, setBurst] = useState(0);
  const question = story.questions[q]!;

  useEffect(() => {
    preload([...story.sentences, ...story.questions.map((item) => item.question)]);
    void play(INSTRUCTIONS.story);
    return () => stopAudio();
  }, [story]);

  useEffect(() => {
    if (phase === "answer") void play(question.question);
    if (phase === "evidence") void play("Где это написано? Нажми на предложение.");
  }, [phase, question.question]);

  const listen = (index: number) => {
    setListened((set) => new Set(set).add(index));
    void play(story.sentences[index]!);
  };

  const answer = (option: string) => {
    setPicked(option);
    if (option === question.answer) {
      setWrong(false);
      setPhase("evidence");
    } else {
      setWrong(true);
      setFirstTry(false);
      if (isSoundOn()) playMiss();
    }
  };

  const evidence = (index: number) => {
    if (phase !== "evidence") return listen(index);
    if (index === question.evidence) {
      results.current.push({
        item: `Q:${story.id}:${q}`,
        correct: firstTry,
        hinted: listened.size > 0,
      });
      setBurst((value) => value + 1);
      if (isSoundOn()) playWin();
      void play(randomOf(PRAISE.slice(0, 4)));
      if (q + 1 < story.questions.length) {
        setQ(q + 1);
        setPicked(null);
        setFirstTry(true);
        setListened(new Set());
        setPhase("answer");
      } else {
        setPhase("done");
      }
    } else {
      setFirstTry(false);
      setWrong(true);
      if (isSoundOn()) playMiss();
    }
  };

  return (
    <div className="ac-exercise">
      <Cheer burst={burst} />
      <h2 className="ac-story-title">{story.title}</h2>
      <div className={`ac-story ${phase === "evidence" ? "pick" : ""}`}>
        {story.sentences.map((sentence, index) => (
          <button
            key={index}
            type="button"
            className={`ac-story-line ${phase === "evidence" && wrong ? "" : ""}`}
            onClick={() => evidence(index)}
            aria-label={phase === "evidence" ? `Предложение ${index + 1}: ${sentence}` : `Послушать: ${sentence}`}
          >
            {sentence}
          </button>
        ))}
      </div>
      {phase === "read" ? (
        <>
          <p className="ac-note">Если трудно — нажми на предложение, и штурман его прочитает.</p>
          <div className="ac-actions">
            <button type="button" className="ac-btn go" onClick={() => setPhase("answer")}>
              Я прочитал
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        </>
      ) : null}
      {phase === "answer" || phase === "evidence" ? (
        <div className="ac-story-q">
          <div className="ac-instruction">
            <button type="button" className="ac-icon-btn" aria-label="Повторить вопрос" onClick={() => void play(question.question)}>
              <CircleHelp aria-hidden="true" />
            </button>
            <p>
              {question.question} <span className="ac-note">({q + 1} из {story.questions.length})</span>
            </p>
          </div>
          {phase === "answer" ? (
            <div className="ac-options wide">
              {question.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`ac-option ${picked === option ? (option === question.answer ? "correct" : "try") : ""}`}
                  onClick={() => answer(option)}
                >
                  <span className="ac-word-option">{option}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="ac-evidence">
              Верно! А где это написано? Нажми на нужное предложение.
            </p>
          )}
          <div className="ac-feedback" aria-live="polite">
            {wrong ? (phase === "evidence" ? "Посмотри ещё раз — ответ в другом предложении." : "Почти! Найди ответ в рассказе.") : ""}
          </div>
        </div>
      ) : null}
      {phase === "done" ? (
        <div className="ac-actions">
          <button type="button" className="ac-btn go" autoFocus onClick={() => onDone(results.current)}>
            Дальше
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Предзагрузка звуков для следующих заданий полёта. */
export function usePreload(exercises: Exercise[]) {
  const texts = useMemo(
    () =>
      exercises.flatMap((ex) => {
        switch (ex.kind) {
          case "hear-letter":
            return [ex.say];
          case "first-sound":
          case "has-letter":
          case "build-word":
            return [ex.word];
          case "same-different":
            return [ex.a, ex.b];
          case "read-syllable":
          case "hear-syllable":
          case "merge":
            return ex.options;
          default:
            return [];
        }
      }),
    [exercises],
  );
  useEffect(() => preload(texts), [texts]);
}
