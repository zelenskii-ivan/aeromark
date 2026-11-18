import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWalker, stepWalker, findPath, gaitTimeScale, arrived, MOTION, STRIDE } from '../lib/an225/motion.ts';

const bounds = { minX: -9, maxX: 9, minZ: -7, maxZ: 7 };
const fuselage = { minX: -3.4, maxX: 3.4, minZ: -0.5, maxZ: 0.5 };
const engine = { x: 1, z: 2, r: 0.3 };
const obstacles = [fuselage, engine];

function run(from, to, { carrying = false, yaw = 0, maxT = 20 } = {}) {
  let w = makeWalker(from, yaw);
  w = { ...w, path: findPath(w.pos, to, obstacles, bounds) };
  let t = 0;
  let sideways = 0;
  let inside = 0;
  let maxSpeed = 0;
  const dt = 1 / 60;
  while (t < maxT && !arrived(w)) {
    const before = w.pos;
    w = stepWalker(w, dt, { kind: 'path' }, carrying, obstacles, bounds);
    t += dt;
    const dx = w.pos.x - before.x, dz = w.pos.z - before.z;
    const moved = Math.hypot(dx, dz);
    maxSpeed = Math.max(maxSpeed, w.speed);
    if (moved > 1e-3) {
      // Угол между направлением движения и направлением тела.
      const cos = (dx * Math.sin(w.yaw) + dz * Math.cos(w.yaw)) / moved;
      // Отталкивание от стенки может сдвинуть вбок; это допустимо только чуть-чуть.
      if (cos < 0.9) sideways++;
    }
    const r = MOTION.radius - 0.01;
    if (w.pos.x > fuselage.minX - r && w.pos.x < fuselage.maxX + r && w.pos.z > fuselage.minZ - r && w.pos.z < fuselage.maxZ + r) inside++;
  }
  return { w, t, sideways, inside, maxSpeed };
}

test('путь в обход фюзеляжа, а не сквозь него', () => {
  const path = findPath({ x: 0, z: 3 }, { x: 0, z: -3 }, obstacles, bounds);
  assert.ok(path.length >= 2, 'путь с поворотами');
  for (const p of path) assert.ok(Math.abs(p.z) > 0.5 || Math.abs(p.x) > 3.4);
});

test('Марк добегает до цели за самолётом, не заходя внутрь и не идя боком', () => {
  const { w, t, sideways, inside, maxSpeed } = run({ x: 0, z: 3 }, { x: 0.5, z: -3 }, { yaw: Math.PI });
  assert.ok(arrived(w), 'добежал');
  assert.ok(Math.hypot(w.pos.x - 0.5, w.pos.z + 3) < 0.15, `встал рядом с целью: ${JSON.stringify(w.pos)}`);
  assert.equal(inside, 0, 'не проходил сквозь фюзеляж');
  assert.ok(sideways < 4, `кадров «боком»: ${sideways}`);
  assert.ok(maxSpeed > 2, `бежал: ${maxSpeed.toFixed(2)} м/с`);
  assert.ok(t < 8, `обежал самолёт за ${t.toFixed(1)} с`);
});

test('8 метров по прямой — меньше пяти секунд (в Су-57 было больше десяти)', () => {
  const { t, w } = run({ x: -4, z: 4 }, { x: 4, z: 4 }, { yaw: Math.PI / 2 });
  assert.ok(arrived(w));
  assert.ok(t < 5, `${t.toFixed(2)} с`);
});

test('цель за спиной: сначала разворот, потом шаг — без пятиться', () => {
  const { sideways } = run({ x: -4, z: 4 }, { x: -6, z: 4 }, { yaw: Math.PI / 2 });
  assert.ok(sideways < 3);
});

test('с деталью в руках — шагом, без бега', () => {
  const { maxSpeed, w } = run({ x: -4, z: 4 }, { x: 4, z: 4 }, { carrying: true, yaw: Math.PI / 2 });
  assert.ok(arrived(w));
  assert.ok(maxSpeed <= MOTION.carrySpeed + 1e-9);
  assert.ok(w.gait === 'carryIdle');
});

test('джойстик: упираемся в фюзеляж — скользим вдоль, не проходим внутрь', () => {
  let w = makeWalker({ x: 0, z: 2 }, Math.PI);
  for (let i = 0; i < 240; i++) w = stepWalker(w, 1 / 60, { kind: 'stick', x: 0.4, z: -1 }, false, obstacles, bounds);
  assert.ok(w.pos.z >= 0.5 + MOTION.radius - 1e-6, `z=${w.pos.z}`);
  assert.ok(w.pos.x > 1, 'проехал вдоль борта');
});

test('темп анимации от реальной скорости: на родной скорости — ровно 1', () => {
  assert.equal(gaitTimeScale('walk', STRIDE.walk), 1);
  assert.equal(gaitTimeScale('run', STRIDE.run), 1);
  assert.ok(gaitTimeScale('run', MOTION.runSpeed) <= 1.35);
});

test('цель внутри препятствия — встаём рядом, а не внутри', () => {
  const path = findPath({ x: 0, z: 3 }, { x: 0, z: 0 }, obstacles, bounds);
  const end = path.at(-1);
  assert.ok(Math.abs(end.z) >= 0.5 + MOTION.radius - 1e-6);
});

