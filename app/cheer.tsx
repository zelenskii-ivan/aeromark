"use client";

import { useMemo } from "react";
import { makeParticles, prefersReducedMotion } from "@/lib/celebrate";

/**
 * Салют над карточкой задания. `burst` растёт с каждым верным ответом —
 * по нему пересобирается раскладка, поэтому второй правильный ответ выглядит
 * не так же, как первый.
 *
 * Слой полностью декоративный: `aria-hidden` и `pointer-events: none`, чтобы
 * он не перехватывал нажатия и не читался озвучкой экрана.
 */
export function Cheer({ burst }: { burst: number }) {
  const particles = useMemo(
    () => (burst > 0 && !prefersReducedMotion() ? makeParticles(14) : []),
    [burst],
  );
  if (!particles.length) return null;
  return (
    <div className="cheer" aria-hidden="true" key={burst}>
      {particles.map((item, index) => (
        <span
          key={index}
          className={item.balloon ? "cheer-balloon" : "cheer-confetti"}
          style={
            {
              left: `${item.left}%`,
              animationDelay: `${item.delay}s`,
              animationDuration: `${item.duration}s`,
              "--drift": `${item.drift}px`,
              "--spin": `${item.spin}deg`,
              "--hue": item.hue,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
