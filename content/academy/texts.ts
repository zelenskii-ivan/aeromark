/**
 * Предложения и рассказы Академии.
 *
 * Требования к тексту первокласснику (docs/METHODOLOGY.md): предложение 3–6
 * слов, одно событие на предложение, один главный герой, строго по порядку.
 * В рассказах у каждого вопроса есть «улика» — номер предложения, где лежит
 * ответ. Ребёнок сначала отвечает, потом показывает, где это написано: так
 * видно, прочитан текст или ответ угадан.
 *
 * Слоги в текстах не размечены — экран режет слова на слоги сам, когда
 * ребёнку нужна подсказка.
 */

export type Sentence =
  | { id: string; kind: "yesno"; text: string; question: string; answer: "да" | "нет" }
  | { id: string; kind: "complete"; text: string; options: [string, string]; answer: string }
  | { id: string; kind: "picture"; text: string; options: [string, string, string]; answer: string };

export const SENTENCES: readonly Sentence[] = [
  { id: "s-cat-sleeps", kind: "picture", text: "Кот спит.", options: ["🐱💤", "🐶💤", "🐱⚽"], answer: "🐱💤" },
  { id: "s-fish-swims", kind: "picture", text: "Рыба плывёт.", options: ["🐟🌊", "🐦☁️", "🐟🍽️"], answer: "🐟🌊" },
  { id: "s-plane-flies", kind: "picture", text: "Самолёт летит.", options: ["✈️☁️", "🚗🛣️", "✈️🏠"], answer: "✈️☁️" },
  { id: "s-mama-soup", kind: "picture", text: "Мама варит суп.", options: ["👩🍲", "👨🍲", "👩🧹"], answer: "👩🍲" },
  { id: "s-moon-night", kind: "picture", text: "Ночью светит луна.", options: ["🌙✨", "☀️🌤️", "🌧️☂️"], answer: "🌙✨" },
  { id: "s-dog-ball", kind: "picture", text: "Собака несёт мяч.", options: ["🐕⚽", "🐱⚽", "🐕🦴"], answer: "🐕⚽" },
  { id: "s-rain", kind: "picture", text: "Идёт дождь.", options: ["🌧️☂️", "❄️⛄", "☀️🏖️"], answer: "🌧️☂️" },
  { id: "s-fish-fly", kind: "yesno", text: "Рыба летает в небе.", question: "Так бывает?", answer: "нет" },
  { id: "s-cat-milk", kind: "yesno", text: "Кот пьёт молоко.", question: "Так бывает?", answer: "да" },
  { id: "s-snow-winter", kind: "yesno", text: "Зимой идёт снег.", question: "Так бывает?", answer: "да" },
  { id: "s-cow-sings", kind: "yesno", text: "Корова поёт песни.", question: "Так бывает?", answer: "нет" },
  { id: "s-plane-wings", kind: "yesno", text: "У самолёта есть крылья.", question: "Это правда?", answer: "да" },
  { id: "s-lemon-sweet", kind: "yesno", text: "Лимон очень сладкий.", question: "Это правда?", answer: "нет" },
  { id: "s-pilot-flies", kind: "yesno", text: "Пилот ведёт самолёт.", question: "Это правда?", answer: "да" },
  { id: "s-mark-reads", kind: "complete", text: "Марк читает ___.", options: ["книгу", "книга"], answer: "книгу" },
  { id: "s-mama-buys", kind: "complete", text: "Мама купила ___.", options: ["рыба", "рыбу"], answer: "рыбу" },
  { id: "s-owl-sits", kind: "complete", text: "На ветке сидит ___.", options: ["сова", "сову"], answer: "сова" },
  { id: "s-papa-carries", kind: "complete", text: "Папа несёт ___.", options: ["сумку", "сумка"], answer: "сумку" },
  { id: "s-tram-came", kind: "complete", text: "К остановке подъехал ___.", options: ["трамвай", "трамваем"], answer: "трамвай" },
  { id: "s-mark-pets", kind: "complete", text: "Марк гладит ___.", options: ["кошка", "кошку"], answer: "кошку" },
  { id: "s-plane-in", kind: "complete", text: "Самолёт летит в ___.", options: ["небе", "небо"], answer: "небо" },
  { id: "s-pilot-sees", kind: "complete", text: "Пилот видит ___.", options: ["облако", "облаком"], answer: "облако" },
];

