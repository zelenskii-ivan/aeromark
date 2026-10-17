import test from 'node:test';
import assert from 'node:assert/strict';
import { PIECES, PIECE_COUNT, startPuzzle, place, remaining, isComplete, markChoice } from '../lib/su57/puzzle.ts';

test('деталей восемь и все разные: по четыре на каждого', () => {
  assert.equal(PIECE_COUNT, 8);
  assert.equal(new Set(PIECES.map(p => p.id)).size, PIECE_COUNT);
});

test('ходят строго по очереди, чужой ход не принимается', () => {
  let s = startPuzzle('player');
  assert.equal(place(s, 'mark', 'body', 'body').ok, false);
  const r = place(s, 'player', 'body', 'body');
  assert.ok(r.ok);
  assert.equal(r.state.turn, 'mark');
  assert.equal(place(r.state, 'player', 'nose', 'nose').ok, false);
});

test('не в своё гнездо — промах, очередь не переходит', () => {
  const s = startPuzzle('player');
  const r = place(s, 'player', 'wingL', 'wingR');
  assert.equal(r.ok, false);
  assert.equal(r.state.turn, 'player');
  assert.equal(r.state.misses, 1);
  assert.equal(r.state.placed.length, 0);
});

test('поставленную деталь второй раз не поставить', () => {
  let s = place(startPuzzle('player'), 'player', 'nose', 'nose').state;
  assert.equal(place(s, 'mark', 'nose', 'nose').ok, false);
});

test('Марк начинает с корпуса, дальше берёт только оставшиеся', () => {
  let s = startPuzzle('mark');
  assert.equal(markChoice(s), 'body');
  s = place(s, 'mark', 'body', 'body').state;
  for (let i = 0; i < 20; i++) {
    const pick = markChoice(s, () => i / 20);
    assert.ok(remaining(s).includes(pick));
  }
  assert.equal(markChoice(s, () => 0.9999), remaining(s).at(-1));
});

test('игра доходит до конца: восемь ходов, по четыре на каждого', () => {
  let s = startPuzzle('player');
  const turns = { player: 0, mark: 0 };
  while (!isComplete(s)) {
    const who = s.turn;
    const piece = who === 'mark' ? markChoice(s) : remaining(s)[0];
    const r = place(s, who, piece, piece);
    assert.ok(r.ok);
    turns[who]++;
    s = r.state;
  }
  assert.deepEqual(turns, { player: 4, mark: 4 });
  assert.equal(markChoice(s), null);
  assert.equal(place(s, s.turn, 'nose', 'nose').ok, false);
});
