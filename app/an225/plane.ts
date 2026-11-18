import * as THREE from "three";
import type { PieceId, SlotId } from "@/lib/an225/puzzle";

/**
 * Игрушечная Ан-225 «Мрия» из шестнадцати деталей. Координаты — в метрах в
 * системе самолёта: нос смотрит в +X, верх — +Y, правое крыло — в +Z.
 * Длина 6,6 м при росте Марка 1,22 м: он проходит под крылом, но до
 * двигателей дотягивается.
 *
 * Узнаваемое у «Мрии»: очень длинный толстый фюзеляж, высокоплан с крылом,
 * опущенным к концам, шесть двигателей под крылом, двухкилевое оперение
 * (кили на концах стабилизатора) и «Буран» на спине.
 */

const WHITE = 0xf3f5f8;
const BLUE = 0x2c63c9;
const YELLOW = 0xf2c230;
const GREY = 0x9aa5b4;
const DARK = 0x2a3038;
const TYRE = 0x22262c;

function mat(color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1, ...extra });
}

/** Фюзеляж: высота оси и радиусы сечения вдоль X. */
export const FUSE = { len: 6.6, front: 3.3, back: -3.3, axis: 1.08, r: 0.37 } as const;

function fuseAt(x: number): { yc: number; ry: number; rz: number } {
  const { front, back, axis, r } = FUSE;
  if (x > 2.45) {
    // Нос: закруглённый, кабина сверху.
    const k = (front - x) / (front - 2.45);
    const s = Math.sqrt(Math.max(0, 1 - (1 - k) ** 2));
    return { yc: axis + 0.06 * (1 - k), ry: r * (0.18 + 0.82 * s), rz: r * (0.12 + 0.88 * s) };
  }
  if (x > -1.7) return { yc: axis, ry: r, rz: r };
  // Хвост сужается и задирается вверх.
  const k = (-1.7 - x) / (-1.7 - back);
  return { yc: axis + 0.42 * k ** 1.3, ry: r * (1 - 0.72 * k), rz: r * (1 - 0.78 * k) };
}