export type StoryQuestion = {
  question: string;
  options: string[];
  answer: string;
  /** Номер предложения (с нуля), где написан ответ. */
  evidence: number;
};

export type Story = {
  id: string;
  title: string;
  /** Предложения рассказа. */
  sentences: string[];
  questions: StoryQuestion[];
  /** Уровень трудности 1–3: длина и количество слов в предложении. */
  level: 1 | 2 | 3;
};

export const STORIES: readonly Story[] = [
  {
    id: "st-cat",
    title: "Рыжий кот",
    level: 1,
    sentences: ["У Марка есть кот.", "Кот рыжий.", "Кот спит на диване.", "Марк дал коту молоко."],
    questions: [
      { question: "Какой кот?", options: ["рыжий", "серый", "чёрный"], answer: "рыжий", evidence: 1 },
      { question: "Где спит кот?", options: ["на диване", "на окне", "в саду"], answer: "на диване", evidence: 2 },
    ],
  },
  {
    id: "st-plane",
    title: "Самолёт",
    level: 1,
    sentences: ["Папа и Марк в аэропорту.", "Там стоит самолёт.", "Самолёт большой и белый.", "Скоро он полетит."],
    questions: [
      { question: "Где Марк и папа?", options: ["в аэропорту", "в школе", "в лесу"], answer: "в аэропорту", evidence: 0 },
      { question: "Какой самолёт?", options: ["большой и белый", "маленький и синий", "старый"], answer: "большой и белый", evidence: 2 },
    ],
  },
  {
    id: "st-snow",
    title: "Снеговик",
    level: 2,
    sentences: ["Зимой выпал снег.", "Марк вышел во двор.", "Он слепил снеговика.", "Вместо носа Марк дал ему морковку.", "Снеговик стоял до весны."],
    questions: [
      { question: "Когда выпал снег?", options: ["зимой", "летом", "осенью"], answer: "зимой", evidence: 0 },
      { question: "Что было вместо носа?", options: ["морковка", "шишка", "камень"], answer: "морковка", evidence: 3 },
      { question: "Почему снеговик растаял только весной?", options: ["зимой холодно", "Марк его спрятал", "он был из песка"], answer: "зимой холодно", evidence: 4 },
    ],
  },
  {
    id: "st-hangar",
    title: "Ночь в ангаре",
    level: 2,
    sentences: ["Механик Гром чинил самолёт.", "Вдруг погас свет.", "Гром не бросил работу.", "Он надел на лоб фонарь.", "Утром самолёт был готов."],
    questions: [
      { question: "Что чинил Гром?", options: ["самолёт", "машину", "велосипед"], answer: "самолёт", evidence: 0 },
      { question: "Что случилось со светом?", options: ["погас", "стал ярче", "замигал"], answer: "погас", evidence: 1 },
      { question: "Зачем Гром надел фонарь?", options: ["чтобы видеть в темноте", "чтобы было красиво", "чтобы согреться"], answer: "чтобы видеть в темноте", evidence: 3 },
    ],
  },
  {
    id: "st-cafe",
    title: "В кофейне",
    level: 2,
    sentences: ["Папа и Марк пришли в кофейню.", "Папа взял кофе.", "Марк выбрал какао.", "Какао было горячее.", "Марк подул на чашку."],
    questions: [
      { question: "Что выбрал Марк?", options: ["какао", "кофе", "сок"], answer: "какао", evidence: 2 },
      { question: "Почему Марк подул на чашку?", options: ["какао горячее", "чашка грязная", "так веселее"], answer: "какао горячее", evidence: 3 },
    ],
  },
  {
    id: "st-owl",
    title: "Сова",
    level: 3,
    sentences: ["У школы растёт старая липа.", "На липе живёт сова.", "Днём сова спит в дупле.", "Ночью она летает и ловит мышей.", "Утром сова снова прячется."],
    questions: [
      { question: "Где живёт сова?", options: ["на липе", "в школе", "в норе"], answer: "на липе", evidence: 1 },
      { question: "Что сова делает днём?", options: ["спит", "летает", "поёт"], answer: "спит", evidence: 2 },
      { question: "Когда сова охотится?", options: ["ночью", "утром", "днём"], answer: "ночью", evidence: 3 },
    ],
  },
  {
    id: "st-airport",
    title: "Первый полёт",
    level: 3,
    sentences: ["Марк впервые полетел на самолёте.", "Он сел у окна.", "Самолёт быстро набрал высоту.", "Внизу дома стали маленькими.", "Марк улыбнулся и помахал облакам."],
    questions: [
      { question: "Где сел Марк?", options: ["у окна", "у двери", "в кабине"], answer: "у окна", evidence: 1 },
      { question: "Почему дома стали маленькими?", options: ["самолёт высоко", "дома сломались", "Марк закрыл глаза"], answer: "самолёт высоко", evidence: 3 },
      { question: "Понравился ли Марку полёт?", options: ["да, он улыбался", "нет, он плакал", "он спал"], answer: "да, он улыбался", evidence: 4 },
    ],
  },
];

