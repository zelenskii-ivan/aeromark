"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ArrowDownToLine, ChevronLeft, LogOut, RotateCcw, Star, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { playMiss, playWin } from "@/lib/celebrate";
import { cancelSpeech, primeVoices, speakText } from "@/lib/speech";
import {
  COUNT_WORDS,
  PIECE_COUNT,
  PIECES,
  SLOTS,
  available,
  canTake,
  enginesOn,
  isComplete,
  isFilled,
  isPlaced,
  markAsked,
  openSlotsFor,
  pieceInfo,
  place,
  placedCount,
  questionDue,
  refusal,
  slotInfo,
  slotOpen,
  slotsForPiece,
  startPuzzle,
  type PieceId,
  type PuzzleState,
  type Question,
  type Refusal,
  type SlotId,
} from "@/lib/an225/puzzle";
import {
  MOTION,
  arrived,
  findPath,
  gaitTimeScale,
  makeWalker,
  stepWalker,
  type Box,
  type Gait,
  type Obstacle,
  type Walker,
} from "@/lib/an225/motion";
import { FUSE, buildCradle, buildExhaust, pieceMesh, slotCenter, type PieceMesh } from "./plane";
import "./an225.css";

type Props = {
  onExit: () => void;
  /** Самолёт собран и улетел: здесь страница начисляет награду. */
  onWin: () => void;
  /** Награда за первую победу ещё не получена. */
  rewardAvailable: boolean;
};

/** Каждый новый раунд — новая сцена: так проще и надёжнее, чем откатывать её. */
export default function MriyaGame(props: Props) {
  const [round, setRound] = useState(0);
  return <MriyaRound key={round} {...props} autoStart={round > 0} onRestart={() => setRound((r) => r + 1)} />;
}

type RoundProps = Props & { autoStart: boolean; onRestart: () => void };
type Phase = "intro" | "loading" | "play" | "done";

const MARK_URL = "/models/mark.glb";
const DAD_URL = "/models/dad.glb";

/** Пол ангара, по которому может ходить Марк. */
const BOUNDS: Box = { minX: -8.6, maxX: 8.6, minZ: -6.9, maxZ: 6.3 };
const RACK_Z = 5.25;
const RACK_SPACING = 0.95;
const MARK_HOME = new THREE.Vector3(6.1, 0, 4.0);
const DAD_HOME = new THREE.Vector3(-6.5, 0, 3.7);
const CONSOLE = new THREE.Vector3(-7.4, 0, 4.7);
/** Красный пульт крана для Марка и где Марк за ним стоит. */
const BUTTON = new THREE.Vector3(-5.4, 0, 5.0);
const CONSOLE_SPOT = new THREE.Vector3(-5.3, 0, 4.38);
const CRANE_TOP = 5.6;
/** Насколько камера ближе общего плана: Марк крупнее, а стеллаж и самолёт всё равно видно. */
const CAM_ZOOM = 0.62;
const HOOK_HIGH = 4.6;
/** Где кран стоит в начале и куда уезжает перед взлётом: у пульта, сбоку от самолёта. */
const CRANE_HOME = new THREE.Vector3(-5.2, 0, 2.6);
/** Докуда ездит крюк. */
const CRANE_BOUNDS: Box = { minX: -8.3, maxX: 8.3, minZ: -6.6, maxZ: 5.6 };
/** Скорость крана, м/с: медленнее Марка, чтобы ребёнок успевал прицелиться. */
const CRANE_SPEED = 2.2;
/** Насколько точно надо навести крюк: на деталь — и на место на самолёте. */
const GRAB_RADIUS = 1.0;
const DROP_RADIUS = 0.9;

const GHOST_COLOR = 0x3d8bff;
const GHOST_OPACITY = 0.3;

/** Где лежат тяжёлые детали до того, как их поднимет кран. */
const YARD: Partial<Record<PieceId, { pos: THREE.Vector3; yaw: number }>> = {
  fuselage: { pos: new THREE.Vector3(0, 0, -5.5), yaw: 0 },
  wingL: { pos: new THREE.Vector3(-6.4, 0, -4.4), yaw: Math.PI / 2 },
  wingR: { pos: new THREE.Vector3(6.4, 0, -4.4), yaw: -Math.PI / 2 },
  stab: { pos: new THREE.Vector3(-7.3, 0, -0.6), yaw: 0 },
  finL: { pos: new THREE.Vector3(-6.2, 0, 1.6), yaw: 0 },
  finR: { pos: new THREE.Vector3(-7.4, 0, 1.6), yaw: 0 },
  buran: { pos: new THREE.Vector3(6.9, 0, -0.5), yaw: Math.PI / 2 },
};

const PRAISE = ["Отлично!", "Здорово получилось!", "Точно на место!", "Молодец, механик!", "Ровно встал!"];

type Piece = {
  id: PieceId;
  mesh: PieceMesh;
  pivot: THREE.Group;
  home: THREE.Vector3;
  homeYaw: number;
  homeScale: number;
  carryScale: number;
  /** Половина высоты при масштабе 1 — на сколько ниже крюка висит центр. */
  halfH: number;
  meshes: THREE.Mesh[];
  /** Пятно на полу, пока деталь лежит (для обхода). */
  footprint: Box | null;
  /** Куда встать Марку, чтобы взять деталь со стеллажа. */
  approach: THREE.Vector3 | null;
};

type Slot = {
  id: SlotId;
  pos: THREE.Vector3;
  ghost: THREE.Group;
  /** Куда встать Марку и куда смотреть, чтобы поставить деталь. */
  approach: THREE.Vector3 | null;
  face: number;
};

type Tween = { t: number; dur: number; step: (k: number) => void; done: () => void };

type Character = {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer | null;
  actions: Record<string, THREE.AnimationAction>;
  current: THREE.AnimationAction | null;
  prop: THREE.Object3D | null;
};

/** Сколько примерно звучит фраза синтезатором — чтобы реплики не перебивали друг друга. */
const speechTime = (text: string) => 0.8 + text.length * 0.066;
const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const pick = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)]!;

const ACTION_FOR: Record<Gait, string> = {
  idle: "Idle",
  walk: "Walk",
  run: "Run",
  carry: "CarryWalk",
  carryIdle: "CarryIdle",
};

