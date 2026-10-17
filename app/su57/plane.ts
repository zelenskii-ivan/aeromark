import * as THREE from "three";
import type { PieceId } from "@/lib/su57/puzzle";

/**
 * Игрушечный Су-57 из восьми деталей. Координаты — в метрах в системе
 * самолёта: нос смотрит в +X, верх — +Y, правое крыло — в +Z. Длина около
 * 2,6 м: Марку (1,22 м) по силам донести и поставить каждую деталь.
 *
 * Узнаваемое у Су-57 — плоский широкий корпус с наплывами у кабины, два
 * разнесённых двигателя, цельноповоротные кили, разваленные наружу, и
 * трапециевидное крыло. Этого и держимся.
 */

const CAMO = 0x8d9db1;
const CAMO_DARK = 0x67788d;
const RADOME = 0x5d6878;
const NOZZLE = 0x3a3f48;

export type PieceMesh = {
  id: PieceId;
  /** Плотная сетка из модели: контур-рёбра для неё не строим. */
  dense?: boolean;
  /** Центр детали в собранном самолёте (система самолёта). */
  center: THREE.Vector3;
  /** Геометрия, сдвинутая так, что центр детали — в начале координат. */
  build: (material?: THREE.Material) => THREE.Group;
};

function mat(color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15, ...extra });
}

/** Плоская деталь по контуру сверху: точки (x, z), толщина по Y. */
function plate(points: [number, number][], thickness: number, y: number, bevel = 0.012) {
  const shape = new THREE.Shape();
  points.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
  });
  // Контур лежал в XY, выдавливание шло по Z — кладём его горизонтально.
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y - thickness / 2, 0);
  return geo;
}

function mirror(points: [number, number][]): [number, number][] {
  return points.map(([x, z]) => [x, -z]).reverse() as [number, number][];
}

function star(size: number): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? size * 0.42 : size;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i) shape.lineTo(x, y);
    else shape.moveTo(x, y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

type Part = { geo: THREE.BufferGeometry; color: number; extra?: Partial<THREE.MeshStandardMaterialParameters> };

function partsFor(id: PieceId): Part[] {
  switch (id) {
    case "body": {
      const half: [number, number][] = [
        [0.78, 0.15], [0.55, 0.22], [0.3, 0.36], [0.05, 0.42], [-0.45, 0.42], [-0.7, 0.32], [-0.74, 0.12],
      ];
      const outline = [...half, ...mirror(half)];
      const spine = new THREE.CapsuleGeometry(0.11, 0.9, 6, 12);
      spine.rotateZ(Math.PI / 2);
      spine.scale(1, 0.7, 1);
      spine.translate(0.1, 0.43, 0);
      return [
        { geo: plate(outline, 0.08, 0.38), color: CAMO },
        { geo: spine, color: CAMO_DARK },
      ];
    }
    case "nose": {
      const cone = new THREE.ConeGeometry(0.15, 0.6, 24);
      cone.rotateZ(-Math.PI / 2);
      cone.scale(1, 0.72, 1.05);
      cone.translate(1.07, 0.4, 0);
      const tip = new THREE.SphereGeometry(0.03, 12, 8);
      tip.translate(1.37, 0.4, 0);
      return [
        { geo: cone, color: RADOME },
        { geo: tip, color: NOZZLE },
      ];
    }
    case "cockpit": {
      const glass = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
      glass.scale(0.3, 0.1, 0.1);
      glass.translate(0.6, 0.45, 0);
      const frame = new THREE.TorusGeometry(0.1, 0.012, 6, 20, Math.PI);
      frame.rotateY(Math.PI / 2);
      frame.translate(0.48, 0.45, 0);
      return [
        { geo: glass, color: 0xffc35a, extra: { metalness: 0.6, roughness: 0.12, transparent: true, opacity: 0.88 } },
        { geo: frame, color: CAMO_DARK },
      ];
    }
    case "wingR":
    case "wingL": {
      const sign = id === "wingR" ? 1 : -1;
      const base: [number, number][] = [[0.28, 0.38], [-0.18, 1.12], [-0.46, 1.12], [-0.6, 0.38]];
      const pts = base.map(([x, z]): [number, number] => [x, z * sign]);
      const geo = plate(sign > 0 ? pts : [...pts].reverse(), 0.03, 0.37, 0.008);
      const flap = plate(
        ([[-0.36, 0.55], [-0.44, 1.02], [-0.48, 1.02], [-0.6, 0.55]] as [number, number][]).map(
          ([x, z]) => [x, z * sign],
        ) as [number, number][],
        0.02,
        0.395,
        0.004,
      );
      return [
        { geo, color: CAMO },
        { geo: flap, color: CAMO_DARK },
      ];
    }
    case "tail": {
      const parts: Part[] = [];
      for (const z of [-0.16, 0.16]) {
        const engine = new THREE.CylinderGeometry(0.085, 0.095, 0.62, 20);
        engine.rotateZ(Math.PI / 2);
        engine.translate(-0.68, 0.34, z);
        const nozzle = new THREE.CylinderGeometry(0.09, 0.075, 0.1, 20, 1, true);
        nozzle.rotateZ(Math.PI / 2);
        nozzle.translate(-1.03, 0.34, z);
        parts.push({ geo: engine, color: CAMO_DARK }, { geo: nozzle, color: NOZZLE, extra: { side: THREE.DoubleSide, metalness: 0.6 } });
      }
      for (const sign of [1, -1]) {
        const pts = ([[-0.72, 0.26], [-0.98, 0.66], [-1.12, 0.66], [-1.06, 0.26]] as [number, number][]).map(
          ([x, z]) => [x, z * sign],
        ) as [number, number][];
        parts.push({ geo: plate(sign > 0 ? pts : [...pts].reverse(), 0.022, 0.33, 0.006), color: CAMO });
      }
      return parts;
    }
    case "finR":
    case "finL": {
      const sign = id === "finR" ? 1 : -1;
      const shape = new THREE.Shape();
      shape.moveTo(-0.46, 0);
      shape.lineTo(-0.74, 0.4);
      shape.lineTo(-0.9, 0.4);
      shape.lineTo(-0.84, 0);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.022, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2,
      });
      geo.translate(0, 0, -0.011);
      // Кили Су-57 разведены наружу примерно на 25°.
      geo.rotateX(-sign * THREE.MathUtils.degToRad(25));
      geo.translate(0, 0.42, 0.24 * sign);
      const decal = star(0.055);
      decal.translate(-0.72, 0.2, 0.02);
      decal.rotateX(-sign * THREE.MathUtils.degToRad(25));
      decal.translate(0, 0.42, 0.24 * sign);
      return [
        { geo, color: CAMO },
        { geo: decal, color: 0xd9262c, extra: { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 } },
      ];
    }
  }
}