export const storyText = (story: Story): string => story.sentences.join(" ");

/** Слова текста без знаков препинания — для подсчёта скорости чтения. */
export const countWords = (text: string): number =>
  text.split(/\s+/).filter((word) => /[А-Яа-яЁё]/.test(word)).length;

/**
 * Тексты для лётного теста. Это не рассказы из уроков: проверка должна
 * показывать навык, а не память о знакомом тексте. Вопрос на понимание
 * обязателен — скорость без понимания не считается успехом.
 */
export type FlightText = {
  id: string;
  title: string;
  text: string;
  questions: StoryQuestion[];
};

export const FLIGHT_TEXTS: readonly FlightText[] = [
  {
    id: "ft-fox",
    title: "Лиса и ёж",
    text: "Лиса шла по лесу. Она увидела ежа. Ёж спал под кустом. Лиса тронула ежа лапой. Ёж свернулся в клубок. Лиса уколола нос и убежала.",
    questions: [
      { question: "Кого увидела лиса?", options: ["ежа", "зайца", "волка"], answer: "ежа", evidence: 1 },
      { question: "Почему лиса убежала?", options: ["уколола нос", "испугалась волка", "пошёл дождь"], answer: "уколола нос", evidence: 5 },
    ],
  },
  {
    id: "ft-park",
    title: "В парке",
    text: "Марк и папа пошли в парк. В парке был пруд. В пруду плавали утки. Марк дал уткам хлеб. Утки быстро всё съели.",
    questions: [
      { question: "Кто плавал в пруду?", options: ["утки", "рыбы", "лебеди"], answer: "утки", evidence: 2 },
      { question: "Что Марк дал уткам?", options: ["хлеб", "зерно", "печенье"], answer: "хлеб", evidence: 3 },
    ],
  },
  {
    id: "ft-school",
    title: "Утро",
    text: "Утром Марк едет в школу. Папа ведёт машину. На улице идёт дождь. Марк смотрит в окно. Вот и школа.",
    questions: [
      { question: "Какая погода была утром?", options: ["дождь", "снег", "солнце"], answer: "дождь", evidence: 2 },
      { question: "Кто ведёт машину?", options: ["папа", "мама", "Марк"], answer: "папа", evidence: 1 },
    ],
  },
  {
    id: "ft-pilot",
    title: "Пилот",
    text: "Пилот пришёл на аэродром. Он проверил крылья и колёса. Потом сел в кабину. Самолёт разбежался и взлетел. Пилот повёл его над морем.",
    questions: [
      { question: "Что проверил пилот?", options: ["крылья и колёса", "окна", "сумку"], answer: "крылья и колёса", evidence: 1 },
      { question: "Где летел самолёт?", options: ["над морем", "над горами", "над городом"], answer: "над морем", evidence: 4 },
    ],
  },
];
