import { CloudLightning, Flag, Plane, TowerControl } from "lucide-react";
import { GRID, samePoint, type Frame, type MapSpec, type Point } from "@/lib/python/flight";

const position = ([x, y]: Point) => ({
  left: `${(x + 0.5) * 100 / GRID.width}%`,
  top: `${(GRID.height - y - 0.5) * 100 / GRID.height}%`,
});
const axis = (size: number) => Array.from({ length: size }, (_, index) => index);
const statusNames = { ready: "На старте", airborne: "В полёте", landed: "На аэродроме", blocked: "Полёт остановлен" };

export function FlightMap({ map, frames, cursor }: { map: MapSpec; frames: readonly Frame[]; cursor: number }) {
  const frame = frames[cursor];
  const point = frame?.point ?? map.start;
  const status = frame?.status ?? "ready";
  const route = [map.start];
  for (let i = 0; i <= cursor; i++) {
    const current = frames[i]!.point;
    if (!samePoint(current, route.at(-1)!)) route.push(current);
  }
  const previous = route.at(-2);
  const angle = !previous || point[0] > previous[0] ? 0 : point[0] < previous[0] ? 180 : point[1] > previous[1] ? -90 : 90;
  return (
    <section className="py-map-card py-panel" aria-label="Карта полёта">
      <div className="py-map-heading"><h2>Карта полёта</h2><span>{statusNames[status]} · ({point.join(", ")})</span></div>
      <div className="py-map">
        <div className="py-grid" aria-hidden="true">
          <div className="py-axis py-axis-x">{axis(GRID.width).map(x => <span key={x}>{x}</span>)}</div>
          <div className="py-axis py-axis-y">{axis(GRID.height).reverse().map(y => <span key={y}>{y}</span>)}</div>
          <span className="py-marker py-start" style={position(map.start)} title="Старт"><Flag /></span>
          <span className="py-marker py-goal" style={position(map.goal)} title="Аэродром"><TowerControl /></span>
          {map.obstacles?.map(storm => <span key={storm.join()} className="py-marker py-storm" style={position(storm)} title="Гроза"><CloudLightning /></span>)}
          {route.slice(1).map(([x, y], i) => {
            const [px, py] = route[i]!;
            return <span className="py-trail" data-vertical={x === px} key={i} style={{
              ...position([Math.min(x, px), Math.max(y, py)]),
              width: x === px ? undefined : `${100 / GRID.width}%`,
              height: y === py ? undefined : `${100 / GRID.height}%`,
            }} />;
          })}
          <span className={`py-plane py-plane-${status}`} style={position(point)}><Plane style={{ transform: `rotate(${angle - 45}deg)` }} /></span>
        </div>
      </div>
      <div className="py-legend">
        <span><Flag /> Старт ({map.start.join(", ")})</span>
        <span><TowerControl /> Аэродром ({map.goal.join(", ")})</span>
        {!!map.obstacles?.length && <span><CloudLightning /> Гроза {map.obstacles.map(p => `(${p.join(", ")})`).join(", ")}</span>}
      </div>
    </section>
  );
}
