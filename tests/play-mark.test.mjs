import test from 'node:test';
import assert from 'node:assert/strict';
import { PARTS, SPAWNS, availableParts, initialAssembly, installPart, assemblyStars, assemblySchema, within, ASSEMBLY_DISTANCE, PICKUP_DISTANCE } from '../lib/play-mark/state.ts';
import { initialProgress, migrateProgress, serializeExport, parseExport } from '../lib/progress.ts';

test('four stages unlock only after all five pieces are installed, in any order', () => {
  let state = initialAssembly;
  assert.equal(installPart(state, PARTS[5].id), state);
  for (let stage = 0; stage < 4; stage++) {
    assert.deepEqual(availableParts(state).map(p => p.id), PARTS.slice(stage * 5, stage * 5 + 5).map(p => p.id));
    for (const part of PARTS.slice(stage * 5, stage * 5 + 5).reverse()) {
      const before = state;
      state = installPart(state, part.id);
      assert.equal(state.installed.length, before.installed.length + 1);
      assert.equal(installPart(state, part.id), state);
    }
  }
  assert.equal(assemblyStars(state), 30);
  assert.deepEqual(availableParts(state), []);
  assert.equal(assemblyStars({ ...state, flown: true }), 30);
});
test('legacy and corrupt saves preserve family progress and normalize assembly', () => {
  const old = migrateProgress({ stars: 17, completed: [1, 2], academy: initialProgress.academy });
  assert.deepEqual(old.assembly, initialAssembly);
  assert.equal(old.stars, 17);
  assert.deepEqual(old.completed, [1, 2]);
  assert.deepEqual(assemblySchema.parse({ installed: ['body', 'body', 'bogus', 'cabin'], flown: true }), { installed: ['body'], flown: false });
  assert.deepEqual(migrateProgress({ assembly: 'broken' }).assembly, initialAssembly);
});
test('export, import and server payload migration retain partial level and unrelated data', () => {
  const saved = { ...initialProgress, stars: 19, completed: [1], assembly: installPart(initialAssembly, 'nose') };
  assert.deepEqual(parseExport(serializeExport(saved)).assembly, saved.assembly);
  const remote = migrateProgress(JSON.parse(JSON.stringify(saved)));
  assert.equal(remote.stars, 19);
  assert.deepEqual(remote.completed, [1]);
  assert.deepEqual(remote.assembly, saved.assembly);
});
test('all five pickups fit walkable bounds, outside assembly zone and separated', () => {
  for (const [x, , z] of SPAWNS) {
    assert.ok(x >= -11 && x <= 10 && z >= -9 && z <= 11);
    assert.equal(within(x, z, 0, 0, ASSEMBLY_DISTANCE), false);
  }
  for (let i = 0; i < SPAWNS.length; i++) for (let j = i + 1; j < SPAWNS.length; j++) {
    assert.equal(within(SPAWNS[i][0], SPAWNS[i][2], SPAWNS[j][0], SPAWNS[j][2], PICKUP_DISTANCE * 2), false);
  }
  assert.equal(within(0, 4.7, 0, 0, ASSEMBLY_DISTANCE), true);
  assert.equal(within(0, 4.9, 0, 0, ASSEMBLY_DISTANCE), false);
});