/** Труба по сечениям с UV: u — вдоль оси X, v — по окружности (0 — правый борт, +Z). */
function loft(samples: { x: number; yc: number; ry: number; rz: number }[], seg = 40) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const x0 = samples[0]!.x;
  const x1 = samples[samples.length - 1]!.x;
  samples.forEach((s, i) => {
    for (let j = 0; j <= seg; j++) {
      const t = (j / seg) * Math.PI * 2;
      pos.push(s.x, s.yc + Math.sin(t) * s.ry, Math.cos(t) * s.rz);
      uv.push((s.x - x0) / (x1 - x0), j / seg);
      if (i && j) {
        const a = (i - 1) * (seg + 1) + j - 1;
        const b = a + 1;
        const c = i * (seg + 1) + j - 1;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Ливрея фюзеляжа: белый, синяя и жёлтая полосы, окна, надпись «МРИЯ». */
function liveryTexture(): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const W = 2048;
  const H = 512;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#f3f5f8";
  g.fillRect(0, 0, W, H);
  // v: 0 — правый борт, 0,25 — верх, 0,5 — левый борт, 0,75 — низ.
  // На правом борту v растёт вверх, на левом — вниз. Поэтому всё, что
  // рисуем на оба борта, задаём смещением «вверх от середины борта».
  const sides = [
    { v: (up: number) => up, mirror: false },
    { v: (up: number) => 0.5 - up, mirror: true },
  ];
  const strip = (v: number, h: number, color: string) => {
    g.fillStyle = color;
    for (const shift of [0, 1, -1]) g.fillRect(0, (v + shift - h / 2) * H, W, h * H);
  };
  for (const side of sides) {
    strip(side.v(-0.012), 0.042, "#2c63c9");
    strip(side.v(-0.048), 0.014, "#f2c230");
  }
  // Низ — светло-серый, как у настоящей.
  strip(0.75, 0.2, "#d6dbe2");
  const u = (x: number) => ((x - FUSE.back) / FUSE.len) * W;
  for (const side of sides) {
    g.fillStyle = "#1f2b3a";
    // Окна кабины и ряд иллюминаторов над синей полосой.
    const cab = side.v(0.075);
    g.fillRect(u(3.0), (cab - 0.025) * H, u(3.16) - u(3.0), 0.05 * H);
    for (let x = -1.5; x < 2.2; x += 0.16) {
      g.beginPath();
      g.arc(u(x), side.v(0.042) * H, 6, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Надписи. Правый борт: v растёт вверх — переворачиваем по вертикали.
  // Левый борт: нос слева от зрителя — отражаем по горизонтали.
  g.textBaseline = "middle";
  g.textAlign = "center";
  g.fillStyle = "#1d3f86";
  const write = (text: string, x: number, up: number, size: number) => {
    g.font = `900 ${size}px system-ui, sans-serif`;
    for (const side of sides) {
      g.save();
      g.translate(u(x), side.v(up) * H);
      g.scale(side.mirror ? -1 : 1, side.mirror ? 1 : -1);
      g.fillText(text, 0, 0);
      g.restore();
    }
  };
  write("МРИЯ", 0.9, 0.115, 110);
  write("АН-225", -2.35, 0.1, 64);
  const tex = new THREE.CanvasTexture(c);
  // Строка холста = v напрямую, без переворота: так проще считать борта.
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Плоская деталь по контуру сверху: точки (x, z), толщина по Y. */
function plate(points: [number, number][], thickness: number, bevel = 0.015) {
  const shape = new THREE.Shape();
  points.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -thickness / 2, 0);
  return geo;
}

/** Вертикальная пластина по контуру сбоку: точки (x, y), толщина по Z. */
function sidePlate(points: [number, number][], thickness: number, bevel = 0.012) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -thickness / 2);
  return geo;
}

// ---------- крыло и где на нём двигатели ----------

const WING = {
  rootZ: 0.28,
  span: 3.25,
  rootLE: 0.95,
  rootChord: 1.45,
  tipLE: -0.45,
  tipChord: 0.5,
  y: 1.42,
  thick: 0.09,
  /** Насколько концы крыла ниже корня: у «Мрии» крыло опущено. */
  droop: 0.26,
} as const;

const wingLE = (z: number) => WING.rootLE + ((Math.abs(z) - WING.rootZ) / WING.span) * (WING.tipLE - WING.rootLE);
const wingY = (z: number) => WING.y - ((Math.abs(z) - WING.rootZ) / WING.span) * WING.droop;

const ENGINE_Z = [0.95, 1.7, 2.45] as const;
const ENGINE_DROP = 0.3;

export function engineSlotPos(side: "L" | "R", n: 1 | 2 | 3): THREE.Vector3 {
  const z = ENGINE_Z[n - 1]! * (side === "R" ? 1 : -1);
  return new THREE.Vector3(wingLE(z) - 0.12, wingY(z) - ENGINE_DROP, z);
}

// ---------- детали ----------

type Part = { geo: THREE.BufferGeometry; color: number; map?: THREE.Texture | null; extra?: Partial<THREE.MeshStandardMaterialParameters> };

function wheel(x: number, y: number, z: number, r = 0.12, w = 0.09): Part[] {
  const tyre = new THREE.CylinderGeometry(r, r, w, 20);
  tyre.rotateX(Math.PI / 2);
  tyre.translate(x, y, z);
  const hub = new THREE.CylinderGeometry(r * 0.5, r * 0.5, w + 0.01, 14);
  hub.rotateX(Math.PI / 2);
  hub.translate(x, y, z);
  return [
    { geo: tyre, color: TYRE, extra: { roughness: 0.9 } },
    { geo: hub, color: GREY, extra: { metalness: 0.5 } },
  ];
}

function enginePart(): Part[] {
  // Двигатель в системе детали: ось вдоль X, воздухозаборник спереди (+X).
  const len = 0.72;
  const nacelle = new THREE.CylinderGeometry(0.15, 0.12, len, 28, 1, true);
  nacelle.rotateZ(Math.PI / 2);
  const lip = new THREE.TorusGeometry(0.148, 0.02, 10, 28);
  lip.rotateY(Math.PI / 2);
  lip.translate(len / 2, 0, 0);
  const fan = new THREE.CircleGeometry(0.135, 28);
  fan.rotateY(Math.PI / 2);
  fan.translate(len / 2 - 0.05, 0, 0);
  const spinner = new THREE.ConeGeometry(0.05, 0.1, 16);
  spinner.rotateZ(-Math.PI / 2);
  spinner.translate(len / 2 - 0.0, 0, 0);
  const nozzle = new THREE.CylinderGeometry(0.1, 0.075, 0.16, 20);
  nozzle.rotateZ(Math.PI / 2);
  nozzle.translate(-len / 2 - 0.06, 0, 0);
  const pylon = sidePlate(
    [
      [0.22, 0.12],
      [-0.3, 0.12],
      [-0.38, ENGINE_DROP + 0.02],
      [0.16, ENGINE_DROP + 0.02],
    ],
    0.05,
  );
  const stripe = new THREE.CylinderGeometry(0.152, 0.152, 0.06, 28, 1, true);
  stripe.rotateZ(Math.PI / 2);
  stripe.translate(0.12, 0, 0);
  return [
    { geo: nacelle, color: WHITE, extra: { side: THREE.DoubleSide } },
    { geo: lip, color: GREY, extra: { metalness: 0.6, roughness: 0.3 } },
    { geo: fan, color: DARK },
    { geo: spinner, color: GREY, extra: { metalness: 0.6 } },
    { geo: nozzle, color: DARK, extra: { metalness: 0.5 } },
    { geo: pylon, color: WHITE },
    { geo: stripe, color: BLUE },
  ];
}

function wingPart(side: "L" | "R"): Part[] {
  const s = side === "R" ? 1 : -1;
  const z0 = WING.rootZ * s;
  const z1 = (WING.rootZ + WING.span) * s;
  // Контур в системе самолёта, крыло потом наклоняем вниз к концу.
  const outline: [number, number][] = [
    [WING.rootLE, z0],
    [WING.tipLE, z1],
    [WING.tipLE - WING.tipChord, z1],
    [WING.rootLE - WING.rootChord, z0],
  ];
  const geo = plate(outline, WING.thick);
  // Опускаем концы: y уменьшается пропорционально размаху.
  const p = geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    p.setY(i, p.getY(i) + wingY(z));
  }
  geo.computeVertexNormals();
  // Синие законцовки и жёлтая полоска по передней кромке.
  const tipOutline: [number, number][] = [
    [WING.tipLE + 0.06, z1 - 0.25 * s],
    [WING.tipLE, z1 + 0.005 * s],
    [WING.tipLE - WING.tipChord, z1 + 0.005 * s],
    [WING.tipLE - WING.tipChord - 0.03, z1 - 0.25 * s],
  ];
  const tip = plate(tipOutline, WING.thick + 0.012);
  tip.translate(0, wingY(z1) + 0.01, 0);
  // Обтекатель-«горб» над фюзеляжем, на который крыло ложится.
  const root = new THREE.BoxGeometry(WING.rootChord * 0.92, 0.12, 0.3);
  root.translate(WING.rootLE - WING.rootChord / 2, WING.y - 0.04, (WING.rootZ - 0.14) * s);
  return [
    { geo, color: WHITE },
    { geo: tip, color: BLUE },
    { geo: root, color: WHITE },
  ];
}

function partsFor(id: PieceId, livery: THREE.Texture | null): Part[] {
  switch (id) {
    case "fuselage": {
      const samples: { x: number; yc: number; ry: number; rz: number }[] = [];
      for (let i = 0; i <= 64; i++) {
        const x = FUSE.back + (i / 64) * FUSE.len;
        samples.push({ x, ...fuseAt(x) });
      }
      // Закрываем нос и хвост крышками.
      const body = loft(samples);
      const tailCap = new THREE.CircleGeometry(1, 20);
      const t = fuseAt(FUSE.back);
      tailCap.scale(t.rz, t.ry, 1);
      tailCap.rotateY(-Math.PI / 2);
      tailCap.translate(FUSE.back, t.yc, 0);
      // Кабина — тёмное стекло сверху носа.
      const glass = new THREE.SphereGeometry(0.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
      glass.scale(1.3, 0.55, 1.15);
      glass.translate(2.88, FUSE.axis + 0.24, 0);
      // Обтекатели шасси по бокам низа.
      const pod = new THREE.CapsuleGeometry(0.16, 1.5, 6, 14);
      pod.rotateZ(Math.PI / 2);
      const podL = pod.clone().translate(-0.2, FUSE.axis - 0.27, -0.3);
      const podR = pod.clone().translate(-0.2, FUSE.axis - 0.27, 0.3);
      const fin = sidePlate(
        [
          [-2.7, 1.45],
          [-3.25, 1.45],
          [-3.25, 1.62],
          [-2.9, 1.62],
        ],
        0.14,
      );
      return [
        { geo: body, color: 0xffffff, map: livery },
        { geo: tailCap, color: GREY },
        { geo: glass, color: 0x1f2b3a, extra: { roughness: 0.15, metalness: 0.4 } },
        { geo: podL, color: 0xd6dbe2 },
        { geo: podR, color: 0xd6dbe2 },
        { geo: fin, color: WHITE },
      ];
    }
    case "wingL":
      return wingPart("L");
    case "wingR":
      return wingPart("R");
    case "stab": {
      const y = 1.66;
      const outline: [number, number][] = [
        [-2.62, 0.0],
        [-2.78, 1.5],
        [-3.2, 1.5],
        [-3.3, 0.0],
        [-3.2, -1.5],
        [-2.78, -1.5],
      ];
      const geo = plate(outline, 0.07);
      geo.translate(0, y, 0);
      return [{ geo, color: WHITE }];
    }
    case "finL":
    case "finR": {
      const s = id === "finR" ? 1 : -1;
      const geo = sidePlate(
        [
          [-2.74, 0],
          [-3.04, 0.82],
          [-3.38, 0.82],
          [-3.3, -0.18],
          [-2.78, -0.18],
        ],
        0.07,
      );
      geo.translate(0, 1.66, 1.5 * s);
      const band = sidePlate(
        [
          [-2.97, 0.62],
          [-3.04, 0.82],
          [-3.38, 0.82],
          [-3.36, 0.62],
        ],
        0.085,
      );
      band.translate(0, 1.66, 1.5 * s);
      const band2 = sidePlate(
        [
          [-2.92, 0.5],
          [-2.97, 0.62],
          [-3.36, 0.62],
          [-3.35, 0.5],
        ],
        0.085,
      );
      band2.translate(0, 1.66, 1.5 * s);
      return [
        { geo, color: WHITE },
        { geo: band, color: BLUE },
        { geo: band2, color: YELLOW },
      ];
    }
    case "eng1":
    case "eng2":
    case "eng3":
    case "eng4":
    case "eng5":
    case "eng6":
      return enginePart();
    case "noseGear": {
      const x = 2.5;
      const top = FUSE.axis - FUSE.r + 0.08;
      const strut = new THREE.CylinderGeometry(0.035, 0.035, top - 0.12, 10);
      strut.translate(x, (top + 0.12) / 2, 0);
      return [
        { geo: strut, color: GREY, extra: { metalness: 0.6 } },
        ...wheel(x + 0.06, 0.12, 0.09),
        ...wheel(x + 0.06, 0.12, -0.09),
        ...wheel(x - 0.18, 0.12, 0.09),
        ...wheel(x - 0.18, 0.12, -0.09),
      ];
    }
    case "bogie1":
    case "bogie2": {
      // Тележка в системе детали: центр — под гнездом, колёса вдоль X.
      const top = FUSE.axis - 0.38;
      const beam = new THREE.BoxGeometry(1.25, 0.06, 0.06);
      beam.translate(0, 0.17, 0);
      const parts: Part[] = [{ geo: beam, color: GREY, extra: { metalness: 0.5 } }];
      for (const x of [-0.45, -0.15, 0.15, 0.45]) {
        const leg = new THREE.CylinderGeometry(0.025, 0.025, top - 0.17, 8);
        leg.translate(x, (top + 0.17) / 2, 0);
        parts.push({ geo: leg, color: GREY, extra: { metalness: 0.6 } });
        parts.push(...wheel(x, 0.12, 0.07, 0.12, 0.08), ...wheel(x, 0.12, -0.07, 0.12, 0.08));
      }
      return parts;
    }
    case "buran": {
      // «Буран» на пилонах над центропланом, нос вперёд.
      const y = FUSE.axis + FUSE.r + 0.42;
      const samples: { x: number; yc: number; ry: number; rz: number }[] = [];
      for (let i = 0; i <= 30; i++) {
        const x = -1.25 + (i / 30) * 2.6;
        const k = (x + 1.25) / 2.6;
        const nose = k > 0.82 ? Math.sqrt(Math.max(0, 1 - ((k - 0.82) / 0.18) ** 2)) : 1;
        samples.push({ x, yc: y + (k > 0.82 ? -0.05 * (k - 0.82) / 0.18 : 0), ry: 0.19 * (0.15 + 0.85 * nose), rz: 0.2 * (0.12 + 0.88 * nose) });
      }
      const body = loft(samples, 28);
      const wing = plate(
        [
          [0.55, 0.18],
          [-0.95, 0.85],
          [-1.22, 0.85],
          [-1.22, -0.85],
          [-0.95, -0.85],
          [0.55, -0.18],
        ],
        0.05,
      );
      wing.translate(0, y - 0.13, 0);
      const fin = sidePlate(
        [
          [-0.85, 0],
          [-1.12, 0.52],
          [-1.3, 0.52],
          [-1.25, 0],
        ],
        0.045,
      );
      fin.translate(0, y + 0.14, 0);
      const belly = new THREE.BoxGeometry(2.2, 0.03, 0.34);
      belly.translate(-0.15, y - 0.16, 0);
      const noseCap = new THREE.SphereGeometry(0.07, 14, 10);
      noseCap.scale(1.4, 1, 1);
      noseCap.translate(1.33, y - 0.05, 0);
      const engines = new THREE.CylinderGeometry(0.11, 0.13, 0.12, 16);
      engines.rotateZ(Math.PI / 2);
      engines.translate(-1.3, y, 0);
      const parts: Part[] = [
        { geo: body, color: 0xfafafa },
        { geo: wing, color: 0xfafafa },
        { geo: fin, color: 0xfafafa },
        { geo: belly, color: 0x1b1d22 },
        { geo: noseCap, color: 0x1b1d22 },
        { geo: engines, color: DARK },
      ];
      for (const x of [0.45, -0.75]) {
        const pylon = new THREE.BoxGeometry(0.14, 0.32, 0.12);
        pylon.translate(x, FUSE.axis + FUSE.r + 0.12, 0);
        parts.push({ geo: pylon, color: GREY });
      }
      return parts;
    }
  }
}

export type PieceMesh = {
  id: PieceId;
  /** Центр детали в собранном самолёте (система самолёта). */
  center: THREE.Vector3;
  /** Геометрия, сдвинутая так, что центр детали — в начале координат. */
  build: (material?: THREE.Material) => THREE.Group;
};

/** Гнёзда двигателей и тележек: деталь одна, а мест несколько. */
export function slotTransform(slot: SlotId): THREE.Vector3 | null {
  const m = /^eng([LR])([123])$/.exec(slot);
  if (m) return engineSlotPos(m[1] as "L" | "R", Number(m[2]) as 1 | 2 | 3);
  if (slot === "gearL") return new THREE.Vector3(-0.2, 0, -0.3);
  if (slot === "gearR") return new THREE.Vector3(-0.2, 0, 0.3);
  return null;
}

let sharedLivery: THREE.Texture | null | undefined;

export function pieceMesh(id: PieceId): PieceMesh {
  if (sharedLivery === undefined) sharedLivery = liveryTexture();
  const parts = partsFor(id, sharedLivery);
  const engine = id.startsWith("eng");
  const bogie = id.startsWith("bogie");
  const box = new THREE.Box3();
  for (const p of parts) {
    p.geo.computeBoundingBox();
    box.union(p.geo.boundingBox!);
  }
  // Двигатель и тележка построены в своей системе; их центр — начало координат
  // для двигателя и середина по высоте для тележки.
  const center = engine || bogie ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  if (bogie) center.set(0, 0, 0);
  const build = (material?: THREE.Material) => {
    const g = new THREE.Group();
    for (const p of parts) {
      const geo = p.geo.clone();
      geo.translate(-center.x, -center.y, -center.z);
      const mesh = new THREE.Mesh(
        geo,
        material ?? mat(p.color, { ...(p.map ? { map: p.map } : {}), ...(p.extra ?? {}) }),
      );
      mesh.castShadow = !material;
      mesh.receiveShadow = !material;
      g.add(mesh);
    }
    return g;
  };
  return { id, center, build };
}

/** Где центр детали, если её поставить в это гнездо. */
export function slotCenter(slot: SlotId, mesh: PieceMesh): THREE.Vector3 {
  return slotTransform(slot) ?? mesh.center.clone();
}

/** Стапель: две жёлтые опоры под фюзеляж, пока нет шасси. */
export function buildCradle(): THREE.Group {
  const g = new THREE.Group();
  const yellow = mat(YELLOW, { roughness: 0.6 });
  const dark = mat(0x3b4350, { roughness: 0.7 });
  for (const x of [1.55, -2.1]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.9), dark);
    base.position.set(x, 0.04, 0);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, FUSE.axis - FUSE.r - 0.08, 0.16), yellow);
    post.position.set(x, (FUSE.axis - FUSE.r) / 2, 0);
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.5), yellow);
    saddle.position.set(x, FUSE.axis - FUSE.r - 0.02, 0);
    for (const m of [base, post, saddle]) {
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
  }
  return g;
}

/** Огни реактивных струй для взлёта: по одной на каждый двигатель. */
export function buildExhaust(): THREE.Group {
  const g = new THREE.Group();
  const flame = new THREE.MeshBasicMaterial({ color: 0xffb35c, transparent: true, opacity: 0.55, depthWrite: false });
  for (const side of ["L", "R"] as const) {
    for (const n of [1, 2, 3] as const) {
      const p = engineSlotPos(side, n);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.4, 14, 1, true), flame);
      cone.rotation.z = Math.PI / 2;
      cone.position.set(p.x - 0.36 - 0.14 - 0.2, p.y, p.z);
      g.add(cone);
    }
  }
  return g;
}
