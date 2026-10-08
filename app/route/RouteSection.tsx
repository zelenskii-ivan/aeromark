"use client";

import { useState } from "react";
import { Check, ChevronLeft, Coffee, Gift, Lock, Star, Timer, TimerReset, TrendingUp } from "lucide-react";
import {
  PRIZES,
  READING_GOAL,
  SCHOOL_BASELINE,
  SHOP_NAME,
  STATIONS,
  STORIES,
  TABLE_SIZE,
  TIMED_RECORD_STARS,
  TIMED_STARS,
  type Prize,
  type Station,
} from "@/content/route";
import { STARS_NOUN, withCount } from "@/content/types";
import { today, type Saved } from "@/lib/progress";
import {
  activeCoupons,
  balance,
  bestWords,
  buyPrize,
  completeStation,
  currentStation,
  isReturnTrip,
  minuteTextFor,
  recordReadingCheck,
  routeOrder,
  stationStatus,
  storyFor,
  formatSeconds,
  minSeconds,
  recordTimedRun,
  storyTimedTarget,
  tableTimedTarget,
  timedHistory,
  type Coupon,
  type TimedTarget,
} from "@/lib/route";
import {
  CoupleStation,
  EndingsStation,
  MinuteCheck,
  SpeakButton,
  Stopwatch,
  StoryStation,
  SyllableText,
  TableStation,
  WordsStation,
} from "./stations";
import "./route.css";

type View =
  | { name: "map" }
  | { name: "station"; station: Station }
  | { name: "reward"; station: Station; stars: number; lapDone: boolean; note?: string }
  | { name: "timed" }
  | { name: "timed-done"; seconds: number; stars: number; record: boolean; previous: number | null; tooFast: boolean; min: number }
  | { name: "minute-gate" }
  | { name: "minute" }
  | { name: "minute-done"; words: number; errors: number; stars: number; record: boolean }
  | { name: "shop" }
  | { name: "coupon"; coupon: Coupon }
  | { name: "coupons" }
  | { name: "growth" };

/**
 * «Путь к Перспективе»: раздел чтения в виде маршрута по району школы.
 * Прогресс живёт в общем Saved, поэтому синхронизируется с семейным
 * сервером так же, как остальной курс.
 */
