"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  BookOpen,
  Calculator,
  Check,
  ChevronRight,
  Download,
  Gauge,
  Gamepad2,
  Lock,
  LockOpen,
  Plane,
  RotateCcw,
  Star,
  Trophy,
  Upload,
  Volume2,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const FlightGame = dynamic(() => import("@/app/game/FlightGame"), {
  ssr: false,
  loading: () => (
    <main className="loading">
      <Plane />
    </main>
  ),
});

type Skill =
  | "Счёт"
  | "Задачи"
  | "Логика"
  | "Слоги"
  | "Звуки"
  | "Предложение"
  | "Понимание текста";
type Task = {
  id: string;
  skill: Skill;
  prompt: string;
  options: string[];
  answer: string;
  hint: string;
  read?: string;
  speech?: string;
};
type Mission = {
  id: number;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  tasks: Task[];
};
type Saved = {
  stars: number;
  completed: number[];
  attempts: Record<string, { right: number; total: number }>;
  mistakes: string[];
  diagnosticDone: boolean;
  earned: string[];
  gameWins: string[];
};
const t = (
  id: string,
  skill: Skill,
  prompt: string,
  options: string[],
  answer: string,
  hint: string,
  read?: string,
): Task => ({ id, skill, prompt, options, answer, hint, read });
const inputTask = (
  id: string,
  skill: Skill,
  prompt: string,
  answer: string,
  hint: string,
  speech?: string,
): Task => ({ id, skill, prompt, options: [], answer, hint, speech });

const diagnostic: Task[] = [
  t(
    "d1",
    "Счёт",
    "Сколько самолётов: ✈️ ✈️ ✈️ ✈️ ✈️?",
    ["4", "5", "6"],
    "5",
    "Посчитай по одному.",
  ),
  t(
    "d2",
    "Счёт",
    "Какое число летит после 8?",
    ["7", "9", "10"],
    "9",
    "Назови числа по порядку: 7, 8…",
  ),
  t(
    "d3",
    "Счёт",
    "На стоянке 6 самолётов. 2 улетели. Сколько осталось?",
    ["4", "6", "8"],
    "4",
    "Улетели — стало меньше. Убери два от шести.",
  ),
  t(
    "d4",
    "Задачи",
    "У Марка 3 детали крыла и ещё 2. Сколько деталей всего?",
    ["1", "5", "6"],
    "5",
    "Слово «ещё» подсказывает: нужно сложить.",
  ),
  t(
    "d5",
    "Логика",
    "Продолжи маршрут: ▲ ● ▲ ● …",
    ["▲", "●", "■"],
    "▲",
    "Фигуры чередуются.",
  ),
  t(
    "d6",
    "Слоги",
    "В каком слове два слога?",
    ["самолёт", "пилот", "винт"],
    "пилот",
    "Произнеси медленно: пи-лот.",
  ),
  t(
    "d7",
    "Слоги",
    "Раздели слово «ракета» на слоги.",
    ["ра-ке-та", "рак-ет-а", "раке-та"],
    "ра-ке-та",
    "Сколько гласных — столько и слогов.",
  ),
  t(
    "d8",
    "Звуки",
    "С какого звука начинается слово «крыло»?",
    ["[к]", "[р]", "[ы]"],
    "[к]",
    "Протяни первый звук: к-к-крыло.",
  ),
  t(
    "d9",
    "Звуки",
    "Где ударение в слове «пилот»?",
    ["пи́лот", "пило́т"],
    "пило́т",
    "Позови слово: пило-о-от!",
  ),
  t(
    "d10",
    "Предложение",
    "Как начинается предложение?",
    ["с большой буквы", "с маленькой буквы", "с цифры"],
    "с большой буквы",
    "Первое слово начинается с большой буквы.",
  ),
  t(
    "d11",
    "Предложение",
    "Собери предложение.",
    ["Самолёт летит высоко.", "Высоко самолёт.", "летит Самолёт высоко"],
    "Самолёт летит высоко.",
    "Кто? Что делает? Как?",
  ),
  t(
    "d12",
    "Понимание текста",
    "Что собрал Марк?",
    ["ракету", "модель самолёта", "вертолёт"],
    "модель самолёта",
    "Ответ есть в первом предложении.",
    "Марк собрал модель самолёта. Он прикрепил два крыла и хвост. Модель получилась крепкой.",
  ),
  t(
    "d13",
    "Понимание текста",
    "Что пилот сделал сначала?",
    ["взлетел", "проверил приборы", "выехал на полосу"],
    "проверил приборы",
    "Найди первое действие.",
    "Пилот проверил приборы. Потом самолёт выехал на полосу и взлетел.",
  ),
  t(
    "d14",
    "Логика",
    "Какая деталь помогает самолёту планировать?",
    ["крыло", "колесо", "окно"],
    "крыло",
    "Что держит самолёт в воздухе?",
  ),
  t(
    "d15",
    "Счёт",
    "Какое число больше?",
    ["7", "12", "9"],
    "12",
    "Двузначное число здесь самое большое.",
  ),
];

