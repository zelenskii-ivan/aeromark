import * as T from "three";
import { PARTS, SPAWNS, availableParts, initialAssembly, installPart, within, PICKUP_DISTANCE, ASSEMBLY_DISTANCE, type Assembly } from "../../lib/play-mark/state";
import { airfield, markModel, partModel } from "./models";

export type Hud = { carrying: string; action: string; canAct: boolean; flying: boolean; finished: boolean };
export function createAirfield(mount: HTMLDivElement, onHud: (hud: Hud) => void, onInstall: (id: string) => void, onFlown: () => void, onError: () => void) {
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  mount.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-label", "Трёхмерный аэродром Марка");
  const scene = new T.Scene(); scene.background = new T.Color(0xc5e3df); scene.fog = new T.Fog(0xc5e3df, 35, 85);
  scene.add(new T.HemisphereLight(0xfff4da, 0x456e65, 2.7));
  const sun = new T.DirectionalLight(0xfff2d7, 3); sun.position.set(-12, 25, 12); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -25; sun.shadow.camera.right = 25; sun.shadow.camera.top = 25; sun.shadow.camera.bottom = -25; scene.add(sun);
  airfield(scene);
  const camera = new T.PerspectiveCamera(48, 1, .1, 150);
  const plane = new T.Group(); scene.add(plane);
  const mark = markModel(); mark.root.position.set(0, 0, 8); scene.add(mark.root);
  const parts = new Map(PARTS.map(p => [p.id, partModel(p)]));
  const pads: T.Mesh[] = [];
  for (const pos of SPAWNS) {
    const pad = new T.Mesh(new T.CylinderGeometry(1.1, 1.1, .06, 32), new T.MeshStandardMaterial({ color: 0xeadab4 }));
    pad.position.set(pos[0], .04, pos[2]); pad.receiveShadow = true; scene.add(pad); pads.push(pad);
  }
  const ring = new T.Mesh(new T.RingGeometry(4.6, 4.8, 64), new T.MeshBasicMaterial({ color: 0xfaf0bf, side: T.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = .08; scene.add(ring);
  const target = new T.Mesh(new T.SphereGeometry(.35, 12, 8), new T.MeshBasicMaterial({ color: 0xffe999, wireframe: true })); scene.add(target); target.visible = false;
  const sparkle = new T.Group(); scene.add(sparkle); sparkle.visible = false;
  for (let i = 0; i < 16; i++) {
    const m = new T.Mesh(new T.OctahedronGeometry(.1), new T.MeshBasicMaterial({ color: i % 2 ? 0xffd45b : 0xffffff })); sparkle.add(m);
  }
  let state: Assembly = initialAssembly;
  let carried: string | null = null, nearest: string | null = null;
  let flying = false, finished = false, paused = false, time = 0, flightTime = 0, snapTime = -10, raf = 0, last = performance.now(), hudKey = "";
  let velocityY = 0;
  const keys = new Set<string>();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wantedCamera = new T.Vector3(), look = new T.Vector3();
  const spawnOf = (id: string) => SPAWNS[PARTS.findIndex(p => p.id === id) % 5]!;
  function reconcile(next: Assembly) {
    state = next;
    if (carried && !availableParts(state).some(p => p.id === carried)) carried = null;
    for (const p of PARTS) {
      const model = parts.get(p.id)!;
      model.removeFromParent(); model.rotation.set(0, 0, 0); model.scale.setScalar(1);
      if (state.installed.includes(p.id)) { plane.add(model); model.position.set(...p.at); }
      else if (p.id === carried) { mark.hands.add(model); model.position.set(0, 0, 0); model.scale.setScalar(.5); }
      else if (availableParts(state).some(v => v.id === p.id)) {
        scene.add(model); const pos = spawnOf(p.id); model.position.set(pos[0], .9, pos[2]); model.scale.setScalar(.65);
      }
    }
    pads.forEach((pad, i) => { pad.visible = availableParts(state).some(p => PARTS.indexOf(p) % 5 === i && p.id !== carried); });
  }
  function act() {
    if (paused || flying || finished) return;
    if (state.installed.length === 20) { startFlight(); return; }
    if (carried) {
      if (!within(mark.root.position.x, mark.root.position.z, 0, 0, ASSEMBLY_DISTANCE)) return;
      const id = carried; carried = null;
      reconcile(installPart(state, id)); snapTime = time;
      sparkle.position.copy(parts.get(id)!.position); sparkle.visible = true;
      onInstall(id);
    } else if (nearest) {
      carried = nearest; nearest = null; reconcile(state);
    }
  }
  function startFlight() {
    if (state.installed.length !== 20 || flying) return;
    keys.clear(); flying = true; finished = false; flightTime = 0;
    plane.add(mark.root); mark.root.position.set(0, 1.8, -.5); mark.root.rotation.set(0, 0, 0); mark.root.scale.setScalar(.43);
  }
  function drop() { if (carried && !flying) { carried = null; reconcile(state); } }
  function clearKeys() { keys.clear(); }
  const codes = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "KeyE", "KeyQ", "ShiftLeft", "ShiftRight"]);
  function keydown(e: KeyboardEvent) {
    if (!codes.has(e.code) || (e.target instanceof HTMLElement && e.target.closest("input,textarea,select"))) return;
    if (e.code === "Space" && e.target instanceof HTMLElement && e.target.closest("button")) return;
    e.preventDefault(); keys.add(e.code);
    if (!e.repeat && e.code === "KeyE") act();
    if (!e.repeat && e.code === "KeyQ") drop();
  }
  function keyup(e: KeyboardEvent) { keys.delete(e.code); }
  function visibility() { clearKeys(); last = performance.now(); }
  function contextLost(e: Event) { e.preventDefault(); paused = true; clearKeys(); onError(); }
  window.addEventListener("keydown", keydown); window.addEventListener("keyup", keyup); window.addEventListener("blur", clearKeys);
  document.addEventListener("visibilitychange", visibility); renderer.domElement.addEventListener("webglcontextlost", contextLost);
  const resize = new ResizeObserver(() => { const w = mount.clientWidth, h = Math.max(1, mount.clientHeight); renderer.setSize(w, h); camera.aspect = w / h; camera.fov = w < h ? 76 : 48; camera.updateProjectionMatrix(); }); resize.observe(mount);
  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, .05); last = now;
    if (document.hidden || paused) return;
    time += dt;
    if (flying) {
      flightTime += dt;
      const t = flightTime;
      if (t < 3) { plane.position.set(17 * t / 3, 0, 0); }
      else if (t < 7) { plane.position.set(17, Math.max(0, t - 5) * 1.4, -(t - 3) * (t - 3) * 1.1); plane.rotation.x = -.12 * Math.min(1, t - 5); }
      else {
        const a = Math.min((t - 7) / 8, 1) * Math.PI * 2;
        plane.position.set(1 + 16 * Math.cos(a), 5 + Math.sin(a / 2) * 3, -17.6 - 16 * Math.sin(a));
        plane.rotation.set(0, -a, -.15 * Math.sin(a / 2));
      }
      parts.get("propeller")!.rotation.z += dt * 28;
      mark.pose(time, false, false, true);
      wantedCamera.copy(plane.position).add(new T.Vector3(11, 8, 14)); look.copy(plane.position);
      if (t >= 15) { flying = false; finished = true; onFlown(); }
    } else if (!finished) {
      const dx = Number(keys.has("KeyD") || keys.has("ArrowRight")) - Number(keys.has("KeyA") || keys.has("ArrowLeft"));
      const dz = Number(keys.has("KeyS") || keys.has("ArrowDown")) - Number(keys.has("KeyW") || keys.has("ArrowUp"));
      const length = Math.hypot(dx, dz); const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 6 : 4;
      if (length) {
        mark.root.position.x = T.MathUtils.clamp(mark.root.position.x + dx / length * dt * speed, -11, 10);
        mark.root.position.z = T.MathUtils.clamp(mark.root.position.z + dz / length * dt * speed, -9, 11);
        mark.root.rotation.y = Math.atan2(-dx, -dz);
      }
      if (keys.has("Space") && mark.root.position.y === 0) { velocityY = 5; keys.delete("Space"); }
      velocityY -= 14 * dt; mark.root.position.y = Math.max(0, mark.root.position.y + velocityY * dt);
      if (mark.root.position.y === 0) velocityY = 0;
      mark.pose(time, length > 0, carried !== null);
      nearest = null; let distance = PICKUP_DISTANCE;
      for (const p of availableParts(state)) {
        if (p.id === carried) continue;
        const pos = spawnOf(p.id), model = parts.get(p.id)!;
        model.position.y = .95 + (reduced ? 0 : Math.sin(time * 2 + PARTS.indexOf(p)) * .12);
        const d = Math.hypot(mark.root.position.x - pos[0], mark.root.position.z - pos[2]);
        if (d <= distance) { nearest = p.id; distance = d; }
      }
      wantedCamera.set(mark.root.position.x * .3, 16, 22 + mark.root.position.z * .25);
      look.set(mark.root.position.x * .35, .8, mark.root.position.z * .35);
    }
    const canInstall = !!carried && within(mark.root.position.x, mark.root.position.z, 0, 0, ASSEMBLY_DISTANCE);
    target.visible = !!carried && !flying && !finished;
    if (carried) { const p = PARTS.find(p => p.id === carried)!; target.position.set(...p.at); target.rotation.y += dt; }
    ring.material.color.setHex(carried ? 0xffd361 : 0xfaf0bf);
    const snapAge = time - snapTime;
    if (snapAge < .8) {
      sparkle.children.forEach((m, i) => { const a = i / 16 * Math.PI * 2; m.position.set(Math.cos(a) * snapAge * 2, Math.sin(a * 3) * snapAge + snapAge, Math.sin(a) * snapAge * 2); m.scale.setScalar(1 - snapAge / .8); });
    } else sparkle.visible = false;
    camera.position.lerp(wantedCamera, reduced ? 1 : 1 - Math.exp(-dt * 5)); camera.lookAt(look);
    const action = flying ? "В полёте" : finished ? "Полёт завершён" : state.installed.length === 20 ? "Взлетаем!" : carried ? canInstall ? "Установить" : "К самолёту" : nearest ? "Поднять" : "Найди деталь";
    const hud: Hud = { carrying: carried ? PARTS.find(p => p.id === carried)!.name : "", action, canAct: !flying && !finished && (state.installed.length === 20 || canInstall || !!nearest), flying, finished };
    const key = JSON.stringify(hud); if (key !== hudKey) { hudKey = key; onHud(hud); }
    renderer.render(scene, camera);
  }
  camera.position.set(0, 16, 24); reconcile(state); raf = requestAnimationFrame(frame);
  return {
    setState: reconcile, act, drop,
    setPaused(value: boolean) { paused = value; clearKeys(); },
    control(code: string, down: boolean) { if (down) keys.add(code); else keys.delete(code); },
    replay() { plane.position.set(0, 0, 0); plane.rotation.set(0, 0, 0); startFlight(); },
    dispose() {
      cancelAnimationFrame(raf); resize.disconnect();
      window.removeEventListener("keydown", keydown); window.removeEventListener("keyup", keyup); window.removeEventListener("blur", clearKeys);
      document.removeEventListener("visibilitychange", visibility); renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      const geometries = new Set<T.BufferGeometry>(), materials = new Set<T.Material>();
      // Includes unspawned pieces, which may not currently belong to the scene.
      for (const root of [scene, ...parts.values()]) root.traverse(obj => { if (obj instanceof T.Mesh) { geometries.add(obj.geometry); (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => materials.add(m)); } });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); renderer.dispose(); renderer.domElement.remove();
    },
  };
}
