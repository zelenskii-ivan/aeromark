/**
 * Как ходит Марк, когда его водит ребёнок. Без three.js — чтобы тест мог
 * проверить: не ходит боком, не проходит сквозь самолёт, добегает быстро.
 *
 * Что было не так в Су-57 и что здесь иначе:
 *  - Скорость ходьбы была меньше, чем шаг в анимации (0,785 против 0,93 м/с):
 *    ноги шагали быстрее, чем двигалось тело, и Марк будто скользил. Здесь
 *    темп анимации всегда считается от реальной скорости, а скорости шага и
 *    бега измерены по ступням в анимациях модели.
 *  - Марк двигался по точкам пути, а разворачивался вдогонку — на поворотах
 *    тело ехало вбок. Здесь Марк движется только туда, куда смотрит: сначала
 *    поворачивается, а скорость на крутом повороте падает, как у человека.
 *  - Бега не было вовсе. Здесь на длинных отрезках Марк бежит.
 */

export type Vec2 = { x: number; z: number };

/** Прямоугольник на полу (вид сверху). */
export type Box = { minX: number; maxX: number; minZ: number; maxZ: number };
/** Круг на полу: стойка шасси, двигатель, Папа. */
export type Circle = { x: number; z: number; r: number };
export type Obstacle = Box | Circle;

export type Bounds = Box;

export const isCircle = (o: Obstacle): o is Circle => "r" in o;

/** Скорости, при которых ступни не скользят: измерены по анимациям mark.glb. */
export const STRIDE = { walk: 0.93, run: 1.87, carry: 0.75 } as const;

export const MOTION = {
  /** Радиус Марка для столкновений. */
  radius: 0.26,
  /** Предельная скорость бега, м/с: анимация бега идёт чуть быстрее родной. */
  runSpeed: 2.3,
  walkSpeed: 1.05,
  carrySpeed: 1.1,
  accel: 5.5,
  brake: 7,
  /** Поворот, рад/с. Быстро, но не рывком. */
  turnRate: 10,
  /** Ближе этого к цели — идём шагом, а не бежим. */
  walkWithin: 1.4,
  arrive: 0.06,
} as const;

export type Gait = "idle" | "walk" | "run" | "carry" | "carryIdle";

export type Walker = {
  pos: Vec2;
  /** Куда смотрит: угол как у three.js — atan2(dx, dz). */
  yaw: number;
  speed: number;
  gait: Gait;
  /** Точки пути; первая — ближайшая цель. */
  path: Vec2[];
};

export type Input =
  | { kind: "path" }
  /** Джойстик или стрелки: направление в мире, длина 0..1. */
  | { kind: "stick"; x: number; z: number };

export function makeWalker(pos: Vec2, yaw = 0): Walker {
  return { pos: { ...pos }, yaw, speed: 0, gait: "idle", path: [] };
}

const wrap = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

function inflate(o: Obstacle, r: number): Box {
  if (isCircle(o)) return { minX: o.x - o.r - r, maxX: o.x + o.r + r, minZ: o.z - o.r - r, maxZ: o.z + o.r + r };
  return { minX: o.minX - r, maxX: o.maxX + r, minZ: o.minZ - r, maxZ: o.maxZ + r };
}

const insideBox = (p: Vec2, b: Box, eps = 0) =>
  p.x > b.minX + eps && p.x < b.maxX - eps && p.z > b.minZ + eps && p.z < b.maxZ - eps;

/** Пересекает ли отрезок a→b внутренность прямоугольника (метод Лянга — Барски). */
function segmentHitsBox(a: Vec2, b: Vec2, box: Box): boolean {
  const eps = 1e-6;
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dz = b.z - a.z;
  const edges: [number, number][] = [
    [-dx, a.x - (box.minX + eps)],
    [dx, box.maxX - eps - a.x],
    [-dz, a.z - (box.minZ + eps)],
    [dz, box.maxZ - eps - a.z],
  ];
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return t1 - t0 > 1e-4;
}

/** Ближайшая точка вне всех препятствий и внутри стен. */
export function freeSpot(p: Vec2, obstacles: Obstacle[], bounds: Bounds, r: number = MOTION.radius): Vec2 {
  let out = { ...p };
  for (let pass = 0; pass < 4; pass++) {
    for (const o of obstacles) out = pushOut(out, o, r);
    out.x = Math.min(bounds.maxX - r, Math.max(bounds.minX + r, out.x));
    out.z = Math.min(bounds.maxZ - r, Math.max(bounds.minZ + r, out.z));
  }
  return out;
}