const missions: Mission[] = [
  {
    id: 1,
    title: "Стадион",
    subtitle: "Числа и слоги",
    icon: "🏟️",
    color: "#ffb703",
    tasks: [
      t(
        "m1a",
        "Счёт",
        "Над стадионом летят 4 самолёта, прилетел ещё 1. Сколько стало?",
        ["3", "5", "6"],
        "5",
        "Прибавь один.",
      ),
      t(
        "m1b",
        "Слоги",
        "Сколько слогов в слове «стадион»?",
        ["2", "3", "4"],
        "3",
        "Ста-ди-он.",
      ),
      t(
        "m1c",
        "Звуки",
        "Какой первый звук в слове «поле»?",
        ["[п]", "[о]", "[л]"],
        "[п]",
        "Произнеси слово медленно.",
      ),
      t(
        "m1d",
        "Предложение",
        "Выбери правильно записанное предложение.",
        ["Большой стадион.", "стадион большой", "Большой стадион"],
        "Большой стадион.",
        "Большая буква в начале, точка в конце.",
      ),
    ],
  },
  {
    id: 2,
    title: "Амфитеатр",
    subtitle: "Сравнение и порядок",
    icon: "⭕",
    color: "#fb8500",
    tasks: [
      t(
        "m2a",
        "Счёт",
        "На верхнем ряду 7 мест, на нижнем 5. Где больше?",
        ["на верхнем", "на нижнем", "поровну"],
        "на верхнем",
        "Сравни 7 и 5.",
      ),
      t(
        "m2b",
        "Логика",
        "Что находится между верхним и нижним рядом?",
        ["верхний", "средний", "нижний"],
        "средний",
        "Посередине — средний.",
      ),
      t(
        "m2c",
        "Слоги",
        "Как правильно разделить «арена»?",
        ["а-ре-на", "ар-ена", "аре-на"],
        "а-ре-на",
        "В слове три гласные.",
      ),
      t(
        "m2d",
        "Предложение",
        "Какой знак нужен: «Представление началось…»",
        [".", "?", "!"],
        ".",
        "Это спокойное сообщение.",
      ),
    ],
  },
  {
    id: 3,
    title: "Конструкторское бюро",
    subtitle: "Фигуры и детали",
    icon: "🧩",
    color: "#8ecae6",
    tasks: [
      t(
        "m3a",
        "Логика",
        "Какая фигура похожа на иллюминатор?",
        ["круг", "треугольник", "квадрат"],
        "круг",
        "У иллюминатора нет углов.",
      ),
      t(
        "m3b",
        "Счёт",
        "Для двух крыльев нужно по 3 детали. Сколько всего?",
        ["5", "6", "8"],
        "6",
        "Три и ещё три.",
      ),
      t(
        "m3c",
        "Звуки",
        "Какая буква есть и в «крыло», и в «руль»?",
        ["р", "к", "о"],
        "р",
        "Сравни буквы.",
      ),
      t(
        "m3d",
        "Понимание текста",
        "Что было после рисунка?",
        ["полёт", "модель", "ремонт"],
        "модель",
        "Найди слово после «затем».",
        "Инженер сначала нарисовал самолёт, затем сделал модель.",
      ),
    ],
  },
  {
    id: 4,
    title: "Грот",
    subtitle: "Сложение и правила",
    icon: "🪨",
    color: "#219ebc",
    tasks: [
      t(
        "m4a",
        "Счёт",
        "У грота 5 больших камней и 3 маленьких. Сколько всего?",
        ["2", "8", "9"],
        "8",
        "Сложи 5 и 3.",
      ),
      t(
        "m4b",
        "Предложение",
        "Где имя написано правильно?",
        ["пилот Антон", "пилот антон", "Пилот антон"],
        "пилот Антон",
        "Имена пишутся с большой буквы.",
      ),
      t(
        "m4c",
        "Звуки",
        "В каком слове мягкий последний звук?",
        ["руль", "грот", "борт"],
        "руль",
        "Мягкий знак смягчает [л’].",
      ),
      t(
        "m4d",
        "Логика",
        "Что лишнее в наборе пилота?",
        ["карта", "шлем", "кастрюля"],
        "кастрюля",
        "Два предмета нужны в полёте.",
      ),
    ],
  },
  {
    id: 5,
    title: "Взлёт",
    subtitle: "Вычитание и чтение",
    icon: "🛫",
    color: "#126782",
    tasks: [
      t(
        "m5a",
        "Счёт",
        "Было 9 самолётов, 3 взлетели. Сколько осталось?",
        ["6", "7", "12"],
        "6",
        "От девяти убери три.",
      ),
      t(
        "m5b",
        "Слоги",
        "Найди слово из одного слога.",
        ["полёт", "винт", "пилот"],
        "винт",
        "В слове одна гласная.",
      ),
      t(
        "m5c",
        "Понимание текста",
        "Почему самолёт поднялся?",
        ["набрал скорость", "остановился", "открыл дверь"],
        "набрал скорость",
        "Причина в первом предложении.",
        "Самолёт набрал скорость. Нос поднялся, и колёса оторвались от земли.",
      ),
      t(
        "m5d",
        "Предложение",
        "Выбери вопрос.",
        ["Самолёт взлетел.", "Самолёт взлетел?", "Самолёт взлетел!"],
        "Самолёт взлетел?",
        "Вопрос заканчивается знаком вопроса.",
      ),
    ],
  },
  {
    id: 6,
    title: "Высота",
    subtitle: "Состав числа и ударение",
    icon: "☁️",
    color: "#48cae4",
    tasks: [
      t(
        "m6a",
        "Счёт",
        "10 — это 6 и сколько?",
        ["3", "4", "5"],
        "4",
        "Сосчитай от 6 до 10.",
      ),
      t(
        "m6b",
        "Счёт",
        "Облако на отметке 7, самолёт на 2 выше. Где самолёт?",
        ["5", "8", "9"],
        "9",
        "Выше — прибавь 2.",
      ),
      t(
        "m6c",
        "Звуки",
        "Где верное ударение?",
        ["вы́сота", "высо́та", "высота́"],
        "высота́",
        "Позови: высота-а-а!",
      ),
      t(
        "m6d",
        "Слоги",
        "Сколько слогов в слове «облако»?",
        ["2", "3", "4"],
        "3",
        "О-бла-ко.",
      ),
    ],
  },
  {
    id: 7,
    title: "Японский сад",
    subtitle: "Задачи и порядок слов",
    icon: "🌸",
    color: "#2a9d8f",
    tasks: [
      t(
        "m7a",
        "Задачи",
        "До красного моста 8 шагов, потом ещё 4. Сколько всего?",
        ["4", "12", "14"],
        "12",
        "Два участка пути нужно сложить.",
      ),
      t(
        "m7b",
        "Логика",
        "Сакура, камень, сакура, камень… Что дальше?",
        ["сакура", "пруд", "мост"],
        "сакура",
        "Предметы чередуются.",
      ),
      t(
        "m7c",
        "Предложение",
        "Собери фразу.",
        ["Марк видит мост.", "Видит мост Марк?", "мост Марк видит"],
        "Марк видит мост.",
        "Кто? Что делает? Что видит?",
      ),
      t(
        "m7d",
        "Понимание текста",
        "Какой путь проходит у водопада?",
        ["короткий", "длинный", "оба"],
        "длинный",
        "Перечитай вторую часть.",
        "В саду два пути. Короткий проходит у пруда, длинный — у водопада.",
      ),
    ],
  },
  {
    id: 8,
    title: "Радиосвязь",
    subtitle: "Слушаем и понимаем",
    icon: "🎧",
    color: "#6a4c93",
    tasks: [
      t(
        "m8a",
        "Понимание текста",
        "Кто дал команду?",
        ["пилот", "диспетчер", "пассажир"],
        "диспетчер",
        "Ответ в первом слове.",
        "Диспетчер сказал: «Борт семь, приготовьтесь к посадке». Пилот подтвердил команду.",
      ),
      t(
        "m8b",
        "Звуки",
        "Какой звук повторяется в словах «борт» и «башня»?",
        ["[б]", "[т]", "[ш]"],
        "[б]",
        "Сравни первые звуки.",
      ),
      t(
        "m8c",
        "Предложение",
        "Как оформить просьбу?",
        [
          "Разрешите посадку, пожалуйста.",
          "посадка быстро",
          "Разрешите посадку",
        ],
        "Разрешите посадку, пожалуйста.",
        "Вежливая просьба и точка.",
      ),
      t(
        "m8d",
        "Счёт",
        "Связь проверили на каналах 3, 4, 5. Сколько каналов?",
        ["2", "3", "5"],
        "3",
        "Пересчитай каналы.",
      ),
    ],
  },
  {
    id: 9,
    title: "Испытатель",
    subtitle: "Закономерности и слова",
    icon: "🧪",
    color: "#e76f51",
    tasks: [
      t(
        "m9a",
        "Логика",
        "Какое число пропущено: 2, 4, 6, …, 10?",
        ["7", "8", "9"],
        "8",
        "Каждый раз прибавляется 2.",
      ),
      t(
        "m9b",
        "Звуки",
        "В каком слове букв больше, чем звуков?",
        ["конь", "бак", "нос"],
        "конь",
        "Мягкий знак звука не обозначает.",
      ),
      t(
        "m9c",
        "Задачи",
        "Испытали 12 моделей. 2 не взлетели. Сколько взлетело?",
        ["10", "12", "14"],
        "10",
        "Вычти 2.",
      ),
      t(
        "m9d",
        "Понимание текста",
        "Какая модель летела ровно?",
        ["первая", "вторая", "обе"],
        "вторая",
        "Ищи слово «ровно».",
        "Первая модель была быстрой, но неустойчивой. Вторая летела медленнее, зато ровно.",
      ),
    ],
  },
  {
    id: 10,
    title: "Самостоятельный полёт",
    subtitle: "Смешанная проверка",
    icon: "🏆",
    color: "#ef476f",
    tasks: [
      t(
        "m10a",
        "Счёт",
        "На борту 8 пассажиров. Вошли ещё 7. Сколько стало?",
        ["14", "15", "16"],
        "15",
        "Сначала дополни до 10.",
      ),
      t(
        "m10b",
        "Задачи",
        "Было 18 литров топлива, потратили 6. Сколько осталось?",
        ["12", "13", "24"],
        "12",
        "Осталось — вычитаем.",
      ),
      t(
        "m10c",
        "Предложение",
        "Где всё написано правильно?",
        ["Марк — пилот.", "марк — пилот.", "Марк — пилот"],
        "Марк — пилот.",
        "Имя с большой буквы, в конце точка.",
      ),
      t(
        "m10d",
        "Понимание текста",
        "Назови второе действие Марка.",
        ["проверил карту", "запустил двигатель", "выехал на полосу"],
        "запустил двигатель",
        "Считай действия по порядку.",
        "Марк проверил карту, запустил двигатель и вырулил на полосу.",
      ),
    ],
  },
  {
    id: 11,
    title: "Ангар",
    subtitle: "Считаем и собираем",
    icon: "🔧",
    color: "#457b9d",
    tasks: [
      inputTask(
        "m11a",
        "Счёт",
        "В ангаре 7 колёс. Привезли ещё 6. Сколько стало?",
        "13",
        "Сначала прибавь 3 до десяти, потом ещё 3.",
      ),
      t(
        "m11b",
        "Слоги",
        "Как правильно разделить слово «ангар»?",
        ["ан-гар", "а-нга-р", "анг-ар"],
        "ан-гар",
        "В слове две гласные — два слога.",
      ),
      inputTask(
        "m11c",
        "Предложение",
        "Впиши последнее слово: «Механик проверил …»",
        "мотор",
        "Что может проверить механик? Подходит слово «мотор».",
      ),
      t(
        "m11d",
        "Логика",
        "Продолжи ряд деталей: крыло, хвост, крыло, хвост…",
        ["крыло", "винт", "колесо"],
        "крыло",
        "Детали чередуются.",
      ),
    ],
  },
  {
    id: 12,
    title: "Диспетчерская башня",
    subtitle: "Команды и вычисления",
    icon: "🗼",
    color: "#5a189a",
    tasks: [
      inputTask(
        "m12a",
        "Счёт",
        "На табло было число 15. Убрали 7. Какое число осталось?",
        "8",
        "Отними сначала 5, затем ещё 2.",
      ),
      t(
        "m12b",
        "Предложение",
        "Какая команда записана правильно?",
        [
          "Пилот, начинайте взлёт!",
          "пилот начинайте взлёт",
          "Пилот начинайте взлёт",
        ],
        "Пилот, начинайте взлёт!",
        "Обращение отделяется запятой, команда заканчивается восклицательным знаком.",
      ),
      t(
        "m12c",
        "Понимание текста",
        "Какой самолёт садится первым?",
        ["синий", "белый", "красный"],
        "белый",
        "Найди слово «сначала».",
        "Сначала садится белый самолёт. За ним — синий. Красный пока делает круг.",
      ),
      inputTask(
        "m12d",
        "Звуки",
        "Напиши первую букву слова «башня». ",
        "б",
        "Произнеси: б-б-башня.",
      ),
    ],
  },
  {
    id: 13,
    title: "Метеостанция",
    subtitle: "Погода и чтение",
    icon: "🌦️",
    color: "#00a6a6",
    tasks: [
      t(
        "m13a",
        "Счёт",
        "Утром было 9 градусов, днём стало на 4 больше. Сколько стало?",
        ["5", "13", "14"],
        "13",
        "Стало больше — прибавляем.",
      ),
      inputTask(
        "m13b",
        "Слоги",
        "Сколько слогов в слове «погода»?",
        "3",
        "По-го-да. Три гласные — три слога.",
      ),
      t(
        "m13c",
        "Понимание текста",
        "Почему полёт перенесли?",
        ["из-за тумана", "из-за солнца", "из-за жары"],
        "из-за тумана",
        "Причина названа во втором предложении.",
        "Утром над парком появился густой туман. Поэтому учебный полёт перенесли на час.",
      ),
      t(
        "m13d",
        "Логика",
        "Что нужно пилоту в дождь?",
        ["прогноз погоды", "пляжный мяч", "санки"],
        "прогноз погоды",
        "Выбери то, что помогает подготовить полёт.",
      ),
    ],
  },
  {
    id: 14,
    title: "Сборочный цех",
    subtitle: "Размеры и точность",
    icon: "🏗️",
    color: "#e76f51",
    tasks: [
      inputTask(
        "m14a",
        "Задачи",
        "Для крыла взяли рейки длиной 8 см и 5 см. Какова их общая длина?",
        "13",
        "Сложи 8 и 5.",
        "Для крыла взяли рейки длиной восемь сантиметров и пять сантиметров. Какова их общая длина?",
      ),
      t(
        "m14b",
        "Логика",
        "Какая деталь самая длинная?",
        ["12 см", "7 см", "10 см"],
        "12 см",
        "Сравни числа 12, 7 и 10.",
      ),
      inputTask(
        "m14c",
        "Звуки",
        "Напиши букву, которой заканчивается слово «винт». ",
        "т",
        "Медленно произнеси: вин-т.",
      ),
      t(
        "m14d",
        "Предложение",
        "Выбери понятную инструкцию.",
        ["Приклей крыло к корпусу.", "Крыло корпус приклей.", "приклей крыло"],
        "Приклей крыло к корпусу.",
        "Инструкция начинается с большой буквы и точно говорит, что делать.",
      ),
    ],
  },
  {
    id: 15,
    title: "Экспедиция над парком",
    subtitle: "Большой смешанный полёт",
    icon: "🧭",
    color: "#ef476f",
    tasks: [
      inputTask(
        "m15a",
        "Счёт",
        "На маршруте 18 отметок. Марк прошёл 9. Сколько осталось?",
        "9",
        "Половина от восемнадцати — девять.",
      ),
      t(
        "m15b",
        "Понимание текста",
        "Где самолёт повернул к стадиону?",
        ["после грота", "до сада", "над мостом"],
        "после грота",
        "События идут по порядку.",
        "Самолёт пролетел над Японским садом, затем увидел грот. После грота пилот повернул к стадиону.",
      ),
      inputTask(
        "m15c",
        "Слоги",
        "Сколько слогов в слове «самолётик»?",
        "4",
        "Са-мо-лё-тик.",
      ),
      t(
        "m15d",
        "Предложение",
        "Выбери лучший заголовок для рассказа о полёте Марка.",
        ["Первый самостоятельный полёт", "Большой камень", "Три карандаша"],
        "Первый самостоятельный полёт",
        "Заголовок должен передавать главную тему.",
      ),
    ],
  },
];