function MriyaRound({ onExit, onWin, rewardAvailable: rewardProp, autoStart, onRestart }: RoundProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  // Запоминаем на старте раунда: после победы страница уже записала награду,
  // и проп становится false — а карточка должна показать «+3 звезды».
  const [rewardAvailable] = useState(rewardProp);
  const [phase, setPhase] = useState<Phase>("intro");
  const [placed, setPlaced] = useState(0);
  const [control, setControl] = useState<"run" | "crane">("run");
  const [craneUi, setCraneUi] = useState<{ label: string; ready: boolean; busy: boolean } | null>(null);
  const [message, setMessage] = useState("");
  const [holding, setHolding] = useState<string | null>(null);
  const [question, setQuestion] = useState<{ text: string; options: number[]; locked: boolean } | null>(null);
  const [counter, setCounter] = useState<{ left: number; right: number } | null>(null);
  const lastSpoken = useRef("");
  const startRef = useRef<() => void>(() => {});
  const answerRef = useRef<(n: number) => void>(() => {});
  const craneActionRef = useRef<() => void>(() => {});
  const exitCraneRef = useRef<() => void>(() => {});
  /** Джойстик: x — вправо по экрану, y — вверх по экрану, длина 0..1. */
  const stickRef = useRef({ x: 0, y: 0 });

  const say = useCallback((text: string, speak = true) => {
    setMessage(text);
    lastSpoken.current = text;
    if (speak) speakText(text);
  }, []);

  useEffect(() => primeVoices(), []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ---------- сцена ----------
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xcfe6ff);
    scene.fog = new THREE.Fog(0xcfe6ff, 24, 48);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);

    scene.add(new THREE.HemisphereLight(0xfff4e2, 0x5a5040, 1.2));
    const key = new THREE.DirectionalLight(0xffe7c4, 2.3);
    key.position.set(5, 11, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -10, right: 10, top: 9, bottom: -9, near: 1, far: 35 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.03;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xbfd6ff, 0.55);
    fill.position.set(-6, 4, 4);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xd6ecff, 1.0);
    rim.position.set(0, 5, -9);
    scene.add(rim);

    buildHangar(scene);
    scene.add(buildCradle());

    // ---------- твины ----------
    const tweens: Tween[] = [];
    const tween = (dur: number, step: (k: number) => void) =>
      new Promise<void>((resolve) => {
        if (dur <= 0) {
          step(1);
          resolve();
          return;
        }
        tweens.push({ t: 0, dur, step, done: resolve });
      });
    const wait = (sec: number) => tween(sec, () => {});

    // ---------- детали, стеллаж и площадка для тяжёлых деталей ----------
    const pieces = new Map<PieceId, Piece>();
    const slots = new Map<SlotId, Slot>();
    const meshFor = new Map<PieceId, PieceMesh>();
    for (const p of PIECES) meshFor.set(p.id, pieceMesh(p.id));

    const ghostMaterial = () =>
      new THREE.MeshBasicMaterial({ color: GHOST_COLOR, transparent: true, opacity: GHOST_OPACITY, depthWrite: false });

    const rackOrder = shuffle(PIECES.filter((p) => p.carrier === "hands").map((p) => p.id));
    const rackX = (i: number) => (i - (rackOrder.length - 1) / 2) * RACK_SPACING;
    const palletMat = new THREE.MeshStandardMaterial({ color: 0xc89a5c, roughness: 0.85 });
    const standMat = new THREE.MeshStandardMaterial({ color: 0x3b4350, roughness: 0.75 });

    for (const info of PIECES) {
      const mesh = meshFor.get(info.id)!;
      const pivot = mesh.build();
      const meshes: THREE.Mesh[] = [];
      pivot.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          meshes.push(o as THREE.Mesh);
          o.userData.piece = info.id;
          // У каждой детали свой материал: подсветка одной не зажигает другие.
          const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
          (o as THREE.Mesh).material = m.clone();
        }
      });
      const box = new THREE.Box3().setFromObject(pivot);
      const size = box.getSize(new THREE.Vector3());
      const longest = Math.max(size.x, size.z, 0.01);
      let home: THREE.Vector3;
      let homeYaw = 0;
      let homeScale = 1;
      let footprint: Box | null = null;
      let approach: THREE.Vector3 | null = null;
      const rackIndex = rackOrder.indexOf(info.id);
      if (rackIndex >= 0) {
        // Стеллаж: детали лежат поперёк, чтобы уместились в ряд.
        homeScale = Math.min(0.9, 0.8 / longest);
        homeYaw = Math.PI / 2;
        const x = rackX(rackIndex);
        home = new THREE.Vector3(x, 0.14 - box.min.y * homeScale, RACK_Z);
        approach = new THREE.Vector3(x, 0, RACK_Z - 0.35 - MOTION.radius - 0.22);
        const pallet = new THREE.Mesh(new THREE.BoxGeometry(RACK_SPACING - 0.1, 0.14, 0.7), palletMat);
        pallet.position.set(x, 0.07, RACK_Z);
        pallet.castShadow = true;
        pallet.receiveShadow = true;
        scene.add(pallet);
      } else {
        const yard = YARD[info.id]!;
        homeYaw = yard.yaw;
        home = new THREE.Vector3(yard.pos.x, 0.18 - box.min.y, yard.pos.z);
        // Пятно на полу с учётом поворота.
        const turned = Math.abs(Math.sin(homeYaw)) > 0.5;
        const hx = (turned ? size.z : size.x) / 2;
        const hz = (turned ? size.x : size.z) / 2;
        footprint = { minX: home.x - hx, maxX: home.x + hx, minZ: home.z - hz, maxZ: home.z + hz };
        const stand = new THREE.Mesh(new THREE.BoxGeometry(hx * 1.6, 0.18, hz * 1.6), standMat);
        stand.position.set(home.x, 0.09, home.z);
        stand.receiveShadow = true;
        stand.castShadow = true;
        stand.userData.stand = info.id;
        scene.add(stand);
      }
      pivot.position.copy(home);
      pivot.rotation.y = homeYaw;
      pivot.scale.setScalar(homeScale);
      scene.add(pivot);
      pieces.set(info.id, {
        id: info.id,
        mesh,
        pivot,
        home,
        homeYaw,
        homeScale,
        carryScale: Math.min(0.85, 0.58 / longest),
        halfH: size.y / 2,
        meshes,
        footprint,
        approach,
      });
    }

    // Гнёзда: призрак детали на месте и где встать Марку.
    const anyOf = (kind: string) => PIECES.find((p) => p.kind === kind)!.id;
    for (const info of SLOTS) {
      const sample = info.kind === "wing" || info.kind === "fin" ? (info.id as PieceId) : anyOf(info.kind);
      const mesh = meshFor.get(info.kind === "fuselage" || info.kind === "stab" || info.kind === "buran" ? (info.id as PieceId) : sample)!;
      const pos = slotCenter(info.id, mesh);
      const ghost = mesh.build(ghostMaterial());
      ghost.position.copy(pos);
      ghost.visible = false;
      ghost.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.userData.slot = info.id;
      });
      scene.add(ghost);
      let approach: THREE.Vector3 | null = null;
      let face = 0;
      if (info.kind === "engine") {
        // Встаём перед воздухозаборником, лицом к двигателю.
        approach = new THREE.Vector3(pos.x + 0.74, 0, pos.z);
        face = -Math.PI / 2;
      } else if (info.kind === "noseGear") {
        approach = new THREE.Vector3(pos.x, 0, 0.95);
        face = Math.PI;
      } else if (info.kind === "bogie") {
        const s = info.side === "R" ? 1 : -1;
        // Чуть позади гнезда: впереди, над головой, висят двигатели.
        approach = new THREE.Vector3(pos.x - 0.3, 0, 1.0 * s);
        face = s > 0 ? Math.PI : 0;
      }
      slots.set(info.id, { id: info.id, pos, ghost, approach, face });
    }

    // ---------- кран ----------
    const crane = buildCrane(scene);
    const craneState = { x: CRANE_HOME.x, z: CRANE_HOME.z, hook: HOOK_HIGH, vx: 0, vz: 0 };
    let craneLoad: Piece | null = null;
    /** Марк стоит у пульта: джойстик и нажатия двигают крюк, а не Марка. */
    let craneMode = false;
    /** Крюк опускается или поднимается — двигать кран нельзя. */
    let hookBusy = false;
    /** Куда кран едет сам после нажатия на пол, деталь или место на самолёте. */
    let hookGoal: { x: number; z: number; then: "grab" | "drop" | null } | null = null;
    /** Сколько кран стоит без дела с деталью — для подсказок Папы. */
    let craneIdle = 0;
    /** Подсказку «ты над местом» говорим один раз за перенос. */
    let overSaid = false;

    const hookTo = (y: number) => {
      const h = craneState.hook;
      return tween(0.25 + Math.abs(y - h) / 2.6, (k) => {
        craneState.hook = h + (y - h) * ease(k);
      });
    };
    const craneSlide = (x: number, z: number) => {
      const fx = craneState.x;
      const fz = craneState.z;
      const d = Math.hypot(x - fx, z - fz);
      if (d < 0.01) return Promise.resolve();
      return tween(0.15 + d / 3, (k) => {
        craneState.x = fx + (x - fx) * ease(k);
        craneState.z = fz + (z - fz) * ease(k);
      });
    };
    // Жёлтое пятно на полу точно под крюком: ребёнку видно, куда опустится груз.
    const hookSpot = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.34, 32),
      new THREE.MeshBasicMaterial({ color: 0xf2b430, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    hookSpot.rotation.x = -Math.PI / 2;
    hookSpot.visible = false;
    scene.add(hookSpot);
    /** Джойстиком уже подвели к пульту и получили отказ — не повторяем, пока не отойдёт. */
    let consoleRefused = false;
    /**
     * Крюк с грузом идёт так, чтобы низ детали был чуть выше самолёта
     * (кили до 2,5 м). Выше не надо: с наклонной камеры высоко висящая
     * деталь кажется сдвинутой от места, и прицелиться трудно.
     */
    const carryHook = (piece: Piece) => Math.min(HOOK_HIGH, 2.75 + 2 * piece.halfH + 0.14);
    // Отвесная линия от груза (или крюка) до пола — куда опустится деталь.
    const dropLine = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.014, 1, 6),
      new THREE.MeshBasicMaterial({ color: 0xf2b430, transparent: true, opacity: 0.7, depthWrite: false }),
    );
    dropLine.visible = false;
    scene.add(dropLine);
    /** Насколько ниже крюка висит центр детали. */
    const hangOf = (piece: Piece) => piece.halfH * piece.pivot.scale.x + 0.14;

    // ---------- препятствия для Марка ----------
    let obstacles: Obstacle[] = [];
    const rebuildObstacles = () => {
      const list: Obstacle[] = [
        // Фюзеляж на стапеле — с самого начала: стапель стоит там же.
        { minX: FUSE.back - 0.05, maxX: FUSE.front + 0.05, minZ: -0.45, maxZ: 0.45 },
        // Стеллаж.
        { minX: rackX(0) - 0.5, maxX: rackX(rackOrder.length - 1) + 0.5, minZ: RACK_Z - 0.35, maxZ: RACK_Z + 0.35 },
        // Пульт Папы и пульт крана для Марка.
        { minX: CONSOLE.x - 0.4, maxX: CONSOLE.x + 0.4, minZ: CONSOLE.z - 0.35, maxZ: CONSOLE.z + 0.35 },
        { x: BUTTON.x, z: BUTTON.z, r: 0.22 },
        { x: dadPos.x, z: dadPos.z, r: 0.3 },
      ];
      for (const piece of pieces.values()) if (piece.footprint) list.push(piece.footprint);
      for (const slot of slots.values()) {
        if (!isFilled(state, slot.id)) continue;
        const kind = slotInfo(slot.id).kind;
        if (kind === "engine") {
          list.push({ minX: slot.pos.x - 0.44, maxX: slot.pos.x + 0.4, minZ: slot.pos.z - 0.17, maxZ: slot.pos.z + 0.17 });
        }
        if (kind === "wing") {
          // Концы крыла опущены почти до макушки Марка — их обходим.
          const s = slotInfo(slot.id).side === "R" ? 1 : -1;
          list.push({ minX: -1.0, maxX: 0.0, minZ: s > 0 ? 2.75 : -3.6, maxZ: s > 0 ? 3.6 : -2.75 });
        }
      }
      obstacles = list;
    };

    // ---------- персонажи ----------
    const loader = new GLTFLoader();
    const loadCharacter = (url: string, fallbackColor: number) =>
      new Promise<Character>((resolve) => {
        const fallback = (): Character => {
          // Модель не загрузилась — простая фигурка, игра всё равно идёт.
          const root = new THREE.Group();
          const body = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.2, 0.7, 6, 12),
            new THREE.MeshStandardMaterial({ color: fallbackColor }),
          );
          body.position.y = 0.6;
          body.castShadow = true;
          root.add(body);
          const prop = new THREE.Object3D();
          prop.position.set(0, 0.6, 0.3);
          root.add(prop);
          scene.add(root);
          return { root, mixer: null, actions: {}, current: null, prop };
        };
        const timer = window.setTimeout(() => resolve(fallback()), 15000);
        loader.load(
          url,
          (gltf) => {
            window.clearTimeout(timer);
            const root = gltf.scene;
            let prop: THREE.Object3D | null = null;
            root.traverse((o) => {
              if ((o as THREE.Mesh).isMesh) {
                o.castShadow = true;
                o.receiveShadow = true;
                o.frustumCulled = false;
              }
              if (o.name === "prop") prop = o;
            });
            scene.add(root);
            const mixer = new THREE.AnimationMixer(root);
            const actions: Record<string, THREE.AnimationAction> = {};
            for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
            resolve({ root, mixer, actions, current: null, prop });
          },
          undefined,
          () => {
            window.clearTimeout(timer);
            resolve(fallback());
          },
        );
      });
    const playOn = (c: Character | null, name: string, once = false, fade = 0.22) => {
      if (!c) return 0;
      const action = c.actions[name];
      if (!action) return 0;
      if (!once && c.current === action) return action.getClip().duration;
      action.reset();
      action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = once;
      action.enabled = true;
      action.setEffectiveWeight(1);
      action.timeScale = 1;
      if (c.current && c.current !== action) action.crossFadeFrom(c.current, fade, false);
      action.play();
      c.current = action;
      return action.getClip().duration;
    };

    let mark: Character | null = null;
    let dad: Character | null = null;
    const dadPos = DAD_HOME.clone();
    let dadBusy = false;
    let walker: Walker = makeWalker({ x: MARK_HOME.x, z: MARK_HOME.z }, -2.4);
    /** Марк занят анимацией (берёт, ставит, жмёт кнопку) — ходить нельзя. */
    let markBusy = false;
    let carried: Piece | null = null;
    let lifting: { piece: Piece; t: number; dur: number; pos: THREE.Vector3; quat: THREE.Quaternion; scale: number; done: () => void } | null = null;

    const markReady = loadCharacter(MARK_URL, 0x2f6fe4).then((c) => {
      if (disposed) return;
      mark = c;
      playOn(mark, "Idle");
    });
    const dadReady = loadCharacter(DAD_URL, 0xd9802e).then((c) => {
      if (disposed) return;
      dad = c;
      c.root.position.copy(dadPos);
      c.root.rotation.y = Math.atan2(0 - dadPos.x, 0.5 - dadPos.z);
      playOn(dad, "Idle");
    });

    const dadCheer = async () => {
      if (!dad || dadBusy) return;
      dadBusy = true;
      const d = playOn(dad, "Cheer", true, 0.2);
      await wait(d || 1);
      playOn(dad, "Idle", false, 0.4);
      dadBusy = false;
    };
    /** Папа показывает рукой, когда подсказывает. */
    const dadPoint = () => {
      if (!dad || dadBusy) return;
      dadBusy = true;
      const d = playOn(dad, "Point", true, 0.2);
      void wait(d || 1).then(() => {
        playOn(dad, "Idle", false, 0.4);
        dadBusy = false;
      });
    };

    const turnMarkTo = (yaw: number, dur = 0.25) => {
      const from = walker.yaw;
      let to = yaw;
      while (to - from > Math.PI) to -= Math.PI * 2;
      while (to - from < -Math.PI) to += Math.PI * 2;
      return tween(dur, (k) => {
        walker.yaw = from + (to - from) * ease(k);
      });
    };

    // ---------- состояние игры ----------
    let state: PuzzleState = startPuzzle();
    let goal: { kind: "pick"; piece: PieceId } | { kind: "place"; slot: SlotId } | { kind: "console" } | null = null;
    /** Гнездо, у которого уже объяснили, почему нельзя: не повторяем, пока Марк не отойдёт. */
    let refusedAt: SlotId | null = null;
    let idleTimer = 0;
    let busy = true; // вопрос, финал или вступление
    let firstCrane = true;
    const missesOn = new Map<string, number>();
    const pulsing = new Set<SlotId>();

    const setGlow = (piece: Piece, on: boolean) => {
      for (const mesh of piece.meshes) {
        const m = mesh.material as THREE.MeshStandardMaterial;
        if (!m.emissive) continue;
        m.emissive.setHex(on ? 0x2e64ff : 0x000000);
        m.emissiveIntensity = on ? 0.35 : 1;
      }
    };
    /** Прозрачные места на самолёте: для детали в руках или на крюке. */
    const showGhosts = () => {
      const load = carried ?? craneLoad;
      const kind = load ? pieceInfo(load.id).kind : null;
      for (const slot of slots.values()) {
        // Показываем все открытые места этой формы — и на «неправильном»
        // крыле тоже: выбрать сторону для двигателя — задача ребёнка.
        slot.ghost.visible =
          kind !== null && slotInfo(slot.id).kind === kind && slotOpen(state, slot.id) && slotsForPiece(load!.id).includes(slot.id);
      }
    };

    const flyTo = (piece: Piece, target: THREE.Vector3, scale: number, dur = 0.6, arc = 0.4) => {
      const from = piece.pivot.position.clone();
      const fromScale = piece.pivot.scale.x;
      const fromQ = piece.pivot.quaternion.clone();
      const toQ = new THREE.Quaternion();
      return tween(dur, (k) => {
        const e = ease(k);
        piece.pivot.position.lerpVectors(from, target, e);
        piece.pivot.position.y += Math.sin(Math.PI * e) * arc;
        piece.pivot.scale.setScalar(fromScale + (scale - fromScale) * e);
        piece.pivot.quaternion.slerpQuaternions(fromQ, toQ, e);
      });
    };

    let lastCraneUi = "";
    const syncUi = () => {
      setPlaced(placedCount(state));
      setControl(craneMode ? "crane" : "run");
      const l = enginesOn(state, "L");
      const r = enginesOn(state, "R");
      setCounter(l + r > 0 ? { left: l, right: r } : null);
    };
    /** Подпись большой кнопки крана — по тому, что сейчас под крюком. */
    const syncCraneUi = () => {
      let ui: { label: string; ready: boolean } | null = null;
      if (craneMode) {
        if (craneLoad) {
          const near = slotUnderHook(craneLoad);
          ui = near ? { label: "Поставить", ready: true } : { label: "Опустить", ready: false };
        } else {
          const near = heavyUnderHook();
          ui = near ? { label: `Взять: ${pieceInfo(near.id).name}`, ready: true } : { label: "Опустить крюк", ready: false };
        }
        if (hookBusy) ui = { ...ui, ready: false };
      }
      const key = JSON.stringify(ui) + hookBusy;
      if (key !== lastCraneUi) {
        lastCraneUi = key;
        setCraneUi(ui ? { ...ui, busy: hookBusy } : null);
      }
    };

    const sideWord = (side: "L" | "R") => (side === "L" ? "левое" : "правое");
    const explain = (why: Refusal, piece: PieceId, slot?: SlotId): string => {
      const info = pieceInfo(piece);
      switch (why) {
        case "heavy":
          return `Это ${info.spoken}. Деталь тяжёлая — её ставят краном. Беги к красному пульту!`;
        case "light":
          return "Эта деталь лёгкая — Марк отнесёт её в руках. Выйди из крана и беги к стеллажу.";
        case "needs":
          if (info.kind === "engine") {
            const missing = !isFilled(state, "wingL") || !isFilled(state, "wingR");
            return missing ? "Двигатели крепят под крылья. Сначала поставь краном оба крыла." : "Сюда пока нельзя.";
          }
          if (info.kind === "fin") return "Кили крепятся к стабилизатору. Сначала поставь краном стабилизатор.";
          if (info.kind === "buran") return "«Буран» ставим последним, когда весь самолёт готов.";
          if (info.kind === "fuselage") return "";
          return "Сначала нужен фюзеляж — к нему всё крепится.";
        case "shape":
          if (info.kind === "wing" || info.kind === "fin") {
            const mine = piece.endsWith("L") ? "левое" : "правое";
            return `Это место для другой стороны. У тебя ${info.kind === "wing" ? `${mine} крыло` : `${mine === "левое" ? "левый" : "правый"} киль`} — неси на другую сторону.`;
          }
          return info.kind === "bogie"
            ? "Тележка с колёсами встаёт под живот самолёта, сбоку. Впереди — место для носовой стойки."
            : info.kind === "noseGear"
              ? "Носовую стойку ставят спереди, под кабину."
              : "Эта деталь сюда не подходит. Посмотри на форму.";
        case "taken":
          return "Здесь уже стоит деталь.";
        case "balance": {
          const side = slot ? slotInfo(slot).side! : "L";
          const other = side === "L" ? "R" : "L";
          const here = enginesOn(state, side);
          const there = enginesOn(state, other);
          return `На этом крыле ${COUNT_WORDS[here]}, а на другом ${COUNT_WORDS[there]}. Если поставить сюда, Мрия накренится! Неси двигатель на ${sideWord(other)} крыло.`;
        }
        case "placed":
          return "";
      }
    };

    /** «Левее и дальше» — куда вести крюк, глазами ребёнка (от камеры). */
    const directionTo = (x: number, z: number): string => {
      const dx = x - craneState.x;
      const dz = z - craneState.z;
      const right = dx * camRight.x + dz * camRight.z;
      const fwd = dx * camFwd.x + dz * camFwd.z;
      const parts: string[] = [];
      if (Math.abs(right) > 0.45) parts.push(right > 0 ? "правее" : "левее");
      if (Math.abs(fwd) > 0.45) parts.push(fwd > 0 ? "дальше" : "ближе");
      if (!parts.length) return "Ты почти на месте!";
      const text = parts.join(" и ");
      return text[0]!.toUpperCase() + text.slice(1) + "!";
    };

    // ---------- руками ----------
    const goTo = (target: THREE.Vector3) => {
      walker = { ...walker, path: findPath(walker.pos, { x: target.x, z: target.z }, obstacles, BOUNDS) };
    };

    const pickUp = async (piece: Piece) => {
      const why = canTake(state, piece.id, "hands");
      if (why) {
        playMiss();
        say(explain(why, piece.id));
        return;
      }
      markBusy = true;
      goal = null;
      walker = { ...walker, path: [], speed: 0 };
      await turnMarkTo(0, 0.2);
      const dur = playOn(mark, "PickUp", true, 0.15) || 1;
      say(`Ты взял ${pieceInfo(piece.id).spoken}.`, false);
      await wait(dur * 0.3);
      await new Promise<void>((resolve) => {
        lifting = {
          piece,
          t: 0,
          dur: Math.max(dur * 0.22, 0.05),
          pos: piece.pivot.position.clone(),
          quat: piece.pivot.quaternion.clone(),
          scale: piece.pivot.scale.x,
          done: resolve,
        };
      });
      await wait(dur * 0.4);
      setGlow(piece, false);
      setHolding(pieceInfo(piece.id).name);
      showGhosts();
      const kind = pieceInfo(piece.id).kind;
      const where =
        kind === "engine"
          ? "Неси его под крыло — к прозрачному двигателю."
          : kind === "noseGear"
            ? "Неси её вперёд, под нос самолёта."
            : "Неси её под самолёт, к прозрачной тележке сбоку.";
      say(`${pieceInfo(piece.id).name}! ${where}`);
      markBusy = false;
    };

    const placeAt = async (slot: Slot) => {
      if (!carried) return;
      const piece = carried;
      const why = refusal(state, piece.id, slot.id);
      if (why) {
        state = place(state, piece.id, slot.id).state;
        refusedAt = slot.id;
        playMiss();
        say(explain(why, piece.id, slot.id));
        const misses = (missesOn.get(piece.id) ?? 0) + 1;
        missesOn.set(piece.id, misses);
        if (misses >= 2) for (const s of openSlotsFor(state, piece.id)) pulsing.add(s);
        void (async () => {
          markBusy = true;
          await turnMarkTo(slot.face, 0.2);
          const d = playOn(mark, "Think", true, 0.2);
          await wait(Math.min(d || 0.8, 1.2));
          playOn(mark, "CarryIdle", false, 0.25);
          markBusy = false;
        })();
        return;
      }
      markBusy = true;
      busy = true;
      goal = null;
      walker = { ...walker, path: [], speed: 0 };
      await turnMarkTo(slot.face, 0.2);
      const dur = playOn(mark, "Place", true, 0.15) || 0.9;
      await wait(dur * 0.5);
      carried = null;
      setHolding(null);
      await flyTo(piece, slot.pos, 1, 0.55, slot.pos.y > 0.5 ? 0.25 : 0.15);
      piece.pivot.position.copy(slot.pos);
      state = place(state, piece.id, slot.id).state;
      pulsing.clear();
      missesOn.delete(piece.id);
      playWin();
      say(pick(PRAISE));
      await wait(Math.max(0.2, dur * 0.5 - 0.55));
      playOn(mark, "Idle", false, 0.3);
      markBusy = false;
      await afterPlacement();
    };

    // ---------- кран ----------
    /** Тяжёлая деталь прямо под крюком (ещё не поставленная). */
    const heavyUnderHook = (): Piece | null => {
      let best: Piece | null = null;
      let bestD = GRAB_RADIUS;
      for (const piece of pieces.values()) {
        if (pieceInfo(piece.id).carrier !== "crane" || isPlaced(state, piece.id) || piece === craneLoad) continue;
        const p = piece.pivot.position;
        const d = Math.hypot(p.x - craneState.x, p.z - craneState.z);
        if (d < bestD) {
          bestD = d;
          best = piece;
        }
      }
      return best;
    };
    /** Место на самолёте под крюком, куда подходит деталь этой формы. */
    const slotUnderHook = (piece: Piece): Slot | null => {
      const kind = pieceInfo(piece.id).kind;
      let best: Slot | null = null;
      let bestD = DROP_RADIUS;
      for (const slot of slots.values()) {
        if (slotInfo(slot.id).kind !== kind || isFilled(state, slot.id)) continue;
        const d = Math.hypot(slot.pos.x - craneState.x, slot.pos.z - craneState.z);
        if (d < bestD) {
          bestD = d;
          best = slot;
        }
      }
      return best;
    };
    /** Куда сейчас нести груз крана: ближайшее подходящее открытое место. */
    const targetFor = (piece: Piece): Slot | null => {
      let best: Slot | null = null;
      let bestD = Infinity;
      for (const id of openSlotsFor(state, piece.id)) {
        const slot = slots.get(id)!;
        const d = Math.hypot(slot.pos.x - craneState.x, slot.pos.z - craneState.z);
        if (d < bestD) {
          bestD = d;
          best = slot;
        }
      }
      return best;
    };

    const enterCrane = async () => {
      if (craneMode || markBusy) return;
      if (carried) {
        say("Руки заняты. Сначала поставь деталь на самолёт, а потом — к пульту.");
        return;
      }
      if (!available(state, "crane").length) {
        say("Сейчас краном ставить нечего. Неси детали со стеллажа руками.");
        dadPoint();
        return;
      }
      goal = null;
      walker = { ...walker, path: [], speed: 0 };
      markBusy = true;
      await turnMarkTo(Math.atan2(BUTTON.x - walker.pos.x, BUTTON.z - walker.pos.z), 0.2);
      const d = playOn(mark, "Point", true, 0.15) || 0.8;
      buttonPress();
      await wait(d * 0.6);
      playOn(mark, "Idle", false, 0.3);
      markBusy = false;
      craneMode = true;
      hookGoal = null;
      craneIdle = 0;
      syncUi();
      dadPoint();
      const next = available(state, "crane").map((id) => pieceInfo(id).name.toLowerCase());
      if (firstCrane) {
        firstCrane = false;
        say(
          `Ты за пультом крана! Джойстиком веди крюк к детали — или просто нажми на неё. Потом жми большую кнопку. Начнём: ${next[0]}.`,
        );
      } else {
        say(`Ты за пультом. Можно поставить: ${next.join(", ")}.`);
      }
    };

    const exitCrane = () => {
      if (!craneMode || hookBusy) return;
      if (craneLoad) {
        say("Деталь ещё на крюке. Сначала поставь её на самолёт.");
        return;
      }
      craneMode = false;
      hookGoal = null;
      syncUi();
      syncCraneUi();
      say("Марк снова бегает. Неси детали со стеллажа.");
    };

    /** Большая кнопка крана: взять то, что под крюком, или поставить груз. */
    const craneAction = async () => {
      if (!craneMode || hookBusy || busy) return;
      idleTimer = 0;
      buttonPress();
      if (!craneLoad) {
        const piece = heavyUnderHook();
        if (!piece) {
          const options = available(state, "crane").map((id) => pieces.get(id)!);
          const near = options.sort(
            (a, b) =>
              Math.hypot(a.pivot.position.x - craneState.x, a.pivot.position.z - craneState.z) -
              Math.hypot(b.pivot.position.x - craneState.x, b.pivot.position.z - craneState.z),
          )[0];
          say(near ? `Под крюком пусто. Тяжёлая деталь — ${pieceInfo(near.id).name.toLowerCase()}. ${directionTo(near.pivot.position.x, near.pivot.position.z)}` : "Под крюком пусто.");
          dadPoint();
          return;
        }
        const why = canTake(state, piece.id, "crane");
        if (why) {
          playMiss();
          say(explain(why, piece.id));
          dadPoint();
          return;
        }
        hookBusy = true;
        syncCraneUi();
        hookGoal = null;
        await craneSlide(piece.pivot.position.x, piece.pivot.position.z);
        await hookTo(piece.pivot.position.y + hangOf(piece));
        craneLoad = piece;
        piece.footprint = null;
        rebuildObstacles();
        // Поднимая, разворачиваем деталь как на самолёте и возвращаем ей размер.
        const fromQ = piece.pivot.quaternion.clone();
        const fromS = piece.pivot.scale.x;
        const toQ = new THREE.Quaternion();
        await Promise.all([
          hookTo(carryHook(piece)),
          tween(1.0, (k) => {
            const e = ease(k);
            piece.pivot.quaternion.slerpQuaternions(fromQ, toQ, e);
            piece.pivot.scale.setScalar(fromS + (1 - fromS) * e);
          }),
        ]);
        hookBusy = false;
        overSaid = false;
        craneIdle = 0;
        showGhosts();
        playWin();
        say(`Есть! ${pieceInfo(piece.id).name} на крюке. Веди деталь к прозрачному месту на самолёте и жми «Поставить».`);
        return;
      }
      const piece = craneLoad;
      const slot = slotUnderHook(piece);
      if (!slot) {
        const target = targetFor(piece);
        say(target ? `Это ещё не место. ${directionTo(target.pos.x, target.pos.z)}` : "Это ещё не место.");
        dadPoint();
        return;
      }
      const why = refusal(state, piece.id, slot.id);
      if (why) {
        state = place(state, piece.id, slot.id).state;
        playMiss();
        say(explain(why, piece.id, slot.id));
        dadPoint();
        return;
      }
      hookBusy = true;
      hookGoal = null;
      syncCraneUi();
      await craneSlide(slot.pos.x, slot.pos.z);
      await hookTo(slot.pos.y + piece.halfH + 0.14);
      craneLoad = null;
      piece.pivot.position.copy(slot.pos);
      piece.pivot.quaternion.identity();
      piece.pivot.scale.setScalar(1);
      state = place(state, piece.id, slot.id).state;
      playWin();
      say(pick(PRAISE));
      void dadCheer();
      await hookTo(HOOK_HIGH);
      hookBusy = false;
      await afterPlacement();
    };

    // ---------- вопросы на счёт ----------
    const badges: THREE.Sprite[] = [];
    const clearBadges = () => {
      for (const b of badges) {
        scene.remove(b);
        (b.material as THREE.SpriteMaterial).map?.dispose();
        b.material.dispose();
      }
      badges.length = 0;
    };
    let asking: Question | null = null;
    const ask = (q: Question) =>
      new Promise<void>((resolve) => {
        asking = q;
        say(q.text);
        setQuestion({ text: q.text, options: q.options, locked: false });
        answerRef.current = async (n: number) => {
          setQuestion({ text: q.text, options: q.options, locked: true });
          answerRef.current = () => {};
          if (n === q.answer) {
            playWin();
            const line = `Верно, ${COUNT_WORDS[q.answer]}!`;
            say(line);
            void dadCheer();
            await wait(Math.max(1.2, speechTime(line)));
          } else {
            playMiss();
            say(q.hint);
            await wait(speechTime(q.hint));
            // Считаем вместе: над каждой деталью загорается номер.
            const targets = q.count.slots.filter((s) => (q.count.mode === "filled" ? isFilled(state, s) : !isFilled(state, s)));
            for (const [i, s] of targets.entries()) {
              const slot = slots.get(s)!;
              if (q.count.mode === "empty") slot.ghost.visible = true;
              const badge = numberBadge(i + 1);
              badge.position.copy(slot.pos).add(new THREE.Vector3(0, s.startsWith("fin") ? 1.0 : 0.55, 0));
              scene.add(badge);
              badges.push(badge);
              const word = COUNT_WORDS[i + 1]!;
              say(word[0]!.toUpperCase() + word.slice(1));
              await wait(0.85);
            }
            const line = `Всего ${COUNT_WORDS[q.answer]}.`;
            say(line);
            await wait(Math.max(1.3, speechTime(line)));
            clearBadges();
            showGhosts();
          }
          setQuestion(null);
          asking = null;
          resolve();
        };
      });

    // ---------- деталь за деталью ----------
    const afterPlacement = async () => {
      busy = true;
      rebuildObstacles();
      showGhosts();
      syncUi();
      syncCraneUi();
      for (;;) {
        const q = questionDue(state);
        if (!q) break;
        state = markAsked(state, q.id);
        await wait(0.5);
        await ask(q);
      }
      if (isComplete(state)) {
        await finale();
        return;
      }
      await wait(0.4);
      prompt();
    };

    /** Что делать дальше — одной фразой, по тому, что сейчас можно поставить. */
    const prompt = () => {
      busy = false;
      idleTimer = 0;
      syncUi();
      syncCraneUi();
      showGhosts();
      const hands = available(state, "hands");
      const heavy = available(state, "crane");
      const engines = hands.some((id) => id.startsWith("eng"));
      const gears = hands.some((id) => !id.startsWith("eng"));
      const what = engines && gears ? "двигатель или колёса" : engines ? "двигатель" : "колёса";
      const heavyName = heavy[0] ? pieceInfo(heavy[0]).name.toLowerCase() : "";
      if (heavy.includes("buran")) {
        say(craneMode ? "Последняя деталь — «Буран»! Веди крюк к нему." : "Самолёт готов! Последняя деталь — «Буран». Беги к красному пульту крана!");
      } else if (heavy.length && hands.length) {
        say(
          craneMode
            ? `Краном можно поставить: ${heavy.map((id) => pieceInfo(id).name.toLowerCase()).join(", ")}. А руками — ${what}.`
            : `Возьми на стеллаже ${what} — или беги к пульту и поставь краном ${heavyName}.`,
        );
      } else if (heavy.length) {
        say(craneMode ? `Следующая деталь — ${heavyName}. Веди крюк к ней.` : `Теперь тяжёлая деталь — ${heavyName}. Беги к красному пульту крана!`);
      } else {
        say(craneMode ? `Краном пока ставить нечего. Выйди из крана и возьми на стеллаже ${what}.` : `Беги к стеллажу и возьми ${what}.`);
      }
    };

    // ---------- финал ----------
    let exhaust: THREE.Group | null = null;
    let finished = false;
    const finale = async () => {
      finished = true;
      busy = true;
      markBusy = true;
      craneMode = false;
      hookGoal = null;
      syncUi();
      syncCraneUi();
      setHolding(null);
      say("Ура! Мрия и «Буран» готовы к полёту!");
      const vd = playOn(mark, "Victory", true, 0.2);
      void dadCheer();
      // Кран уезжает к стене, чтобы не мешать взлёту.
      void craneSlide(CRANE_HOME.x, CRANE_HOME.z);
      await wait(Math.max(vd || 1.5, 2.2));
      // Отводим Марка в угол у стеллажа: самолёт будет разворачиваться.
      markBusy = false;
      goTo(new THREE.Vector3(6.6, 0, 4.6));
      for (let i = 0; i < 80 && !arrived(walker); i++) await wait(0.1);
      markBusy = true;
      walker = { ...walker, path: [], speed: 0 };
      await turnMarkTo(Math.PI, 0.3);
      playOn(mark, "Idle", false, 0.3);
      const planeGroup = new THREE.Group();
      scene.add(planeGroup);
      for (const piece of pieces.values()) planeGroup.attach(piece.pivot);
      exhaust = buildExhaust();
      exhaust.visible = false;
      planeGroup.add(exhaust);
      const line = "Отличная работа, Марк! Ты всё собрал сам. Капитан Папа сопровождает Мрию!";
      say(line);
      if (dad) {
        dadBusy = true;
        const d = playOn(dad, "TakeOff", true, 0.2) || 1;
        const from = dadPos.clone();
        await wait(d * 0.45);
        await tween(d * 0.55, (k) => {
          dadPos.lerpVectors(from, new THREE.Vector3(-4.6, 2.2, 1.2), ease(k));
        });
        playOn(dad, "Fly", false, 0.3);
      }
      await wait(Math.max(0.3, speechTime(line) - 2));
      say("Мрия выезжает из ангара. Взлетаем!");
      if (!reducedMotion) {
        await tween(2.2, (k) => {
          planeGroup.rotation.y = (Math.PI / 2) * ease(k);
        });
        exhaust.visible = true;
        const dadFrom = dadPos.clone();
        await tween(4.2, (k) => {
          const a = k * k;
          planeGroup.position.z = -a * 30;
          planeGroup.position.y = Math.max(0, (k - 0.45) / 0.55) ** 2 * 7;
          planeGroup.rotation.x = Math.max(0, k - 0.5) * 0.25;
          if (dad) {
            dadPos.set(
              dadFrom.x + (-4.2 - dadFrom.x) * Math.min(1, k * 2),
              dadFrom.y + planeGroup.position.y + Math.sin(performance.now() / 300) * 0.05,
              dadFrom.z + planeGroup.position.z * 0.98,
            );
          }
        });
      }
      if (dad) dad.root.visible = false;
      planeGroup.visible = false;
      playOn(mark, "Wave", false, 0.3);
      onWin();
      setPhase("done");
      say(rewardAvailable ? "Мрия улетела! За сборку ты получаешь три звезды." : "Мрия улетела! Можно собрать ещё раз.");
    };

    // ---------- ввод: нажатие по сцене ----------
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const buttonMeshes: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (o.userData.button) buttonMeshes.push(o);
    });
    type Hit = { piece?: PieceId; slot?: SlotId; button?: boolean; floor?: THREE.Vector3 };
    const hit = (event: PointerEvent): Hit | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const targets: THREE.Object3D[] = [...buttonMeshes];
      for (const piece of pieces.values()) {
        const inHands = piece === carried || (lifting !== null && piece === lifting.piece);
        if (!isPlaced(state, piece.id) && !inHands && piece !== craneLoad) targets.push(...piece.meshes);
      }
      for (const slot of slots.values()) if (slot.ghost.visible) slot.ghost.traverse((o) => (o as THREE.Mesh).isMesh && targets.push(o));
      const first = raycaster.intersectObjects(targets, false)[0];
      if (first) return first.object.userData as Hit;
      const p = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(floor, p)) return { floor: p };
      return null;
    };

    /** Нажатие, пока Марк у пульта: оно управляет краном. */
    const tapCrane = (data: Hit) => {
      if (hookBusy) return;
      if (data.button) return;
      if (data.piece) {
        const piece = pieces.get(data.piece)!;
        if (pieceInfo(data.piece).carrier === "hands") {
          if (craneLoad) {
            say("Сначала поставь деталь, которая на крюке.");
            return;
          }
          // Лёгкая деталь: выходим из крана и бежим за ней.
          exitCrane();
          tapRun(data);
          return;
        }
        if (craneLoad) {
          say(`На крюке уже ${pieceInfo(craneLoad.id).name.toLowerCase()}. Сначала поставь её.`);
          return;
        }
        const why = canTake(state, data.piece, "crane");
        if (why) {
          playMiss();
          say(explain(why, data.piece));
          dadPoint();
          return;
        }
        hookGoal = { x: piece.pivot.position.x, z: piece.pivot.position.z, then: "grab" };
        return;
      }
      if (data.slot && craneLoad) {
        const slot = slots.get(data.slot)!;
        hookGoal = { x: slot.pos.x, z: slot.pos.z, then: "drop" };
        return;
      }
      if (data.floor) {
        hookGoal = { x: data.floor.x, z: data.floor.z, then: null };
        tapMarker(data.floor);
      }
    };

    /** Нажатие, пока Марк бегает. */
    const tapRun = (data: Hit) => {
      if (data.floor) {
        goal = null;
        goTo(data.floor);
        tapMarker(data.floor);
        return;
      }
      if (data.button) {
        goal = { kind: "console" };
        goTo(CONSOLE_SPOT);
        return;
      }
      if (data.piece) {
        const piece = pieces.get(data.piece)!;
        if (pieceInfo(data.piece).carrier === "crane") {
          if (isPlaced(state, data.piece)) return;
          const why = canTake(state, data.piece, "crane");
          if (why) {
            playMiss();
            say(explain(why, data.piece));
            return;
          }
          // Тяжёлую — краном: Марк бежит к пульту.
          say(`Это ${pieceInfo(data.piece).spoken}. Эту деталь ставят краном — бегу к пульту!`);
          goal = { kind: "console" };
          goTo(CONSOLE_SPOT);
          return;
        }
        if (carried) {
          say(`Руки заняты: Марк несёт ${pieceInfo(carried.id).spoken}. Сначала поставь её на самолёт.`);
          return;
        }
        const why = canTake(state, data.piece, "hands");
        if (why) {
          playMiss();
          say(explain(why, data.piece));
          return;
        }
        if (!piece.approach) return;
        goal = { kind: "pick", piece: data.piece };
        goTo(piece.approach);
        return;
      }
      if (data.slot) {
        const slot = slots.get(data.slot)!;
        if (!slot.approach) return;
        if (!carried) {
          say("Сначала возьми деталь на стеллаже.");
          return;
        }
        goal = { kind: "place", slot: data.slot };
        refusedAt = null;
        goTo(slot.approach);
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (finished || !started || busy) return;
      const data = hit(event);
      if (!data) return;
      idleTimer = 0;
      if (craneMode) tapCrane(data);
      else if (!markBusy) tapRun(data);
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);

    // Отметка на полу, куда побежал Марк или поедет крюк.
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.24, 32),
      new THREE.MeshBasicMaterial({ color: 0x2f6fe4, transparent: true, opacity: 0, depthWrite: false }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.012;
    scene.add(marker);
    let markerT = 1;
    const tapMarker = (p: THREE.Vector3) => {
      marker.position.set(p.x, 0.012, p.z);
      markerT = 0;
    };

    // Клавиатура: стрелки и WASD; пробел — кнопка крана.
    const keys = new Set<string>();
    const onKey = (e: KeyboardEvent) => {
      const code = e.code;
      if (code === "Space" && e.type === "keydown" && craneMode) {
        e.preventDefault();
        void craneAction();
        return;
      }
      if (!/^(Arrow(Up|Down|Left|Right)|Key[WASD])$/.test(code)) return;
      e.preventDefault();
      if (e.type === "keydown") keys.add(code);
      else keys.delete(code);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    craneActionRef.current = () => void craneAction();
    exitCraneRef.current = exitCrane;

    // ---------- для автотестов ----------
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __mriya?: unknown }).__mriya = {
        state: () => state,
        busy: () => busy || markBusy || hookBusy,
        mark: () => ({
          ...walker.pos,
          yaw: walker.yaw,
          speed: walker.speed,
          gait: walker.gait,
          carrying: carried?.id ?? null,
          path: walker.path,
          goal,
          markBusy,
          busy,
        }),
        crane: () => ({ ...craneState, mode: craneMode, load: craneLoad?.id ?? null, busy: hookBusy, goal: hookGoal }),
        tapPiece: (id: PieceId) => (craneMode ? tapCrane({ piece: id }) : tapRun({ piece: id })),
        tapSlot: (id: SlotId) => (craneMode ? tapCrane({ slot: id }) : tapRun({ slot: id })),
        tapConsole: () => tapRun({ button: true }),
        hookTo: (x: number, z: number) => {
          hookGoal = { x, z, then: null };
        },
        craneAction: () => craneAction(),
        exitCrane: () => exitCrane(),
        walkTo: (x: number, z: number) => {
          goal = null;
          goTo(new THREE.Vector3(x, 0, z));
        },
        answer: (n: number) => answerRef.current(n),
        asking: () => asking,
        clock: () => gameTime,
        step: (dt: number, n = 1) => {
          for (let i = 0; i < n; i++) frame(dt);
        },
        available: (by: "hands" | "crane") => available(state, by),
        camera: () => ({ pos: camera.position.toArray(), target: camTarget.toArray() }),
        open: (id: PieceId) => openSlotsFor(state, id),
        slotPos: (id: SlotId) => slots.get(id)!.pos.toArray(),
        bubble: () => lastSpoken.current,
        /** Мгновенно ставит детали по правилам, пока их не станет n, — для проверки картинки. */
        fill: (n: number) => {
          while (placedCount(state) < Math.min(n, 15)) {
            const id = [...available(state, "crane"), ...available(state, "hands")].find((x) => x !== "buran");
            if (!id) break;
            const slotId = openSlotsFor(state, id)[0]!;
            const piece = pieces.get(id)!;
            piece.pivot.position.copy(slots.get(slotId)!.pos);
            piece.pivot.quaternion.identity();
            piece.pivot.scale.setScalar(1);
            piece.footprint = null;
            state = place(state, id, slotId).state;
            for (;;) {
              const q = questionDue(state);
              if (!q) break;
              state = markAsked(state, q.id);
            }
          }
          rebuildObstacles();
          prompt();
        },
      };
    }

    // ---------- старт ----------
    let started = false;
    startRef.current = async () => {
      setPhase("loading");
      await Promise.all([markReady, dadReady]);
      if (disposed) return;
      rebuildObstacles();
      setPhase("play");
      started = true;
      walker = { ...walker, yaw: Math.atan2(0 - walker.pos.x, 2 - walker.pos.z) };
      const hello = "Привет! Я Марк. Сегодня я сам соберу самый большой самолёт в мире — Ан-225 «Мрия»!";
      say(hello);
      const d = playOn(mark, "Wave", true, 0.2);
      await wait(Math.max(d, speechTime(hello)));
      playOn(mark, "Idle", false, 0.4);
      const line =
        "А я Капитан Папа, я подсказываю. Лёгкие детали Марк носит в руках, тяжёлые ставит краном. Начнём с фюзеляжа: беги к красному пульту!";
      say(line);
      const dw = playOn(dad, "Wave", true, 0.2);
      await wait(Math.max(dw, speechTime(line)));
      playOn(dad, "Point", true, 0.3);
      busy = false;
      idleTimer = 0;
      syncUi();
    };
    if (autoStart) void startRef.current();

    // Нажатие красной кнопки: колпачок проседает и возвращается.
    let pressT = 1;
    const buttonPress = () => {
      pressT = 0;
    };

    // ---------- камера ----------
    /**
     * Общий план подбирается под экран: в кадр попадает весь пол ангара.
     * Потом камера чуть приближается и мягко следует за тем, кто сейчас
     * действует: за Марком или за крюком крана.
     */
    const viewDir = new THREE.Vector3(0.36, 0.74, 0.57).normalize();
    const viewDirNarrow = new THREE.Vector3(0.22, 0.86, 0.46).normalize();
    const camTarget = new THREE.Vector3();
    const camBase = new THREE.Vector3();
    let camDist = 20;
    let camBaseDist = 20;
    const framePoints: THREE.Vector3[] = [];
    for (const x of [BOUNDS.minX, BOUNDS.maxX]) {
      for (const z of [BOUNDS.minZ + 0.6, BOUNDS.maxZ - 0.2]) framePoints.push(new THREE.Vector3(x * 0.92, 0, z));
      framePoints.push(new THREE.Vector3(x * 0.6, 2.4, -1));
    }
    const fitCamera = (w: number, h: number) => {
      const narrow = w / h < 1;
      const dir = narrow ? viewDirNarrow : viewDir;
      const top = 1 - (2 * (narrow ? 150 : 130)) / h;
      const bottom = -1 + (2 * (narrow ? 40 : 30)) / h;
      const side = 0.98;
      const target = new THREE.Vector3(0, 0, -0.2);
      const projected = new THREE.Vector3();
      const measure = (d: number) => {
        camera.position.copy(target).addScaledVector(dir, d);
        camera.lookAt(target);
        camera.updateMatrixWorld(true);
        let minY = Infinity, maxY = -Infinity, maxX = 0;
        for (const p of framePoints) {
          projected.copy(p).project(camera);
          minY = Math.min(minY, projected.y);
          maxY = Math.max(maxY, projected.y);
          maxX = Math.max(maxX, Math.abs(projected.x));
        }
        return { minY, maxY, maxX };
      };
      let dist = 20;
      for (let pass = 0; pass < 3; pass++) {
        let lo = 3, hi = 60;
        for (let i = 0; i < 30; i++) {
          const mid = (lo + hi) / 2;
          const m = measure(mid);
          if (m.maxY - m.minY <= top - bottom && m.maxX <= side) hi = mid;
          else lo = mid;
        }
        dist = hi;
        const m = measure(hi);
        const shift = ((m.maxY + m.minY) / 2 - (top + bottom) / 2) * 0.5;
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
        target.addScaledVector(up, shift * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * hi);
        target.y = 0;
      }
      camBase.copy(target);
      camBaseDist = dist;
      camTarget.copy(target);
      camDist = dist;
    };
    const resize = () => {
      const w = mount.clientWidth;
      const h = Math.max(mount.clientHeight, 1);
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.fov = w / h < 1 ? 52 : 38;
      camera.updateProjectionMatrix();
      fitCamera(w, h);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    // ---------- цикл ----------
    const clock = new THREE.Clock();
    const propPos = new THREE.Vector3();
    const camFwd = new THREE.Vector3();
    const camRight = new THREE.Vector3();
    const focus = new THREE.Vector3();
    let raf = 0;
    let gameTime = 0;
    let lastGait: Gait | null = null;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const delta = clock.getDelta();
      if (process.env.NODE_ENV !== "production") {
        const w = window as unknown as { __mriyaSpeed?: number; __mriyaManual?: boolean };
        // Покадровый режим для записи видео в тестах: кадры двигает __mriya.step.
        if (w.__mriyaManual) return;
        frame(Math.min(delta, 0.05) * (w.__mriyaSpeed ?? 1));
        return;
      }
      frame(Math.min(delta, 0.05));
    };
    const frame = (dt: number) => {
      gameTime += dt;
      const time = gameTime;
      for (let i = tweens.length - 1; i >= 0; i--) {
        const tw = tweens[i];
        if (!tw) continue;
        tw.t = Math.min(tw.dur, tw.t + dt);
        tw.step(tw.t / tw.dur);
        if (tw.t >= tw.dur) {
          tweens.splice(i, 1);
          tw.done();
        }
      }

      // Ввод: джойстик или клавиши — относительно камеры.
      camera.getWorldDirection(camFwd);
      camFwd.y = 0;
      camFwd.normalize();
      camRight.set(-camFwd.z, 0, camFwd.x);
      let sx = stickRef.current.x;
      let sy = stickRef.current.y;
      if (keys.has("ArrowLeft") || keys.has("KeyA")) sx -= 1;
      if (keys.has("ArrowRight") || keys.has("KeyD")) sx += 1;
      if (keys.has("ArrowUp") || keys.has("KeyW")) sy += 1;
      if (keys.has("ArrowDown") || keys.has("KeyS")) sy -= 1;
      const stickLen = Math.min(1, Math.hypot(sx, sy));
      const stickRaw = stickLen > 0.12 && started && !finished;
      const sn = Math.hypot(sx, sy) || 1;
      const stickX = ((camRight.x * sx + camFwd.x * sy) / sn) * stickLen;
      const stickZ = ((camRight.z * sx + camFwd.z * sy) / sn) * stickLen;
      // У пульта джойстик ведёт кран, а не Марка.
      const stickOn = stickRaw && !markBusy && !craneMode;
      if (stickRaw) idleTimer = 0;
      if (stickOn) goal = null;

      // ---------- кран ----------
      if (craneMode && !hookBusy) {
        let vx = 0;
        let vz = 0;
        if (stickRaw) {
          hookGoal = null;
          vx = stickX * CRANE_SPEED;
          vz = stickZ * CRANE_SPEED;
        } else if (hookGoal) {
          const dx = hookGoal.x - craneState.x;
          const dz = hookGoal.z - craneState.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.03) {
            const then = hookGoal.then;
            hookGoal = null;
            if (then) void craneAction();
          } else {
            const v = Math.min(CRANE_SPEED, d * 2.5 + 0.3);
            vx = (dx / d) * v;
            vz = (dz / d) * v;
          }
        }
        // Кран тяжёлый: разгоняется и тормозит плавно, без рывков.
        const k = Math.min(1, dt * 6);
        craneState.vx += (vx - craneState.vx) * k;
        craneState.vz += (vz - craneState.vz) * k;
        craneState.x = THREE.MathUtils.clamp(craneState.x + craneState.vx * dt, CRANE_BOUNDS.minX, CRANE_BOUNDS.maxX);
        craneState.z = THREE.MathUtils.clamp(craneState.z + craneState.vz * dt, CRANE_BOUNDS.minZ, CRANE_BOUNDS.maxZ);
        const moving = Math.hypot(craneState.vx, craneState.vz) > 0.08;
        // Подсказки Папы, пока деталь на крюке.
        if (craneLoad && !busy) {
          const target = targetFor(craneLoad);
          const over = slotUnderHook(craneLoad);
          if (over && refusal(state, craneLoad.id, over.id) === null && !moving && !overSaid) {
            overSaid = true;
            say("Ты прямо над местом! Жми «Поставить».");
          }
          if (!over) overSaid = false;
          craneIdle = moving ? 0 : craneIdle + dt;
          if (target && !over && craneIdle > 3.5) {
            craneIdle = 0;
            say(`Капитан Папа: ${directionTo(target.pos.x, target.pos.z)}`);
            dadPoint();
          }
        }
        syncCraneUi();
      } else if (craneMode) {
        craneState.vx = 0;
        craneState.vz = 0;
      }

      if (mark) {
        if (started && !markBusy && !craneMode) {
          const input = stickOn ? { kind: "stick" as const, x: stickX, z: stickZ } : { kind: "path" as const };
          walker = stepWalker(walker, dt, input, carried !== null, obstacles, BOUNDS);
        }
        // Походка: клип по виду шага, темп — от реальной скорости.
        const gait: Gait = markBusy ? lastGait ?? "idle" : craneMode ? "idle" : walker.gait;
        if (!markBusy && gait !== lastGait) {
          playOn(mark, ACTION_FOR[gait], false, gait === "run" || lastGait === "run" ? 0.18 : 0.25);
          lastGait = gait;
        }
        if (!markBusy && mark.current) mark.current.timeScale = gaitTimeScale(gait, walker.speed);
        if (markBusy) lastGait = null;
        mark.root.position.set(walker.pos.x, 0, walker.pos.z);
        mark.root.rotation.y = walker.yaw;
        mark.mixer?.update(dt);

        // Цели: дошёл — делаем.
        if (goal && !markBusy && !busy && arrived(walker)) {
          const g = goal;
          goal = null;
          if (g.kind === "pick") void pickUp(pieces.get(g.piece)!);
          else if (g.kind === "place") void placeAt(slots.get(g.slot)!);
          else void enterCrane();
        }
        // Джойстиком подошли к детали, к месту или к пульту — действие само.
        if (stickOn && !busy && !markBusy) {
          if (!carried) {
            for (const id of available(state, "hands")) {
              const piece = pieces.get(id)!;
              if (piece.approach && Math.hypot(piece.approach.x - walker.pos.x, piece.approach.z - walker.pos.z) < 0.4) {
                void pickUp(piece);
                break;
              }
            }
          } else {
            const kind = pieceInfo(carried.id).kind;
            let nearest: Slot | null = null;
            let best = 0.45;
            for (const slot of slots.values()) {
              if (!slot.approach || slotInfo(slot.id).kind !== kind || isFilled(state, slot.id) || !slotOpen(state, slot.id)) continue;
              const d = Math.hypot(slot.approach.x - walker.pos.x, slot.approach.z - walker.pos.z);
              if (d < best) {
                best = d;
                nearest = slot;
              }
            }
            if (nearest && nearest.id !== refusedAt) void placeAt(nearest);
            if (!nearest && refusedAt) refusedAt = null;
          }
          if (Math.hypot(CONSOLE_SPOT.x - walker.pos.x, CONSOLE_SPOT.z - walker.pos.z) < 0.35 && !consoleRefused) {
            consoleRefused = true;
            void enterCrane();
          }
        }
        if (Math.hypot(CONSOLE_SPOT.x - walker.pos.x, CONSOLE_SPOT.z - walker.pos.z) > 0.9) consoleRefused = false;

        // Деталь в руках.
        if (lifting && mark.prop) {
          const l = lifting;
          l.t = Math.min(l.dur, l.t + dt);
          const k = ease(l.t / l.dur);
          mark.root.updateMatrixWorld(true);
          mark.prop.getWorldPosition(propPos);
          propPos.y += 0.06;
          l.piece.pivot.position.lerpVectors(l.pos, propPos, k);
          l.piece.pivot.quaternion.slerpQuaternions(l.quat, mark.root.quaternion, k);
          l.piece.pivot.scale.setScalar(l.scale + (l.piece.carryScale - l.scale) * k);
          if (l.t >= l.dur) {
            lifting = null;
            carried = l.piece;
            l.done();
          }
        }
        if (carried && mark.prop) {
          mark.root.updateMatrixWorld(true);
          mark.prop.getWorldPosition(propPos);
          carried.pivot.position.copy(propPos).add(new THREE.Vector3(0, 0.06, 0));
          carried.pivot.quaternion.copy(mark.root.quaternion);
          carried.pivot.scale.setScalar(carried.carryScale);
        }
      }

      if (dad) {
        dad.root.position.copy(dadPos);
        dad.mixer?.update(dt);
      }

      // Кран: мост, тележка, трос, крюк и груз.
      crane.bridge.position.x = craneState.x;
      crane.trolley.position.z = craneState.z;
      const cable = Math.max(0.05, CRANE_TOP - 0.2 - craneState.hook);
      crane.cable.scale.y = cable;
      crane.cable.position.y = CRANE_TOP - 0.2 - cable / 2;
      crane.hook.position.y = craneState.hook;
      if (craneLoad) craneLoad.pivot.position.set(craneState.x, craneState.hook - hangOf(craneLoad), craneState.z);
      // Пятно под крюком: видно, куда он опустится.
      hookSpot.visible = craneMode;
      hookSpot.position.set(craneState.x, 0.014, craneState.z);
      const lineTop = craneLoad ? craneState.hook - hangOf(craneLoad) - craneLoad.halfH : craneState.hook - 0.1;
      dropLine.visible = craneMode && lineTop > 0.1;
      dropLine.scale.y = Math.max(0.05, lineTop);
      dropLine.position.set(craneState.x, lineTop / 2, craneState.z);

      // Подсказки: доступные детали подпрыгивают и светятся.
      const free = started && !busy && !lifting && !finished;
      for (const piece of pieces.values()) {
        if (isPlaced(state, piece.id) || piece === carried || piece === craneLoad || (lifting && lifting.piece === piece)) continue;
        const heavy = pieceInfo(piece.id).carrier === "crane";
        const ok = free && (heavy ? craneMode && !craneLoad : !craneMode && !carried) && canTake(state, piece.id, heavy ? "crane" : "hands") === null;
        setGlow(piece, ok);
        if (!heavy) piece.pivot.position.y = piece.home.y + (ok && !reducedMotion ? Math.max(0, Math.sin(time * 3 + piece.home.x)) * 0.05 : 0);
      }
      for (const slot of slots.values()) {
        if (!slot.ghost.visible) continue;
        const glow = pulsing.has(slot.id);
        const wave = 0.5 + 0.5 * Math.sin(time * (glow ? 6 : 2.5));
        slot.ghost.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
          if (m && (o as THREE.Mesh).isMesh) m.opacity = glow ? 0.25 + 0.35 * wave : GHOST_OPACITY + 0.12 * wave;
        });
      }
      // Пульт мигает, когда есть что ставить краном, а Марк не у пульта.
      buttonGlow(time, free && !craneMode && !carried && available(state, "crane").length > 0);
      if (markerT < 1) {
        markerT = Math.min(1, markerT + dt * 1.6);
        const m = marker.material as THREE.MeshBasicMaterial;
        m.opacity = 0.8 * (1 - markerT);
        marker.scale.setScalar(1 + markerT * 0.8);
      }
      if (free) {
        idleTimer += dt;
        if (idleTimer > 16) {
          idleTimer = 0;
          if (craneMode) {
            if (craneLoad) say("Веди крюк к прозрачному месту на самолёте и жми «Поставить».");
            else if (available(state, "crane").length) say("Нажми на светящуюся тяжёлую деталь — кран сам к ней поедет.");
            else say("Нажми «Выйти из крана» и беги к стеллажу.");
          } else if (carried) {
            say("Нажми на прозрачную деталь на самолёте — Марк отнесёт туда свою.");
          } else if (available(state, "crane").length && !available(state, "hands").length) {
            say("Беги к красному пульту крана — он мигает.");
          } else {
            say("Нажми на светящуюся деталь на стеллаже — Марк побежит за ней.");
          }
        }
      }

      // Камера: мягко к тому, что сейчас в руках у ребёнка — Марку или крюку.
      if (craneMode) focus.set(craneState.x, 0, craneState.z);
      else focus.set(walker.pos.x, 0, walker.pos.z);
      const want = camBase.clone().addScaledVector(focus.sub(camBase), 0.5);
      const k = 1 - Math.exp(-dt * 2.2);
      camTarget.lerp(want, k);
      camDist += (camBaseDist * CAM_ZOOM - camDist) * k;
      camera.position.copy(camTarget).addScaledVector(camera.aspect < 1 ? viewDirNarrow : viewDir, camDist);
      camera.lookAt(camTarget);

      if (exhaust?.visible) exhaust.scale.x = 0.85 + Math.random() * 0.3;
      renderer.render(scene, camera);
    };
    loop();

    function buttonGlow(time: number, on: boolean) {
      const cap = crane.button;
      const m = cap.material as THREE.MeshStandardMaterial;
      m.emissive.setHex(0xff2a2a);
      m.emissiveIntensity = on ? 0.4 + 0.4 * Math.sin(time * 5) : 0.08;
      if (pressT < 1) {
        pressT = Math.min(1, pressT + 0.05);
        cap.position.y = crane.buttonY - 0.04 * Math.sin(Math.PI * pressT);
      }
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      cancelSpeech();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m?.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
    // Сцена создаётся один раз на раунд; пропсы читаются в момент старта.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [say]);

  return (
    <main className="mriya-shell">
      <div ref={mountRef} className="mriya-canvas" aria-label="Ангар: Марк, Капитан Папа и самолёт Ан-225 «Мрия»" />

      <header className="mriya-hud">
        <Button variant="outline" onClick={onExit} className="mriya-back">
          <ChevronLeft /> Карта
        </Button>
        <div className="mriya-progress" aria-live="polite">
          <b>Мрия</b>
          <span className="mriya-dots" aria-hidden>
            {Array.from({ length: PIECE_COUNT }, (_, i) => (
              <i key={i} className={i < placed ? "on" : ""} />
            ))}
          </span>
          <span>
            {placed} из {PIECE_COUNT}
          </span>
        </div>
        <span className={`mriya-turn ${control}`}>
          {phase === "play" ? (control === "crane" ? "Марк у крана" : "Марк бегает") : "Ангар"}
        </span>
      </header>

      {phase === "play" && (
        <section className="mriya-bubble" aria-live="polite">
          <button type="button" onClick={() => speakText(lastSpoken.current)} aria-label="Повторить вслух">
            <Volume2 />
          </button>
          <p>
            {holding ? <b>В руках: {holding}. </b> : null}
            {message}
          </p>
        </section>
      )}

      {phase === "play" && counter && (
        <div className="mriya-engines" aria-label={`Двигатели: слева ${counter.left}, справа ${counter.right}`}>
          <span>Двигатели</span>
          <div>
            <em>{"●".repeat(counter.left)}<s>{"○".repeat(3 - counter.left)}</s></em>
            <small>левое</small>
          </div>
          <div>
            <em>{"●".repeat(counter.right)}<s>{"○".repeat(3 - counter.right)}</s></em>
            <small>правое</small>
          </div>
        </div>
      )}

      {phase === "play" && <Joystick stickRef={stickRef} />}

      {phase === "play" && control === "crane" && craneUi && !question && (
        <section className="mriya-crane" aria-label="Пульт крана">
          <button
            type="button"
            className={`mriya-crane-go${craneUi.ready ? " ready" : ""}`}
            disabled={craneUi.busy}
            onClick={() => craneActionRef.current()}
          >
            <ArrowDownToLine /> {craneUi.label}
          </button>
          <button type="button" className="mriya-crane-exit" disabled={craneUi.busy} onClick={() => exitCraneRef.current()}>
            <LogOut /> Выйти из крана
          </button>
        </section>
      )}

      {question && (
        <section className="mriya-question" role="dialog" aria-label="Вопрос на счёт">
          <p>{question.text}</p>
          <div>
            {question.options.map((n) => (
              <button key={n} type="button" disabled={question.locked} onClick={() => answerRef.current(n)}>
                {n}
              </button>
            ))}
          </div>
        </section>
      )}

      {(phase === "intro" || phase === "loading") && (
        <section className="mriya-card">
          <span className="mriya-eyebrow">ИГРОВОЙ ЭПИЗОД 03</span>
          <h1>Собери «Мрию» вместе с Марком</h1>
          <p>
            Самый большой самолёт в мире: шесть двигателей, двойной хвост и космический корабль
            на спине. Ты водишь Марка и собираешь всё сам: лёгкие детали носишь в руках,
            тяжёлые ставишь краном. Капитан Папа подсказывает.
          </p>
          <Button size="lg" disabled={phase === "loading"} onClick={() => startRef.current()}>
            {phase === "loading" ? "Марк бежит в ангар…" : "Начать"}
          </Button>
        </section>
      )}

      {phase === "done" && (
        <section className="mriya-card">
          <span className="mriya-eyebrow">МРИЯ СОБРАНА</span>
          <h1>Марк сам собрал «Мрию»!</h1>
          {rewardAvailable && (
            <p className="mriya-reward">
              <Star /> +3 звезды
            </p>
          )}
          <div className="mriya-actions">
            <Button size="lg" onClick={onRestart} variant="outline">
              <RotateCcw /> Собрать ещё раз
            </Button>
            <Button size="lg" onClick={onExit}>
              На карту
            </Button>
          </div>
        </section>
      )}
    </main>
  );
}

