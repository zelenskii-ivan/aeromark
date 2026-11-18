/**
 * Правила эпизода «Собери Мрию»: всё делает ребёнок. Лёгкие детали Марк
 * носит в руках, тяжёлые ставит краном с пульта. Капитан Папа только
 * подсказывает.
 *
 * Логика вынесена из компонента, чтобы тест проверял порядок сборки,
 * правило «поровну» и вопросы на счёт без three.js и WebGL.
 *
 * Чему учит: счёт до шести, пары («три слева и три справа»), «сколько ещё
 * осталось» — это состав числа 6 из программы 1 класса.
 */

export type Side = "L" | "R";

export type PieceKind =
  | "fuselage"
  | "wing"
  | "stab"
  | "fin"
  | "engine"
  | "noseGear"
  | "bogie"
  | "buran";

export type PieceId =
  | "fuselage"
  | "wingL"
  | "wingR"
  | "stab"
  | "finL"
  | "finR"
  | "eng1"
  | "eng2"
  | "eng3"
  | "eng4"
  | "eng5"
  | "eng6"
  | "noseGear"
  | "bogie1"
  | "bogie2"
  | "buran";

export type SlotId =
  | "fuselage"
  | "wingL"
  | "wingR"
  | "stab"
  | "finL"
  | "finR"
  | "engL1"
  | "engL2"
  | "engL3"
  | "engR1"
  | "engR2"
  | "engR3"
  | "gearNose"
  | "gearL"
  | "gearR"
  | "buran";

/** Чем ставят деталь: Марк несёт в руках или поднимает краном. */
export type Carrier = "hands" | "crane";

export type PieceInfo = {
  id: PieceId;
  kind: PieceKind;
  name: string;
  /** Как деталь называет голос: «Ты взял …». */
  spoken: string;
  carrier: Carrier;
};

export type SlotInfo = {
  id: SlotId;
  kind: PieceKind;
  side?: Side;
  /** Что должно уже стоять, чтобы было к чему крепить. */
  needs: SlotId[];
};

export const PIECES: readonly PieceInfo[] = [
  { id: "fuselage", kind: "fuselage", name: "Фюзеляж", spoken: "фюзеляж — это корпус самолёта", carrier: "crane" },
  { id: "wingL", kind: "wing", name: "Левое крыло", spoken: "левое крыло", carrier: "crane" },
  { id: "wingR", kind: "wing", name: "Правое крыло", spoken: "правое крыло", carrier: "crane" },
  { id: "stab", kind: "stab", name: "Стабилизатор", spoken: "стабилизатор — это хвостовое крылышко", carrier: "crane" },
  { id: "finL", kind: "fin", name: "Левый киль", spoken: "левый киль", carrier: "crane" },
  { id: "finR", kind: "fin", name: "Правый киль", spoken: "правый киль", carrier: "crane" },
  { id: "eng1", kind: "engine", name: "Двигатель", spoken: "двигатель", carrier: "hands" },
  { id: "eng2", kind: "engine", name: "Двигатель", spoken: "двигатель", carrier: "hands" },
  { id: "eng3", kind: "engine", name: "Двигатель", spoken: "двигатель", carrier: "hands" },
  { id: "eng4", kind: "engine", name: "Двигатель", spoken: "двигатель", carrier: "hands" },
  { id: "eng5", kind: "engine", name: "Двигатель", spoken: "двигатель", carrier: "hands" },
  { id: "eng6", kind: "engine", name: "Двигатель", spoken: "двигатель", carrier: "hands" },
  { id: "noseGear", kind: "noseGear", name: "Носовая стойка", spoken: "носовую стойку шасси", carrier: "hands" },
  { id: "bogie1", kind: "bogie", name: "Тележка шасси", spoken: "тележку шасси с колёсами", carrier: "hands" },
  { id: "bogie2", kind: "bogie", name: "Тележка шасси", spoken: "тележку шасси с колёсами", carrier: "hands" },
  { id: "buran", kind: "buran", name: "«Буран»", spoken: "космический корабль «Буран»", carrier: "crane" },
];

const WINGS: Record<Side, SlotId> = { L: "wingL", R: "wingR" };

