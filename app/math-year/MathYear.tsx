"use client";

import { useEffect, useState } from "react";
import { Check, ChevronLeft, Clock, Lock, Plane, Rocket, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Cheer } from "@/app/cheer";
import { MATH_YEAR, type Quarter } from "@/content/math-year/plan";
import type { Lesson } from "@/content/lesson";
import { nextTopic, quarterProgress, topicStatus } from "@/lib/math-year";
import { playWin } from "@/lib/celebrate";
import "./math-year.css";

type Props = {
  completed: readonly string[];
  stars: number;
  pilotName: string;
  soundOn: boolean;
  /** Четверть, которую только что закрыл урок: показываем праздник один раз. */
  celebrate: Quarter | null;
  onCelebrated: () => void;
  onStart: (lesson: Lesson) => void;
  onExit: () => void;
};

export function MathYear({ completed, stars, pilotName, soundOn, celebrate, onCelebrated, onStart, onExit }: Props) {
  const next = nextTopic(completed);
  const readyTotal = MATH_YEAR.reduce((sum, quarter) => sum + quarterProgress(quarter, completed).ready, 0);
  const doneTotal = MATH_YEAR.reduce((sum, quarter) => sum + quarterProgress(quarter, completed).done, 0);

  return (
    <main className="math-year">
      <div className="my-sky" aria-hidden="true">
        <span className="my-cloud c1" />
        <span className="my-cloud c2" />
        <span className="my-cloud c3" />
      </div>

      <header className="my-header">
        <Button variant="outline" onClick={onExit}>
          <ChevronLeft />В AeroMark
        </Button>
        <span className="my-stars">
          <Star size={20} /> {stars}
        </span>
      </header>

      <section className="my-intro">
        <span className="my-eyebrow">МАТЕМАТИКА · 1 КЛАСС · ПО ПРОГРАММЕ «ПЕРСПЕКТИВА»</span>
        <h1>Полёт через весь год</h1>
        <p>
          {pilotName}, четыре аэропорта — четыре четверти. Пройди уроки аэропорта, и в ангаре появится новый самолёт.
        </p>
        <Progress value={readyTotal ? (doneTotal / readyTotal) * 100 : 0} aria-label={`Пройдено ${doneTotal} из ${readyTotal}`} />
        <p className="my-muted">
          Пройдено уроков: {doneTotal} из {readyTotal}. Темы можно брать в любом порядке — как в школе.
        </p>
      </section>

      {next?.lesson ? (
        <section className="my-card my-next">
          <div>
            <span className="my-eyebrow">СЛЕДУЮЩИЙ ПОЛЁТ</span>
            <h2>{next.title}</h2>
            <p>{next.lesson.goal}</p>
          </div>
          <Button size="lg" onClick={() => onStart(next.lesson!)}>
            <Plane />
            Лететь
          </Button>
        </section>
      ) : (
        <section className="my-card my-next">
          <div>
            <span className="my-eyebrow">ВСЕ ГОТОВЫЕ УРОКИ ПРОЙДЕНЫ</span>
            <h2>Отличный налёт!</h2>
            <p>Новые уроки появятся на карте. Пройденные можно повторять сколько хочется.</p>
          </div>
        </section>
      )}

      <Hangar completed={completed} />

      <ol className="my-route">
        {MATH_YEAR.map((quarter) => {
          const progress = quarterProgress(quarter, completed);
          return (
            <li key={quarter.id} className={`my-airport ${progress.complete ? "complete" : ""}`}>
              <div className="my-airport-head">
                <AircraftBadge quarter={quarter} earned={progress.complete} />
                <div>
                  <span className="my-eyebrow">
                    {quarter.number} ЧЕТВЕРТЬ · {quarter.months.toLocaleUpperCase("ru")}
                  </span>
                  <h2>{quarter.title}</h2>
                  <p className="my-muted">
                    {progress.ready
                      ? `Уроков пройдено: ${progress.done} из ${progress.ready}${progress.complete ? ` · в ангаре: ${quarter.aircraft.name}` : ""}`
                      : "Уроки этого аэропорта готовятся"}
                  </p>
                </div>
              </div>
              <ul className="my-topics">
                {quarter.topics.map((item) => {
                  const status = topicStatus(item, completed, next?.id ?? null);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`my-topic ${status}`}
                        disabled={status === "soon"}
                        onClick={() => item.lesson && onStart(item.lesson)}
                        aria-label={`${item.title}. ${STATUS_LABEL[status]}`}
                      >
                        <span className="my-topic-mark" aria-hidden="true">
                          {status === "done" ? <Check size={18} /> : status === "next" ? <Plane size={18} /> : status === "soon" ? <Clock size={16} /> : null}
                        </span>
                        <span className="my-topic-title">{item.title}</span>
                        <span className="my-topic-state">{STATUS_LABEL[status]}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>

      {celebrate && <Celebration quarter={celebrate} soundOn={soundOn} onClose={onCelebrated} />}
    </main>
  );
}

const STATUS_LABEL = {
  done: "пройдено",
  next: "следующий",
  open: "открыто",
  soon: "готовится",
} as const;

function AircraftBadge({ quarter, earned, size = 30 }: { quarter: Quarter; earned: boolean; size?: number }) {
  const Icon = quarter.aircraft.kind === "rocket" ? Rocket : Plane;
  return (
    <span
      className={`my-badge ${earned ? "earned" : ""}`}
      style={{ "--plane": quarter.aircraft.color } as React.CSSProperties}
      aria-hidden="true"
    >
      {earned ? <Icon size={size} /> : <Lock size={size * 0.7} />}
    </span>
  );
}

function Hangar({ completed }: { completed: readonly string[] }) {
  return (
    <section className="my-card my-hangar" aria-label="Мой ангар">
      <span className="my-eyebrow">МОЙ АНГАР</span>
      <div className="my-hangar-row">
        {MATH_YEAR.map((quarter) => {
          const earned = quarterProgress(quarter, completed).complete;
          return (
            <div key={quarter.id} className={`my-hangar-slot ${earned ? "earned" : ""}`}>
              <AircraftBadge quarter={quarter} earned={earned} size={34} />
              <span>{earned ? quarter.aircraft.name : `${quarter.number} четверть`}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Celebration({ quarter, soundOn, onClose }: { quarter: Quarter; soundOn: boolean; onClose: () => void }) {
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    // Салют запускается после появления окна: так его видно, а звук разрешён,
    // потому что ребёнок только что нажал кнопку в уроке.
    const timer = setTimeout(() => setBurst(1), 150);
    if (soundOn) playWin();
    return () => clearTimeout(timer);
  }, [soundOn]);
  return (
    <div className="my-celebration" role="dialog" aria-modal="true" aria-labelledby="my-celebration-title">
      <div className="my-celebration-card">
        <Cheer burst={burst} />
        <AircraftBadge quarter={quarter} earned size={64} />
        <span className="my-eyebrow">{quarter.number} ЧЕТВЕРТЬ ПРОЙДЕНА</span>
        <h2 id="my-celebration-title">{quarter.title} — посадка!</h2>
        <p>
          В ангаре новый борт: <strong>{quarter.aircraft.name}</strong>.
        </p>
        <Button size="lg" onClick={onClose} autoFocus>
          Ура, дальше!
        </Button>
      </div>
    </div>
  );
}
