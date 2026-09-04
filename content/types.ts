export type Skill =
  | "Счёт"
  | "Задачи"
  | "Логика"
  | "Слоги"
  | "Звуки"
  | "Предложение"
  | "Понимание текста";

export const SKILLS: readonly Skill[] = [
  "Счёт",
  "Задачи",
  "Логика",
  "Слоги",
  "Звуки",
  "Предложение",
  "Понимание текста",
];

export type Task = {
  id: string;
  skill: Skill;
  prompt: string;
  /** Пустой массив означает задачу со свободным вводом ответа. */
  options: string[];
  answer: string;
  hint: string;
  /** Текст для чтения перед вопросом. */
  read?: string;
  /** Готовая реплика для озвучки вместо собранной из prompt + options. */
  speech?: string;
};

export type Mission = {
  id: number;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  tasks: Task[];
};

export const choiceTask = (
  id: string,
  skill: Skill,
  prompt: string,
  options: string[],
  answer: string,
  hint: string,
  read?: string,
): Task => ({ id, skill, prompt, options, answer, hint, read });

export const inputTask = (
  id: string,
  skill: Skill,
  prompt: string,
  answer: string,
  hint: string,
  speech?: string,
): Task => ({ id, skill, prompt, options: [], answer, hint, speech });

/**
 * Снисходительное сравнение для свободного ввода: первоклассник печатает
 * медленно и неточно, поэтому регистр, ё/е, конечная точка и лишние пробелы
 * не должны считаться ошибкой.
 */
export const normalizeAnswer = (value: string): string =>
  value
    .trim()
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ");

/**
 * Для вариантов ответа сравнение строгое.
 *
 * Снисходительная нормализация тут ломала целый класс заданий: в задаче
 * «Выбери правильно записанное предложение» варианты отличаются ровно
 * регистром и точкой, а в задаче про знак в конце — это сами «.», «?» и «!».
 * После обрезки пунктуации и регистра все варианты становились одинаковыми,
 * и любой ответ засчитывался как верный. Ребёнок, выбравший «стадион большой»,
 * получал звезду.
 */
export const isCorrect = (response: string, task: Task): boolean =>
  task.options.length
    ? response === task.answer
    : normalizeAnswer(response) === normalizeAnswer(task.answer);

/** Формы существительного для 1 / 2-4 / 5+. */
export type Noun = readonly [one: string, few: string, many: string];

/**
 * Согласование существительного с числом. Приложение учит русскому языку,
 * поэтому «4 заданий» и «13 дирижабльов» здесь недопустимы.
 */
export function plural(count: number, noun: Noun): string {
  const abs = Math.abs(count) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return noun[2];
  if (last === 1) return noun[0];
  if (last >= 2 && last <= 4) return noun[1];
  return noun[2];
}

export const withCount = (count: number, noun: Noun): string =>
  `${count} ${plural(count, noun)}`;

export const TASKS_NOUN: Noun = ["задание", "задания", "заданий"];
export const STARS_NOUN: Noun = ["звезда", "звезды", "звёзд"];
export const MISSIONS_NOUN: Noun = ["миссия", "миссии", "миссий"];
export const DAYS_NOUN: Noun = ["день", "дня", "дней"];