function centerOf(parts: Part[]): THREE.Vector3 {
  const box = new THREE.Box3();
  for (const part of parts) {
    part.geo.computeBoundingBox();
    box.union(part.geo.boundingBox!);
  }
  return box.getCenter(new THREE.Vector3());
}

export function pieceMesh(id: PieceId): PieceMesh {
  const parts = partsFor(id);
  const center = centerOf(parts);
  for (const part of parts) part.geo.translate(-center.x, -center.y, -center.z);
  return {
    id,
    center,
    build: (override) => {
      const group = new THREE.Group();
      for (const part of parts) {
        const mesh = new THREE.Mesh(part.geo, override ?? mat(part.color, part.extra));
        mesh.castShadow = !override;
        mesh.receiveShadow = !override;
        group.add(mesh);
      }
      return group;
    },
  };
}

/**
 * Детали из настоящей модели Су-57 (public/models/su57.glb): каждая деталь —
 * отдельный объект с именем, равным id детали, в собранном положении.
 */
export function piecesFromModel(root: THREE.Object3D): Map<PieceId, PieceMesh> | null {
  const out = new Map<PieceId, PieceMesh>();
  root.updateMatrixWorld(true);
  const ids: PieceId[] = ["body", "nose", "cockpit", "wingL", "wingR", "tail", "finL", "finR"];
  for (const id of ids) {
    const node = root.getObjectByName(id);
    let mesh: THREE.Mesh | null = null;
    node?.traverse((o) => {
      if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
    });
    if (!mesh) return null;
    const source = mesh as THREE.Mesh;
    const geo = source.geometry.clone();
    geo.applyMatrix4(source.matrixWorld);
    geo.computeBoundingBox();
    const center = geo.boundingBox!.getCenter(new THREE.Vector3());
    geo.translate(-center.x, -center.y, -center.z);
    const material = source.material as THREE.MeshStandardMaterial;
    out.set(id, {
      id,
      dense: true,
      center,
      build: (override) => {
        const group = new THREE.Group();
        const m = new THREE.Mesh(geo, override ?? material.clone());
        m.castShadow = !override;
        m.receiveShadow = !override;
        group.add(m);
        return group;
      },
    });
  }
  return out;
}

/** Подставка под самолёт: три низкие стойки и плита. */
export function buildStand(): THREE.Group {
  const group = new THREE.Group();
  const metal = mat(0x4b5566, { metalness: 0.4 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.5), metal);
  top.position.y = 0.3;
  group.add(top);
  for (const [x, z] of [[-0.55, -0.15], [-0.55, 0.15], [0.55, 0]] as const) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.3, 12), metal);
    leg.position.set(x, 0.15, z);
    group.add(leg);
  }
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return group;
}

/** Пламя форсажа для финального взлёта. */
export function buildAfterburners(y = 0.34, x = -1.27): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: 0xff9d3b, transparent: true, opacity: 0.85 });
  for (const z of [-0.16, 0.16]) {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.42, 16), material);
    flame.rotation.z = Math.PI / 2;
    flame.position.set(x, y, z);
    group.add(flame);
  }
  return group;
}