export const SLOTS: readonly SlotInfo[] = [
  { id: "fuselage", kind: "fuselage", needs: [] },
  { id: "wingL", kind: "wing", side: "L", needs: ["fuselage"] },
  { id: "wingR", kind: "wing", side: "R", needs: ["fuselage"] },
  { id: "stab", kind: "stab", needs: ["fuselage"] },
  { id: "finL", kind: "fin", side: "L", needs: ["stab"] },
  { id: "finR", kind: "fin", side: "R", needs: ["stab"] },
  ...(["L", "R"] as const).flatMap((side) =>
    ([1, 2, 3] as const).map(
      (n): SlotInfo => ({ id: `eng${side}${n}` as SlotId, kind: "engine", side, needs: [WINGS[side]] }),
    ),
  ),
  { id: "gearNose", kind: "noseGear", needs: ["fuselage"] },
  { id: "gearL", kind: "bogie", side: "L", needs: ["fuselage"] },
  { id: "gearR", kind: "bogie", side: "R", needs: ["fuselage"] },
  // «Буран» ставят последним, когда самолёт целиком готов.
  { id: "buran", kind: "buran", needs: [] },
];

export const PIECE_COUNT = PIECES.length;
export const ENGINES_PER_SIDE = 3;

const pieceById = new Map(PIECES.map((p) => [p.id, p]));
const slotById = new Map(SLOTS.map((s) => [s.id, s]));

export function pieceInfo(id: PieceId): PieceInfo {
  return pieceById.get(id)!;
}
export function slotInfo(id: SlotId): SlotInfo {
  return slotById.get(id)!;
}

export type PuzzleState = {
  /** Какая деталь в каком гнезде. Порядок вставки — порядок сборки. */
  placed: Partial<Record<SlotId, PieceId>>;
  /** Промахи ребёнка — только для подсказок, не для оценки. */
  misses: number;
  /** Вопросы на счёт, которые уже звучали. */
  asked: QuestionId[];
};

export function startPuzzle(): PuzzleState {
  return { placed: {}, misses: 0, asked: [] };
}

export const placedCount = (s: PuzzleState) => Object.keys(s.placed).length;
export const isPlaced = (s: PuzzleState, piece: PieceId) => Object.values(s.placed).includes(piece);
export const isFilled = (s: PuzzleState, slot: SlotId) => slot in s.placed;
export const isComplete = (s: PuzzleState) => placedCount(s) === PIECE_COUNT;

export function enginesOn(s: PuzzleState, side: Side): number {
  return SLOTS.filter((x) => x.kind === "engine" && x.side === side && isFilled(s, x.id)).length;
}

/** Всё, кроме «Бурана», уже стоит. */
const planeReady = (s: PuzzleState) => SLOTS.every((x) => x.id === "buran" || isFilled(s, x.id));

export function slotOpen(s: PuzzleState, slot: SlotId): boolean {
  if (isFilled(s, slot)) return false;
  if (slot === "buran") return planeReady(s);
  return slotInfo(slot).needs.every((n) => isFilled(s, n));
}

/** Гнёзда, куда эта деталь подходит по форме (без учёта порядка сборки). */
export function slotsForPiece(piece: PieceId): SlotId[] {
  const info = pieceInfo(piece);
  if (info.kind === "wing" || info.kind === "fin") {
    // Левое к левому, правое к правому: зеркальные детали не меняются местами.
    return SLOTS.filter((x) => x.kind === info.kind && x.side === piece.slice(-1)).map((x) => x.id);
  }
  return SLOTS.filter((x) => x.kind === info.kind).map((x) => x.id);
}

export type Refusal =
  /** Деталь уже стоит. */
  | "placed"
  /** Деталь не той формы для этого места. */
  | "shape"
  /** Крепить ещё не к чему: например, двигатель без крыла. */
  | "needs"
  /** Место занято. */
  | "taken"
  /** На этой стороне уже больше двигателей: самолёт накренится. */
  | "balance"
  /** Тяжёлую деталь руками не поднять — её ставят краном. */
  | "heavy"
  /** Лёгкую деталь краном не берут — её несут в руках. */
  | "light";

/** Причина, по которой деталь нельзя поставить в гнездо, или null. */
export function refusal(s: PuzzleState, piece: PieceId, slot: SlotId): Refusal | null {
  if (isPlaced(s, piece)) return "placed";
  if (!slotsForPiece(piece).includes(slot)) return "shape";
  if (isFilled(s, slot)) return "taken";
  if (!slotOpen(s, slot)) return "needs";
  const info = slotInfo(slot);
  if (info.kind === "engine" && info.side) {
    // Правило пары: разница между крыльями не больше одного двигателя.
    const here = enginesOn(s, info.side);
    const there = enginesOn(s, info.side === "L" ? "R" : "L");
    if (here + 1 - there > 1) return "balance";
  }
  return null;
}

/** Куда деталь можно поставить прямо сейчас (с правилом пары). */
export function openSlotsFor(s: PuzzleState, piece: PieceId): SlotId[] {
  return slotsForPiece(piece).filter((slot) => refusal(s, piece, slot) === null);
}

