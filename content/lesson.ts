import type { Skill, Task } from "./types.ts";

/**
 * Модель урока.
 *
 * Прежний тренажёр умел только спрашивать и сверять ответ — это контроль, а не
 * обучение. Здесь урок собран из фаз, общих для всех разобранных методик:
 * ребёнок сначала упирается в задачу, потом открывает способ руками, переводит
 * открытие в схему, и только затем получает правило. Подробности и источники —
 * в docs/METHODOLOGY.md.
 */

export type Subject = "Математика" | "Русский язык" | "Чтение" | "Английский";

export const SUBJECTS: readonly Subject[] = [
  "Математика",
  "Русский язык",
  "Чтение",
  "Английский",
];

/** Фазы идут строго в этом порядке, переставлять нельзя. */
export type Phase =
  | "hook"
  | "warmup"
  | "trial"
  | "explore"
  | "model"
  | "sign"
  | "rule"
  | "guided"
  | "practice"
  | "transfer"
  | "reflect";

export const PHASE_ORDER: readonly Phase[] = [
  "hook",
  "warmup",
  "trial",
  "explore",
  "model",
  "sign",
  "rule",
  "guided",
  "practice",
  "transfer",
  "reflect",
];

export const PHASE_TITLE: Record<Phase, string> = {
  hook: "Задание от диспетчера",
  warmup: "Разогрев",
  trial: "Попробуем сами",
  explore: "Разбираемся руками",
  model: "Собираем схему",
  sign: "Записываем",
  rule: "Как это работает",
  guided: "Тренируемся со схемой",
  practice: "Теперь сам",
  transfer: "Проверим, понял ли",
  reflect: "Что теперь умею",
};

type Base = { id: string; phase: Phase };

/** Персонаж говорит. Ввода нет — это объяснение, а не вопрос. */
export type SayStep = Base & {
  kind: "say";
  character: string;
  text: string;
  /** Реплика для озвучки, если отличается от текста на экране. */
  speech?: string;
};

/** Правило как итог: ребёнок видит формулировку после того, как её вывел. */
export type RuleStep = Base & {
  kind: "rule";
  title: string;
  text: string;
};

/** Обычный вопрос с вариантами или свободным вводом — прежний тип задачи. */
export type AskStep = Base & { kind: "ask"; task: Task };

/**
 * Числовой домик: целое и две части. Ровно одна ячейка пустая.
 * Обслуживает состав числа, сложение, вычитание и четыре равенства.
 */
export type BondStep = Base & {
  kind: "bond";
  skill: Skill;
  prompt: string;
  whole: number;
  parts: [number, number];
  missing: "whole" | "left" | "right";
  hint: string;
};

/** Расставить события или числа по порядку. Угадать нельзя. */
export type OrderStep = Base & {
  kind: "order";
  skill: Skill;
  prompt: string;
  /** Правильный порядок. На экране перемешиваются. */
  items: string[];
  hint: string;
};

export type SoundKind = "гласный" | "твёрдый" | "мягкий";

export const SOUND_COLOR: Record<SoundKind, string> = {
  гласный: "#e23b3b",
  твёрдый: "#2f6fd0",
  мягкий: "#2f9e5c",
};

/**
 * Звуковая схема слова фишками. Цвета школьные: гласный красный, твёрдый
 * согласный синий, мягкий зелёный — иначе ребёнок будет переучиваться в школе.
 */
export type SchemeStep = Base & {
  kind: "scheme";
  prompt: string;
  word: string;
  /** По звукам, а не по буквам. */
  sounds: SoundKind[];
  hint: string;
};

/** Соединить пары: слово и схема, событие и причина, слово и перевод. */
export type MatchStep = Base & {
  kind: "match";
  skill: Skill;
  prompt: string;
  pairs: Array<[left: string, right: string]>;
  hint: string;
};

export type Step =
  | SayStep
  | RuleStep
  | AskStep
  | BondStep
  | OrderStep
  | SchemeStep
  | MatchStep;

export type Lesson = {
  id: string;
  subject: Subject;
  title: string;
  /** Чему учит — одной фразой, для родителя. */
  goal: string;
  /** Что ребёнок должен уметь до этого урока. */
  requires: string;
  steps: Step[];
};

/** Шаги без ввода не оцениваются и не идут в статистику. */
export const isInteractive = (step: Step): boolean =>
  step.kind !== "say" && step.kind !== "rule";

/** Навык, в который засчитывается шаг. */
export function stepSkill(step: Step): Skill | null {
  switch (step.kind) {
    case "ask":
      return step.task.skill;
    case "bond":
    case "order":
    case "match":
      return step.skill;
    case "scheme":
      return "Звуки";
    default:
      return null;
  }
}

/** Ожидаемый ответ шага в виде строки — для проверки и для тестов. */
export function expectedAnswer(step: Step): string | null {
  switch (step.kind) {
    case "ask":
      return step.task.answer;
    case "bond":
      return String(
        step.missing === "whole"
          ? step.whole
          : step.missing === "left"
            ? step.parts[0]
            : step.parts[1],
      );
    case "order":
      return step.items.join(" ");
    case "scheme":
      return step.sounds.join(" ");
    case "match":
      return step.pairs.map(([, right]) => right).join(" ");
    default:
      return null;
  }
}

/** Домик обязан сходиться: части в сумме дают целое. */
export const bondIsConsistent = (step: BondStep): boolean =>
  step.parts[0] + step.parts[1] === step.whole;
