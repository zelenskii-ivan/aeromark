"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  BookOpen,
  Calculator,
  Check,
  ChevronRight,
  Download,
  Flame,
  Gauge,
  Gamepad2,
  Infinity as InfinityIcon,
  Lock,
  LockOpen,
  Plane,
  RotateCcw,
  Star,
  Target,
  Trophy,
  Upload,
  Volume2,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { diagnostic, missions } from "@/content/tasks";
import { mathBooks, readBooks } from "@/content/method";
import { generateSession } from "@/content/generator";
import {
  DAYS_NOUN,
  isCorrect,
  MISSIONS_NOUN,
  plural,
  STARS_NOUN,
  TASKS_NOUN,
  withCount,
  type Mission,
  type Task,
} from "@/content/types";
import {
  applyAnswer,
  initialProgress,
  loadProgress,
  parseExport,
  PIN_KEY,
  PROGRESS_KEY,
  serializeExport,
  skillRows,
  touchStreak,
  type Saved,
} from "@/lib/progress";
import { cancelSpeech, primeVoices, speakTask } from "@/lib/speech";
import { useSync } from "@/lib/sync";
import { SyncPanel } from "@/app/sync-panel";
import {
  isPersistent,
  readValue,
  removeValue,
  writeValue,
} from "@/lib/storage";

const FlightGame = dynamic(() => import("@/app/game/FlightGame"), {
  ssr: false,
  loading: () => (
    <main className="loading">
      <Plane />
    </main>
  ),
});

const NAME_KEY = "aeromark-child-name";
const DEFAULT_NAME = "Марк";
const PRACTICE_LENGTH = 8;

type Mode =
  | "home"
  | "diagnostic"
  | "mission"
  | "mistakes"
  | "practice"
  | "game";

/** Все статичные задачи по id — на этом держится режим работы над ошибками. */
const taskIndex = new Map<string, Task>(
  [...diagnostic, ...missions.flatMap((mission) => mission.tasks)].map(
    (task) => [task.id, task],
  ),
);

const LESSON_TITLE: Record<"diagnostic" | "mistakes" | "practice", string> = {
  diagnostic: "Проверочный полёт",
  mistakes: "Работа над ошибками",
  practice: "Бесконечная тренировка",
};

