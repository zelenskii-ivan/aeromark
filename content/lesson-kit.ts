import { choiceTask, inputTask, type Skill } from "./types.ts";
import type { Lesson, Phase, Step, Subject } from "./lesson.ts";

/**
 * Короткие конструкторы шагов урока.
 *
 * Рукописные уроки (вроде «Десяти заклёпок») описывают каждый шаг полным
 * объектом. Для серий уроков это много повторяющегося кода, поэтому шаги
 * собираются здесь: `maker("mz", "Диспетчер Ника").say(...)` даёт шаг с id
 * `mz-...`, а у свободного ввода озвучка сразу заканчивается подсказкой
 * «Введи ответ в поле».
 */

export type Maker = {
  say: (suffix: string, phase: Phase, text: string, character?: string) => Step;
  choice: (suffix: string, phase: Phase, skill: Skill, prompt: string, options: string[], answer: string, hint: string, read?: string) => Step;
  input: (suffix: string, phase: Phase, skill: Skill, prompt: string, answer: string, hint: string, speech?: string) => Step;
  bond: (suffix: string, phase: Phase, prompt: string, whole: number, parts: [number, number], missing: "whole" | "left" | "right", hint: string) => Step;
  order: (suffix: string, phase: Phase, skill: Skill, prompt: string, items: string[], hint: string) => Step;
  match: (suffix: string, phase: Phase, skill: Skill, prompt: string, pairs: Array<[string, string]>, hint: string) => Step;
  rule: (suffix: string, title: string, text: string) => Step;
};

export function maker(prefix: string, character: string): Maker {
  const id = (suffix: string) => `${prefix}-${suffix}`;
  return {
    say: (suffix, phase, text, who = character) => ({ id: id(suffix), phase, kind: "say", character: who, text }),
    choice: (suffix, phase, skill, prompt, options, answer, hint, read) => ({
      id: id(suffix),
      phase,
      kind: "ask",
      task: choiceTask(id(suffix), skill, prompt, options, answer, hint, read),
    }),
    input: (suffix, phase, skill, prompt, answer, hint, speech) => ({
      id: id(suffix),
      phase,
      kind: "ask",
      task: inputTask(id(suffix), skill, prompt, answer, hint, speech ?? `${spoken(prompt)} Введи ответ в поле.`),
    }),
    bond: (suffix, phase, prompt, whole, parts, missing, hint) => ({
      id: id(suffix),
      phase,
      kind: "bond",
      skill: "Счёт",
      prompt,
      whole,
      parts,
      missing,
      hint,
    }),
    order: (suffix, phase, skill, prompt, items, hint) => ({ id: id(suffix), phase, kind: "order", skill, prompt, items, hint }),
    match: (suffix, phase, skill, prompt, pairs, hint) => ({ id: id(suffix), phase, kind: "match", skill, prompt, pairs, hint }),
    rule: (suffix, title, text) => ({ id: id(suffix), phase: "rule", kind: "rule", title, text }),
  };
}

/** «8 + 1» в озвучке — «8 плюс 1»: знаки синтезатор читает плохо. */
export function spoken(text: string): string {
  return text.replace(/\s\+\s/g, " плюс ").replace(/\s−\s/g, " минус ");
}

export const lesson = (id: string, title: string, goal: string, requires: string, steps: Step[], subject: Subject = "Математика"): Lesson => ({
  id,
  subject,
  title,
  goal,
  requires,
  steps,
});