/** Экранный джойстик: тянешь кружок — Марк бежит. Работает пальцем и мышью. */
function Joystick({ stickRef }: { stickRef: RefObject<{ x: number; y: number }> }) {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef<number | null>(null);
  const R = 46;
  const update = (e: { clientX: number; clientY: number }) => {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    let dx = e.clientX - (rect.left + rect.width / 2);
    let dy = e.clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    setKnob({ x: dx, y: dy });
    stickRef.current = { x: dx / R, y: -dy / R };
  };
  const end = () => {
    active.current = null;
    setKnob({ x: 0, y: 0 });
    stickRef.current = { x: 0, y: 0 };
  };
  return (
    <div
      ref={baseRef}
      className="mriya-stick"
      role="application"
      aria-label="Джойстик: веди Марка"
      onPointerDown={(e) => {
        active.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => {
        if (active.current === e.pointerId) update(e);
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <i style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

function numberBadge(n: number): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d");
  if (g) {
    g.fillStyle = "#f2a83b";
    g.beginPath();
    g.arc(64, 64, 58, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 8;
    g.strokeStyle = "#ffffff";
    g.stroke();
    g.fillStyle = "#ffffff";
    g.font = "900 78px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(n), 64, 70);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.setScalar(0.55);
  sprite.renderOrder = 10;
  return sprite;
}

/** Кран-балка под потолком: мост ездит вдоль ангара, тележка — поперёк. */
function buildCrane(scene: THREE.Scene) {
  const yellow = new THREE.MeshStandardMaterial({ color: 0xf2b430, roughness: 0.55, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3b4350, roughness: 0.6, metalness: 0.3 });
  // Рельс только у задней стены: передний перекрывал бы кадр.
  const rail = new THREE.Mesh(new THREE.BoxGeometry(18.6, 0.2, 0.24), dark);
  rail.position.set(0, CRANE_TOP + 0.15, -7.35);
  scene.add(rail);
  const bridge = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 13.1), yellow);
  beam.position.set(0, CRANE_TOP, -0.85);
  beam.castShadow = true;
  bridge.add(beam);
  scene.add(bridge);
  const trolley = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.28, 0.5), dark);
  body.position.y = CRANE_TOP - 0.24;
  trolley.add(body);
  bridge.add(trolley);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 6), dark);
  trolley.add(cable);
  const hook = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.24), yellow);
  hook.castShadow = true;
  trolley.add(hook);

  // Пульт крана у Капитана Папы и большая красная кнопка для Марка.
  const desk = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.95, 0.6), dark);
  desk.position.set(CONSOLE.x, 0.475, CONSOLE.z);
  desk.castShadow = true;
  scene.add(desk);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 0.35), new THREE.MeshStandardMaterial({ color: 0x2f6fe4, emissive: 0x2f6fe4, emissiveIntensity: 0.4 }));
  screen.position.set(CONSOLE.x, 0.97, CONSOLE.z);
  scene.add(screen);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.62, 20), dark);
  post.position.set(BUTTON.x, 0.31, BUTTON.z);
  post.castShadow = true;
  post.userData.button = true;
  scene.add(post);
  const buttonY = 0.68;
  const button = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 0.1, 24),
    new THREE.MeshStandardMaterial({ color: 0xe23b3b, roughness: 0.35 }),
  );
  button.position.set(BUTTON.x, buttonY, BUTTON.z);
  button.userData.button = true;
  scene.add(button);
  return { bridge, trolley, cable, hook, button, buttonY };
}