test('Марк стоит вплотную к борту — путь всё равно в обход, а не сквозь', () => {
  const from = { x: 1.2, z: -0.5 - MOTION.radius };
  const path = findPath(from, { x: 0, z: 4.4 }, obstacles, bounds);
  assert.ok(path.length >= 3, JSON.stringify(path));
  let w = { ...makeWalker(from, 0), path };
  for (let i = 0; i < 900 && !arrived(w); i++) w = stepWalker(w, 1 / 60, { kind: 'path' }, false, obstacles, bounds);
  assert.ok(arrived(w), `застрял в ${JSON.stringify(w.pos)}`);
  assert.ok(Math.hypot(w.pos.x, w.pos.z - 4.4) < 0.2);
});

test('крупный шаг времени (медленный планшет): Марк не кружит вокруг цели', () => {
  for (const dt of [1 / 60, 1 / 20, 0.15]) {
    for (let a = 0; a < 16; a++) {
      const yaw = (a / 16) * Math.PI * 2;
      let w = makeWalker({ x: -4, z: 3.5 }, yaw);
      w = { ...w, path: findPath(w.pos, { x: -3.6, z: 3.2 }, obstacles, bounds) };
      let i = 0;
      for (; i < 400 && !arrived(w); i++) w = stepWalker(w, dt, { kind: 'path' }, true, obstacles, bounds);
      assert.ok(arrived(w), `dt=${dt} yaw=${yaw.toFixed(2)}: не дошёл ${JSON.stringify(w.pos)}`);
      assert.ok(Math.hypot(w.pos.x + 3.6, w.pos.z - 3.2) < 0.17);
    }
  }
});

test('цель вплотную к двигателю, а между — опущенный конец крыла: путь в обход', () => {
  const eng = { minX: 0.1, maxX: 0.94, minZ: 0.78, maxZ: 1.12 };
  const wingTip = { minX: -1, maxX: 0, minZ: 2.75, maxZ: 3.6 };
  const obs = [fuselage, eng, wingTip];
  const goal = { x: -0.2, z: 1.0 };
  const path = findPath({ x: 0, z: 4.42 }, goal, obs, bounds);
  assert.ok(path.length >= 2, JSON.stringify(path));
  let w = { ...makeWalker({ x: 0, z: 4.42 }, Math.PI), path };
  for (let i = 0; i < 900 && !arrived(w); i++) w = stepWalker(w, 1 / 30, { kind: 'path' }, true, obs, bounds);
  assert.ok(arrived(w), `застрял в ${JSON.stringify(w.pos)}`);
});

test('300 случайных маршрутов по ангару со всеми препятствиями: дошёл, не прошёл сквозь', () => {
  const B = { minX: -8.6, maxX: 8.6, minZ: -6.9, maxZ: 6.3 };
  const eng = (x, z) => ({ minX: x - 0.44, maxX: x + 0.4, minZ: z - 0.17, maxZ: z + 0.17 });
  const obs = [
    { minX: -3.35, maxX: 3.35, minZ: -0.45, maxZ: 0.45 },
    { minX: -4.3, maxX: 4.3, minZ: 4.9, maxZ: 5.6 },
    { minX: -7.8, maxX: -7.0, minZ: 4.35, maxZ: 5.05 },
    { x: -5.4, z: 5.0, r: 0.22 },
    { x: -6.5, z: 3.7, r: 0.3 },
    eng(0.54, -0.95), eng(0.54, 0.95), eng(0.22, -1.7), eng(0.22, 1.7), eng(-0.1, -2.45), eng(-0.1, 2.45),
    { minX: -1, maxX: 0, minZ: 2.75, maxZ: 3.6 },
    { minX: -1, maxX: 0, minZ: -3.6, maxZ: -2.75 },
    { minX: 6.0, maxX: 7.8, minZ: -1.8, maxZ: 0.8 },
  ];
  const r = MOTION.radius - 0.02;
  const inside = (p) =>
    obs.some((o) => ('r' in o ? Math.hypot(p.x - o.x, p.z - o.z) < o.r + r : p.x > o.minX - r && p.x < o.maxX + r && p.z > o.minZ - r && p.z < o.maxZ + r));
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const point = () => {
    for (;;) {
      const p = { x: B.minX + 0.5 + rnd() * (B.maxX - B.minX - 1), z: B.minZ + 0.5 + rnd() * (B.maxZ - B.minZ - 1) };
      if (!inside(p)) return p;
    }
  };
  for (let n = 0; n < 300; n++) {
    const from = point();
    const to = point();
    let w = { ...makeWalker(from, rnd() * 6.28), path: findPath(from, to, obs, B) };
    let i = 0;
    for (; i < 2400 && !arrived(w); i++) {
      w = stepWalker(w, 1 / 30, { kind: 'path' }, rnd() < 0.5, obs, B);
      assert.ok(!inside(w.pos), `маршрут ${n}: внутри препятствия в ${JSON.stringify(w.pos)}`);
    }
    assert.ok(arrived(w), `маршрут ${n}: ${JSON.stringify(from)} → ${JSON.stringify(to)} застрял в ${JSON.stringify(w.pos)}`);
    assert.ok(Math.hypot(w.pos.x - to.x, w.pos.z - to.z) < 0.2, `маршрут ${n}: встал далеко от цели`);
  }
});