function pushOut(p: Vec2, o: Obstacle, r: number): Vec2 {
  if (isCircle(o)) {
    const d = Math.hypot(p.x - o.x, p.z - o.z);
    const need = o.r + r;
    if (d >= need) return p;
    if (d < 1e-6) return { x: o.x + need, z: o.z };
    return { x: o.x + ((p.x - o.x) / d) * need, z: o.z + ((p.z - o.z) / d) * need };
  }
  const b = inflate(o, r);
  if (!insideBox(p, b)) return p;
  const pushes = [
    { d: p.x - b.minX, v: { x: b.minX, z: p.z } },
    { d: b.maxX - p.x, v: { x: b.maxX, z: p.z } },
    { d: p.z - b.minZ, v: { x: p.x, z: b.minZ } },
    { d: b.maxZ - p.z, v: { x: p.x, z: b.maxZ } },
  ];
  pushes.sort((u, w) => u.d - w.d);
  return pushes[0]!.v;
}

/**
 * Путь в обход препятствий: кратчайший по углам раздутых прямоугольников
 * (граф видимости + Дейкстра). Узлов немного — считается мгновенно.
 */
export function findPath(from: Vec2, to: Vec2, obstacles: Obstacle[], bounds: Bounds, r: number = MOTION.radius): Vec2[] {
  const goal = freeSpot(to, obstacles, bounds, r);
  // Небольшой запас, чтобы путь не скрёб углы.
  const margin = 0.06;
  // Марк стоит вплотную к борту — то есть внутри запаса. Тогда путь строим
  // от ближайшей точки снаружи, иначе любой отрезок от него «заблокирован»
  // и путь вырождался в прямую сквозь самолёт.
  const start = freeSpot(from, obstacles, bounds, r + margin + 0.02);
  const lead = dist(start, from) > 1e-3 ? [start] : [];
  const boxes = obstacles.map((o) => inflate(o, r + margin));
  const tight = obstacles.map((o) => inflate(o, r));
  // Цель может стоять вплотную к препятствию — внутри запаса, но не внутри
  // самого препятствия. Отрезки к цели и от старта проверяем без запаса,
  // иначе любой путь к такой цели «заблокирован».
  const blocked = (a: Vec2, b: Vec2) => {
    const end = a === goal || b === goal || a === start || b === start;
    return (end ? tight : boxes).some((box) => segmentHitsBox(a, b, box));
  };
  if (!blocked(start, goal)) return [...lead, goal];
  const nodes: Vec2[] = [start, goal];
  for (const b of boxes) {
    for (const c of [
      { x: b.minX - 0.02, z: b.minZ - 0.02 },
      { x: b.maxX + 0.02, z: b.minZ - 0.02 },
      { x: b.minX - 0.02, z: b.maxZ + 0.02 },
      { x: b.maxX + 0.02, z: b.maxZ + 0.02 },
    ]) {
      const inWalls = c.x > bounds.minX + r && c.x < bounds.maxX - r && c.z > bounds.minZ + r && c.z < bounds.maxZ - r;
      if (inWalls && !boxes.some((other) => insideBox(c, other))) nodes.push(c);
    }
  }
  const n = nodes.length;
  const best = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  best[0] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && best[i]! < Infinity && (u < 0 || best[i]! < best[u]!)) u = i;
    if (u < 0 || u === 1) break;
    done[u] = true;
    for (let v = 0; v < n; v++) {
      if (done[v] || v === u) continue;
      if (blocked(nodes[u]!, nodes[v]!)) continue;
      const d = best[u]! + dist(nodes[u]!, nodes[v]!);
      if (d < best[v]!) {
        best[v] = d;
        prev[v] = u;
      }
    }
  }
  if (prev[1] === -1) return [...lead, goal];
  const out: Vec2[] = [];
  for (let v = 1; v > 0; v = prev[v]!) out.unshift(nodes[v]!);
  return [...lead, ...out];
}

function remaining(w: Walker): number {
  let total = 0;
  let at = w.pos;
  for (const p of w.path) {
    total += dist(at, p);
    at = p;
  }
  return total;
}

/**
 * Один шаг физики. Марк всегда идёт туда, куда смотрит: направление
 * движения — это направление тела. Поэтому боком он не ходит в принципе.
 */