const mathBooks = [
  [
    "Моро, Волкова, Степанова",
    "Чёткая ступенчатая подача и типовые упражнения",
    "Основа и плавный рост сложности",
  ],
  [
    "Петерсон",
    "Деятельностный подход и нестандартные задачи",
    "Открытия, закономерности и выбор способа",
  ],
  [
    "Аргинская и др. (Занков)",
    "Сравнение способов и общее развитие",
    "Вариативность и объяснение решения",
  ],
  [
    "Александрова / Эльконин–Давыдов",
    "Модели величин и отношений",
    "Схемы и понимание «почему»",
  ],
  [
    "Башмаков, Нефёдова",
    "Практические сюжеты, информация, логика",
    "Маршруты, таблицы и жизненные задачи",
  ],
];
const readBooks = [
  [
    "Горецкий / Климанова",
    "Переход от звука и слога к осмысленному тексту",
    "Надёжная фонетическая лестница",
  ],
  [
    "Журова, Евдокимова",
    "Сильный звуковой анализ и модели слова",
    "Различение звука и буквы",
  ],
  [
    "Климанова, Макеева",
    "Слушание, говорение, чтение и письмо",
    "Диалоги и речевые ситуации",
  ],
  [
    "Репкин, Восторгова, Левин",
    "Исследование языка и рефлексия",
    "Вопросы-наблюдения и самопроверка",
  ],
  [
    "Чуракова",
    "Инструментальная работа со словом и текстом",
    "Поиск доказательства в тексте",
  ],
];
const initial: Saved = {
  stars: 0,
  completed: [],
  attempts: {},
  mistakes: [],
  diagnosticDone: false,
  earned: [],
  gameWins: [],
};
function prepareSpeech(text: string) {
  return text
    .replace(/(\d+)\s*\+\s*(\d+)/g, "$1 плюс $2")
    .replace(/(\d+)\s*[−-]\s*(\d+)/g, "$1 минус $2")
    .replace(/=/g, " равно ")
    .replace(/см\b/g, "сантиметров")
    .replace(/\[([^\]]+)\]/g, "звук $1")
    .replace(/([А-Яа-яЁё])-(?=[А-Яа-яЁё])/g, "$1, ")
    .replace(/[▲●■]/g, " фигура ")
    .replace(/\s+/g, " ")
    .trim();
}
function speak(task: Task, slow = false) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const variants = task.options.length
    ? ` Варианты ответа: ${task.options.map((option, index) => `${index + 1}. ${option}`).join(". ")}.`
    : " Введи ответ в поле.";
  const text =
    task.speech ||
    `${task.read ? `${task.read}. ` : ""}${task.prompt}.${variants}`;
  const u = new SpeechSynthesisUtterance(prepareSpeech(text));
  u.lang = "ru-RU";
  u.rate = slow ? 0.68 : 0.78;
  u.pitch = 1.03;
  const voices = speechSynthesis
    .getVoices()
    .filter((voice) => voice.lang.toLowerCase().startsWith("ru"));
  u.voice =
    voices.find((voice) =>
      /milena|katya|alena|yuri|russian/i.test(voice.name),
    ) ||
    voices[0] ||
    null;
  speechSynthesis.speak(u);
}

