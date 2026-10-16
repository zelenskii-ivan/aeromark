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
// Articulated procedural placeholder, not a skinned GLB or an approved likeness.
// Limb pivots support idle, walk, carry and seated poses without external assets.
export function markModel() {
  const root = new T.Group();
  ball(root, [.35, .44, .26], [0, 1.15, 0], 0x258fbb);
  ball(root, [.37, .42, .34], [0, 1.88, 0], 0xf3c29b);
  ball(root, [.38, .21, .35], [0, 2.14, .01], 0x725039);
  for (const x of [-.13, .13]) {
    ball(root, [.065, .08, .04], [x, 1.94, -.31], 0xffffff);
    ball(root, [.032, .045, .025], [x, 1.93, -.35], 0x344d53);
  }
  ball(root, [.07, .06, .06], [0, 1.79, -.34], 0xe7a17d);
  const limbs = [-1, 1].map(side => {
    const arm = new T.Group(); arm.position.set(side * .4, 1.4, 0); root.add(arm);
    ball(arm, [.13, .29, .13], [0, -.2, 0], 0x258fbb);
    ball(arm, [.12, .14, .12], [0, -.49, 0], 0xf3c29b);
    const leg = new T.Group(); leg.position.set(side * .18, .85, 0); root.add(leg);
    box(leg, [.26, .65, .28], [0, -.3, 0], 0x25455c);
    box(leg, [.3, .18, .44], [0, -.72, -.06], 0xfff6e3);
    return { arm, leg };
  });
  const hands = new T.Group(); hands.position.set(0, 1.15, -.85); root.add(hands);
  return { root, hands, pose(time: number, moving: boolean, carrying: boolean, seated = false) {
    limbs.forEach(({ arm, leg }, i) => {
      const swing = moving ? Math.sin(time * 10 + i * Math.PI) * .65 : 0;
      leg.rotation.x = seated ? -1.3 : swing;
      arm.rotation.x = carrying || seated ? -1.25 : -swing * .7;
    });
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
