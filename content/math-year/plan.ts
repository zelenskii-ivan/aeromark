import type { Lesson } from "../lesson.ts";
import { mathBond10 } from "../lessons/math-bond-10.ts";
import { bondLesson, compareLesson, neighborsLesson } from "./generators.ts";

/**
 * Математика на год: 1 класс.
 *
 * Порядок разделов — по программе УМК «Перспектива» (Дорофеев, Миракова,
 * Бука): сравнение и счёт предметов → множества → числа 1–10 и нумерация →
 * сложение и вычитание до 10 → числа 11–20 → сложение и вычитание до 20 →
 * повторение. Разбивка по четвертям примерная: школа может идти чуть быстрее
 * или медленнее, поэтому темы не запираются — открыта любая.
 *
 * У темы без урока стоит `lesson: null` — на карте она видна как «готовится».
 */

export type Topic = {
  id: string;
  title: string;
  /** Раздел программы, как в учебнике. */
  section: string;
  lesson: Lesson | null;
};

export type Quarter = {
  id: string;
  number: 1 | 2 | 3 | 4;
  title: string;
  months: string;
  /** Самолёт, который открывается за пройденную четверть. */
  aircraft: { name: string; color: string; kind: "plane" | "rocket" };
  topics: Topic[];
};

const topic = (id: string, title: string, section: string, lesson: Lesson | null = null): Topic => ({
  id,
  title,
  section,
  lesson,
});

const SECTION = {
  compare: "Сравнение и счёт предметов",
  sets: "Множества",
  numbers10: "Числа от 1 до 10. Нумерация",
  add10: "Числа от 1 до 10. Сложение и вычитание",
  numbers20: "Числа от 11 до 20. Нумерация",
  add20: "Числа от 11 до 20. Сложение и вычитание",
  review: "Повторение",
} as const;

export const MATH_YEAR: readonly Quarter[] = [
  {
    id: "q1",
    number: 1,
    title: "Аэродром «Старт»",
    months: "сентябрь — октябрь",
    aircraft: { name: "Учебный планер", color: "#3a9d5d", kind: "plane" },
    topics: [
      topic("y-props", "Признаки предметов: цвет, форма, размер", SECTION.compare),
      topic("y-space", "Вверху, внизу, слева, справа", SECTION.compare),
      topic("y-groups", "Группы предметов: больше, меньше, поровну", SECTION.sets),
      topic("y-compare", "Сравнение чисел: >, <, =", SECTION.numbers10, compareLesson()),
      topic("y-neighbors", "Соседи числа: прибавить и вычесть 1", SECTION.numbers10, neighborsLesson()),
      topic("y-bond-2", "Состав числа 2", SECTION.numbers10, bondLesson(2)),
      topic("y-bond-3", "Состав числа 3", SECTION.numbers10, bondLesson(3)),
      topic("y-bond-4", "Состав числа 4", SECTION.numbers10, bondLesson(4)),
      topic("y-bond-5", "Состав числа 5", SECTION.numbers10, bondLesson(5)),
    ],
  },
  {
    id: "q2",
    number: 2,
    title: "Аэропорт «Облака»",
    months: "ноябрь — декабрь",
    aircraft: { name: "Самолёт-амфибия", color: "#e2b417", kind: "plane" },
    topics: [
      topic("y-bond-6", "Состав числа 6", SECTION.numbers10, bondLesson(6)),
      topic("y-bond-7", "Состав числа 7", SECTION.numbers10, bondLesson(7)),
      topic("y-bond-8", "Состав числа 8", SECTION.numbers10, bondLesson(8)),
      topic("y-bond-9", "Состав числа 9", SECTION.numbers10, bondLesson(9)),
      topic("y-bond-10", "Состав числа 10", SECTION.numbers10, mathBond10),
      topic("y-segment", "Точка, линия, отрезок", SECTION.numbers10),
      topic("y-zero", "Число 0", SECTION.numbers10),
    ],
  },
  {
    id: "q3",
    number: 3,
    title: "Аэропорт «Радуга»",
    months: "январь — март",
    aircraft: { name: "Пассажирский лайнер", color: "#2a6fb5", kind: "plane" },
    topics: [
      topic("y-add10", "Сложение и вычитание в пределах 10", SECTION.add10),
      topic("y-swap", "Переставь слагаемые", SECTION.add10),
      topic("y-problem", "Задача: условие и вопрос", SECTION.add10),
      topic("y-cm", "Длина: сантиметр", SECTION.add10),
    ],
  },
  {
    id: "q4",
    number: 4,
    title: "Космодром «Звезда»",
    months: "апрель — май",
    aircraft: { name: "Ракета", color: "#b8323a", kind: "rocket" },
    topics: [
      topic("y-teens", "Второй десяток: десяток и единицы", SECTION.numbers20),
      topic("y-add20", "Сложение и вычитание без перехода через десяток", SECTION.add20),
      topic("y-cross", "Сложение с переходом через десяток", SECTION.add20),
      topic("y-review", "Что я умею: повторение года", SECTION.review),
    ],
  },
];

/** Все готовые уроки года — для поиска урока по id и для тестов методики. */
export const mathYearLessons: readonly Lesson[] = MATH_YEAR.flatMap((quarter) =>
  quarter.topics.flatMap((item) => (item.lesson ? [item.lesson] : [])),
);
