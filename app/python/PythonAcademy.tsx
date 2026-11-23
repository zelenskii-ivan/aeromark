"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowLeft, Check, Code2, Lock, Play, RotateCcw, Star, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { play, stopAudio } from "@/lib/academy/audio";
import { execute } from "@/lib/python/interpreter";
import { simulate, type Flight } from "@/lib/python/flight";
import { assemble, COURSE, isUnlocked, missionKey, MISSIONS, programBadgeEarned, type Mission } from "@/content/python/missions";
import { FreeFlight } from "./FreeFlight";
import { FlightMap } from "./FlightMap";
import "./python.css";

type Props = { wins: string[]; onComplete: (id: string) => void; onExit: () => void };
const editorLabels = { values: "Меняю значения", complete: "Дополняю программу", free: "Пишу сам" };
function preview(mission: Mission, source: string, values: readonly string[]) {
  if (mission.mode === "free") return source.split("\n").map(text => [{ text, editable: false }]);
  const lines: { text: string; editable: boolean }[][] = [[]];
  mission.parts.forEach((part, index) => {
    part.split("\n").forEach((text, line) => {
      if (line) lines.push([]);
      lines.at(-1)!.push({ text, editable: false });
    });
    if (index < values.length) lines.at(-1)!.push({ text: values[index] || (mission.slots[index]?.choices?.includes("") ? "" : "___"), editable: true });
  });
  return lines;
}
const phases = ["Предскажи", "Измени", "Запусти", "Объясни", "Результат"];
const nextActions = [
  "Посмотри на код и ответь на вопрос.",
  "Измени выделенную часть кода. Затем нажми «Запустить».",
  "Следи за строкой, которую выполняет программа.",
  "Посмотри на результат. Объясни, почему так получилось.",
  "Можно перейти к следующей миссии или попробовать ещё раз.",
];

export default function PythonAcademy({ wins, onComplete, onExit }: Props) {
  const [id, setId] = useState(() => MISSIONS.find(m => isUnlocked(wins, m.id) && !wins.includes(missionKey(m.id)))?.id ?? MISSIONS[0]!.id);
  const [free, setFree] = useState(false);
  const mission = MISSIONS.find(item => item.id === id)!;
  const completed = MISSIONS.filter(item => wins.includes(missionKey(item.id))).length;
  const next = MISSIONS[MISSIONS.indexOf(mission) + 1];
  useEffect(() => stopAudio, []);

  function openMission(missionId: string) {
    stopAudio();
    setId(missionId);
    window.scrollTo(0, 0);
  }

  return (
    <main className="py-academy">
      <header className="py-header">
        <Button variant="outline" onClick={onExit}><ArrowLeft /> На главную</Button>
        <div><h1>Изучаем Python</h1><p>Программируй свой самолёт!</p></div>
        <div className="py-progress">
          <span><Star /> {completed} из {MISSIONS.length} миссий</span>
          <progress value={completed} max={MISSIONS.length} aria-label="Пройдено миссий" />
          {programBadgeEarned(wins) && <strong>Достижение «Пилот-программист»</strong>}
        </div>
      </header>
      <div className="py-mode py-buttons" aria-label="Режим тренировки">
        <Button variant={free ? "outline" : "default"} aria-pressed={!free}
          onClick={() => { stopAudio(); setFree(false); }}>Миссии</Button>
        <Button variant={free ? "default" : "outline"} aria-pressed={free}
          onClick={() => { stopAudio(); setFree(true); }}>Свободный полёт</Button>
      </div>
      {free ? <FreeFlight /> : <>
      <details className="py-course-picker">
        <summary>Все задания</summary>
        <nav className="py-course" aria-label="Этапы курса">
        {COURSE.map(stage => (
          <section key={stage.name}>
            <h2>{stage.name}</h2>
            {stage.missions.map(item => {
              const done = wins.includes(missionKey(item.id));
              const unlocked = done || isUnlocked(wins, item.id);
              return <button key={item.id} disabled={!unlocked} aria-current={id === item.id ? "step" : undefined}
                onClick={event => {
                  const details = event.currentTarget.closest("details");
                  if (details) details.open = false;
                  openMission(item.id);
                }}>
                {done ? <Check /> : !unlocked ? <Lock /> : null}{item.title}
              </button>;
            })}
          </section>
        ))}
        </nav>
      </details>
      <Lesson key={id} mission={mission} rewarded={wins.includes(missionKey(id))}
        onComplete={() => onComplete(id)}
        onNext={next ? () => openMission(next.id) : undefined} />
      </>}
    </main>
  );
}