/** Большой ангар: пол с разметкой, стены, широкие ворота, лампы. */
function buildHangar(scene: THREE.Scene) {
  // Пол тянется и за открытую переднюю сторону ангара — до края кадра.
  // Снаружи за стенами — бетон, чтобы в углах кадра не было пустого неба.
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(70, 50), new THREE.MeshStandardMaterial({ color: 0xa9adb0, roughness: 1 }));
  outside.rotation.x = -Math.PI / 2;
  outside.position.set(0, -0.02, 6);
  scene.add(outside);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(19, 26),
    new THREE.MeshStandardMaterial({ color: 0xcfc8ba, roughness: 0.9 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = 5.4;
  floor.receiveShadow = true;
  scene.add(floor);

  const paint = (w: number, d: number, x: number, z: number, color = 0xf2c230) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.004, z);
    m.receiveShadow = true;
    scene.add(m);
  };
  // Площадка сборки и дорожка к воротам.
  paint(7.4, 0.08, 0, 3.75);
  paint(7.4, 0.08, 0, -3.75);
  paint(0.08, 7.5, -3.7, 0);
  paint(0.08, 7.5, 3.7, 0);
  paint(0.14, 3.2, 0, -5.9, 0xffffff);
  // Синяя линия перед стеллажом.
  paint(8.8, 0.06, 0, RACK_Z - 0.55, 0x2f6fe4);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xebe2cf, roughness: 0.95 });
  const bandMat = new THREE.MeshStandardMaterial({ color: 0x2f6fe4, roughness: 0.8 });
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    b.receiveShadow = true;
    scene.add(b);
    return b;
  };
  const backZ = -7.6;
  const gate = 4.4;
  const half = 9.5;
  box(half - gate, 6.4, 0.3, -(gate + (half - gate) / 2), 3.2, backZ, wallMat);
  box(half - gate, 6.4, 0.3, gate + (half - gate) / 2, 3.2, backZ, wallMat);
  box(gate * 2, 1.6, 0.3, 0, 5.6, backZ, wallMat);
  box(half - gate, 0.8, 0.32, -(gate + (half - gate) / 2), 0.4, backZ, bandMat);
  box(half - gate, 0.8, 0.32, gate + (half - gate) / 2, 0.4, backZ, bandMat);
  for (const x of [-half, half]) {
    box(0.3, 6.4, 15, x, 3.2, -0.4, wallMat);
    box(0.32, 0.8, 15, x, 0.4, -0.4, bandMat);
  }
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x8796a8, roughness: 0.6, metalness: 0.3 });
  box(1.4, 4.6, 0.12, -gate - 0.7, 2.3, backZ + 0.24, doorMat);
  box(1.4, 4.6, 0.12, gate + 0.7, 2.3, backZ + 0.24, doorMat);

  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 192;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#10243e";
    ctx.fillRect(0, 0, 1024, 192);
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 110px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("АЭРОМАРК", 512, 100);
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.68), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas) }));
  (sign.material as THREE.MeshBasicMaterial).map!.colorSpace = THREE.SRGBColorSpace;
  sign.position.set(0, 5.6, backZ + 0.17);
  scene.add(sign);

  const apron = new THREE.Mesh(new THREE.PlaneGeometry(60, 50), new THREE.MeshStandardMaterial({ color: 0xa9adb0, roughness: 1 }));
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(0, -0.01, backZ - 25);
  scene.add(apron);
  for (let i = 0; i < 10; i++) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 1.6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(0, 0, backZ - 2.5 - i * 3.4);
    scene.add(dash);
  }

  const crate = (x: number, z: number, s: number, color: number) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
    b.position.set(x, s / 2, z);
    b.castShadow = true;
    b.receiveShadow = true;
    scene.add(b);
  };
  crate(-8.6, -6.6, 0.8, 0xd9802e);
  crate(8.5, -6.7, 0.7, 0xe2c043);
  crate(8.6, 6.0, 0.6, 0x5a8f4e);
}