export default function Home() {
  const [saved, setSaved] = useState<Saved>(initialProgress);
  const [loaded, setLoaded] = useState(false);
  const [childName, setChildName] = useState(DEFAULT_NAME);
  const [nameDraft, setNameDraft] = useState("");

  const [parentPin, setParentPin] = useState("");
  const [pinEntry, setPinEntry] = useState("");
  const [parentUnlocked, setParentUnlocked] = useState(false);
  const [pinMessage, setPinMessage] = useState("");
  const [resetArmed, setResetArmed] = useState(false);
  const [transferNote, setTransferNote] = useState("");
  const [persistent, setPersistent] = useState(true);

  const [mode, setMode] = useState<Mode>("home");
  const [mission, setMission] = useState<Mission | null>(null);
  const [queue, setQueue] = useState<Task[]>([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState("");
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState(false);
  const [right, setRight] = useState(false);
  const [starEarned, setStarEarned] = useState(false);

  useEffect(() => {
    // Страница пререндерится статически, поэтому прогресс нельзя прочитать в
    // инициализаторе useState: серверная и клиентская разметка разойдутся.
    // Читаем один раз после монтирования, до этого показываем заставку.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(touchStreak(loadProgress()));
    setParentPin(readValue(PIN_KEY) ?? "");
    setChildName(readValue(NAME_KEY) || DEFAULT_NAME);
    setPersistent(isPersistent());
    // setLoaded обязан выполниться при любом исходе чтения, иначе приложение
    // навсегда остаётся на заставке.
    setLoaded(true);
    const stopVoices = primeVoices();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then((registration) => {
          // Отдаём worker\'у список уже загруженных ресурсов, чтобы приложение
          // открывалось офлайн начиная с первого визита, а не со второго.
          const warm = () =>
            registration.active?.postMessage({
              type: "warm",
              urls: performance
                .getEntriesByType("resource")
                .map((entry) => entry.name)
                .filter((url) => url.startsWith(location.origin)),
            });
          if (document.readyState === "complete") warm();
          else window.addEventListener("load", warm, { once: true });
        })
        .catch(() => {});
    }
    return () => {
      stopVoices();
      cancelSpeech();
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    writeValue(PROGRESS_KEY, JSON.stringify(saved));
  }, [saved, loaded]);

  // Синхронизация с семейным сервером. Источник правды — это устройство:
  // хук только отправляет изменения и предлагает выбор при расхождении.
  const sync = useSync(saved, setSaved);
  // Если подключён серверный профиль, имя на экране берётся из него: иначе
  // на двух устройствах у одного ребёнка оказались бы разные имена.
  const activeChild = sync.state.account?.children.find(
    (child) => child.id === sync.state.childId,
  );
  const pilotName = activeChild?.name ?? childName;

  // Речь не должна продолжаться поверх следующего экрана.
  useEffect(() => cancelSpeech, [mode, index]);

  const task = queue[index];
  const skills = useMemo(() => skillRows(saved), [saved]);
  const weakest = skills[0];
  const mistakeTasks = useMemo(
    () =>
      saved.mistakes
        .map((id) => taskIndex.get(id))
        .filter((item): item is Task => Boolean(item)),
    [saved.mistakes],
  );
  const gameUnlocked = saved.completed.length >= 2;
  const gameComplete = saved.gameWins.includes("hangar-parts");

  const beginLesson = useCallback(
    (nextMode: Mode, tasks: Task[], target: Mission | null = null) => {
      if (!tasks.length) return;
      setMode(nextMode);
      setMission(target);
      setQueue(tasks);
      setIndex(0);
      setPicked("");
      setTyped("");
      setChecked(false);
    },
    [],
  );

  const startDiagnostic = () => beginLesson("diagnostic", diagnostic);
  const startMission = (target: Mission) =>
    beginLesson("mission", target.tasks, target);
  const startMistakes = () => beginLesson("mistakes", mistakeTasks);
  const startPractice = () =>
    beginLesson(
      "practice",
      generateSession(PRACTICE_LENGTH, Date.now() % 1_000_000, weakest?.skill),
    );

  const check = () => {
    if (!task) return;
    const response = task.options.length ? picked : typed;
    if (!response.trim()) return;
    const ok = isCorrect(response, task);
    setRight(ok);
    setChecked(true);
    const outcome = applyAnswer(saved, task, ok);
    setStarEarned(outcome.starEarned);
    setSaved(outcome.next);
  };

  const finish = () => {
    setSaved((current) => ({
      ...current,
      diagnosticDone: current.diagnosticDone || mode === "diagnostic",
      completed:
        mission && !current.completed.includes(mission.id)
          ? [...current.completed, mission.id]
          : current.completed,
    }));
    setMode("home");
    setMission(null);
    setQueue([]);
  };

  const advance = () => {
    setIndex((value) => value + 1);
    setPicked("");
    setTyped("");
    setChecked(false);
  };

  const next = () => {
    if (index < queue.length - 1) {
      advance();
      return;
    }
    if (mode === "practice") {
      // Тренировка бесконечная: докладываем следующую пачку вместо выхода.
      setQueue((current) => [
        ...current,
        ...generateSession(
          PRACTICE_LENGTH,
          (Date.now() + current.length) % 1_000_000,
          weakest?.skill,
        ),
      ]);
      advance();
      return;
    }
    finish();
  };

  const completeGame = () => {
    setSaved((current) =>
      current.gameWins.includes("hangar-parts")
        ? current
        : {
            ...current,
            stars: current.stars + 3,
            gameWins: [...current.gameWins, "hangar-parts"],
          },
    );
    setMode("home");
  };

  const submitPin = () => {
    if (!/^\d{4}$/.test(pinEntry)) {
      setPinMessage("Введите ровно четыре цифры.");
      return;
    }
    if (!parentPin) {
      writeValue(PIN_KEY, pinEntry);
      setParentPin(pinEntry);
    } else if (pinEntry !== parentPin) {
      setPinMessage("Неверный PIN.");
      return;
    }
    setParentUnlocked(true);
    setPinEntry("");
    setPinMessage("");
  };

  const saveName = () => {
    const value = nameDraft.trim().slice(0, 20);
    if (!value) return;
    setChildName(value);
    setNameDraft("");
    writeValue(NAME_KEY, value);
  };

  const exportProgress = () => {
    const url = URL.createObjectURL(
      new Blob([serializeExport(saved)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `aeromark-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setTransferNote("Файл прогресса скачан.");
  };

  const importProgress = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const restored = parseExport(String(reader.result));
        setSaved(touchStreak(restored));
        setTransferNote(`Прогресс восстановлен: ${restored.stars} звёзд.`);
      } catch {
        setTransferNote("Не удалось прочитать файл прогресса.");
      }
    };
    reader.onerror = () => setTransferNote("Файл не открылся.");
    reader.readAsText(file);
  };

  const confirmReset = () => {
    setSaved(touchStreak(initialProgress));
    setResetArmed(false);
    setTransferNote("Прогресс стёрт.");
    removeValue(PROGRESS_KEY);
  };

  if (!loaded) {
    return (
      <main className="loading">
        <Plane />
      </main>
    );
  }

  if (mode === "game") {
    return (
      <FlightGame onExit={() => setMode("home")} onComplete={completeGame} />
    );
  }

  if (mode !== "home" && task) {
    const infinite = mode === "practice";
    const title =
      mode === "mission"
        ? (mission?.title ?? "Миссия")
        : LESSON_TITLE[mode];
    return (
      <main className="lesson">
        <section>
          <header>
            <Button variant="outline" onClick={finish}>
              ← Карта
            </Button>
            <div className="lesson-progress">
              <div>
                <b>{title}</b>
                <span>
                  {infinite
                    ? `задание ${index + 1}`
                    : `${index + 1} / ${queue.length}`}
                </span>
              </div>
              <Progress
                value={infinite ? 100 : ((index + 1) / queue.length) * 100}
              />
            </div>
            <div className="star-pill">
              <Star />
              {saved.stars}
            </div>
          </header>
          <article className="task-card">
            <div className="task-top">
              <span className="skill-chip">{task.skill}</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Прочитать вслух"
                onClick={() => speakTask(task)}
              >
                <Volume2 />
              </Button>
            </div>
            {task.read && (
              <div className="reading-box">
                <BookOpen />
                <p>{task.read}</p>
              </div>
            )}
            <h1>{task.prompt}</h1>
            {task.options.length ? (
              <div
                className="answers"
                role="radiogroup"
                aria-label="Варианты ответа"
              >
                {task.options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={picked === option}
                    disabled={checked}
                    onClick={() => setPicked(option)}
                    className={`answer ${picked === option ? "selected" : ""} ${
                      checked && option === task.answer ? "correct" : ""
                    } ${
                      checked && picked === option && option !== task.answer
                        ? "wrong"
                        : ""
                    }`}
                  >
                    <span>{option}</span>
                    {checked && option === task.answer && <Check />}
                  </button>
                ))}
              </div>
            ) : (
              <div className="input-answer">
                <label htmlFor="pilot-answer">Ответ пилота</label>
                <input
                  id="pilot-answer"
                  autoFocus
                  disabled={checked}
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && check()}
                  placeholder="Напиши ответ"
                />
              </div>
            )}
            <div aria-live="polite">
              {checked && (
                <div className={`feedback ${right ? "good" : "try"}`}>
                  <strong>
                    {right
                      ? "Верно! Отличная работа, пилот!"
                      : "Почти! Давай разберёмся."}
                  </strong>
                  <p>
                    {right
                      ? starEarned
                        ? "Получена новая звезда ⭐"
                        : "Ответ верный. Звезда за это задание уже получена."
                      : task.hint}
                  </p>
                  {!right && (
                    <>
                      <p>
                        Правильный ответ: <b>{task.answer}</b>
                      </p>
                      <button
                        type="button"
                        className="slow-speech"
                        onClick={() => speakTask(task, true)}
                      >
                        <Volume2 />
                        Послушать медленнее
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            <footer>
              {!checked ? (
                <Button
                  size="lg"
                  disabled={!(task.options.length ? picked : typed.trim())}
                  onClick={check}
                >
                  Проверить
                </Button>
              ) : (
                <Button size="lg" onClick={next}>
                  {!infinite && index === queue.length - 1
                    ? "Завершить полёт"
                    : "Дальше"}
                  <ChevronRight />
                </Button>
              )}
            </footer>
          </article>
        </section>
      </main>
    );
  }

  return (
    <main className="home">
      <section className="map-hero">
        <div className="hero-overlay">
          <nav>
            <div className="brand">
              <span>
                <Plane />
              </span>
              АЭРОМАРК
            </div>
            <div className="pill-row">
              {saved.streak > 1 && (
                <div className="star-pill streak-pill">
                  <Flame />
                  {withCount(saved.streak, DAYS_NOUN)}
                </div>
              )}
              <div className="star-pill">
                <Star />
                {withCount(saved.stars, STARS_NOUN)}
              </div>
            </div>
          </nav>
          <div className="hero-copy">
            <p>ЛИЧНЫЙ УЧЕБНЫЙ БОРТ: {pilotName.toLocaleUpperCase("ru")}</p>
            <h1>Готов к новому полёту?</h1>
            <span>Математика • Русский язык • Чтение</span>
          </div>
        </div>
      </section>
      <div className="shell">
        <Tabs defaultValue="missions" className="tabs">
          <TabsList className="main-tabs">
            <TabsTrigger value="missions">
              <Plane />
              Полёты
            </TabsTrigger>
            <TabsTrigger value="progress">
              <Gauge />
              Прогресс
            </TabsTrigger>
            <TabsTrigger value="parents">
              <Wrench />
              Для взрослого
            </TabsTrigger>
          </TabsList>

          <TabsContent value="missions" className="tab-content">
            {!saved.diagnosticDone ? (
              <article className="diagnostic-card">
                <div>
                  <span className="eyebrow">НАЧАТЬ ОТСЮДА</span>
                  <h2>Проверочный полёт</h2>
                  <p>
                    {withCount(diagnostic.length, TASKS_NOUN)} определят
                    стартовый уровень. Примерно 12 минут.
                  </p>
                </div>
                <Button size="lg" onClick={startDiagnostic}>
                  Начать диагностику
                  <ChevronRight />
                </Button>
              </article>
            ) : (
              <article className="captain-card">
                <div className="captain-icon">🧑‍✈️</div>
                <div>
                  <span className="eyebrow">СОВЕТ ШТУРМАНА</span>
                  <h2>
                    Сегодня потренируем: {weakest?.skill ?? "смешанные задания"}
                  </h2>
                  <p>
                    {weakest
                      ? `Пока получается ${weakest.pct}% — начнём с этой темы.`
                      : "Начни любую миссию, и здесь появится персональный совет."}
                  </p>
                  <Button onClick={startPractice}>
                    <Target />
                    Тренировать эту тему
                  </Button>
                </div>
              </article>
            )}

            <div className="action-grid">
              <article
                className={`action-card ${mistakeTasks.length ? "" : "muted"}`}
              >
                <div>
                  <span className="eyebrow">РАБОТА НАД ОШИБКАМИ</span>
                  <h3>
                    {mistakeTasks.length
                      ? `${mistakeTasks.length} на повтор`
                      : "Ошибок нет — чистое небо"}
                  </h3>
                  <p>
                    Задания с неверным ответом возвращаются сюда, пока не будут
                    решены правильно.
                  </p>
                </div>
                <Button disabled={!mistakeTasks.length} onClick={startMistakes}>
                  <RotateCcw />
                  Повторить
                </Button>
              </article>

              <article className="action-card">
                <div>
                  <span className="eyebrow">ТРЕНАЖЁР</span>
                  <h3>Бесконечная тренировка</h3>
                  <p>
                    Задания генерируются заново каждый раз и не кончаются:
                    счёт в пределах 20, слоги, звуки, ряды фигур, знаки в конце
                    предложения и короткие тексты. Решено всего:{" "}
                    {saved.practiceAnswered}.
                  </p>
                </div>
                <Button onClick={startPractice}>
                  <InfinityIcon />
                  Тренироваться
                </Button>
              </article>
            </div>

            <div className="section-heading">
              <div>
                <span className="eyebrow">КАРТА КУРСА</span>
                <h2>{missions.length} учебных {plural(missions.length, MISSIONS_NOUN)}</h2>
              </div>
              <span>
                {saved.completed.length} из {missions.length} завершено
              </span>
            </div>

            <article
              className={`action-card game-card ${gameUnlocked ? "" : "muted"}`}
            >
              <div>
                <span className="eyebrow">
                  {gameUnlocked ? "🎮" : "🔒"} ИГРОВОЙ ЭПИЗОД 01
                </span>
                <h3>Парк Аэромарка: обби-маршрут</h3>
                <p>
                  {gameComplete
                    ? "Пройдено — можно играть снова без награды."
                    : gameUnlocked
                      ? "Трёхмерная мини-игра открыта. Награда: 3 звезды."
                      : "Заверши две учебные миссии, чтобы открыть игру."}
                </p>
              </div>
              <Button
                size="lg"
                disabled={!gameUnlocked}
                onClick={() => setMode("game")}
              >
                <Gamepad2 />
                {gameComplete ? "Играть снова" : "Начать игру"}
              </Button>
            </article>

            <div className="mission-grid">
              {missions.map((item) => {
                const done = saved.completed.includes(item.id);
                const locked = item.id > 2 && !gameComplete && !done;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={locked}
                    onClick={() => startMission(item)}
                    className={`mission-card ${done ? "done" : ""}`}
                    style={{ "--mission": item.color } as React.CSSProperties}
                  >
                    <div>
                      <span>{String(item.id).padStart(2, "0")}</span>
                      <i>{done ? "✓" : item.icon}</i>
                    </div>
                    <h3>{item.title}</h3>
                    <p>{item.subtitle}</p>
                    <footer>
                      <span>
                        {locked
                          ? "Сначала игровой эпизод"
                          : withCount(item.tasks.length, TASKS_NOUN)}
                      </span>
                      {locked ? <Lock /> : <ChevronRight />}
                    </footer>
                  </button>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="progress" className="tab-content">
            <section className="panel">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">БОРТОВОЙ ЖУРНАЛ</span>
                  <h2>Навыки</h2>
                </div>
                <Trophy className="trophy" />
              </div>
              {skills.length === 0 ? (
                <div className="empty">
                  <Gauge />
                  <h3>Сначала пройдём диагностику</h3>
                  <p>Здесь появятся сильные стороны и навыки для тренировки.</p>
                  <Button onClick={startDiagnostic}>Начать</Button>
                </div>
              ) : (
                <div className="skills">
                  {skills.map((row) => (
                    <div key={row.skill}>
                      <div>
                        <strong>{row.skill}</strong>
                        <span>
                          {row.right} из {row.total} • {row.pct}%
                        </span>
                      </div>
                      <Progress value={row.pct} />
                    </div>
                  ))}
                </div>
              )}
              <div className="stats">
                <div>
                  <Star />
                  <strong>{saved.stars}</strong>
                  <span>{plural(saved.stars, STARS_NOUN)}</span>
                </div>
                <div>
                  <Check />
                  <strong>{saved.completed.length}</strong>
                  <span>{plural(saved.completed.length, MISSIONS_NOUN)}</span>
                </div>
                <div>
                  <RotateCcw />
                  <strong>{mistakeTasks.length}</strong>
                  <span>повторить</span>
                </div>
                <div>
                  <Flame />
                  <strong>{saved.streak}</strong>
                  <span>{plural(saved.streak, DAYS_NOUN)} подряд</span>
                </div>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="parents" className="tab-content">
            {!parentUnlocked ? (
              <section className="panel parent-gate">
                <div className="gate-icon">
                  <Lock />
                </div>
                <span className="eyebrow">РОДИТЕЛЬСКИЙ ДОСТУП</span>
                <h2>{parentPin ? "Введите PIN" : "Создайте PIN"}</h2>
                <p>
                  {parentPin
                    ? "Настройки и перенос прогресса защищены на этом устройстве."
                    : "Придумайте четыре цифры. Они будут храниться только на этом устройстве."}
                </p>
                <div className="pin-row">
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={pinEntry}
                    onChange={(event) =>
                      setPinEntry(event.target.value.replace(/\D/g, ""))
                    }
                    onKeyDown={(event) => event.key === "Enter" && submitPin()}
                    aria-label="Четырёхзначный PIN"
                    placeholder="••••"
                  />
                  <Button onClick={submitPin}>
                    <LockOpen />
                    {parentPin ? "Открыть" : "Сохранить"}
                  </Button>
                </div>
                <div aria-live="polite">
                  {pinMessage && (
                    <strong className="pin-error">{pinMessage}</strong>
                  )}
                </div>
                <p className="fine-print">
                  PIN закрывает настройки от ребёнка, но не защищает данные: он
                  хранится в этом браузере в открытом виде.
                </p>
              </section>
            ) : (
              <>
                <section className="panel">
                  <div className="parent-title">
                    <div>
                      <span className="eyebrow">ПРОФИЛЬ</span>
                      <h2>Имя на этом устройстве</h2>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => setParentUnlocked(false)}
                    >
                      <Lock />
                      Закрыть
                    </Button>
                  </div>
                  <p className="lead">
                    {activeChild ? (
                      <>
                        Подключён серверный профиль <b>{activeChild.name}</b> —
                        его имя и показывается на главном экране. Локальное имя
                        (<b>{childName}</b>) используется, пока профиль не
                        подключён.
                      </>
                    ) : (
                      <>
                        Сейчас: <b>{childName}</b>. Имя подставляется на главный
                        экран.
                      </>
                    )}
                  </p>
                  <div className="pin-row">
                    <input
                      maxLength={20}
                      value={nameDraft}
                      onChange={(event) => setNameDraft(event.target.value)}
                      onKeyDown={(event) => event.key === "Enter" && saveName()}
                      aria-label="Имя на этом устройстве"
                      placeholder={childName}
                    />
                    <Button onClick={saveName} disabled={!nameDraft.trim()}>
                      Сохранить
                    </Button>
                  </div>
                </section>

                <section className="panel">
                  <span className="eyebrow">МЕТОДИКА</span>
                  <h2>Из чего собран курс</h2>
                  <p className="lead">
                    Авторская авиационная программа в рамках требований 1
                    класса. Мы сравнили пять сильных математических и пять
                    языковых линий и взяли их лучшие механики.
                  </p>
                  <Research
                    title="Математика"
                    icon={<Calculator />}
                    rows={mathBooks}
                  />
                  <Research
                    title="Русский и чтение"
                    icon={<BookOpen />}
                    rows={readBooks}
                  />
                </section>

                <SyncPanel sync={sync} saved={saved} />

                <section className="panel">
                  <span className="eyebrow">ДАННЫЕ</span>
                  <h2>Перенос прогресса файлом</h2>
                  <p className="lead">
                    Скачайте файл на старом устройстве и загрузите его на новом.
                    Так сохранятся звёзды, ошибки и завершённые миссии.
                  </p>
                  <div className="parent-actions">
                    <Button onClick={exportProgress}>
                      <Download />
                      Скачать прогресс
                    </Button>
                    <label className="file-button">
                      <Upload />
                      Загрузить прогресс
                      <input
                        type="file"
                        accept="application/json,.json"
                        onChange={(event) => {
                          importProgress(event.target.files?.[0]);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                    {resetArmed ? (
                      <>
                        <Button variant="destructive" onClick={confirmReset}>
                          Да, стереть всё
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setResetArmed(false)}
                        >
                          Отмена
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => setResetArmed(true)}
                      >
                        <RotateCcw />
                        Сбросить
                      </Button>
                    )}
                  </div>
                  <div aria-live="polite">
                    {transferNote && <p className="lead">{transferNote}</p>}
                  </div>
                </section>

                {!persistent && (
                  <section className="panel">
                    <span className="eyebrow">ВНИМАНИЕ</span>
                    <h2>Браузер не разрешает хранить данные</h2>
                    <p className="lead">
                      Прогресс сохраняется только до закрытия вкладки. Обычно
                      это приватный режим или запрет на хранение данных сайта.
                      Чтобы не потерять звёзды, скачайте файл прогресса.
                    </p>
                  </section>
                )}
                <section className="panel install-card">
                  <div>
                    <span className="eyebrow">ПРИЛОЖЕНИЕ</span>
                    <h2>Установить на Mac</h2>
                    <p>
                      Откройте сайт в Safari и выберите «Файл → Добавить в
                      Dock». После первого открытия основные экраны работают и
                      без интернета.
                    </p>
                  </div>
                  <div className="offline-badge">✓ PWA готово</div>
                </section>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function Research({
  title,
  icon,
  rows,
}: {
  title: string;
  icon: React.ReactNode;
  rows: string[][];
}) {
  return (
    <>
      <h3 className="research-title">
        {icon}
        {title}
      </h3>
      <div className="research">
        {rows.map((row, position) => (
          <article key={row[0]}>
            <b>{position + 1}</b>
            <div>
              <h4>{row[0]}</h4>
              <p>{row[1]}</p>
              <span>{row[2]}</span>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
