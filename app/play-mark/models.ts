import * as T from "three";
import type { Part } from "../../lib/play-mark/state";

export function box(parent: T.Object3D, size: number[], pos: number[], color: number) {
  const mesh = new T.Mesh(new T.BoxGeometry(size[0], size[1], size[2]), new T.MeshStandardMaterial({ color, roughness: .75 }));
  mesh.position.set(pos[0]!, pos[1]!, pos[2]!);
  mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function ball(parent: T.Object3D, size: number[], pos: number[], color: number) {
  const mesh = new T.Mesh(new T.SphereGeometry(1, 16, 12), new T.MeshStandardMaterial({ color, roughness: .8 }));
  mesh.scale.set(size[0]!, size[1]!, size[2]!); mesh.position.set(pos[0]!, pos[1]!, pos[2]!);
  mesh.castShadow = true; parent.add(mesh); return mesh;
}
export function partModel(p: Part) {
  const group = new T.Group();
  if (p.shape === "wheel") {
    const tire = new T.Mesh(new T.CylinderGeometry(p.size[0], p.size[1], p.size[2], 20), new T.MeshStandardMaterial({ color: p.color }));
    tire.rotation.z = Math.PI / 2; tire.castShadow = true; group.add(tire);
    box(group, [.12, .65, .12], [0, .5, 0], 0xadb9bf);
  } else if (p.shape === "body") {
    ball(group, p.size.map(n => n / 2), [0, 0, 0], p.color);
  } else box(group, p.size, [0, 0, 0], p.color);
  return group;
}
// Procedural interpretation of the supplied character sheet (everyday outfit).
// Articulated meshes, not a skinned GLB; facial likeness remains approximate.
export function markModel() {
  const root = new T.Group();
  const skin = 0xf0bd95, hair = 0xb1844f, shirt = 0xf8f5ef, navy = 0x223248;
  ball(root, [.32, .42, .23], [0, 1.18, 0], shirt);
  // Straight polo hem, short zip and two separate collar leaves.
  ball(root, [.29, .1, .2], [0, .94, 0], shirt);
  ball(root, [.12, .14, .12], [0, 1.62, 0], skin);
  for (const side of [-1, 1]) {
    const collar = box(root, [.17, .16, .055], [side * .105, 1.53, -.195], 0xffffff);
    collar.rotation.z = side * -.4;
  }
  box(root, [.025, .25, .025], [0, 1.4, -.235], 0xc9bba7);
  box(root, [.04, .055, .03], [0, 1.49, -.255], 0xd9c7a9);
  const head = new T.Group(); head.position.y = 1.94; root.add(head);
  ball(head, [.345, .405, .32], [0, 0, 0], skin);
  ball(head, [.245, .19, .25], [0, -.23, -.055], skin);
  for (const side of [-1, 1]) {
    ball(head, [.07, .105, .06], [side * .345, -.025, .005], skin);
    ball(head, [.033, .06, .018], [side * .365, -.02, -.045], 0xd6947d);
    ball(head, [.07, .035, .008], [side * .19, -.13, -.275], 0xeab095);
    ball(head, [.082, .062, .033], [side * .13, .025, -.292], 0xfffbf6);
    ball(head, [.041, .046, .018], [side * .13, .025, -.324], 0x688c9f);
    ball(head, [.021, .03, .012], [side * .13, .025, -.341], 0x273b4a);
    ball(head, [.009, .012, .006], [side * .13 - .009, .04, -.352], 0xffffff);
    const brow = ball(head, [.086, .018, .02], [side * .13, .115, -.294], 0x956b42);
    brow.rotation.z = side * -.1;
  }
  ball(head, [.055, .065, .055], [0, -.07, -.315], 0xefb28b);
  // Small open smile and visible upper teeth, as in the reference.
  ball(head, [.1, .035, .012], [0, -.205, -.289], 0x935449);
  ball(head, [.075, .014, .006], [0, -.19, -.302], 0xfff9e8);
  // Layered blond locks replace the previous smooth brown cap.
  ball(head, [.352, .21, .325], [0, .255, .035], hair);
  ball(head, [.33, .27, .18], [0, .16, .17], hair);
  for (let i = 0; i < 13; i++) {
    const angle = i * 2.399;
    const lock = ball(head, [.045, .12, .06], [Math.sin(angle) * .27, .26 + (i % 3) * .025, Math.cos(angle) * .23], i % 3 ? 0xbe925b : 0xd4ad76);
    lock.rotation.z = Math.sin(angle) * -.55;
    lock.rotation.x = Math.cos(angle) * .4;
  }
  for (let i = 0; i < 5; i++) {
    const fringe = ball(head, [.045, .13, .035], [-.24 + i * .11, .205 + (i % 2) * .025, -.257], i % 2 ? 0xcba06a : 0xb98a52);
    fringe.rotation.z = -.35 + i * .14;
  }
  const limbs = [-1, 1].map(side => {
    const arm = new T.Group(); arm.position.set(side * .35, 1.46, 0); root.add(arm);
    ball(arm, [.135, .19, .14], [side * .025, -.1, 0], shirt);
    ball(arm, [.085, .19, .09], [side * .045, -.34, 0], skin);
    ball(arm, [.085, .105, .055], [side * .045, -.54, 0], skin);
    ball(arm, [.035, .065, .035], [side * -.025, -.51, -.025], skin);
    const leg = new T.Group(); leg.position.set(side * .155, .9, 0); root.add(leg);
    ball(leg, [.145, .35, .16], [0, -.28, 0], navy);
    box(leg, [.245, .13, .27], [0, -.58, 0], navy);
    // Navy cargo pocket, ochre upper, contrasting toe and pale sole.
    box(leg, [.035, .17, .17], [side * .14, -.17, .015], 0x2c3e54);
    ball(leg, [.16, .125, .235], [0, -.735, -.065], 0xc58b3d);
    box(leg, [.31, .065, .43], [0, -.835, -.065], 0xeae5d8);
    ball(leg, [.155, .065, .075], [0, -.76, -.24], 0x9a9386);
    for (let i = 0; i < 3; i++) box(leg, [.17, .014, .02], [0, -.63 - i * .017, -.09 - i * .035], 0xf1d19a);
    return { arm, leg };
  });
  const hands = new T.Group(); hands.position.set(0, 1.15, -.65); root.add(hands);
  return { root, hands, pose(time: number, moving: boolean, carrying: boolean, seated = false) {
    limbs.forEach(({ arm, leg }, i) => {
      const swing = moving ? Math.sin(time * 10 + i * Math.PI) * .65 : 0;
      leg.rotation.x = seated ? 1.3 : swing;
      // Positive X rotates a downward arm toward the character's -Z front.
      arm.rotation.x = carrying || seated ? 1.25 : -swing * .7;
      arm.rotation.z = carrying ? (i === 0 ? -.2 : .2) : 0;
    });
    head.rotation.y = !moving && !carrying && !seated ? Math.sin(time * .8) * .035 : 0;
  } };
}
export function airfield(scene: T.Scene) {
  box(scene, [100, .3, 100], [0, -.2, 0], 0x87b99c);
  box(scene, [9, .08, 80], [17, .01, 0], 0x536b70);
  for (let z = -36; z < 40; z += 7) box(scene, [.2, .02, 3.5], [17, .06, z], 0xfff6dc);
  for (const x of [12.7, 21.3]) box(scene, [.12, .02, 79], [x, .06, 0], 0xe5e8d4);
  box(scene, [12, .1, 11], [0, -.01, 0], 0xd3d8bd);
  box(scene, [11, 5, 7], [-15, 2.45, -15], 0x668e92);
  box(scene, [11.5, .4, 7.5], [-15, 5.1, -15], 0x365962);
  box(scene, [8, 3.8, .1], [-15, 1.9, -11.4], 0x284651);
  for (let x = -18; x <= -12; x += 2) box(scene, [.08, 3.7, .15], [x, 1.9, -11.3], 0x93b4b4);
  box(scene, [3, 6, 3], [26, 3, -18], 0xe2d5ad);
  box(scene, [4, 1.7, 4], [26, 6.6, -18], 0x517c88);
  box(scene, [4.5, .25, 4.5], [26, 7.6, -18], 0x264955);
  for (let i = 0; i < 28; i++) {
    const angle = i * 2.399; const r = 28 + (i % 4) * 3;
    const x = Math.cos(angle) * r, z = Math.sin(angle) * r;
    if (x > 11 && x < 23) continue;
    box(scene, [.35, 1.4, .35], [x, .7, z], 0x7c7054);
    ball(scene, [1.5, 2 + i % 2 * .4, 1.5], [x, 2.8, z], i % 2 ? 0x438579 : 0x5d9980);
  }
  for (let i = 0; i < 8; i++) {
    const x = -32 + i * 9;
    ball(scene, [3, .7, 1.3], [x, 14 + i % 3, -25 - i % 2 * 8], 0xf4f8ed);
  }
  box(scene, [.12, 5, .12], [9, 2.5, -10], 0xe8e4cf);
  box(scene, [1.5, .45, .45], [9.7, 4.8, -10], 0xe57850);
}
