"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ChevronLeft, RotateCcw, Star, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { playMiss, playWin } from "@/lib/celebrate";
import { cancelSpeech, primeVoices, speakText } from "@/lib/speech";
import {
  PIECE_COUNT,
  PIECES,
  isComplete,
  markChoice,
  pieceName,
  pieceSpoken,
  place,
  startPuzzle,
  type PieceId,
  type PuzzleState,
  type Turn,
} from "@/lib/su57/puzzle";
import { buildAfterburners, buildStand, pieceMesh, piecesFromModel, type PieceMesh } from "./plane";
import "./su57.css";

type Props = {
  onExit: () => void;
  /** Самолёт собран и улетел: здесь страница начисляет награду. */
  onWin: () => void;
  /** Награда за первую победу ещё не получена. */
  rewardAvailable: boolean;
};

/** Каждый новый раунд — новая сцена: так проще и надёжнее, чем откатывать её. */
export default function Su57Puzzle(props: Props) {
  const [round, setRound] = useState(0);
  return (
    <Su57Round
      key={round}
      {...props}
      autoStart={round > 0}
      onRestart={() => setRound((r) => r + 1)}
    />
  );
}

type RoundProps = Props & { autoStart: boolean; onRestart: () => void };

type Phase = "intro" | "loading" | "play" | "done";

const MARK_URL = "/models/mark.glb";
const PLANE_URL = "/models/su57.glb";
/** Где Марк ждёт своей очереди в начале. */
const MARK_HOME = new THREE.Vector3(2.3, 0, 1.2);
const SHELF_Z = 1.95;
const GHOST_COLOR = 0x3d8bff;
/** Второй ряд полки на узком экране — на столько дальше первого. */
const SECOND_ROW = 0.95;
const GHOST_OPACITY = 0.34;
const FRONT_LANE = 1.38;
const BACK_LANE = -1.5;
const RIGHT_LANE = 2.05;
const LEFT_LANE = -1.75;
const SHELF_SCALE = 0.62;
const CARRY_SCALE = 0.45;

const PRAISE = ["Отлично!", "Здорово получилось!", "Точно в цель!", "Молодец, пилот!"];
const MARK_SAYS = [
  "Теперь моя очередь!",
  "Смотри, как я поставлю эту деталь!",
  "Моя очередь. Сейчас поставлю!",
];

type Piece = {
  id: PieceId;
  pivot: THREE.Group;
  slot: THREE.Vector3;
  shelf: THREE.Vector3;
  shelfYaw: number;
  shelfScale: number;
  carryScale: number;
  meshes: THREE.Mesh[];
};

type Tween = { t: number; dur: number; step: (k: number) => void; done: () => void };

const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

