import { z } from "zod";

export const readingRunSchema = z.object({
  id: z.string().min(1).max(100),
  date: z.string().datetime(),
  textId: z.string().min(1).max(100),
  mode: z.enum(["manual", "syllables", "words"]),
  pace: z.number().int().min(5).max(90),
  elapsedMs: z.number().finite().min(1000).max(3_600_000),
  totalWords: z.number().int().min(1).max(2000),
  attempted: z.number().int().min(0),
  errors: z.array(z.number().int().min(0)),
  verified: z.boolean(),
  answers: z.array(z.boolean()).max(10),
}).refine(r => r.attempted <= r.totalWords && new Set(r.errors).size === r.errors.length && r.errors.every(i => i < r.attempted));
export type ReadingRun = z.infer<typeof readingRunSchema>;
export type ReadingMode = ReadingRun["mode"];

/** Punctuation is never a word; internal hyphens/apostrophes stay in one word.
 * Combining stress marks stay attached. Digits count as one lexical token. */
export function tokenize(text: string): { text: string; start: number; end: number }[] {
  return Array.from(text.matchAll(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:[-‑’'][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*/gu), m => ({ text: m[0], start: m.index!, end: m.index! + m[0].length }));
}

export function metrics(run: ReadingRun) {
  if (!run.verified || run.attempted === 0) return null;
  return {
    wpm: run.attempted * 60_000 / run.elapsedMs,
    wcpm: (run.attempted - run.errors.length) * 60_000 / run.elapsedMs,
    accuracy: (run.attempted - run.errors.length) / run.attempted,
  };
}

export function appendRun(runs: ReadingRun[], input: ReadingRun): ReadingRun[] {
  const run = readingRunSchema.parse(input);
  return runs.some(r => r.id === run.id) ? runs : [...runs, run].slice(-60);
}

/** Conservative product heuristics, not validated educational thresholds. */
export function recommend(runs: ReadingRun[], textId: string, pace = 15): { pace: number; message: string } {
  const recent = runs.filter(r => r.textId === textId && r.verified && r.attempted > 0 && r.elapsedMs >= 5000).slice(-2);
  const last = recent.at(-1);
  if (!last) return { pace, message: "Начните в своём темпе. Взрослый поможет слить звуки и понять рассказ." };
  const good = (r: ReadingRun) => metrics(r)!.accuracy >= .95 && r.answers.length > 0 && r.answers.every(Boolean) && r.attempted === r.totalWords;
  if (metrics(last)!.accuracy < .9 || last.answers.some(a => !a)) return { pace: Math.max(5, last.pace - 3), message: "Снизим темп: прочитайте трудное слово вместе, затем повторите короткий отрывок и обсудите смысл." };
  if (recent.length === 2 && recent.every(good)) return { pace: Math.min(90, last.pace + 2), message: "Два уверенных повторения. Можно немного ускорить подсветку или попробовать новый текст без неё." };
  return { pace: last.pace, message: "Оставим удобный темп. Повторите рассказ, затем проверьте чтение нового текста без подсветки." };
}

export type Cue = { word: number; part: number; weight: number };
export function cues(parts: string[][], mode: ReadingMode): Cue[] {
  return parts.flatMap((word, wi) => mode === "syllables"
    ? word.map((_, pi) => ({ word: wi, part: pi, weight: 1 / word.length }))
    : [{ word: wi, part: -1, weight: 1 }]);
}

/** Advance by monotonic active time. A word always gets 60/pace seconds,
 * distributed across its curated syllables; no interval-count timing drift. */
export function advance(cueList: Cue[], index: number, fraction: number, deltaMs: number, pace: number) {
  if (!Number.isFinite(deltaMs) || deltaMs < 0 || pace < 5 || pace > 90) throw new Error("Invalid clock input");
  let remaining = deltaMs * pace / 60_000;
  while (index < cueList.length) {
    const weight = cueList[index]!.weight;
    const needed = (1 - fraction) * weight;
    if (remaining + 1e-10 < needed) return { index, fraction: fraction + remaining / weight };
    remaining -= needed;
    index++;
    fraction = 0;
  }
  return { index: cueList.length, fraction: 0 };
}

/** Unseen first, then least recently practised. The 60-run journal covers
 * two full rounds of the 30-text library; no separate device-only queue. */
export function nextTextId(ids: string[], runs: Pick<ReadingRun, "textId">[], exclude?: string): string {
  if (!ids.length) throw new Error("Empty reading library");
  const candidates = ids.filter(id => id !== exclude);
  if (!candidates.length) return ids[0]!;
  const last = new Map<string, number>();
  runs.forEach((r, index) => last.set(r.textId, index));
  return candidates.reduce((best, id) => (last.get(id) ?? -1) < (last.get(best) ?? -1) ? id : best);
}
