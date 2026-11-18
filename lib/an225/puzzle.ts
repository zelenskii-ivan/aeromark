/**
 * Правила эпизода «Собери Мрию»: ребёнок водит Марка и носит детали, Капитан
 * Папа ставит большие детали краном. Ходят по очереди.
 *
 * Логика вынесена из компонента, чтобы тест проверял очерёдность, порядок
 * сборки, правило «поровну» и вопросы на счёт без three.js и WebGL.
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

export type Turn = "player" | "papa";

/** Кто может поставить деталь: Марк несёт в руках, кран поднимает тяжёлое. */
export type Carrier = "mark" | "crane";

export type PieceInfo = {
  id: PieceId;
  kind: PieceKind;
  name: string;
  /** Как деталь называет голос: «Возьми …». */
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
  { id: "eng1", kind: "engine", name: "Двигатель", spoken: "двигатель", carrier: "mark" },
  { id: "eng2", kind: "engine", name: "Двигатель", spoken: "двигатель", carrier: "mark" },
  { id: "eng3", kind: "engine", name: "Двигатель", spoken: "двигатель", carrier: "mark" },
  { id: "eng4", kind: "engine", name: "Двигатель", spoken: "двигатель", carrier: "mark" },
  { id: "eng5", kind: "engine", name: "Двигатель", spoken: "двигатель", carrier: "mark" },
  { id: "eng6", kind: "engine", name: "Двигатель", spoken: "двигатель", carrier: "mark" },
  { id: "noseGear", kind: "noseGear", name: "Носовая стойка", spoken: "носовую стойку шасси", carrier: "mark" },
  { id: "bogie1", kind: "bogie", name: "Тележка шасси", spoken: "тележку шасси с колёсами", carrier: "mark" },
  { id: "bogie2", kind: "bogie", name: "Тележка шасси", spoken: "тележку шасси с колёсами", carrier: "mark" },
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
  turn: Turn;
  /** Промахи ребёнка — только для подсказок, не для оценки. */
  misses: number;
  /** Вопросы на счёт, которые уже звучали. */
  asked: QuestionId[];
};

