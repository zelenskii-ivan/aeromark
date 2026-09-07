/**
 * Геометрия и физика обби-маршрута вынесены из компонента, чтобы тест мог
 * проверить проходимость, не поднимая three.js и WebGL.
 *
 * Это не косметика: при JUMP_VELOCITY = 8.2 и GRAVITY = 20 высота прыжка
 * равна 1.68, а последнее препятствие было высотой 1.8 — забраться на него
 * было нельзя, пятая деталь не собиралась никогда. А без пяти деталей игра не
 * засчитывалась, значит миссии 3-5 не открывались вообще ни при каком раскладе.
 */
export const GRAVITY = 20;
export const JUMP_VELOCITY = 8.2;
export const PLAYER_RADIUS = 0.42;
/** Высота, на которой находится центр персонажа относительно его основания. */
export const PLAYER_CENTER_OFFSET = 1.7;
/** Радиус подбора детали. */
export const PICKUP_RADIUS = 1.65;
/** Амплитуда покачивания детали вверх-вниз. */
export const PART_BOB = 0.25;
/** Запас, с которым игрок считается стоящим на крыше препятствия. */
export const TOP_TOLERANCE = 0.08;

export const MAX_JUMP_HEIGHT = (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY);

export type Obstacle = {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
};

export const OBSTACLES: readonly Obstacle[] = [
  { x: -4, z: 14, height: 1.1, width: 3.8, depth: 3.5 },
  { x: 4, z: 5, height: 1.5, width: 3.8, depth: 3.5 },
  { x: -3, z: -6, height: 0.8, width: 3.8, depth: 3.5 },
  { x: 4, z: -17, height: 1.35, width: 3.8, depth: 3.5 },
  // Было 1.8 — выше прыжка. Снижено до 1.6, маршрут по-прежнему идёт по
  // возрастанию сложности, но финальное препятствие берётся.
  { x: 0, z: -28, height: 1.6, width: 5, depth: 3.5 },
];

export const PART_POSITIONS: ReadonlyArray<readonly [number, number, number]> = [
  [-4, 2.6, 14],
  [4, 3.1, 5],
  [-3, 2.3, -6],
  [4, 3.0, -17],
  // Опущено вслед за препятствием, иначе деталь висела бы вне досягаемости.
  [0, 3.25, -28],
];

/** Можно ли забраться на препятствие с земли одним прыжком. */
export const isClimbable = (obstacle: Obstacle): boolean =>
  MAX_JUMP_HEIGHT >= obstacle.height - TOP_TOLERANCE;

/**
 * Достаётся ли деталь, если стоять на соответствующем препятствии.
 * Учитывается нижняя точка покачивания — самый неудобный момент подбора.
 */
export function isPartReachable(
  part: readonly [number, number, number],
  obstacle: Obstacle,
): boolean {
  const standY = isClimbable(obstacle) ? obstacle.height : 0;
  const centerY = standY + PLAYER_CENTER_OFFSET;
  const horizontal = Math.hypot(part[0] - obstacle.x, part[2] - obstacle.z);
  const vertical = Math.min(
    Math.abs(part[1] - PART_BOB - centerY),
    Math.abs(part[1] + PART_BOB - centerY),
  );
  return Math.hypot(horizontal, vertical) < PICKUP_RADIUS;
}