function Su57Round({ onExit, onWin, rewardAvailable, autoStart, onRestart }: RoundProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [placed, setPlaced] = useState(0);
  const [turn, setTurn] = useState<Turn>("player");
  const [message, setMessage] = useState("Нажми «Начать», и Марк расскажет, что делать.");
  const [selected, setSelected] = useState<string | null>(null);
  const lastSpoken = useRef("");
  const startRef = useRef<() => void>(() => {});

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
    scene.fog = new THREE.Fog(0xcfe6ff, 16, 34);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
    const lookAt = new THREE.Vector3(0, 0.45, 0.25);

    scene.add(new THREE.HemisphereLight(0xfff4e2, 0x5a5040, 1.15));
    const key = new THREE.DirectionalLight(0xffe7c4, 2.4);
    key.position.set(4, 7.5, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -4, near: 1, far: 25 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xbfd6ff, 0.55);
    fill.position.set(-5, 3, 3);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xd6ecff, 1.1);
    rim.position.set(0, 3.5, -7);
    scene.add(rim);

    buildHangar(scene);

    const stand = buildStand();
    scene.add(stand);

    // ---------- детали, гнёзда и полка ----------
    const pieces = new Map<PieceId, Piece>();
    const ghosts = new Map<PieceId, THREE.Group>();
    const ghostMaterial = () =>
      new THREE.MeshBasicMaterial({ color: GHOST_COLOR, transparent: true, opacity: GHOST_OPACITY, depthWrite: false });
    const buildPieces = (source: Map<PieceId, PieceMesh> | null) => {
      const shelfOrder = shuffle(PIECES.map((p) => p.id));
      shelfOrder.forEach((id, index) => {
        const mesh = source?.get(id) ?? pieceMesh(id);
        const pivot = mesh.build();
        const meshes: THREE.Mesh[] = [];
        pivot.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            meshes.push(o as THREE.Mesh);
            o.userData.piece = id;
          }
        });
        const size = new THREE.Box3().setFromObject(pivot).getSize(new THREE.Vector3());
        const longest = Math.max(size.x, size.z, 0.01);
        const shelfScale = Math.min(SHELF_SCALE, 0.74 / longest);
        const carryScale = Math.min(CARRY_SCALE, 0.55 / longest);
        // На узком экране полка в два ряда по четыре, иначе она не помещается.
        const narrow = mount.clientWidth / Math.max(mount.clientHeight, 1) < 1;
        const x = narrow ? -1.2 + (index % 4) * 0.8 : -2.8 + index * 0.8;
        const z = narrow && index >= 4 ? SHELF_Z + SECOND_ROW : SHELF_Z;
        const shelf = new THREE.Vector3(x, 0.12 + (size.y * shelfScale) / 2 + 0.02, z);
        const shelfYaw = id.startsWith("fin") ? 0.5 : id.startsWith("wing") ? -0.2 : -0.6;
        pivot.position.copy(shelf);
        pivot.rotation.y = shelfYaw;
        pivot.scale.setScalar(shelfScale);
        scene.add(pivot);
        pieces.set(id, { id, pivot, slot: mesh.center.clone(), shelf, shelfYaw, shelfScale, carryScale, meshes });

        const pallet = new THREE.Mesh(
          new THREE.BoxGeometry(0.7, 0.1, 0.6),
          new THREE.MeshStandardMaterial({ color: 0xc89a5c, roughness: 0.85 }),
        );
        pallet.position.set(x, 0.05, z);
        pallet.castShadow = true;
        pallet.receiveShadow = true;
        scene.add(pallet);

        const ghost = mesh.build(ghostMaterial());
        ghost.position.copy(mesh.center);
        ghost.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            o.userData.slot = id;
            if (!mesh.dense) {
              const edges = new THREE.LineSegments(
                new THREE.EdgesGeometry((o as THREE.Mesh).geometry, 28),
                new THREE.LineBasicMaterial({ color: 0x2f8fe0, transparent: true, opacity: 0.6 }),
              );
              o.add(edges);
            }
          }
        });
        scene.add(ghost);
        ghosts.set(id, ghost);
      });
    };
    let realPlane = false;
    const planeReady = new Promise<void>((resolve) => {
      new GLTFLoader().load(
        PLANE_URL,
        (gltf) => {
          if (disposed) return resolve();
          const source = piecesFromModel(gltf.scene);
          realPlane = Boolean(source);
          buildPieces(source);
          resolve();
        },
        undefined,
        () => {
          if (!disposed) buildPieces(null);
          resolve();
        },
      );
    });

    let afterburners = buildAfterburners();

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

    // ---------- Марк ----------
    type Mark = {
      root: THREE.Object3D;
      mixer: THREE.AnimationMixer;
      actions: Record<string, THREE.AnimationAction>;
      prop: THREE.Object3D | null;
      current: THREE.AnimationAction | null;
    };
    let mark: Mark | null = null;
    let carried: Piece | null = null;
    const markPos = MARK_HOME.clone();
    // На узком экране Марк ждёт ближе к центру, иначе его не видно.
    if (mount.clientWidth / Math.max(mount.clientHeight, 1) < 1) markPos.x = 1.55;

    const play = (name: string, once = false, fade = 0.25) => {
      if (!mark) return 0;
      const action = mark.actions[name];
      if (!action) return 0;
      action.reset();
      action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = once;
      action.enabled = true;
      action.setEffectiveWeight(1);
      if (mark.current && mark.current !== action) action.crossFadeFrom(mark.current, fade, false);
      action.play();
      mark.current = action;
      return action.getClip().duration;
    };
    const faceTo = (target: THREE.Vector3, dur = 0.25) => {
      if (!mark) return Promise.resolve();
      const from = mark.root.rotation.y;
      const dx = target.x - markPos.x;
      const dz = target.z - markPos.z;
      if (Math.hypot(dx, dz) < 1e-3) return Promise.resolve();
      let to = Math.atan2(dx, dz);
      while (to - from > Math.PI) to -= Math.PI * 2;
      while (to - from < -Math.PI) to += Math.PI * 2;
      return tween(dur, (k) => {
        if (mark) mark.root.rotation.y = from + (to - from) * ease(k);
      });
    };
    const faceDir = (dx: number, dz: number, dur = 0.25) =>
      faceTo(new THREE.Vector3(markPos.x + dx, 0, markPos.z + dz), dur);
    const walkPath = async (points: THREE.Vector3[], anim: string, speed: number) => {
      if (!mark) return;
      play(anim);
      for (const point of points) {
        const from = markPos.clone();
        const len = from.distanceTo(point);
        if (len < 0.02) continue;
        await faceTo(point, 0.18);
        await tween(len / speed, (k) => {
          markPos.lerpVectors(from, point, k);
        });
      }
    };
    /** Обход самолёта: по передней или задней дорожке, между ними — сбоку. */
    const route = (to: THREE.Vector3, start: THREE.Vector3 = markPos): THREE.Vector3[] => {
      const front = (z: number) => z > 1.1;
      const back = (z: number) => z < -1.2;
      const from = start;
      // Между рядами полки заходим сбоку, а не сквозь первый ряд.
      const between = (z: number) => z > SHELF_Z + 0.2;
      if (between(to.z) || between(from.z)) {
        const side = (to.x + from.x >= 0 ? 1 : -1) * 1.85;
        const path = [
          new THREE.Vector3(side, 0, from.z),
          new THREE.Vector3(side, 0, to.z),
          to,
        ];
        if (between(from.z) && !between(to.z)) {
          return [new THREE.Vector3(side, 0, from.z), new THREE.Vector3(side, 0, FRONT_LANE), ...route(to, new THREE.Vector3(side, 0, FRONT_LANE))];
        }
        if (back(from.z)) {
          const lane = from.x + to.x >= 0 ? RIGHT_LANE : LEFT_LANE;
          return [
            new THREE.Vector3(lane, 0, from.z),
            new THREE.Vector3(lane, 0, FRONT_LANE),
            new THREE.Vector3(side, 0, FRONT_LANE),
            new THREE.Vector3(side, 0, to.z),
            to,
          ];
        }
        return path;
      }
      if ((front(from.z) && front(to.z)) || (back(from.z) && back(to.z))) return [to];
      const lane = from.x + to.x >= 0 ? RIGHT_LANE : LEFT_LANE;
      return [new THREE.Vector3(lane, 0, from.z), new THREE.Vector3(lane, 0, to.z), to];
    };

    const loader = new GLTFLoader();
    const markReady = new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, 15000);
      loader.load(
        MARK_URL,
        (gltf) => {
          if (disposed) return;
          const root = gltf.scene;
          root.traverse((o) => {
            if ((o as THREE.Mesh).isMesh) {
              o.castShadow = true;
              o.receiveShadow = true;
              o.frustumCulled = false;
            }
          });
          let prop: THREE.Object3D | null = null;
          root.traverse((o) => {
            if (o.name === "prop") prop = o;
          });
          scene.add(root);
          const mixer = new THREE.AnimationMixer(root);
          const actions: Record<string, THREE.AnimationAction> = {};
          for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
          mark = { root, mixer, actions, prop, current: null };
          root.position.copy(markPos);
          root.rotation.y = Math.atan2(-markPos.x, 3 - markPos.z);
          play("Idle");
          window.clearTimeout(timer);
          resolve();
        },
        undefined,
        () => {
          window.clearTimeout(timer);
          resolve();
        },
      );
    });

    // ---------- состояние игры ----------
    let state: PuzzleState = startPuzzle("player");
    let chosen: Piece | null = null;
    let busy = true;
    let idleTimer = 0;
    const missesOn = new Map<PieceId, number>();

    const setGlow = (piece: Piece, on: boolean) => {
      for (const mesh of piece.meshes) {
        const m = mesh.material as THREE.MeshStandardMaterial;
        if (!m.emissive) continue;
        m.emissive.setHex(on ? 0x2e64ff : 0x000000);
        m.emissiveIntensity = on ? 0.45 : 1;
      }
    };
    const flyTo = (piece: Piece, target: THREE.Vector3, scale: number, yaw: number, dur = 0.7, arc = 0.5) => {
      const from = piece.pivot.position.clone();
      const fromScale = piece.pivot.scale.x;
      const fromQ = piece.pivot.quaternion.clone();
      const toQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
      return tween(dur, (k) => {
        const e = ease(k);
        piece.pivot.position.lerpVectors(from, target, e);
        piece.pivot.position.y += Math.sin(Math.PI * e) * arc;
        piece.pivot.scale.setScalar(fromScale + (scale - fromScale) * e);
        piece.pivot.quaternion.slerpQuaternions(fromQ, toQ, e);
      });
    };
    const settle = (id: PieceId) => {
      const ghost = ghosts.get(id);
      if (ghost) ghost.visible = false;
      setPlaced(state.placed.length);
    };

    const playerTurn = () => {
      busy = false;
      idleTimer = 0;
      setTurn("player");
      setSelected(null);
    };

    const markTurn = async () => {
      busy = true;
      setTurn("mark");
      chosen = null;
      setSelected(null);
      const id = markChoice(state);
      if (!id) return;
      const piece = pieces.get(id)!;
      say(MARK_SAYS[state.placed.length % MARK_SAYS.length] ?? "Теперь моя очередь!");
      await wait(0.4);
      if (mark) {
        const backRow = piece.shelf.z > SHELF_Z + 0.1;
        const pickSpot = new THREE.Vector3(piece.shelf.x, 0, backRow ? piece.shelf.z - 0.48 : FRONT_LANE + 0.08);
        await walkPath(route(pickSpot), "Walk", 1.05);
        play("Idle", false, 0.2);
        await faceDir(0, 1);
        const dur = play("PickUp", true, 0.2);
        say(`Я беру ${pieceSpoken(id)}.`);
        await wait(dur * 0.5);
        carried = piece;
        await wait(dur * 0.5);
        const placeSpot = new THREE.Vector3(
          THREE.MathUtils.clamp(piece.slot.x, LEFT_LANE + 0.3, RIGHT_LANE - 0.3),
          0,
          BACK_LANE,
        );
        await walkPath(route(placeSpot), "CarryWalk", 0.85);
        play("CarryIdle", false, 0.2);
        await faceDir(0, 1);
        const placeDur = play("Place", true, 0.2);
        await wait(placeDur * 0.55);
        carried = null;
        await flyTo(piece, piece.slot, 1, 0, 0.6, 0.25);
      } else {
        // Модель не загрузилась — деталь перелетает сама, игра не встаёт.
        await flyTo(piece, piece.slot, 1, 0, 1.1, 0.9);
      }
      state = place(state, "mark", id, id).state;
      settle(id);
      playWin();
      await wait(0.5);
      if (isComplete(state)) {
        await finale();
        return;
      }
      if (mark) {
        const d = play("Point", true, 0.2);
        say("Твой ход! Выбери деталь на полке.");
        await wait(d * 0.9);
        play("Idle", false, 0.4);
      } else {
        say("Твой ход! Выбери деталь на полке.");
      }
      playerTurn();
    };

    const finale = async () => {
      busy = true;
      setTurn("mark");
      say("Ура! Мы вместе собрали Су-57!");
      if (mark) {
        const d = play("Victory", true, 0.2);
        await wait(d);
        // Отводим Марка с пути самолёта: тот поедет к воротам, то есть к −Z.
        if (Math.abs(markPos.x) < 1.9) {
          await walkPath([new THREE.Vector3(2.5, 0, markPos.z)], "Walk", 1.2);
        }
        play("Idle", false, 0.3);
        await faceTo(new THREE.Vector3(0, 0, markPos.z), 0.3);
      } else {
        await wait(1.5);
      }
      // Самолёт выезжает к воротам и взлетает.
      const planeGroup = new THREE.Group();
      scene.add(planeGroup);
      for (const piece of pieces.values()) planeGroup.attach(piece.pivot);
      if (realPlane) afterburners = buildAfterburners(0.46, -1.24);
      planeGroup.add(afterburners);
      say("Су-57 готов к полёту. Взлетаем!");
      const start = planeGroup.position.clone();
      if (!reducedMotion) {
        await tween(1.4, (k) => {
          planeGroup.rotation.y = (Math.PI / 2) * ease(k);
          planeGroup.position.z = start.z - 0.6 * ease(k);
          planeGroup.position.y = 0.05 * Math.sin(k * Math.PI);
        });
        await tween(2.6, (k) => {
          const a = k * k;
          planeGroup.position.z = start.z - 0.6 - a * 16;
          planeGroup.position.y = Math.max(0, (k - 0.35) / 0.65) ** 2 * 4.5;
          planeGroup.rotation.z = Math.min(1, k * 1.6) * 0.18;
        });
      }
      if (mark) play("Wave", false, 0.3);
      onWin();
      setPhase("done");
      say(
        rewardAvailable
          ? "Самолёт улетел! За сборку ты получаешь три звезды."
          : "Самолёт улетел! Можно собрать ещё раз.",
      );
    };

    // ---------- ввод ----------
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const hit = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const targets: THREE.Object3D[] = [];
      for (const piece of pieces.values()) if (!state.placed.includes(piece.id) && piece !== carried) targets.push(...piece.meshes);
      for (const [id, ghost] of ghosts) if (!state.placed.includes(id)) ghost.traverse((o) => (o as THREE.Mesh).isMesh && targets.push(o));
      const first = raycaster.intersectObjects(targets, false)[0];
      if (!first) return null;
      const data = first.object.userData as { piece?: PieceId; slot?: PieceId };
      return data;
    };

    const onPointerMove = (event: PointerEvent) => {
      const data = busy ? null : hit(event);
      renderer.domElement.style.cursor = data ? "pointer" : "default";
    };

    const onPointerDown = (event: PointerEvent) => {
      if (busy || state.turn !== "player") return;
      const data = hit(event);
      if (data) void choose(data);
    };

    const choose = async (data: { piece?: PieceId; slot?: PieceId }) => {
      if (busy || state.turn !== "player") return;
      idleTimer = 0;
      if (data.piece) {
        if (chosen) {
          setGlow(chosen, false);
          void flyTo(chosen, chosen.shelf, chosen.shelfScale, chosen.shelfYaw, 0.25, 0);
        }
        chosen = pieces.get(data.piece)!;
        setGlow(chosen, true);
        setSelected(pieceName(chosen.id));
        void flyTo(chosen, chosen.shelf.clone().add(new THREE.Vector3(0, 0.22, 0)), chosen.shelfScale * 1.08, chosen.shelfYaw, 0.25, 0);
        say(`Это ${pieceSpoken(chosen.id)}. Нажми на место, где ему быть.`);
        return;
      }
      if (!data.slot) return;
      if (!chosen) {
        say("Сначала выбери деталь на полке.");
        return;
      }
      const piece = chosen;
      const result = place(state, "player", piece.id, data.slot);
      state = result.state;
      if (!result.ok) {
        playMiss();
        flashGhost(data.slot);
        const misses = (missesOn.get(piece.id) ?? 0) + 1;
        missesOn.set(piece.id, misses);
        if (misses >= 2) {
          pulseGhost(piece.id);
          say("Подсказка: нужное место мигает.");
        } else {
          say("Не сюда. Посмотри на форму детали и попробуй ещё.");
        }
        return;
      }
      busy = true;
      chosen = null;
      setGlow(piece, false);
      setSelected(null);
      await flyTo(piece, piece.slot, 1, 0, 0.75, 0.6);
      settle(piece.id);
      playWin();
      say(PRAISE[Math.floor(Math.random() * PRAISE.length)] ?? "Отлично!");
      if (isComplete(state)) {
        await finale();
        return;
      }
      await wait(1.2);
      await markTurn();
    };

    const flashGhost = (id: PieceId) => {
      const ghost = ghosts.get(id);
      if (!ghost) return;
      ghost.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
        if (m && (o as THREE.Mesh).isMesh) m.color.setHex(0xff6b6b);
      });
      void wait(0.45).then(() =>
        ghost.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
          if (m && (o as THREE.Mesh).isMesh) m.color.setHex(GHOST_COLOR);
        }),
      );
    };
    const pulsing = new Set<PieceId>();
    const pulseGhost = (id: PieceId) => pulsing.add(id);

    if (process.env.NODE_ENV !== "production") {
      // Для автотестов: те же действия, что и нажатия по сцене.
      (window as unknown as { __su57?: unknown }).__su57 = {
        pick: (id: PieceId) => choose({ piece: id }),
        drop: (id: PieceId) => choose({ slot: id }),
        state: () => state,
        busy: () => busy,
      };
    }
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);

    // ---------- старт и перезапуск ----------
    startRef.current = async () => {
      setPhase("loading");
      await Promise.all([markReady, planeReady]);
      if (disposed) return;
      setPhase("play");
      if (mark) {
        await faceTo(new THREE.Vector3(0.5, 0, 5), 0.2);
        const d = play("Wave", true, 0.2);
        say("Привет! Я Марк. Давай вместе соберём самолёт Су-57. Ходим по очереди: деталь берёшь ты, потом я. Начинай!");
        await wait(Math.max(d, 1.5));
        play("Point", true, 0.3);
        await wait(1.2);
        play("Idle", false, 0.4);
      } else {
        say("Давай вместе соберём самолёт Су-57. Ходим по очереди. Начинай: выбери деталь на полке.");
      }
      playerTurn();
    };
    if (autoStart) void startRef.current();

    // ---------- цикл ----------
    const resize = () => {
      const w = mount.clientWidth;
      const h = Math.max(mount.clientHeight, 1);
      renderer.setSize(w, h);
      const aspect = w / h;
      camera.aspect = aspect;
      camera.fov = aspect < 1 ? 62 : aspect < 1.4 ? 50 : 42;
      const dist = aspect < 1 ? 8.4 : aspect < 1.4 ? 7.8 : 6.7;
      lookAt.set(0, aspect < 1 ? 0.3 : 0.45, aspect < 1 ? 0.9 : 0.25);
      camera.position.set(0.2, dist * 0.46, lookAt.z + dist * 0.88);
      camera.lookAt(lookAt);
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    const clock = new THREE.Clock();
    const propPos = new THREE.Vector3();
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const testSpeed =
        process.env.NODE_ENV !== "production"
          ? ((window as unknown as { __su57Speed?: number }).__su57Speed ?? 1)
          : 1;
      const dt = Math.min(clock.getDelta(), 0.05) * testSpeed;
      const time = clock.elapsedTime;
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
      if (mark) {
        mark.root.position.copy(markPos);
        mark.mixer.update(dt);
        if (carried && mark.prop) {
          mark.root.updateMatrixWorld(true);
          mark.prop.getWorldPosition(propPos);
          carried.pivot.position.copy(propPos).add(new THREE.Vector3(0, 0.05, 0));
          carried.pivot.quaternion.copy(mark.root.quaternion);
          carried.pivot.scale.setScalar(carried.carryScale);
        }
      }
      for (const [id, ghost] of ghosts) {
        const glow = pulsing.has(id) && !state.placed.includes(id);
        ghost.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
          if (!m || !(o as THREE.Mesh).isMesh) return;
          // Пока деталь в руке, все свободные места мягко «дышат» — видно, куда можно ставить.
          const wave = 0.5 + 0.5 * Math.sin(time * (glow ? 6 : 2.5));
          m.opacity = glow ? 0.3 + 0.4 * wave : chosen ? GHOST_OPACITY + 0.14 * wave : GHOST_OPACITY;
        });
      }
      if (!busy && state.turn === "player") {
        idleTimer += dt;
        if (idleTimer > 14) {
          idleTimer = 0;
          say(chosen ? "Нажми на прозрачное место на самолёте, куда подходит деталь." : "Выбери любую деталь на полке.");
        }
        if (!chosen && !reducedMotion) {
          for (const piece of pieces.values()) {
            if (state.placed.includes(piece.id)) continue;
            piece.pivot.position.y = piece.shelf.y + Math.max(0, Math.sin(time * 3 + piece.shelf.x)) * 0.03;
          }
        }
      }
      if (afterburners.parent) {
        afterburners.scale.x = 0.85 + Math.random() * 0.3;
      }
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      cancelSpeech();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
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
    <main className="su57-shell">
      <div ref={mountRef} className="su57-canvas" aria-label="Ангар: Марк и самолёт Су-57" />

      <header className="su57-hud">
        <Button variant="outline" onClick={onExit} className="su57-back">
          <ChevronLeft /> Карта
        </Button>
        <div className="su57-progress" aria-live="polite">
          <b>Су-57</b>
          <span className="su57-dots" aria-hidden>
            {Array.from({ length: PIECE_COUNT }, (_, i) => (
              <i key={i} className={i < placed ? "on" : ""} />
            ))}
          </span>
          <span>
            {placed} из {PIECE_COUNT}
          </span>
        </div>
        <span className={`su57-turn ${turn}`}>{phase === "play" ? (turn === "player" ? "Твой ход" : "Ходит Марк") : "Ангар"}</span>
      </header>

      {phase === "play" && (
        <section className="su57-bubble" aria-live="polite">
          <button type="button" onClick={() => speakText(lastSpoken.current)} aria-label="Повторить вслух">
            <Volume2 />
          </button>
          <p>
            {selected && turn === "player" ? <b>{selected}. </b> : null}
            {message}
          </p>
        </section>
      )}

      {(phase === "intro" || phase === "loading") && (
        <section className="su57-card">
          <span className="su57-eyebrow">ИГРОВОЙ ЭПИЗОД 02</span>
          <h1>Собери Су-57 вместе с Марком</h1>
          <p>
            В ангаре лежат восемь деталей самолёта. Ходите по очереди: ты выбираешь деталь на
            полке и нажимаешь на её место на самолёте, потом свою деталь ставит Марк.
          </p>
          <Button size="lg" disabled={phase === "loading"} onClick={() => startRef.current()}>
            {phase === "loading" ? "Марк идёт в ангар…" : "Начать"}
          </Button>
        </section>
      )}

      {phase === "done" && (
        <section className="su57-card">
          <span className="su57-eyebrow">СУ-57 СОБРАН</span>
          <h1>Вы с Марком собрали самолёт!</h1>
          {rewardAvailable && (
            <p className="su57-reward">
              <Star /> +3 звезды
            </p>
          )}
          <div className="su57-actions">
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

/** Ангар: пол с разметкой, стены, ворота в сторону полосы, лампы. */
function buildHangar(scene: THREE.Scene) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 14),
    new THREE.MeshStandardMaterial({ color: 0xcfc8ba, roughness: 0.9 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -0.5;
  floor.receiveShadow = true;
  scene.add(floor);

  const paint = (w: number, d: number, x: number, z: number, color = 0xf2c230) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.004, z);
    m.receiveShadow = true;
    scene.add(m);
  };
  // Осевая линия руления от площадки к воротам.
  paint(0.12, 6, 0, -3.6);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.7, 1.8, 64),
    new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.7 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.004;
  scene.add(ring);
  paint(6.6, 0.06, 0, SHELF_Z - 0.4, 0x2f6fe4);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xebe2cf, roughness: 0.95 });
  const bandMat = new THREE.MeshStandardMaterial({ color: 0x2f6fe4, roughness: 0.8 });
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    b.receiveShadow = true;
    scene.add(b);
    return b;
  };
  const backZ = -4.5;
  const gate = 2.8;
  // Задняя стена с проёмом ворот.
  box(9 - gate, 5.5, 0.3, -(gate + (9 - gate) / 2), 2.75, backZ, wallMat);
  box(9 - gate, 5.5, 0.3, gate + (9 - gate) / 2, 2.75, backZ, wallMat);
  box(gate * 2, 1.9, 0.3, 0, 4.55, backZ, wallMat);
  box(9 - gate, 0.8, 0.32, -(gate + (9 - gate) / 2), 0.4, backZ, bandMat);
  box(9 - gate, 0.8, 0.32, gate + (9 - gate) / 2, 0.4, backZ, bandMat);
  // Боковые стены.
  for (const x of [-9, 9]) {
    box(0.3, 5.5, 14, x, 2.75, -0.5, wallMat);
    box(0.32, 0.8, 14, x, 0.4, -0.5, bandMat);
  }
  // Створки ворот, откатанные в стороны.
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x8796a8, roughness: 0.6, metalness: 0.3 });
  box(1.2, 3.6, 0.12, -gate - 0.6, 1.8, backZ + 0.22, doorMat);
  box(1.2, 3.6, 0.12, gate + 0.6, 1.8, backZ + 0.22, doorMat);

  // Вывеска.
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
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 0.64),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas) }),
  );
  (sign.material as THREE.MeshBasicMaterial).map!.colorSpace = THREE.SRGBColorSpace;
  sign.position.set(0, 4.45, backZ + 0.17);
  scene.add(sign);

  // Снаружи: бетон полосы и небо.
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 30),
    new THREE.MeshStandardMaterial({ color: 0xa9adb0, roughness: 1 }),
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(0, -0.01, backZ - 15);
  scene.add(apron);
  for (let i = 0; i < 8; i++) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 1.4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(0, 0.0, backZ - 2 - i * 3);
    scene.add(dash);
  }

  // Лампы под потолком.
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff3d6 });
  for (const x of [-4, 0, 4]) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 0.18, 24), lampMat);
    lamp.position.set(x, 5.2, -0.8);
    scene.add(lamp);
  }

  // Ящики с инструментом у стен — для уюта и масштаба.
  const crate = (x: number, z: number, s: number, color: number) => {
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(s, s, s),
      new THREE.MeshStandardMaterial({ color, roughness: 0.8 }),
    );
    b.position.set(x, s / 2, z);
    b.castShadow = true;
    b.receiveShadow = true;
    scene.add(b);
  };
  crate(-6.5, -3.4, 0.9, 0xd9802e);
  crate(-5.5, -3.6, 0.6, 0x2f6fe4);
  crate(6.2, -3.3, 1, 0xd9802e);
  crate(5.2, -3.6, 0.55, 0xe2c043);
  crate(-7.2, 1.2, 0.7, 0x5a8f4e);
}
