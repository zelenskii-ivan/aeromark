import type { Command, Direction } from "./interpreter.ts";

export type Point = readonly [number, number];
export type MapSpec = { start: Point; goal: Point; obstacles?: readonly Point[]; needsTakeoff?: boolean };
export type Frame = {
  point: Point;
  line: number;
  text: string;
  radio?: string;
  speed: number;
  status: "ready" | "airborne" | "landed" | "blocked";
};
export const GRID = { width: 7, height: 5 };
export const samePoint = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];
const offsets: Record<Direction, Point> = { right: [1, 0], left: [-1, 0], up: [0, 1], down: [0, -1] };

export function simulate(map: MapSpec, commands: readonly Command[]) {
  let point = map.start;
  let speed = 2;
  let fuel = 0;
  let fuelChecked = false;
  let status: Frame["status"] = "ready";
  let problem = "";
  const frames: Frame[] = [];
  const output: string[] = [];
  const record = (line: number, text = "", radio?: string) => frames.push({ point, line, text, speed, status, radio });
  const stop = (line: number, text: string) => {
    problem = text;
    status = "blocked";
    record(line, text);
  };
  const fly = (direction: Direction, count: number, line: number) => {
    const [dx, dy] = offsets[direction];
    for (let step = 0; step < count; step++) {
      const next: Point = [point[0] + dx, point[1] + dy];
      if (next[0] < 0 || next[0] >= GRID.width || next[1] < 0 || next[1] >= GRID.height) {
        stop(line, "Край карты. Проверь направление и число клеток.");
        break;
      }
      if (map.obstacles?.some((obstacle) => samePoint(obstacle, next))) {
        stop(line, "На пути гроза. Попробуй облететь её.");
        break;
      }
      point = next;
      record(line);
    }
  };

  for (const command of commands) {
    const { line } = command;
    if (problem) break;
    if (command.kind === "move") {
      if (status === "landed") stop(line, "Самолёт уже сел.");
      else if (map.needsTakeoff && status !== "airborne") stop(line, "Сначала нужно взлететь.");
      else {
        status = "airborne";
        fly(command.direction, command.steps, line);
      }
    } else if (command.kind === "print") {
      output.push(command.text);
      record(line, "", command.text);
    } else if (command.kind === "settings") {
      if (command.name === "fuel") {
        fuel = command.value;
        fuelChecked = false;
      } else if (command.name === "speed") {
        if (command.value < 1 || command.value > 5) {
          stop(line, "Для скорости выбери число от 1 до 5.");
          continue;
        }
        speed = command.value;
      } else if (!map.needsTakeoff) {
        if (command.value < 0 || command.value >= GRID.height) {
          stop(line, "Для высоты выбери число от 0 до 4.");
          continue;
        }
        const delta = command.value - point[1];
        if (delta) {
          status = "airborne";
          fly(delta > 0 ? "up" : "down", Math.abs(delta), line);
          continue;
        }
      }
      record(line);
    } else if (command.kind === "check") {
      if (command.fuelTest) fuelChecked = true;
      record(line, command.passed ? "Условие верно" : "Условие неверно");
    } else if (command.kind === "takeoff") {
      if (!fuelChecked || fuel <= 0 || status !== "ready") {
        stop(line, "Перед взлётом проверь, что в баке есть топливо.");
      } else {
        status = "airborne";
        record(line, "Взлёт разрешён");
      }
    } else if (command.kind === "land") {
      if (status !== "airborne" || !samePoint(point, map.goal)) stop(line, "Для посадки сначала долети до аэродрома.");
      else {
        status = "landed";
        record(line, "Посадка выполнена");
      }
    } else record(line);
  }
  return { frames, output, point, speed, problem, landed: status === "landed", arrived: samePoint(point, map.goal) };
}
export type Flight = ReturnType<typeof simulate>;