/** Можно ли взять деталь этим способом прямо сейчас; null — можно. */
export function canTake(s: PuzzleState, piece: PieceId, by: Carrier): Refusal | null {
  if (isPlaced(s, piece)) return "placed";
  const info = pieceInfo(piece);
  if (info.carrier !== by) return by === "hands" ? "heavy" : "light";
  if (!openSlotsFor(s, piece).length) return "needs";
  return null;
}

/** Детали, которые можно взять прямо сейчас этим способом. */
export function available(s: PuzzleState, by: Carrier): PieceId[] {
  return PIECES.filter((p) => canTake(s, p.id, by) === null).map((p) => p.id);
}

export type PlaceResult = { state: PuzzleState; ok: boolean; why: Refusal | null };

/** Ставим деталь в гнездо. Неудача по форме, порядку или паре — промах. */
export function place(s: PuzzleState, piece: PieceId, slot: SlotId): PlaceResult {
  const why = refusal(s, piece, slot);
  if (why) {
    const counts = why === "shape" || why === "balance" || why === "needs";
    return { state: counts ? { ...s, misses: s.misses + 1 } : s, ok: false, why };
  }
  return { state: { ...s, placed: { ...s.placed, [slot]: piece } }, ok: true, why: null };
}

// ---------- вопросы на счёт ----------

export type QuestionId = "engines2" | "enginesLeft4" | "enginesSide" | "enginesTotal" | "fins";

export type Question = {
  id: QuestionId;
  text: string;
  answer: number;
  options: number[];
  /** Что пересчитать вслух, если ответ неверный: гнёзда и как их отметить. */
  count: { slots: SlotId[]; mode: "filled" | "empty" };
  /** Подсказка-объяснение после неверного ответа. */
  hint: string;
};

const ENGINE_SLOTS = SLOTS.filter((x) => x.kind === "engine").map((x) => x.id);
const ENGINE_SLOTS_R = SLOTS.filter((x) => x.kind === "engine" && x.side === "R").map((x) => x.id);

/**
 * Вопрос, который пора задать после очередной поставленной детали, или null.
 * Каждый звучит один раз за игру.
 */
export function questionDue(s: PuzzleState): Question | null {
  const engines = enginesOn(s, "L") + enginesOn(s, "R");
  // Все вопросы, уместные сейчас, по порядку; задаём первый ещё не заданный.
  // (Раньше уже заданный вопрос про двигатели заслонял вопрос про кили.)
  const candidates: Question[] = [];
  if (engines === 2) {
    candidates.push({
      id: "engines2",
      text: "Посчитай: сколько двигателей уже стоит на крыльях?",
      answer: 2,
      options: [1, 2, 3],
      count: { slots: ENGINE_SLOTS, mode: "filled" },
      hint: "Давай посчитаем вместе.",
    });
  }
  if (engines === 4) {
    candidates.push({
      id: "enginesLeft4",
      text: "Всего у Мрии шесть двигателей. Четыре уже стоят. Сколько ещё нужно поставить?",
      answer: 2,
      options: [1, 2, 3],
      count: { slots: ENGINE_SLOTS, mode: "empty" },
      hint: "Посмотри на пустые места под крыльями.",
    });
  }
  if (engines === 6) {
    candidates.push(
      {
        id: "enginesSide",
        text: "Все двигатели на месте! Сколько двигателей на одном крыле?",
        answer: 3,
        options: [2, 3, 6],
        count: { slots: ENGINE_SLOTS_R, mode: "filled" },
        hint: "Посчитай двигатели на ближнем крыле.",
      },
      {
        id: "enginesTotal",
        text: "Три на одном крыле и три на другом. Сколько всего?",
        answer: 6,
        options: [3, 5, 6],
        count: { slots: ENGINE_SLOTS, mode: "filled" },
        hint: "Три и три. Считаем все.",
      },
    );
  }
  if (isFilled(s, "finL") && isFilled(s, "finR")) {
    candidates.push({
      id: "fins",
      text: "Сколько килей на хвосте у Мрии?",
      answer: 2,
      options: [1, 2, 3],
      count: { slots: ["finL", "finR"], mode: "filled" },
      hint: "Кили — это высокие стенки на концах хвоста.",
    });
  }
  return candidates.find((q) => !s.asked.includes(q.id)) ?? null;
}

export function markAsked(s: PuzzleState, id: QuestionId): PuzzleState {
  return s.asked.includes(id) ? s : { ...s, asked: [...s.asked, id] };
}

/** Число словами для подсчёта вслух: «один, два, три…». */
export const COUNT_WORDS = ["ноль", "один", "два", "три", "четыре", "пять", "шесть", "семь"];
