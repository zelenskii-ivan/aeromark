"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronsUp,
  Plane,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  GRAVITY,
  JUMP_VELOCITY,
  OBSTACLES,
  PART_BOB,
  PART_POSITIONS,
  PICKUP_RADIUS,
  PLAYER_CENTER_OFFSET,
  PLAYER_RADIUS,
  TOP_TOLERANCE,
} from "./layout";
import "./game.css";

type Props = { onExit: () => void; onComplete: () => void };

/**
 * Управление хранится по event.code, а не по event.key: на русской раскладке
 * WASD приходит как «цф ыв», и по key игра просто не отвечала.
 */
type Control = "forward" | "back" | "left" | "right" | "jump";

const CONTROL_BY_CODE: Record<string, Control> = {
  ArrowUp: "forward",
  KeyW: "forward",
  ArrowDown: "back",
  KeyS: "back",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  Space: "jump",
};



export default function FlightGame({ onExit, onComplete }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [collected, setCollected] = useState(0);
  const [won, setWon] = useState(false);
  const controls = useRef<Record<Control, boolean>>({
    forward: false,
    back: false,
    left: false,
    right: false,
    jump: false,
  });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9edcff);
    scene.fog = new THREE.Fog(0x9edcff, 28, 72);
    const camera = new THREE.PerspectiveCamera(
      58,
      mount.clientWidth / Math.max(mount.clientHeight, 1),
      0.1,
      120,
    );
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x3e7b4e, 2.3));
    const sun = new THREE.DirectionalLight(0xfff4cf, 2.2);
    sun.position.set(12, 22, 8);
    sun.castShadow = true;
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(76, 76),
      new THREE.MeshStandardMaterial({ color: 0x69bd5a, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const path = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 70),
      new THREE.MeshStandardMaterial({ color: 0xd9cfad }),
    );
    path.rotation.x = -Math.PI / 2;
    path.position.y = 0.015;
    scene.add(path);

    const stadium = new THREE.Mesh(
      new THREE.CylinderGeometry(8, 9, 3, 32, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xf6f3e9,
        side: THREE.DoubleSide,
      }),
    );
    stadium.position.set(-20, 1.5, -18);
    stadium.castShadow = true;
    scene.add(stadium);

    const field = new THREE.Mesh(
      new THREE.CircleGeometry(6.6, 32),
      new THREE.MeshStandardMaterial({ color: 0x228b45 }),
    );
    field.rotation.x = -Math.PI / 2;
    field.position.set(-20, 0.04, -18);
    scene.add(field);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x704627 });
    const crownMat = new THREE.MeshStandardMaterial({ color: 0x257d47 });
    const trunkGeometry = new THREE.CylinderGeometry(0.22, 0.3, 1.6, 7);
    const crownGeometry = new THREE.ConeGeometry(1.4, 3.4, 9);
    for (let i = 0; i < 22; i++) {
      const x = (i % 2 ? 1 : -1) * (8 + ((i * 7) % 25));
      const z = 28 - ((i * 11) % 58);
      const trunk = new THREE.Mesh(trunkGeometry, trunkMat);
      const crown = new THREE.Mesh(crownGeometry, crownMat);
      trunk.position.set(x, 0.8, z);
      crown.position.set(x, 2.8, z);
      scene.add(trunk, crown);
    }

    const player = new THREE.Group();
    const blue = new THREE.MeshStandardMaterial({
      color: 0x0870ae,
      metalness: 0.15,
      roughness: 0.55,
    });
    const orange = new THREE.MeshStandardMaterial({
      color: 0xf3a52b,
      roughness: 0.7,
    });
    const skin = new THREE.MeshStandardMaterial({
      color: 0xf1c6a4,
      roughness: 0.85,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x17324a,
      roughness: 0.8,
    });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.3, 0.58), blue);
    torso.position.y = 1.75;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.78, 0.72), skin);
    head.position.y = 2.82;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.22, 0.82), orange);
    cap.position.set(0, 3.26, -0.02);
    const leftArm = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 1.15, 0.38),
      orange,
    );
    const rightArm = leftArm.clone();
    leftArm.position.set(-0.75, 1.77, 0);
    rightArm.position.set(0.75, 1.77, 0);
    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.2, 0.48), dark);
    const rightLeg = leftLeg.clone();
    leftLeg.position.set(-0.3, 0.62, 0);
    rightLeg.position.set(0.3, 0.62, 0);
    player.add(torso, head, cap, leftArm, rightArm, leftLeg, rightLeg);
    player.position.set(0, 0, 25);
    player.rotation.y = Math.PI;
    player.traverse((object) => {
      if (object instanceof THREE.Mesh) object.castShadow = true;
    });
    scene.add(player);

    const obstacleMaterial = new THREE.MeshStandardMaterial({
      color: 0xe7e0cc,
      roughness: 0.9,
    });
    for (const obstacle of OBSTACLES) {
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(obstacle.width, obstacle.height, obstacle.depth),
        obstacleMaterial,
      );
      block.position.set(obstacle.x, obstacle.height / 2, obstacle.z);
      block.castShadow = true;
      block.receiveShadow = true;
      scene.add(block);
    }

    const partMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd23f,
      emissive: 0x8a5600,
      emissiveIntensity: 0.45,
      metalness: 0.55,
    });
    const partGeometry = new THREE.TorusGeometry(0.8, 0.25, 10, 18);
    const parts = PART_POSITIONS.map(([x, y, z]) => {
      const mesh = new THREE.Mesh(partGeometry, partMaterial);
      mesh.position.set(x, y, z);
      mesh.rotation.x = Math.PI / 2;
      mesh.castShadow = true;
      scene.add(mesh);
      return mesh;
    });

    camera.position.set(0, 8, 34);
    camera.lookAt(player.position);

    let found = 0;
    let velocityY = 0;
    let grounded = true;
    // THREE.Clock объявлен устаревшим в three 0.185 и печатает предупреждение
    // в консоль при каждом запуске игры.
    const timer = new THREE.Timer();

    /** Стоит ли игрок внутри коробки на этой высоте — по одной оси за раз. */
    const blocked = (x: number, z: number, y: number) =>
      OBSTACLES.some(
        (obstacle) =>
          y < obstacle.height - TOP_TOLERANCE &&
          Math.abs(x - obstacle.x) < obstacle.width / 2 + PLAYER_RADIUS &&
          Math.abs(z - obstacle.z) < obstacle.depth / 2 + PLAYER_RADIUS,
      );

    const animate = () => {
      timer.update();
      const dt = Math.min(timer.getDelta(), 0.04);
      const speed = 10 * dt;
      const previousY = player.position.y;

      let moveX = 0;
      let moveZ = 0;
      if (controls.current.left) moveX -= 1;
      if (controls.current.right) moveX += 1;
      if (controls.current.forward) moveZ -= 1;
      if (controls.current.back) moveZ += 1;

      if (moveX || moveZ) {
        const length = Math.hypot(moveX, moveZ);
        const stepX = (moveX / length) * speed;
        const stepZ = (moveZ / length) * speed;
        // Оси разрешаются раздельно, иначе персонаж «прилипает» к стене
        // вместо того чтобы скользить вдоль неё.
        if (
          !blocked(player.position.x + stepX, player.position.z, previousY)
        ) {
          player.position.x += stepX;
        }
        if (
          !blocked(player.position.x, player.position.z + stepZ, previousY)
        ) {
          player.position.z += stepZ;
        }
        player.rotation.y = THREE.MathUtils.lerp(
          player.rotation.y,
          Math.atan2(moveX, moveZ),
          0.18,
        );
        if (!reducedMotion) {
          const walk = Math.sin(performance.now() * 0.012) * 0.58;
          leftArm.rotation.x = walk;
          rightArm.rotation.x = -walk;
          leftLeg.rotation.x = -walk;
          rightLeg.rotation.x = walk;
        }
      } else {
        leftArm.rotation.x *= 0.82;
        rightArm.rotation.x *= 0.82;
        leftLeg.rotation.x *= 0.82;
        rightLeg.rotation.x *= 0.82;
      }

      if (controls.current.jump && grounded) {
        velocityY = JUMP_VELOCITY;
        grounded = false;
      }
      velocityY -= GRAVITY * dt;
      player.position.y += velocityY * dt;

      let surfaceY = 0;
      for (const obstacle of OBSTACLES) {
        const onTopX =
          Math.abs(player.position.x - obstacle.x) < obstacle.width / 2 - 0.1;
        const onTopZ =
          Math.abs(player.position.z - obstacle.z) < obstacle.depth / 2 - 0.1;
        const crossedTop =
          previousY >= obstacle.height - TOP_TOLERANCE &&
          player.position.y <= obstacle.height;
        if (onTopX && onTopZ && velocityY <= 0 && crossedTop) {
          surfaceY = Math.max(surfaceY, obstacle.height);
        }
      }
      if (player.position.y <= surfaceY) {
        player.position.y = surfaceY;
        velocityY = 0;
        grounded = true;
      } else if (player.position.y > surfaceY + TOP_TOLERANCE) {
        grounded = false;
      }

      player.position.x = THREE.MathUtils.clamp(player.position.x, -12, 12);
      player.position.z = THREE.MathUtils.clamp(player.position.z, -34, 30);

      const playerCenter = new THREE.Vector3(
        player.position.x,
        player.position.y + PLAYER_CENTER_OFFSET,
        player.position.z,
      );
      parts.forEach((part, i) => {
        if (!part.visible) return;
        part.rotation.z += dt * 1.8;
        const baseY = PART_POSITIONS[i]?.[1] ?? 1.3;
        part.position.y =
          baseY + Math.sin(performance.now() * 0.002 + i) * PART_BOB;
        if (part.position.distanceTo(playerCenter) < PICKUP_RADIUS) {
          part.visible = false;
          found += 1;
          setCollected(found);
          if (found === parts.length) setWon(true);
        }
      });

      camera.position.x = THREE.MathUtils.lerp(
        camera.position.x,
        player.position.x,
        0.06,
      );
      camera.position.z = THREE.MathUtils.lerp(
        camera.position.z,
        player.position.z + 10,
        0.06,
      );
      camera.position.y = THREE.MathUtils.lerp(
        camera.position.y,
        player.position.y + 6.2,
        0.06,
      );
      camera.lookAt(
        player.position.x,
        player.position.y + 1.5,
        player.position.z - 4,
      );
      renderer.render(scene, camera);
    };

    // setAnimationLoop сам останавливается на скрытой вкладке и корректно
    // отменяется в dispose(), в отличие от ручного requestAnimationFrame.
    renderer.setAnimationLoop(animate);

    const down = (event: KeyboardEvent) => {
      const control = CONTROL_BY_CODE[event.code];
      if (!control) return;
      controls.current[control] = true;
      // Иначе стрелки и пробел прокручивают страницу под игрой.
      event.preventDefault();
    };
    const up = (event: KeyboardEvent) => {
      const control = CONTROL_BY_CODE[event.code];
      if (control) controls.current[control] = false;
    };
    /** Потеря фокуса окна оставляла клавишу «зажатой» навсегда. */
    const releaseAll = () => {
      controls.current.forward = false;
      controls.current.back = false;
      controls.current.left = false;
      controls.current.right = false;
      controls.current.jump = false;
    };

    const resizeObserver = new ResizeObserver(() => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    resizeObserver.observe(mount);

    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    window.addEventListener("blur", releaseAll);

    return () => {
      renderer.setAnimationLoop(null);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", releaseAll);
      resizeObserver.disconnect();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const material = object.material;
          if (Array.isArray(material)) material.forEach((item) => item.dispose());
          else material.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  const press = useCallback((control: Control, active: boolean) => {
    controls.current[control] = active;
  }, []);

  /** Один набор обработчиков на кнопку, включая pointercancel — без него
   *  палец, уехавший за край экрана, оставлял движение включённым. */
  const touchProps = (control: Control) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      press(control, true);
    },
    onPointerUp: () => press(control, false),
    onPointerCancel: () => press(control, false),
    onPointerLeave: () => press(control, false),
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
  });

  return (
    <main className="game-shell">
      <div ref={mountRef} className="game-canvas" />
      <header className="game-hud">
        <Button variant="outline" onClick={onExit}>
          <X />
          Выйти
        </Button>
        <div>
          <Plane />
          <strong>Парк Аэромарка: обби-маршрут</strong>
        </div>
        <span aria-live="polite">{collected} / {PART_POSITIONS.length} деталей</span>
      </header>
      <section className="game-brief">
        <b>Задание</b>
        <span>
          Проведи персонажа по полосе препятствий и собери пять золотых деталей.
          Управление — кнопки на экране или клавиши со стрелками, прыжок —
          кнопка «Прыжок» или пробел.
        </span>
      </section>
      <div className="touch-controls" aria-label="Управление персонажем">
        <button type="button" {...touchProps("forward")} aria-label="Вперёд">
          <ArrowUp />
        </button>
        <button type="button" {...touchProps("left")} aria-label="Влево">
          <ArrowLeft />
        </button>
        <button type="button" {...touchProps("back")} aria-label="Назад">
          <ArrowDown />
        </button>
        <button type="button" {...touchProps("right")} aria-label="Вправо">
          <ArrowRight />
        </button>
        <button
          type="button"
          className="jump-button"
          {...touchProps("jump")}
          aria-label="Прыжок"
        >
          <ChevronsUp />
          <span>Прыжок</span>
        </button>
      </div>
      {won && (
        <section className="game-win">
          <div>🏆</div>
          <h1>Все детали собраны!</h1>
          <p>
            Маршрут пройден, детали самолёта найдены. Открыты следующие учебные
            миссии.
          </p>
          <Button size="lg" onClick={onComplete}>
            Получить 3 звезды
          </Button>
        </section>
      )}
    </main>
  );
}