export default function Home() {
  const [saved, setSaved] = useState<Saved>(initial),
    [loaded, setLoaded] = useState(false);
  const [parentPin, setParentPin] = useState(""),
    [pinEntry, setPinEntry] = useState(""),
    [parentUnlocked, setParentUnlocked] = useState(false),
    [pinMessage, setPinMessage] = useState("");
  const [mode, setMode] = useState<"home" | "diagnostic" | "mission" | "game">(
      "home",
    ),
    [mission, setMission] = useState<Mission | null>(null);
  const [index, setIndex] = useState(0),
    [picked, setPicked] = useState(""),
    [typed, setTyped] = useState(""),
    [checked, setChecked] = useState(false),
    [right, setRight] = useState(false),
    [starEarned, setStarEarned] = useState(false);
  useEffect(() => {
    try {
      const x = localStorage.getItem("aeromark-progress");
      if (x) setSaved(JSON.parse(x));
      setParentPin(localStorage.getItem("aeromark-parent-pin") || "");
      if ("serviceWorker" in navigator)
        navigator.serviceWorker.register("/sw.js").catch(() => {});
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded)
      localStorage.setItem("aeromark-progress", JSON.stringify(saved));
  }, [saved, loaded]);
  const tasks = mode === "diagnostic" ? diagnostic : mission?.tasks || [],
    task = tasks[index];
  const skills = useMemo(
    () =>
      Object.entries(saved.attempts)
        .map(([skill, v]) => ({
          skill,
          ...v,
          pct: Math.round((v.right / v.total) * 100),
        }))
        .sort((a, b) => a.pct - b.pct),
    [saved.attempts],
  );
  const gameUnlocked = saved.completed.length >= 2;
  const gameComplete = (saved.gameWins || []).includes("hangar-parts");
  const start = (m?: Mission) => {
    setMode(m ? "mission" : "diagnostic");
    setMission(m || null);
    setIndex(0);
    setPicked("");
    setTyped("");
    setChecked(false);
  };
  const check = () => {
    const response = task.options.length ? picked : typed;
    if (!response.trim()) return;
    const normalize = (value: string) =>
      value
        .trim()
        .toLocaleLowerCase("ru")
        .replace(/ё/g, "е")
        .replace(/[.!?]/g, "");
    const ok = normalize(response) === normalize(task.answer);
    const alreadyEarned = (saved.earned || []).includes(task.id);
    setRight(ok);
    setStarEarned(ok && !alreadyEarned);
    setChecked(true);
    setSaved((s) => {
      const old = s.attempts[task.skill] || { right: 0, total: 0 };
      return {
        ...s,
        stars: s.stars + (ok && !alreadyEarned ? 1 : 0),
        earned:
          ok && !alreadyEarned
            ? [...(s.earned || []), task.id]
            : s.earned || [],
        attempts: {
          ...s.attempts,
          [task.skill]: {
            right: old.right + (ok ? 1 : 0),
            total: old.total + 1,
          },
        },
        mistakes: ok
          ? s.mistakes.filter((x) => x !== task.id)
          : [...new Set([...s.mistakes, task.id])],
      };
    });
  };
  const next = () => {
    if (index < tasks.length - 1) {
      setIndex(index + 1);
      setPicked("");
      setTyped("");
      setChecked(false);
    } else {
      setSaved((s) => ({
        ...s,
        diagnosticDone: s.diagnosticDone || mode === "diagnostic",
        completed:
          mission && !s.completed.includes(mission.id)
            ? [...s.completed, mission.id]
            : s.completed,
      }));
      setMode("home");
      setMission(null);
    }
  };
  const reset = () => {
    if (confirm("Стереть весь прогресс Марка?")) {
      setSaved(initial);
      localStorage.removeItem("aeromark-progress");
    }
  };
  const submitPin = () => {
    if (!/^\d{4}$/.test(pinEntry)) {
      setPinMessage("Введите ровно четыре цифры.");
      return;
    }
    if (!parentPin) {
      localStorage.setItem("aeromark-parent-pin", pinEntry);
      setParentPin(pinEntry);
      setParentUnlocked(true);
      setPinEntry("");
      setPinMessage("");
    } else if (pinEntry === parentPin) {
      setParentUnlocked(true);
      setPinEntry("");
      setPinMessage("");
    } else setPinMessage("Неверный PIN.");
  };
  const exportProgress = () => {
    const data = JSON.stringify(
      {
        app: "aeromark",
        version: 1,
        exportedAt: new Date().toISOString(),
        progress: saved,
      },
      null,
      2,
    );
    const url = URL.createObjectURL(
      new Blob([data], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `aeromark-mark-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const importProgress = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        const next = data?.progress;
        if (
          !next ||
          typeof next.stars !== "number" ||
          !Array.isArray(next.completed) ||
          typeof next.attempts !== "object"
        )
          throw new Error();
        setSaved({ ...initial, ...next });
        alert(`Прогресс восстановлен: ${next.stars} звёзд.`);
      } catch {
        alert("Не удалось прочитать файл прогресса.");
      }
    };
    reader.readAsText(file);
  };
  const completeGame = () => {
    setSaved((s) => {
      if ((s.gameWins || []).includes("hangar-parts")) return s;
      return {
        ...s,
        stars: s.stars + 3,
        gameWins: [...(s.gameWins || []), "hangar-parts"],
      };
    });
    setMode("home");
  };
  if (!loaded)
    return (
      <main className="loading">
        <Plane />
      </main>
    );
  if (mode === "game")
    return (
      <FlightGame onExit={() => setMode("home")} onComplete={completeGame} />
    );
  if (mode !== "home" && task)
    return (
      <main className="lesson">
        <section>
          <header>
            <Button variant="outline" onClick={() => setMode("home")}>
              ← Карта
            </Button>
            <div className="lesson-progress">
              <div>
                <b>
                  {mode === "diagnostic" ? "Проверочный полёт" : mission?.title}
                </b>
                <span>
                  {index + 1} / {tasks.length}
                </span>
              </div>
              <Progress value={((index + 1) / tasks.length) * 100} />
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
                onClick={() => speak(task)}
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
              <div className="answers">
                {task.options.map((o) => (
                  <button
                    key={o}
                    disabled={checked}
                    onClick={() => setPicked(o)}
                    className={`answer ${picked === o ? "selected" : ""} ${checked && o === task.answer ? "correct" : ""} ${checked && picked === o && o !== task.answer ? "wrong" : ""}`}
                  >
                    <span>{o}</span>
                    {checked && o === task.answer && <Check />}
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
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && check()}
                  placeholder="Напиши ответ"
                />
              </div>
            )}
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
                      : "Ответ верный. Эта звезда уже получена."
                    : task.hint}
                </p>
                {!right && (
                  <button
                    className="slow-speech"
                    onClick={() => speak(task, true)}
                  >
                    <Volume2 />
                    Послушать медленнее
                  </button>
                )}
              </div>
            )}
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
                  {index === tasks.length - 1 ? "Завершить полёт" : "Дальше"}
                  <ChevronRight />
                </Button>
              )}
            </footer>
          </article>
        </section>
      </main>
    );
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
            <div className="star-pill">
              <Star />
              {saved.stars} звёзд
            </div>
          </nav>
          <div className="hero-copy">
            <p>ЛИЧНЫЙ УЧЕБНЫЙ БОРТ МАРКА</p>
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
                    15 коротких заданий определят стартовый уровень Марка.
                    Примерно 12 минут.
                  </p>
                </div>
                <Button size="lg" onClick={() => start()}>
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
                    Сегодня потренируем:{" "}
                    {skills[0]?.skill || "смешанные задания"}
                  </h2>
                  <p>Начни с темы, где пока меньше правильных ответов.</p>
                </div>
              </article>
            )}
            <div className="section-heading">
              <div>
                <span className="eyebrow">КАРТА КУРСА</span>
                <h2>{missions.length} учебных миссий</h2>
              </div>
              <span>
                {saved.completed.length} из {missions.length} завершено
              </span>
            </div>
            <article className={`game-card ${gameUnlocked ? "" : "locked"}`}>
              <div>
                <span className="game-icon">{gameUnlocked ? "🎮" : "🔒"}</span>
                <div>
                  <span className="eyebrow">ИГРОВОЙ ЭПИЗОД 01</span>
                  <h3>Парк Аэромарка: обби-маршрут</h3>
                  <p>
                    {gameComplete
                      ? "Пройдено — можно играть снова без награды."
                      : gameUnlocked
                        ? "Трёхмерная мини-игра открыта. Награда: 3 звезды."
                        : "Заверши две учебные миссии, чтобы открыть игру."}
                  </p>
                </div>
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
              {missions.map((m) => {
                const done = saved.completed.includes(m.id);
                const locked = m.id > 2 && !gameComplete && !done;
                return (
                  <button
                    key={m.id}
                    disabled={locked}
                    onClick={() => start(m)}
                    className={`mission-card ${done ? "done" : ""}`}
                    style={{ "--mission": m.color } as React.CSSProperties}
                  >
                    <div>
                      <span>{String(m.id).padStart(2, "0")}</span>
                      <i>{done ? "✓" : m.icon}</i>
                    </div>
                    <h3>{m.title}</h3>
                    <p>{m.subtitle}</p>
                    <footer>
                      <span>
                        {locked ? "Сначала игровой эпизод" : "4 задания"}
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
                  <h2>Навыки Марка</h2>
                </div>
                <Trophy className="trophy" />
              </div>
              {skills.length === 0 ? (
                <div className="empty">
                  <Gauge />
                  <h3>Сначала пройдём диагностику</h3>
                  <p>Здесь появятся сильные стороны и навыки для тренировки.</p>
                  <Button onClick={() => start()}>Начать</Button>
                </div>
              ) : (
                <div className="skills">
                  {skills.map((r) => (
                    <div key={r.skill}>
                      <div>
                        <strong>{r.skill}</strong>
                        <span>
                          {r.right} из {r.total} • {r.pct}%
                        </span>
                      </div>
                      <Progress value={r.pct} />
                    </div>
                  ))}
                </div>
              )}
              <div className="stats">
                <div>
                  <Star />
                  <strong>{saved.stars}</strong>
                  <span>звёзд</span>
                </div>
                <div>
                  <Check />
                  <strong>{saved.completed.length}</strong>
                  <span>миссий</span>
                </div>
                <div>
                  <RotateCcw />
                  <strong>{saved.mistakes.length}</strong>
                  <span>повторить</span>
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
                    onChange={(e) =>
                      setPinEntry(e.target.value.replace(/\D/g, ""))
                    }
                    onKeyDown={(e) => e.key === "Enter" && submitPin()}
                    aria-label="Четырёхзначный PIN"
                    placeholder="••••"
                  />
                  <Button onClick={submitPin}>
                    <LockOpen />
                    {parentPin ? "Открыть" : "Сохранить"}
                  </Button>
                </div>
                {pinMessage && (
                  <strong className="pin-error">{pinMessage}</strong>
                )}
              </section>
            ) : (
              <>
                <section className="panel">
                  <div className="parent-title">
                    <div>
                      <span className="eyebrow">МЕТОДИКА</span>
                      <h2>Из чего собран курс</h2>
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
                <section className="panel">
                  <span className="eyebrow">ДАННЫЕ МАРКА</span>
                  <h2>Перенос прогресса</h2>
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
                        onChange={(e) => {
                          importProgress(e.target.files?.[0]);
                          e.currentTarget.value = "";
                        }}
                      />
                    </label>
                    <Button variant="outline" onClick={reset}>
                      <RotateCcw />
                      Сбросить
                    </Button>
                  </div>
                </section>
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
        {rows.map((r, i) => (
          <article key={r[0]}>
            <b>{i + 1}</b>
            <div>
              <h4>{r[0]}</h4>
              <p>{r[1]}</p>
              <span>{r[2]}</span>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
