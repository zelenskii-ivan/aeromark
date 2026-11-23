import { useLayoutEffect, useRef, type ReactNode } from "react";

export function ActionDock({ children }: { children: ReactNode }) {
  const dock = useRef<HTMLElement>(null);
  const spacer = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const panel = dock.current;
    const gap = spacer.current;
    if (!panel || !gap) return;
    const reserveSpace = () => { gap.style.height = `${panel.offsetHeight + 12}px`; };
    reserveSpace();
    const observer = new ResizeObserver(reserveSpace);
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={spacer} className="py-dock-spacer">
      <section ref={dock} className="py-dock" aria-label="Действия">
        <div className="py-dock-inner">{children}</div>
      </section>
    </div>
  );
}