export function RouteSection({
  saved,
  setSaved,
  parentPin,
  childName,
  onExit,
}: {
  saved: Saved;
  setSaved: (next: Saved) => void;
  parentPin: string;
  childName: string;
  onExit: () => void;
}) {
  const [view, setView] = useState<View>({ name: "map" });
  const date = today();
  const wallet = balance(saved);

  const back = () => setView({ name: "map" });

  const finishStation = (station: Station, base = saved, extraStars = 0, note?: string) => {
    const outcome = completeStation(base, station.id, date);
    setSaved(outcome.next);
    setView({
      name: "reward",
      station,
      stars: outcome.starsEarned + extraStars,
      lapDone: outcome.lapDone,
      note,
    });
  };

  /** Таблица в школе тоже идёт на время: её рекорд — в общем секундомере. */
  const finishTable = (station: Station, seconds: number) => {
    const timed = recordTimedRun(saved, tableTimedTarget(TABLE_SIZE), seconds, date);
    const note = timed.tooFast
      ? undefined
      : timed.record
        ? `Новый рекорд таблицы: ${formatSeconds(seconds)}!`
        : timed.previousBest === null
          ? `Время таблицы: ${formatSeconds(seconds)}. Это твой первый рекорд.`
          : `Время таблицы: ${formatSeconds(seconds)}. Рекорд — ${formatSeconds(timed.previousBest)}.`;
    finishStation(station, timed.next, timed.starsEarned, note);
  };

  const story = storyFor(saved);
  const storyTarget = storyTimedTarget(story);

  const header = (title: string, eyebrow?: string, onBack = back) => (
    <header className="route-head">
      <button type="button" className="route-back" aria-label="Назад" onClick={onBack}>
        <ChevronLeft aria-hidden="true" />
      </button>
      <div className="route-title">
        {eyebrow && <span className="route-eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
      </div>
      <div className="route-stars">
        <Star aria-hidden="true" />
        {wallet}
      </div>
    </header>
  );

  if (view.name === "station") {
    const { station } = view;
    const done = () => finishStation(station);
    return (
      <main className="route">
        {header(station.title, station.place.toLocaleUpperCase("ru"))}
        <SpeakButton text={station.instruction} />
        <p className="route-instruction">{station.instruction}</p>
        {station.kind === "couple" && <CoupleStation onDone={done} seed={date} />}
        {station.kind === "table" && (
          <TableStation onDone={(seconds) => finishTable(station, seconds)} seed={date} />
        )}
        {station.kind === "words" && <WordsStation onDone={done} seed={date} />}
        {station.kind === "endings" && <EndingsStation onDone={done} seed={date} />}
        {station.kind === "story" && <StoryStation onDone={done} story={storyFor(saved)} />}
      </main>
    );
  }

  if (view.name === "reward") {
    const nextStation = currentStation(saved);
    return (
      <main className="route">
        <section className="route-reward">
          <div className="reward-badge">
            <Check aria-hidden="true" />
          </div>
          <h1>{view.lapDone ? "Круг пройден!" : "Остановка пройдена!"}</h1>
          <p>
            {view.stars > 0
              ? `+${withCount(view.stars, STARS_NOUN)}`
              : "Звёзды за эту остановку сегодня уже были. Тренировка всё равно засчитана."}
          </p>
          {view.note && <p className="route-note strong">{view.note}</p>}
          {view.lapDone && (
            <p className="route-note">
              {isReturnTrip(saved)
                ? "Теперь обратный путь: из сквера к школе и к машине."
                : "Снова от парковки к школе. Рассказ в сквере будет новый."}
            </p>
          )}
          <div className="route-actions column">
            <button
              type="button"
              className="route-btn go"
              onClick={() => setView({ name: "station", station: nextStation })}
            >
              Дальше: {nextStation.place}
            </button>
            <button type="button" className="route-btn soft" onClick={back}>
              На карту
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (view.name === "timed") {
    return (
      <main className="route">
        {header("Читаю на время", "СЕКУНДОМЕР")}
        <p className="route-instruction">
          Нажми «Старт», прочитай рассказ вслух до конца и нажми «Стоп». Читай этот рассказ
          каждый день — и смотри, как время становится меньше.
        </p>
        <Stopwatch
          best={saved.timedBest[storyTarget.key] ?? null}
          onFinish={(seconds) => {
            const outcome = recordTimedRun(saved, storyTarget, seconds, date);
            setSaved(outcome.next);
            setView({
              name: "timed-done",
              seconds,
              stars: outcome.starsEarned,
              record: outcome.record,
              previous: outcome.previousBest,
              tooFast: outcome.tooFast,
              min: minSeconds(storyTarget),
            });
          }}
        >
          <SyllableText text={story.text} />
        </Stopwatch>
      </main>
    );
  }

  if (view.name === "timed-done") {
    const history = timedHistory(saved, storyTarget.key);
    return (
      <main className="route">
        <section className="route-reward">
          <div className={`reward-badge ${view.tooFast ? "warn" : ""}`}>
            <TimerReset aria-hidden="true" />
          </div>
          <h1>
            {view.tooFast
              ? "Слишком быстро!"
              : view.record
                ? "Новый рекорд!"
                : formatSeconds(view.seconds)}
          </h1>
          {view.tooFast ? (
            <p className="route-note">
              Так быстро рассказ вслух не прочитать — меньше {view.min} сек. Прочитай его весь, до
              последнего слова, и нажми «Стоп» в конце.
            </p>
          ) : (
            <>
              <p>
                {view.stars > 0
                  ? `+${withCount(view.stars, STARS_NOUN)}`
                  : "Звёзды за этот рассказ сегодня уже были — но рекорд засчитан."}
              </p>
              <p className="route-note">
                {view.record && view.previous !== null
                  ? `${formatSeconds(view.seconds)} — на ${Math.max(1, Math.round(view.previous - view.seconds))} сек быстрее, чем было.`
                  : view.previous === null
                    ? "Это твой первый рекорд. Завтра попробуй быстрее!"
                    : `Рекорд — ${formatSeconds(view.previous)}. Чтобы побить, нужно хотя бы на секунду быстрее.`}
              </p>
              {history.length > 1 && <TimeStrip runs={history} />}
            </>
          )}
          <div className="route-actions column">
            <button type="button" className="route-btn go" onClick={() => setView({ name: "timed" })}>
              Ещё раз
            </button>
            <button type="button" className="route-btn soft" onClick={back}>
              На карту
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (view.name === "minute-gate") {
    return (
      <main className="route">
        {header("Минута чтения", "ДЛЯ ВЗРОСЛОГО")}
        <PinGate
          parentPin={parentPin}
          onOpen={() => setView({ name: "minute" })}
        />
      </main>
    );
  }

  if (view.name === "minute") {
    return (
      <main className="route dark">
        {header("Минута чтения", "РЕЖИМ ВЗРОСЛОГО")}
        <MinuteCheck
          text={minuteTextFor(date)}
          onSave={(result) => {
            const outcome = recordReadingCheck(saved, result, date, SCHOOL_BASELINE.words);
            setSaved(outcome.next);
            setView({
              name: "minute-done",
              words: result.words,
              errors: result.errors,
              stars: outcome.starsEarned,
              record: outcome.record,
            });
          }}
        />
      </main>
    );
  }

  if (view.name === "minute-done") {
    return (
      <main className="route">
        <section className="route-reward">
          <div className="reward-badge">
            <TrendingUp aria-hidden="true" />
          </div>
          <h1>
            {view.words} {view.words === 1 ? "слово" : "слов"} в минуту
          </h1>
          <p>
            {view.record ? "Новый рекорд! " : ""}
            {view.stars > 0 ? `+${withCount(view.stars, STARS_NOUN)}` : "Сегодняшний замер обновлён."}
          </p>
          <p className="route-note">Ошибок: {view.errors}. В школе 30.09 было {SCHOOL_BASELINE.words}.</p>
          <div className="route-actions column">
            <button type="button" className="route-btn go" onClick={() => setView({ name: "growth" })}>
              Посмотреть график
            </button>
            <button type="button" className="route-btn soft" onClick={back}>
              На карту
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (view.name === "growth") {
    return (
      <main className="route">
        {header("Слов в минуту", "МОИ УСПЕХИ")}
        <Growth saved={saved} />
        <Records saved={saved} targets={[storyTarget, tableTimedTarget(TABLE_SIZE)]} />
      </main>
    );
  }

  if (view.name === "shop") {
    return (
      <main className="route">
        {header("Призы")}
        <div className="shop-banner">
          <Coffee aria-hidden="true" />
          <div>
            <b>{SHOP_NAME}</b>
            <span>Выбери приз и покажи код папе или бариста</span>
          </div>
        </div>
        <div className="prize-grid">
          {PRIZES.map((prize) => (
            <PrizeCard
              key={prize.id}
              prize={prize}
              wallet={wallet}
              onBuy={() => {
                const result = buyPrize(saved, prize);
                if (!result) return;
                setSaved(result.next);
                setView({ name: "coupon", coupon: result.coupon });
              }}
            />
          ))}
        </div>
        <p className="goal-banner">
          Большая цель: {READING_GOAL} слов в минуту — поход в кофейню всей семьёй и любой приз.
        </p>
        {activeCoupons(saved).length > 0 && (
          <div className="route-actions">
            <button type="button" className="route-btn soft" onClick={() => setView({ name: "coupons" })}>
              <Gift aria-hidden="true" />
              Мои коды ({activeCoupons(saved).length})
            </button>
          </div>
        )}
      </main>
    );
  }

  if (view.name === "coupon") {
    return (
      <main className="route">
        {header("Твой приз", undefined, () => setView({ name: "shop" }))}
        <CouponCard coupon={view.coupon} />
        <p className="route-note">
          Код работает один раз. Взрослый отметит приз выданным во вкладке «Для взрослого».
        </p>
        <div className="route-actions column">
          <button type="button" className="route-btn go" onClick={back}>
            На карту
          </button>
        </div>
      </main>
    );
  }

  if (view.name === "coupons") {
    const list = activeCoupons(saved);
    return (
      <main className="route">
        {header("Мои коды", undefined, () => setView({ name: "shop" }))}
        {list.length === 0 ? (
          <p className="route-note">Все призы уже получены.</p>
        ) : (
          list.map((coupon) => <CouponCard key={coupon.id} coupon={coupon} />)
        )}
      </main>
    );
  }

  // Карта.
  const order = routeOrder(saved);
  const doneCount = saved.routeDone.length;
  const now = currentStation(saved);
  return (
    <main className="route">
      <header className="route-head">
        <button type="button" className="route-back" aria-label="Выйти из раздела" onClick={onExit}>
          <ChevronLeft aria-hidden="true" />
        </button>
        <div className="route-title">
          <span className="route-eyebrow">ЧТЕНИЕ · ПАШКОВКА</span>
          <h1>Путь к «Перспективе»</h1>
        </div>
        <button type="button" className="route-stars" onClick={() => setView({ name: "shop" })}>
          <Star aria-hidden="true" />
          {wallet}
        </button>
      </header>
      <p className="route-sub">
        {childName}, {isReturnTrip(saved) ? "обратный путь" : "путь в школу"} · пройдено {doneCount} из{" "}
        {order.length}
      </p>

      <div className="route-map">
        <MapArt />
        {STATIONS.map((station) => {
          const status = stationStatus(saved, station.id);
          return (
            <div
              key={station.id}
              className={`map-stop ${status}`}
              style={{ left: `${station.x}%`, top: `${station.y}%` }}
            >
              <button
                type="button"
                disabled={status === "locked"}
                aria-label={`${station.place}: ${
                  status === "done" ? "пройдено" : status === "current" ? "сейчас здесь" : "закрыто"
                }`}
                onClick={() => setView({ name: "station", station })}
              >
                {status === "done" ? (
                  <Check aria-hidden="true" />
                ) : status === "current" ? (
                  childName.slice(0, 1).toLocaleUpperCase("ru")
                ) : (
                  <Lock aria-hidden="true" />
                )}
              </button>
              <span>{station.place}</span>
            </div>
          );
        })}
      </div>

      <section className="route-sheet">
        <span className="route-eyebrow red">{now.place.toLocaleUpperCase("ru")}</span>
        <h2>{now.title}</h2>
        <p>{now.instruction}</p>
        <div className="route-actions">
          <button
            type="button"
            className="route-btn go"
            onClick={() => setView({ name: "station", station: now })}
          >
            Поехали
          </button>
        </div>
        <div className="route-tiles">
          <button type="button" onClick={() => setView({ name: "shop" })}>
            <Gift aria-hidden="true" />
            Призы
          </button>
          <button type="button" onClick={() => setView({ name: "growth" })}>
            <TrendingUp aria-hidden="true" />
            Успехи
          </button>
          <button type="button" onClick={() => setView({ name: "timed" })}>
            <TimerReset aria-hidden="true" />
            На время
          </button>
          <button type="button" onClick={() => setView({ name: "minute-gate" })}>
            <Timer aria-hidden="true" />
            Минута чтения
          </button>
        </div>
      </section>
    </main>
  );
}

function PinGate({ parentPin, onOpen }: { parentPin: string; onOpen: () => void }) {
  const [entry, setEntry] = useState("");
  const [error, setError] = useState("");
  if (!parentPin) {
    return (
      <p className="route-note">
        Сначала придумайте PIN во вкладке «Для взрослого» на главном экране — минуту чтения
        проводит взрослый.
      </p>
    );
  }
  const submit = () => {
    if (entry === parentPin) onOpen();
    else setError("Неверный PIN.");
  };
  return (
    <div className="route-pin">
      <p>Ребёнок читает вслух, взрослый отмечает ошибки. Введите PIN взрослого.</p>
      <div className="route-pin-row">
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          value={entry}
          aria-label="PIN взрослого"
          placeholder="••••"
          onChange={(event) => setEntry(event.target.value.replace(/\D/g, ""))}
          onKeyDown={(event) => event.key === "Enter" && submit()}
        />
        <button type="button" className="route-btn go" onClick={submit}>
          Открыть
        </button>
      </div>
      <div aria-live="polite">{error && <p className="route-note">{error}</p>}</div>
    </div>
  );
}

function PrizeCard({ prize, wallet, onBuy }: { prize: Prize; wallet: number; onBuy: () => void }) {
  const [armed, setArmed] = useState(false);
  const can = prize.price <= wallet;
  return (
    <article className="prize">
      <h3>{prize.title}</h3>
      <span className="price">
        <Star aria-hidden="true" />
        {prize.price}
      </span>
      {!can ? (
        <button type="button" className="prize-btn" disabled>
          Ещё {prize.price - wallet}
        </button>
      ) : armed ? (
        <div className="prize-confirm">
          <button type="button" className="prize-btn go" onClick={onBuy}>
            Да, беру
          </button>
          <button type="button" className="prize-btn" onClick={() => setArmed(false)}>
            Нет
          </button>
        </div>
      ) : (
        <button type="button" className="prize-btn dark" onClick={() => setArmed(true)}>
          Взять
        </button>
      )}
    </article>
  );
}

function CouponCard({ coupon }: { coupon: Coupon }) {
  return (
    <article className="coupon">
      <span className="route-eyebrow">
        {`${coupon.title} · ${withCount(coupon.price, STARS_NOUN)}`.toLocaleUpperCase("ru")}
      </span>
      <div className="coupon-code" aria-label={`Код ${coupon.code.split("").join(" ")}`}>
        {coupon.code}
      </div>
      <p>Покажи этот код папе или бариста.</p>
    </article>
  );
}

function Growth({ saved }: { saved: Saved }) {
  const checks = saved.readingChecks.slice(-6);
  const bars = [
    { label: "30.09 школа", words: SCHOOL_BASELINE.words, kind: "bar-school" },
    ...checks.map((check) => ({
      label: `${check.date.slice(8, 10)}.${check.date.slice(5, 7)}`,
      words: check.words,
      kind: "bar-home",
    })),
    { label: "цель", words: READING_GOAL, kind: "bar-goal" },
  ];
  const max = Math.max(READING_GOAL, ...bars.map((bar) => bar.words));
  const best = bestWords(saved, SCHOOL_BASELINE.words);
  return (
    <section className="growth">
      <p className="route-note">
        Лучший результат: <b>{best}</b> слов в минуту. Цель к концу 1 класса — {READING_GOAL}.
      </p>
      <div className="bars" role="img" aria-label={`Слов в минуту: ${bars.map((b) => `${b.label} — ${b.words}`).join(", ")}`}>
        {bars.map((bar, i) => (
          <div key={i} className="bar-col">
            <b>{bar.words}</b>
            <span className={`bar ${bar.kind}`} style={{ height: `calc((100% - 26px) * ${bar.words / max})` }} />
          </div>
        ))}
      </div>
      <div className="bar-labels">
        {bars.map((bar, i) => (
          <span key={i}>{bar.label}</span>
        ))}
      </div>
      {checks.length === 0 && (
        <p className="route-note">
          Первый домашний замер появится после «Минуты чтения». Её удобно делать по пятницам.
        </p>
      )}
    </section>
  );
}

/** Стилизованная карта района: Садовая, трамвай, Кирова и сквер. Не в масштабе. */
function MapArt() {
  return (
    <svg viewBox="0 0 390 500" preserveAspectRatio="none" aria-hidden="true">
      <rect width="390" height="500" fill="#E9F0DC" />
      <rect x="14" y="20" width="130" height="130" rx="10" fill="#F4ECDB" />
      <rect x="14" y="196" width="140" height="56" rx="10" fill="#F4ECDB" />
      <rect x="196" y="196" width="180" height="56" rx="10" fill="#F4ECDB" />
      <rect x="196" y="296" width="180" height="190" rx="10" fill="#F4ECDB" />
      <rect x="14" y="296" width="140" height="100" rx="10" fill="#F4ECDB" />
      <rect x="226" y="24" width="150" height="128" rx="22" fill="#9CCB86" />
      <circle cx="252" cy="52" r="13" fill="#2E8B57" />
      <circle cx="352" cy="50" r="12" fill="#2E8B57" />
      <circle cx="350" cy="128" r="14" fill="#2E8B57" />
      <circle cx="248" cy="130" r="11" fill="#2E8B57" />
      <rect x="0" y="162" width="390" height="22" fill="#D8D1C3" />
      <rect x="168" y="162" width="20" height="338" fill="#D8D1C3" />
      <rect x="0" y="260" width="390" height="26" fill="#C9C1B1" />
      <line x1="0" y1="268" x2="390" y2="268" stroke="#6B6458" strokeWidth="2" />
      <line x1="0" y1="278" x2="390" y2="278" stroke="#6B6458" strokeWidth="2" />
      <rect x="150" y="250" width="44" height="18" rx="5" fill="#D7352B" />
      <rect x="155" y="254" width="9" height="7" rx="1.5" fill="#FFF7E8" />
      <rect x="167" y="254" width="9" height="7" rx="1.5" fill="#FFF7E8" />
      <rect x="179" y="254" width="9" height="7" rx="1.5" fill="#FFF7E8" />
      <rect x="212" y="322" width="150" height="96" rx="8" fill="#F2B705" />
      <rect x="212" y="310" width="150" height="16" rx="4" fill="#D7352B" />
      <rect x="224" y="340" width="20" height="20" rx="3" fill="#FFF7E8" />
      <rect x="254" y="340" width="20" height="20" rx="3" fill="#FFF7E8" />
      <rect x="300" y="340" width="20" height="20" rx="3" fill="#FFF7E8" />
      <rect x="330" y="340" width="20" height="20" rx="3" fill="#FFF7E8" />
      <rect x="276" y="380" width="22" height="38" rx="3" fill="#22303C" />
      <rect x="22" y="420" width="132" height="66" rx="8" fill="#B9C3CC" />
      <line x1="56" y1="424" x2="56" y2="482" stroke="#fff" strokeWidth="2" />
      <line x1="88" y1="424" x2="88" y2="482" stroke="#fff" strokeWidth="2" />
      <line x1="120" y1="424" x2="120" y2="482" stroke="#fff" strokeWidth="2" />
      <path
        d="M90 455 L178 455 L178 390 L238 390 M178 390 L178 300 L95 300 L95 273 M95 273 L290 273 M290 273 L290 205 L300 205 L300 100"
        fill="none"
        stroke="#22303C"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="2 10"
      />
      <text x="20" y="157" fontSize="11" fontWeight="800" fill="#55626D">ул. Кирова</text>
      <text x="8" y="255" fontSize="11" fontWeight="800" fill="#55626D">трамвай</text>
      <text fontSize="11" fontWeight="800" fill="#55626D" transform="translate(182 254) rotate(-90)">
        ул. Садовая
      </text>
    </svg>
  );
}

/** Полоска последних заходов: столбик короче — прочитал быстрее. */
function TimeStrip({ runs }: { runs: { date: string; seconds: number }[] }) {
  const max = Math.max(...runs.map((run) => run.seconds));
  return (
    <div className="time-strip" role="img" aria-label={`Последние заходы: ${runs.map((r) => formatSeconds(r.seconds)).join(", ")}`}>
      {runs.map((run, i) => (
        <div key={i}>
          <span style={{ height: `${Math.max(12, (run.seconds / max) * 100)}%` }} className={i === runs.length - 1 ? "last" : ""} />
          <b>{Math.round(run.seconds)}</b>
        </div>
      ))}
    </div>
  );
}

function Records({ saved, targets }: { saved: Saved; targets: TimedTarget[] }) {
  return (
    <section className="records">
      <h2>Рекорды на время</h2>
      {targets.map((target) => {
        const best = saved.timedBest[target.key];
        return (
          <div key={target.key} className="record-row">
            <span>{target.title}</span>
            <b>{best === undefined ? "ещё нет" : formatSeconds(best)}</b>
          </div>
        );
      })}
      <p className="route-note">
        За чтение на время — {withCount(TIMED_STARS, STARS_NOUN)} в день за каждый текст, за побитый
        рекорд ещё {TIMED_RECORD_STARS}. В сквере новый рассказ появляется на каждом круге маршрута
        (всего рассказов: {STORIES.length}).
      </p>
    </section>
  );
}