function Lesson({ mission, rewarded, onComplete, onNext }: {
  mission: Mission; rewarded: boolean; onComplete: () => void; onNext?: () => void;
}) {
  const [values, setValues] = useState(() => mission.slots.map(slot => slot.initial));
  const starter = assemble(mission, mission.slots.map(slot => slot.initial));
  const [code, setCode] = useState(starter);
  const [predicted, setPredicted] = useState(false);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [cursor, setCursor] = useState(-1);
  const [errorLine, setErrorLine] = useState<number | null>(null);
  const [result, setResult] = useState("");
  const [feedback, setFeedback] = useState("");
  const [award, setAward] = useState(false);
  const [explained, setExplained] = useState(false);
  const mapRegion = useRef<HTMLDivElement>(null);
  const terminal = useRef<HTMLElement>(null);
  const source = mission.mode === "free" ? code : assemble(mission, values);
  const frames = flight?.frames;
  const playing = !!frames && cursor + 1 < frames.length;
  const valid = !!flight && !flight.problem && !result;
  const phase = !predicted ? 0 : playing ? 2 : explained ? 4 : valid ? 3 : 1;

  useEffect(() => {
    if (!frames || cursor + 1 >= frames.length) return;
    const speed = frames[cursor + 1]!.speed;
    const timer = window.setTimeout(() => setCursor(cursor + 1), 580 - speed * 65);
    return () => window.clearTimeout(timer);
  }, [cursor, frames]);

  function clearRun() {
    setFlight(null);
    setCursor(-1);
    setErrorLine(null);
    setResult("");
    setFeedback("");
    setExplained(false);
  }
  function updateValue(index: number, value: string) {
    clearRun();
    setValues(current => current.map((item, i) => i === index ? value : item));
  }
  function reset() {
    clearRun();
    setValues(mission.slots.map(slot => slot.initial));
    setCode(starter);
    setPredicted(false);
    setAward(false);
  }
  function keepIndent(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    const editor = event.currentTarget;
    const before = code.slice(0, editor.selectionStart);
    const line = before.slice(before.lastIndexOf("\n") + 1);
    const indent = line.match(/^ */)![0];
    const insertion = "\n" + indent + (line.trimEnd().endsWith(":") ? "    " : "");
    const changed = before + insertion + code.slice(editor.selectionEnd);
    event.preventDefault();
    if (changed.length > editor.maxLength) return;
    clearRun();
    setCode(changed);
    const caret = before.length + insertion.length;
    window.requestAnimationFrame(() => editor.setSelectionRange(caret, caret));
  }
  function showPlayback() {
    if (!window.matchMedia("(max-width: 700px)").matches) return;
    const target = COURSE[0]?.missions.includes(mission) ? terminal.current : mapRegion.current;
    target?.scrollIntoView({ block: "start" });
  }
  function run() {
    clearRun();
    if (source === starter) {
      setResult("Сначала измени пример и посмотри, что получится.");
      return;
    }
    const execution = execute(source);
    if (!execution.ok) {
      setErrorLine(execution.line);
      setResult(`Строка ${execution.line}. ${execution.message}`);
      return;
    }
    const calculated = simulate(mission.map, execution.commands);
    setFlight(calculated);
    showPlayback();
    if (calculated.problem) setResult(calculated.problem);
    else if (!mission.passes(calculated, source)) setResult("Программа сработала. Сверь результат с целью и попробуй ещё раз.");
  }
  function explain(answer: number) {
    if (answer !== mission.explain.correct) {
      setFeedback("Посмотри на активные строки во время повтора и попробуй ещё раз.");
      return;
    }
    setFeedback("");
    setAward(!rewarded);
    setExplained(true);
    onComplete();
  }

  const activeLine = errorLine ?? frames?.[cursor]?.line;
  const telemetry = frames?.[cursor]?.text;
  const visibleOutput = frames?.slice(0, cursor + 1).flatMap(frame => frame.radio === undefined ? [] : [frame.radio]) ?? [];

  return (
    <>
      <ol className="py-phases" aria-label="Шаги миссии">
        {phases.map((name, index) => <li key={name} aria-current={phase === index ? "step" : undefined}>{name}</li>)}
      </ol>
      <p className="py-next-action" role="status"><strong>{phases[phase]}.</strong> {nextActions[phase]}</p>
      <div className="py-workspace py-lesson">
        <div className="py-stack">
          <section className="py-panel py-brief">
            <div className="py-map-heading">
              <h2>{mission.title}</h2>
              <Button variant="outline" onClick={() => void play(mission.speech)}><Volume2 /> Послушать</Button>
            </div>
            <p>{mission.instruction}</p>
            <details><summary>Подсказка</summary><p>{mission.hint}</p></details>
          </section>
          <div className="py-lesson-map" ref={mapRegion}>
            <FlightMap map={mission.map} frames={frames ?? []} cursor={cursor} />
          </div>
          <section className="py-panel py-terminal" aria-label="Терминал" ref={terminal}>
            <h2>Терминал</h2>
            {cursor >= 0 && activeLine && <code>Строка {activeLine} · {source.split("\n")[activeLine - 1]?.trim()}</code>}
            {telemetry && <p>{telemetry}</p>}
            {visibleOutput.length ? <pre>{visibleOutput.join("\n")}</pre> : <p>Здесь появятся сообщения программы.</p>}
          </section>
        </div>
        <div className="py-stack">
          {!predicted && <section className="py-panel py-prediction">
            <div className="py-map-heading"><h2>{mission.predict.prompt}</h2>
              <Button variant="outline" aria-label="Послушать вопрос" onClick={() => void play([mission.predict.prompt, ...mission.predict.choices].join(". "))}><Volume2 /></Button>
            </div>
            <div className="py-buttons">{mission.predict.choices.map((choice, index) => (
              <Button key={choice} variant="outline" onClick={() => {
                if (index === mission.predict.correct) { setPredicted(true); setFeedback(""); }
                else setFeedback("Подумай ещё. Можно послушать задание или открыть подсказку.");
              }}>{choice}</Button>
            ))}</div>
            <p role="status">{feedback}</p>
          </section>}
          <section className="py-panel py-editor">
            <h2><Code2 /> {editorLabels[mission.mode]}</h2>
            {!predicted ? <p>Сначала ответь на вопрос «Предскажи». Потом сможешь изменить код.</p> : mission.mode === "free" ? (
              <div className="py-field">
                <label htmlFor="py-source">Код Python</label>
                <textarea id="py-source" value={code} maxLength={2000} rows={8} spellCheck={false} autoCapitalize="off" onKeyDown={keepIndent}
                  onChange={event => { clearRun(); setCode(event.target.value); }} />
              </div>
            ) : mission.slots.map((slot, index) => (
              slot.choices?.length ? (
                <fieldset className="py-field" key={slot.label}>
                  <legend>{slot.label}</legend>
                  <div className="py-buttons py-choices">
                    {slot.choices.map(choice => (
                      <Button key={choice} variant="outline" aria-pressed={choice === values[index]}
                        onClick={() => updateValue(index, choice)}>{choice || "Без знака"}</Button>
                    ))}
                  </div>
                </fieldset>
              ) : (
                <div className="py-field" key={slot.label}>
                  <label htmlFor={`py-slot-${index}`}>{slot.label}</label>
                  <input id={`py-slot-${index}`} value={values[index]} maxLength={100} spellCheck={false} autoCapitalize="off"
                    onChange={event => updateValue(index, event.target.value)} />
                </div>
              )
            ))}
            <pre className="py-code" aria-label="Программа">{preview(mission, source, values).map((line, index) => (
              <span key={index} data-active={index + 1 === activeLine} aria-current={index + 1 === activeLine ? "true" : undefined}>
                <span aria-hidden="true">{index + 1}</span>{line.map(({ text, editable }, i) => editable ? <mark key={i}>{text}</mark> : text)}
              </span>
            ))}</pre>
            <p>Учебный Python. move(), takeoff() и land() — команды AeroMark.</p>
            {predicted && <div className="py-buttons">
              <Button onClick={run}><Play /> {playing ? "Запустить заново" : "Запустить"}</Button>
              {flight && <Button variant="outline" onClick={() => { setCursor(-1); showPlayback(); }}><RotateCcw /> Повторить анимацию</Button>}
              <Button variant="outline" onClick={reset}><RotateCcw /> Вернуть пример</Button>
            </div>}
            {result && !playing && <p className="py-feedback" role="status">{result}</p>}
          </section>
          {valid && !playing && !explained && <section className="py-panel py-explanation">
            <div className="py-map-heading"><h2>{mission.explain.prompt}</h2>
              <Button variant="outline" aria-label="Послушать вопрос" onClick={() => void play([mission.explain.prompt, ...mission.explain.choices].join(". "))}><Volume2 /></Button>
            </div>
            <div className="py-buttons">{mission.explain.choices.map((choice, index) => (
              <Button key={choice} variant="outline" onClick={() => explain(index)}>{choice}</Button>
            ))}</div>
            <p role="status">{feedback}</p>
          </section>}
          {explained && !playing && <section className="py-panel py-success">
            <h2><Star /> Миссия выполнена{award && " · +1 звезда"}</h2>
            <p>Ты объяснил, как сработала программа.</p>
            {onNext && <Button onClick={onNext}>Следующая миссия</Button>}
          </section>}
        </div>
      </div>
    </>
  );
}
