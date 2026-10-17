/**
 * Правила пазла «Собери Су-57»: Марк и ребёнок по очереди ставят детали.
 *
 * Логика вынесена из компонента, чтобы тест проверял очерёдность и конец игры
 * без three.js и WebGL.
 */

export type PieceId =
  | "body"
  | "nose"
  | "cockpit"
  | "wingL"
  | "wingR"
  | "tail"
  | "finL"
  | "finR";

export type Turn = "player" | "mark";

export type PieceInfo = {
  id: PieceId;
  /** Подпись на экране. */
  name: string;
  /** Как деталь называет голос: «Возьми …». */
  spoken: string;
};

export const PIECES: readonly PieceInfo[] = [
  { id: "body", name: "Фюзеляж", spoken: "фюзеляж — это корпус самолёта" },
  { id: "nose", name: "Нос", spoken: "нос самолёта" },
  { id: "cockpit", name: "Кабина", spoken: "кабину пилота" },
  { id: "wingL", name: "Левое крыло", spoken: "левое крыло" },
  { id: "wingR", name: "Правое крыло", spoken: "правое крыло" },
  { id: "tail", name: "Двигатели", spoken: "двигатели с хвостовым оперением" },
  { id: "finL", name: "Левый киль", spoken: "левый киль" },
  { id: "finR", name: "Правый киль", spoken: "правый киль" },
];

export const PIECE_COUNT = PIECES.length;

export type PuzzleState = {
  placed: PieceId[];
  turn: Turn;
  /** Промахи ребёнка за игру — только для подсказок, не для оценки. */
  misses: number;
};

export function startPuzzle(first: Turn = "player"): PuzzleState {
  return { placed: [], turn: first, misses: 0 };
}

export function remaining(state: PuzzleState): PieceId[] {
  return PIECES.map((piece) => piece.id).filter(
    (id) => !state.placed.includes(id),
  );
}

export function isComplete(state: PuzzleState): boolean {
  return state.placed.length === PIECE_COUNT;
}

export type PlaceResult = { state: PuzzleState; ok: boolean };

/**
 * Ход: деталь `piece` ставится в гнездо `slot`. Принимается только в свою
 * очередь, только ещё не поставленная деталь и только в своё гнездо.
 * После удачного хода очередь переходит к другому игроку.
 */
export function place(
  state: PuzzleState,
  who: Turn,
  piece: PieceId,
  slot: PieceId,
): PlaceResult {
  if (isComplete(state) || state.turn !== who || state.placed.includes(piece)) {
    return { state, ok: false };
  }
  if (piece !== slot) {
    return {
      state: who === "player" ? { ...state, misses: state.misses + 1 } : state,
      ok: false,
    };
  }
  const placed = [...state.placed, piece];
  const done = placed.length === PIECE_COUNT;
  return {
    ok: true,
    state: {
      ...state,
      placed,
      turn: done ? state.turn : who === "player" ? "mark" : "player",
    },
  };
}

/**
 * Какую деталь берёт Марк. Сначала корпус — без него остальное не к чему
 * крепить, — дальше случайная из оставшихся.
 */
export function markChoice(
  state: PuzzleState,
  random: () => number = Math.random,
): PieceId | null {
  const left = remaining(state);
  if (!left.length) return null;
  if (left.includes("body")) return "body";
  return left[Math.min(left.length - 1, Math.floor(random() * left.length))] ?? null;
}

export function pieceName(id: PieceId): string {
  return PIECES.find((piece) => piece.id === id)?.name ?? id;
}

export function pieceSpoken(id: PieceId): string {
  return PIECES.find((piece) => piece.id === id)?.spoken ?? id;
}
