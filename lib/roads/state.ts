import { z } from "zod";
import {
  ROAD_TASKS,
  taskById,
  correctRoadAnswer,
} from "../../content/roads/tasks.ts";
const ids = new Set(ROAD_TASKS.map((task) => task.id));
const idSchema = z.string().refine((id) => ids.has(id));
const statSchema = z.object({
  attempts: z.number().int().nonnegative(),
  correct: z.number().int().nonnegative(),
  mistake: z.boolean(),
  earned: z.boolean(),
});
const runSchema = z
  .object({
    queue: z.array(idSchema).min(1).max(ROAD_TASKS.length),
    index: z.number().int().nonnegative(),
    picked: z.array(z.number().int().min(0).max(3)).max(4).nullable(),
    right: z.number().int().nonnegative(),
  })
  .refine(
    (run) =>
      run.index <= run.queue.length &&
      new Set(run.queue).size === run.queue.length &&
      run.right <= run.index + (run.picked ? 1 : 0) &&
      (run.index < run.queue.length || run.picked === null),
  );
export const roadsSchema = z.object({
  items: z
    .record(z.unknown())
    .transform((raw) =>
      Object.fromEntries(
        Object.entries(raw).flatMap(([id, value]) => {
          const parsed = statSchema.safeParse(value);
          return ids.has(id) &&
            parsed.success &&
            parsed.data.correct <= parsed.data.attempts
            ? [[id, parsed.data]]
            : [];
        }),
      ),
    )
    .catch({})
    .default({}),
  runs: z.number().int().nonnegative().catch(0).default(0),
  active: runSchema.nullable().catch(null).default(null),
});
export type Roads = z.infer<typeof roadsSchema>;
export const initialRoads = roadsSchema.parse({});
export const roadStars = (state: Roads) =>
  Object.values(state.items).filter((item) => item.earned).length;
export const mistakeIds = (state: Roads) =>
  ROAD_TASKS.filter((task) => state.items[task.id]?.mistake).map(
    (task) => task.id,
  );
export function startRoadRun(
  state: Roads,
  level: number | "mistakes",
  random = Math.random,
): Roads {
  const queue =
    level === "mistakes"
      ? mistakeIds(state)
      : ROAD_TASKS.filter((task) => task.level === level).map(
          (task) => task.id,
        );
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [queue[i], queue[j]] = [queue[j]!, queue[i]!];
  }
  return queue.length
    ? { ...state, active: { queue, index: 0, picked: null, right: 0 } }
    : state;
}
export function answerRoad(state: Roads, id: string, picked: number[]): Roads {
  const run = state.active;
  const task = taskById(id);
  if (
    !run ||
    run.queue[run.index] !== id ||
    run.picked !== null ||
    !task ||
    !picked.length ||
    picked.some(
      (i) => !Number.isInteger(i) || i < 0 || i >= task.options.length,
    ) ||
    new Set(picked).size !== picked.length ||
    (task.kind === "choice" && picked.length !== 1) ||
    (task.kind === "order" && picked.length !== task.options.length)
  )
    return state;
  const correct = correctRoadAnswer(task, picked);
  const old = state.items[id] ?? {
    attempts: 0,
    correct: 0,
    mistake: false,
    earned: false,
  };
  return {
    ...state,
    active: { ...run, picked: [...picked], right: run.right + Number(correct) },
    items: {
      ...state.items,
      [id]: {
        attempts: old.attempts + 1,
        correct: old.correct + Number(correct),
        mistake: !correct,
        earned: old.earned || correct,
      },
    },
  };
}
export function nextRoadTask(state: Roads): Roads {
  const run = state.active;
  if (!run || run.picked === null) return state;
  const index = run.index + 1;
  return {
    ...state,
    runs: state.runs + Number(index === run.queue.length),
    active: { ...run, index, picked: null },
  };
}
