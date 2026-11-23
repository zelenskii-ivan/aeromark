"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Code2, Play, RotateCcw, Undo2, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { play } from "@/lib/academy/audio";
import { execute } from "@/lib/python/interpreter";
import { simulate, type Flight, type MapSpec } from "@/lib/python/flight";
import { ActionDock } from "./ActionDock";
import { FlightMap } from "./FlightMap";

const map: MapSpec = { start: [0, 0], goal: [5, 2], obstacles: [[2, 0], [2, 1]] };
const blocks = [
  { title: "Вправо →", code: 'move("right", 1)' },
  { title: "Влево ←", code: 'move("left", 1)' },
  { title: "Вверх ↑", code: 'move("up", 1)' },
  { title: "Вниз ↓", code: 'move("down", 1)' },
  { title: "Сказать «Привет!»", code: 'print("Привет!")' },
];
const example = 'move("up", 2)\nmove("right", 5)\nprint("На месте!")';

export function FreeFlight() {
  const [code, setCode] = useState("");
  const [flight, setFlight] = useState<Flight | null>(null);
  const [error, setError] = useState("");
  const [cursor, setCursor] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const scene = useRef<HTMLDivElement>(null);
  const frames = flight?.frames ?? [];
  const frame = frames[cursor];
  const finished = !!flight && cursor + 1 >= frames.length;
  const transmissions = frames.slice(0, cursor + 1).flatMap(item => item.radio === undefined ? [] : [item.radio]);

  useEffect(() => {
    if (!playing || finished) return;
    const timer = window.setTimeout(() => setCursor(current => current + 1), 430);
    return () => window.clearTimeout(timer);
  }, [cursor, finished, playing]);

  function update(value: string) {
    setCode(value);
    setFlight(null);
    setError("");
    setCursor(-1);
    setPlaying(false);
  }

  function start(automatic: boolean) {
    const result = execute(code);
    if (!result.ok) {
      setError(`Строка ${result.line}. ${result.message}`);
      return;
    }
    setError("");
    setFlight(simulate(map, result.commands));
    setCursor(automatic ? -1 : 0);
    setPlaying(automatic);
    if (window.matchMedia("(max-width: 700px)").matches) scene.current?.scrollIntoView({ block: "start" });
  }

  return <section className="py-lab" aria-label="Свободный полёт">
    <header className="py-panel py-map-heading">
      <div><h2>Свободный полёт</h2><p>Собери маршрут кнопками или напиши свой код.</p></div>
      <Button variant="outline" onClick={() => void play("Добавь полёт вверх, вниз, вправо или влево. Запусти всё сразу или проверяй по одному шагу.")}>
        <Volume2 /> Послушать
      </Button>
    </header>
    <div className="py-workspace">
      <section className="py-panel py-editor">
        <h2><Code2 /> Команды</h2>
        <div className="py-buttons">
          {blocks.map(block => <Button key={block.code} variant="outline"
            disabled={code.length + block.code.length + 1 > 2000}
            onClick={() => update(code ? `${code.trimEnd()}\n${block.code}` : block.code)}>{block.title}</Button>)}
        </div>
        <div className="py-field">
          <label htmlFor="py-free-code">Твой код</label>
          <textarea id="py-free-code" rows={6} value={code} maxLength={2000} spellCheck={false} autoCapitalize="off"
            onChange={event => update(event.target.value)} />
        </div>
        <div className="py-buttons">
          <Button variant="outline" onClick={() => update(code.trimEnd().split("\n").slice(0, -1).join("\n"))}
            disabled={!code}><Undo2 /> Убрать последнюю строку</Button>
          <Button variant="outline" onClick={() => update(example)}>Попробовать пример</Button>
          <Button variant="outline" onClick={() => update("")} disabled={!code}><RotateCcw /> Очистить</Button>
        </div>
        {error && <p role="alert">{error}</p>}
      </section>
      <div className="py-stack" ref={scene}>
        <FlightMap map={map} frames={frames} cursor={cursor} />
        {flight && <section className="py-panel py-terminal" aria-label="Ход программы">
          <h2>Ход программы</h2>
          {frame && <code>Строка {frame.line} · {code.split("\n")[frame.line - 1]?.trim()}</code>}
          {transmissions.length > 0 && <pre aria-label="Сообщения">{transmissions.join("\n")}</pre>}
          {finished && <p role="status">{flight.problem || (flight.arrived ? "Аэродром достигнут!" : "Маршрут завершён.")}</p>}
        </section>}
      </div>
    </div>
    <ActionDock>
      <div className="py-buttons py-dock-actions">
        <Button onClick={() => start(true)} disabled={!code.trim()}><Play /> Запустить маршрут</Button>
        {!flight || finished ? <Button variant="outline" onClick={() => start(false)} disabled={!code.trim()}><ArrowRight /> По шагам</Button> :
          playing ? <Button variant="outline" onClick={() => setPlaying(false)}>Пауза</Button> :
            <Button variant="outline" onClick={() => setCursor(current => current + 1)}><ArrowRight /> Следующий шаг</Button>}
      </div>
    </ActionDock>
  </section>;
}
