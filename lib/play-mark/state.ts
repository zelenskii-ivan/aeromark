import { z } from "zod";

export type Vec3 = [number, number, number];
export type Part = { id: string; name: string; at: Vec3; size: Vec3; color: number; shape?: "wheel" | "body" };
// Local aircraft coordinates: nose toward -Z. Five separate pieces per stage.
export const PARTS: Part[] = [
  { id: "body", name: "Фюзеляж", at: [0, 1.7, 0], size: [1.45, 1.35, 2.8], color: 0xfff3d5, shape: "body" },
  { id: "nose", name: "Нос", at: [0, 1.6, -1.9], size: [1.2, 1.15, 1.1], color: 0xf6b731, shape: "body" },
  { id: "tail", name: "Хвост", at: [0, 1.65, 2.15], size: [.65, .75, 2.1], color: 0xfff3d5, shape: "body" },
  { id: "left-wing", name: "Левое крыло", at: [-2.25, 2.3, -.25], size: [3.2, .16, 1.35], color: 0xf6b731 },
  { id: "right-wing", name: "Правое крыло", at: [2.25, 2.3, -.25], size: [3.2, .16, 1.35], color: 0xf6b731 },
  { id: "left-aileron", name: "Левый элерон", at: [-2.95, 2.3, .6], size: [1.7, .13, .35], color: 0x167d99 },
  { id: "right-aileron", name: "Правый элерон", at: [2.95, 2.3, .6], size: [1.7, .13, .35], color: 0x167d99 },
  { id: "left-flap", name: "Левый закрылок", at: [-1.3, 2.3, .6], size: [1.5, .13, .35], color: 0xffd56a },
  { id: "right-flap", name: "Правый закрылок", at: [1.3, 2.3, .6], size: [1.5, .13, .35], color: 0xffd56a },
  { id: "fin", name: "Киль", at: [0, 2.45, 2.65], size: [.15, 1.3, .9], color: 0xf6b731 },
  { id: "rudder", name: "Руль направления", at: [0, 2.45, 3.25], size: [.15, 1.25, .3], color: 0x167d99 },
  { id: "left-stabilizer", name: "Левый стабилизатор", at: [-.85, 1.8, 2.7], size: [1.5, .13, .7], color: 0xf6b731 },
  { id: "right-stabilizer", name: "Правый стабилизатор", at: [.85, 1.8, 2.7], size: [1.5, .13, .7], color: 0xf6b731 },
  { id: "elevator", name: "Руль высоты", at: [0, 1.8, 3.2], size: [3.15, .13, .3], color: 0x167d99 },
  { id: "propeller", name: "Винт", at: [0, 1.65, -2.85], size: [.17, 2.3, .13], color: 0x243b4c },
  { id: "cowling", name: "Капот", at: [0, 1.65, -2.55], size: [.9, .9, .4], color: 0x167d99, shape: "body" },
  { id: "front-wheel", name: "Переднее колесо", at: [0, .48, -1.7], size: [.42, .42, .22], color: 0x243b4c, shape: "wheel" },
  { id: "left-wheel", name: "Левое колесо", at: [-1.05, .48, .5], size: [.48, .48, .25], color: 0x243b4c, shape: "wheel" },
  { id: "right-wheel", name: "Правое колесо", at: [1.05, .48, .5], size: [.48, .48, .25], color: 0x243b4c, shape: "wheel" },
  { id: "cabin", name: "Кабина", at: [0, 2.45, -.65], size: [1.15, .65, 1.05], color: 0x75d5e5, shape: "body" },
];
const ids = new Set(PARTS.map(p => p.id));
export const assemblySchema = z.object({
  installed: z.array(z.string()).catch([]).default([]).transform(values => {
    const unique = [...new Set(values.filter(id => ids.has(id)))];
    // A corrupt save cannot unlock pieces from a future stage.
    let stage = 0;
    while (stage < 3 && PARTS.slice(stage * 5, stage * 5 + 5).every(p => unique.includes(p.id))) stage++;
    return unique.filter(id => PARTS.findIndex(p => p.id === id) < (stage + 1) * 5);
  }),
  flown: z.boolean().catch(false).default(false),
}).transform(s => ({ ...s, flown: s.flown && s.installed.length === 20 }));
export type Assembly = z.infer<typeof assemblySchema>;
export const initialAssembly: Assembly = { installed: [], flown: false };
export const stageOf = (s: Assembly) => Math.min(3, Math.floor(s.installed.length / 5));
export const availableParts = (s: Assembly) => PARTS.slice(stageOf(s) * 5, stageOf(s) * 5 + 5).filter(p => !s.installed.includes(p.id));
export const assemblyStars = (s: Assembly) => s.installed.length + (s.installed.length === 20 ? 10 : 0);
export function installPart(s: Assembly, id: string): Assembly {
  return availableParts(s).some(p => p.id === id) ? { ...s, installed: [...s.installed, id] } : s;
}
export const SPAWNS: Vec3[] = [[-7, 0, 5], [-9, 0, -1], [-6, 0, -6], [6, 0, -6], [8, 0, 3]];
export const PICKUP_DISTANCE = 1.8;
export const ASSEMBLY_DISTANCE = 4.8;
export const within = (x: number, z: number, tx: number, tz: number, radius: number) => Math.hypot(x - tx, z - tz) <= radius;
