"use client";

import { useEffect, useRef, useState } from "react";
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
import "./game.css";

type Props = { onExit: () => void; onComplete: () => void };

export default function FlightGame({ onExit, onComplete }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [collected, setCollected] = useState(0);
  const [won, setWon] = useState(false);
  const keys = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9edcff);
    scene.fog = new THREE.Fog(0x9edcff, 28, 72);
    const camera = new THREE.PerspectiveCamera(
      58,
      mount.clientWidth / mount.clientHeight,
      0.1,
      120,
    );
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
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
    for (let i = 0; i < 22; i++) {
      const x = (i % 2 ? 1 : -1) * (8 + ((i * 7) % 25));
      const z = 28 - ((i * 11) % 58);
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.3, 1.6, 7),
        trunkMat,
      );
      const crown = new THREE.Mesh(
        new THREE.ConeGeometry(1.4, 3.4, 9),
        crownMat,
      );
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
    const leftLeg = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 1.2, 0.48),
      dark,
    );
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
    const obstacles: Array<{
      mesh: THREE.Mesh;
      x: number;
      z: number;
      width: number;
      depth: number;
      height: number;
    }> = [];
    [
      [-4, 14, 1.1],
      [4, 5, 1.5],
      [-3, -6, 0.8],
      [4, -17, 1.35],
      [0, -28, 1.8],
    ].forEach(([x, z, height], i) => {
      const width = i === 4 ? 5 : 3.8;
      const depth = 3.5;
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        obstacleMaterial,
      );
      block.position.set(x, height / 2, z);
      block.castShadow = true;
      block.receiveShadow = true;
      scene.add(block);
      obstacles.push({ mesh: block, x, z, width, depth, height });
    });

    const partMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd23f,
      emissive: 0x8a5600,
      emissiveIntensity: 0.45,
      metalness: 0.55,
    });
    const partPositions: [number, number, number][] = [
      [-4, 2.6, 14],
      [4, 3.1, 5],
      [-3, 2.3, -6],
      [4, 3.0, -17],
      [0, 3.5, -28],
    ];
    const parts = partPositions.map(([x, y, z]) => {
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(0.8, 0.25, 10, 18),
        partMaterial,
      );
      mesh.position.set(x, y, z);
      mesh.rotation.x = Math.PI / 2;
      mesh.castShadow = true;
      scene.add(mesh);
      return mesh;
    });

    camera.position.set(0, 8, 34);
    camera.lookAt(player.position);
    let frame = 0;
    let found = 0;
    let velocityY = 0;
    let grounded = true;
    const clock = new THREE.Clock();
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.04);
      const speed = 10 * dt;
      const previousX = player.position.x;
      const previousZ = player.position.z;
      const previousY = player.position.y;
      let moveX = 0;
      let moveZ = 0;
      if (keys.current.ArrowLeft || keys.current.a) moveX -= 1;
      if (keys.current.ArrowRight || keys.current.d) moveX += 1;
      if (keys.current.ArrowUp || keys.current.w) moveZ -= 1;
      if (keys.current.ArrowDown || keys.current.s) moveZ += 1;
      if (moveX || moveZ) {
        const length = Math.hypot(moveX, moveZ);
        player.position.x += (moveX / length) * speed;
        player.position.z += (moveZ / length) * speed;
        player.rotation.y = THREE.MathUtils.lerp(
          player.rotation.y,
          Math.atan2(moveX, moveZ),
          0.18,
        );
        const walk = Math.sin(performance.now() * 0.012) * 0.58;
        leftArm.rotation.x = walk;
        rightArm.rotation.x = -walk;
        leftLeg.rotation.x = -walk;
        rightLeg.rotation.x = walk;
      } else {
        leftArm.rotation.x *= 0.82;
        rightArm.rotation.x *= 0.82;
        leftLeg.rotation.x *= 0.82;
        rightLeg.rotation.x *= 0.82;
      }
      for (const obstacle of obstacles) {
        const insideX =
          Math.abs(player.position.x - obstacle.x) < obstacle.width / 2 + 0.42;
        const insideZ =
          Math.abs(player.position.z - obstacle.z) < obstacle.depth / 2 + 0.42;
        if (insideX && insideZ && player.position.y < obstacle.height - 0.08) {
          player.position.x = previousX;
          player.position.z = previousZ;
          break;
        }
      }
      if ((keys.current[" "] || keys.current.Space) && grounded) {
        velocityY = 8.2;
        grounded = false;
      }
      velocityY -= 20 * dt;
      player.position.y += velocityY * dt;
      let surfaceY = 0;
      for (const obstacle of obstacles) {
        const onTopX =
          Math.abs(player.position.x - obstacle.x) < obstacle.width / 2 - 0.1;
        const onTopZ =
          Math.abs(player.position.z - obstacle.z) < obstacle.depth / 2 - 0.1;
        const crossedTop =
          previousY >= obstacle.height - 0.08 &&
          player.position.y <= obstacle.height;
        if (onTopX && onTopZ && velocityY <= 0 && crossedTop)
          surfaceY = Math.max(surfaceY, obstacle.height);
      }
      if (player.position.y <= surfaceY) {
        player.position.y = surfaceY;
        velocityY = 0;
        grounded = true;
      } else if (player.position.y > surfaceY + 0.08) {
        grounded = false;
      }
      player.position.x = THREE.MathUtils.clamp(player.position.x, -12, 12);
      player.position.z = THREE.MathUtils.clamp(player.position.z, -34, 30);
      const playerCenter = new THREE.Vector3(
        player.position.x,
        player.position.y + 1.7,
        player.position.z,
      );
      parts.forEach((part, i) => {
        if (!part.visible) return;
        part.rotation.z += dt * 1.8;
        const baseY = partPositions[i]?.[1] || 1.3;
        part.position.y =
          baseY + Math.sin(performance.now() * 0.002 + i) * 0.25;
        if (part.position.distanceTo(playerCenter) < 1.65) {
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
    animate();

    const down = (event: KeyboardEvent) => {
      keys.current[event.key] = true;
      if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      )
        event.preventDefault();
    };
    const up = (event: KeyboardEvent) => {
      keys.current[event.key] = false;
    };
    const resize = () => {
      if (!mount.clientWidth || !mount.clientHeight) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("resize", resize);
      renderer.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const material = object.material;
          if (Array.isArray(material))
            material.forEach((item) => item.dispose());
          else material.dispose();
        }
      });
      mount.removeChild(renderer.domElement);
    };
  }, []);

  const press = (key: string, active: boolean) => {
    keys.current[key] = active;
  };
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
        <span>{collected} / 5 деталей</span>
      </header>
      <section className="game-brief">
        <b>Задание</b>
        <span>
          Проведи персонажа по полосе препятствий и собери пять золотых деталей.
          Прыжок — пробел.
        </span>
      </section>
      <div className="touch-controls" aria-label="Управление персонажем">
        <button
          onPointerDown={() => press("ArrowUp", true)}
          onPointerUp={() => press("ArrowUp", false)}
          onPointerLeave={() => press("ArrowUp", false)}
          aria-label="Вперёд"
        >
          <ArrowUp />
        </button>
        <button
          onPointerDown={() => press("ArrowLeft", true)}
          onPointerUp={() => press("ArrowLeft", false)}
          onPointerLeave={() => press("ArrowLeft", false)}
          aria-label="Влево"
        >
          <ArrowLeft />
        </button>
        <button
          onPointerDown={() => press("ArrowDown", true)}
          onPointerUp={() => press("ArrowDown", false)}
          onPointerLeave={() => press("ArrowDown", false)}
          aria-label="Назад"
        >
          <ArrowDown />
        </button>
        <button
          onPointerDown={() => press("ArrowRight", true)}
          onPointerUp={() => press("ArrowRight", false)}
          onPointerLeave={() => press("ArrowRight", false)}
          aria-label="Вправо"
        >
          <ArrowRight />
        </button>
        <button
          className="jump-button"
          onPointerDown={() => press("Space", true)}
          onPointerUp={() => press("Space", false)}
          onPointerLeave={() => press("Space", false)}
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