export function startPuzzle(): PuzzleState {
  return { placed: {}, turn: "papa", misses: 0, asked: [] };
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

/** Гнёзда, куда эта деталь подходит по форме (без учёта очереди и порядка). */
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
  /** Не тот ход. */
  | "turn"
  /** Деталь не той формы для этого места. */
  | "shape"
  /** Крепить ещё не к чему: например, двигатель без крыла. */
  | "needs"
  /** Место занято. */
  | "taken"
  /** На этой стороне уже больше двигателей: самолёт накренится. */
  | "balance"
  /** Тяжёлую деталь Марку не поднять — её ставит кран. */
  | "heavy";

/**
 * Можно ли ребёнку (через Марка) взять эту деталь прямо сейчас.
 * Возвращает null, если можно, или причину отказа.
 */
export function canPick(s: PuzzleState, piece: PieceId): Refusal | null {
  if (isPlaced(s, piece)) return "placed";
  if (s.turn !== "player") return "turn";
  const info = pieceInfo(piece);
  if (info.carrier !== "mark") return "heavy";
  if (!openSlotsFor(s, piece).length) return "needs";
  return null;
}

/** Причина, по которой деталь нельзя поставить в гнездо, или null. */
export function refusal(s: PuzzleState, who: Turn, piece: PieceId, slot: SlotId): Refusal | null {
  if (isPlaced(s, piece)) return "placed";
  if (isComplete(s) || s.turn !== who) return "turn";
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

export type PlaceResult = { state: PuzzleState; ok: boolean; why: Refusal | null };

/**
 * Ход: деталь `piece` ставится в гнездо `slot`. После удачного хода очередь
 * переходит к другому. Первый ход Папы — фюзеляж — это показ, после него
 * всегда ход ребёнка. «Буран» в конце ставят вместе: ход ребёнка, кран Папы.
 */
export function place(s: PuzzleState, who: Turn, piece: PieceId, slot: SlotId): PlaceResult {
  const why = refusal(s, who, piece, slot);
  if (why) {
    const counts = who === "player" && (why === "shape" || why === "balance" || why === "needs");
    return { state: counts ? { ...s, misses: s.misses + 1 } : s, ok: false, why };
  }
  const placed = { ...s.placed, [slot]: piece };
  const next: PuzzleState = { ...s, placed };
  next.turn = nextTurn(next, who);
  return { state: next, ok: true, why: null };
}

/**
 * Чей ход дальше. Обычно — другого. Но если у одного нечего ставить, ходит
 * другой: например, когда Папе остался только «Буран», его ставят по ходу
 * ребёнка, а когда ребёнку нечего нести, свою деталь ставит Папа.
 */
export function nextTurn(s: PuzzleState, who: Turn): Turn {
  if (isComplete(s)) return who;
  const other: Turn = who === "player" ? "papa" : "player";
  const has = (t: Turn) => (t === "player" ? playerHasMove(s) : papaChoice({ ...s, turn: "papa" }) !== null);
  if (has(other)) return other;
  return has(who) ? who : other;
}

/** Есть ли у ребёнка что ставить: деталь для Марка или общий финальный «Буран». */
export function playerHasMove(s: PuzzleState): boolean {
  if (slotOpen(s, "buran")) return true;
  const t = { ...s, turn: "player" as const };
  return PIECES.some((p) => p.carrier === "mark" && !isPlaced(s, p.id) && openSlotsFor(t, p.id).length > 0);
}

/** Детали, которые ребёнок может взять прямо сейчас. */
export function pickable(s: PuzzleState): PieceId[] {
  return PIECES.filter((p) => canPick({ ...s, turn: "player" }, p.id) === null).map((p) => p.id);
}

/**
 * Куда можно поставить деталь из рук прямо сейчас: открытые гнёзда её формы,
 * с учётом правила пары для двигателей.
 */
export function openSlotsFor(s: PuzzleState, piece: PieceId, who: Turn = "player"): SlotId[] {
  return slotsForPiece(piece).filter((slot) => refusal({ ...s, turn: who }, who, piece, slot) === null);
}

/** Порядок, в котором Папа ставит краном: каркас, потом хвост. */
const PAPA_ORDER: PieceId[] = ["fuselage", "wingL", "wingR", "stab", "finL", "finR"];

/**
 * Что ставит Папа своим ходом. Сначала каркас по порядку, потом —
 * двигатель на ту сторону, где их меньше (Папа тоже держит пару).
 * «Буран» Папа один не ставит: это общий финал по ходу ребёнка.
 */
export function papaChoice(s: PuzzleState): { piece: PieceId; slot: SlotId } | null {
  for (const piece of PAPA_ORDER) {
    if (isPlaced(s, piece)) continue;
    const slot = slotsForPiece(piece).find((x) => slotOpen(s, x));
    if (slot) return { piece, slot };
  }
  const engine = PIECES.find((p) => p.kind === "engine" && !isPlaced(s, p.id));
  if (!engine) return null;
  const left = enginesOn(s, "L");
  const right = enginesOn(s, "R");
  const order: Side[] = left <= right ? ["L", "R"] : ["R", "L"];
  for (const side of order) {
    // Ближнее к фюзеляжу гнездо — первым, как на настоящей сборке.
    const slot = SLOTS.find((x) => x.kind === "engine" && x.side === side && slotOpen(s, x.id));
    if (slot && refusal({ ...s, turn: "papa" }, "papa", engine.id, slot.id) === null) {
      return { piece: engine.id, slot: slot.id };
    }
  }
  return null;
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
  const due = (q: Question) => (s.asked.includes(q.id) ? null : q);
  if (engines === 2) {
    return due({
      id: "engines2",
      text: "Посчитай: сколько двигателей уже стоит на крыльях?",
      answer: 2,
      options: [1, 2, 3],
      count: { slots: ENGINE_SLOTS, mode: "filled" },
      hint: "Давай посчитаем вместе.",
    });
  }
  if (engines === 4) {
    return due({
      id: "enginesLeft4",
      text: "Всего у Мрии шесть двигателей. Четыре уже стоят. Сколько ещё нужно поставить?",
      answer: 2,
      options: [1, 2, 3],
      count: { slots: ENGINE_SLOTS, mode: "empty" },
      hint: "Посмотри на пустые места под крыльями.",
    });
  }
  if (engines === 6 && !s.asked.includes("enginesSide")) {
    return {
      id: "enginesSide",
      text: "Все двигатели на месте! Сколько двигателей на одном крыле?",
      answer: 3,
      options: [2, 3, 6],
      count: { slots: ENGINE_SLOTS_R, mode: "filled" },
      hint: "Посчитай двигатели на ближнем крыле.",
    };
  }
  if (engines === 6 && s.asked.includes("enginesSide")) {
    return due({
      id: "enginesTotal",
      text: "Три на одном крыле и три на другом. Сколько всего?",
      answer: 6,
      options: [3, 5, 6],
      count: { slots: ENGINE_SLOTS, mode: "filled" },
      hint: "Три и три. Считаем все.",
    });
  }
  if (isFilled(s, "finL") && isFilled(s, "finR")) {
    return due({
      id: "fins",
      text: "Сколько килей на хвосте у Мрии?",
      answer: 2,
      options: [1, 2, 3],
      count: { slots: ["finL", "finR"], mode: "filled" },
      hint: "Кили — это высокие стенки на концах хвоста.",
    });
  }
  return null;
}

export function markAsked(s: PuzzleState, id: QuestionId): PuzzleState {
  return s.asked.includes(id) ? s : { ...s, asked: [...s.asked, id] };
}

/** Число словами для подсчёта вслух: «один, два, три…». */
export const COUNT_WORDS = ["ноль", "один", "два", "три", "четыре", "пять", "шесть", "семь"];