export function stepWalker(
  w: Walker,
  dt: number,
  input: Input,
  carrying: boolean,
  obstacles: Obstacle[],
  bounds: Bounds,
): Walker {
  let want: Vec2 | null = null;
  let top = 0;
  let path = w.path;
  if (input.kind === "stick") {
    const len = Math.min(1, Math.hypot(input.x, input.z));
    path = [];
    if (len > 0.12) {
      want = { x: input.x / len, z: input.z / len };
      top = carrying ? MOTION.carrySpeed : len > 0.75 ? MOTION.runSpeed : MOTION.walkSpeed * Math.max(0.55, len / 0.75);
    }
  } else if (path.length) {
    // Промежуточную точку засчитываем чуть раньше — углы проходим дугой, —
    // но только если следующую уже видно: иначе Марк срезал бы угол сквозь борт.
    const boxes = obstacles.map((o) => inflate(o, MOTION.radius));
    while (path.length > 1 && dist(w.pos, path[0]!) < 0.45 && !boxes.some((b) => segmentHitsBox(w.pos, path[1]!, b))) {
      path = path.slice(1);
    }
    if (path.length > 1 && dist(w.pos, path[0]!) < 0.05) path = path.slice(1);
    const left = remaining({ ...w, path });
    const aim0 = path[0]!;
    const d0 = dist(w.pos, aim0);
    // Цель совсем рядом, но оказалась сбоку или за спиной — считаем, что
    // пришли. Иначе Марк кружил бы вокруг точки, разворачиваясь на ходу.
    const behind =
      path.length === 1 &&
      left < 0.16 &&
      (Math.sin(w.yaw) * (aim0.x - w.pos.x) + Math.cos(w.yaw) * (aim0.z - w.pos.z)) / Math.max(d0, 1e-6) < 0.5;
    if (left < MOTION.arrive || behind) {
      path = [];
    } else {
      const aim = aim0;
      const d = d0;
      want = { x: (aim.x - w.pos.x) / d, z: (aim.z - w.pos.z) / d };
      top = carrying ? MOTION.carrySpeed : left > MOTION.walkWithin ? MOTION.runSpeed : MOTION.walkSpeed;
      // Тормозим к концу пути, чтобы встать точно, а не проскочить, —
      // и не дальше, чем осталось, за один шаг.
      top = Math.min(top, Math.sqrt(2 * MOTION.brake * left * 0.8), left / Math.max(dt, 1e-3));
      // И перед крутым поворотом — как человек, который огибает угол.
      const next = path[1];
      if (next) {
        const ax = aim.x - w.pos.x, az = aim.z - w.pos.z;
        const bx = next.x - aim.x, bz = next.z - aim.z;
        const cos = (ax * bx + az * bz) / Math.max(1e-6, Math.hypot(ax, az) * Math.hypot(bx, bz));
        const corner = Math.max(0.9, MOTION.runSpeed * Math.max(0, (1 + cos) / 2));
        top = Math.min(top, Math.sqrt(corner * corner + 2 * MOTION.brake * Math.max(0, d - 0.3)));
      }
    }
  }

  let yaw = w.yaw;
  let target = 0;
  if (want) {
    const diff = wrap(Math.atan2(want.x, want.z) - yaw);
    const turn = Math.sign(diff) * Math.min(Math.abs(diff), MOTION.turnRate * dt);
    yaw = wrap(yaw + turn);
    // На крутом повороте почти останавливаемся и разворачиваемся на месте.
    const align = Math.cos(wrap(Math.atan2(want.x, want.z) - yaw));
    target = top * Math.max(0, align) ** 3;
  }
  const rate = target > w.speed ? MOTION.accel : MOTION.brake;
  const speed = w.speed + Math.sign(target - w.speed) * Math.min(Math.abs(target - w.speed), rate * dt);

  let pos = { x: w.pos.x + Math.sin(yaw) * speed * dt, z: w.pos.z + Math.cos(yaw) * speed * dt };
  // Столкновения: выталкиваем наружу. Вдоль стенки Марк скользит, а не застревает.
  pos = freeSpot(pos, obstacles, bounds);

  // Темп и вид походки — от реальной скорости, с запасом, чтобы не дёргалось.
  let gait: Gait;
  if (carrying) gait = speed > 0.06 ? "carry" : "carryIdle";
  else if (speed < 0.06) gait = "idle";
  else if (w.gait === "run") gait = speed > 1.2 ? "run" : "walk";
  else gait = speed > 1.4 ? "run" : "walk";

  if (input.kind === "path" && path.length && remaining({ ...w, pos, path }) < MOTION.arrive && speed < 0.3) path = [];
  return { pos, yaw, speed, gait, path };
}

/** Во сколько раз ускорить клип походки, чтобы ступни не скользили. */
export function gaitTimeScale(gait: Gait, speed: number): number {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  if (gait === "run") return clamp(speed / STRIDE.run, 0.75, 1.35);
  if (gait === "walk") return clamp(speed / STRIDE.walk, 0.45, 1.5);
  if (gait === "carry") return clamp(speed / STRIDE.carry, 0.45, 1.6);
  return 1;
}

export const arrived = (w: Walker) => w.path.length === 0 && w.speed < 0.08;
