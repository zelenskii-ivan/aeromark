import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PIECES,
  PIECE_COUNT,
  SLOTS,
  startPuzzle,
  place,
  papaChoice,
  pickable,
  openSlotsFor,
  canPick,
  enginesOn,
  isComplete,
  questionDue,
  markAsked,
  placedCount,
  slotOpen,
} from '../lib/an225/puzzle.ts';

test('шестнадцать деталей и шестнадцать гнёзд, все разные', () => {
  assert.equal(PIECE_COUNT, 16);
  assert.equal(new Set(PIECES.map((p) => p.id)).size, 16);
  assert.equal(new Set(SLOTS.map((s) => s.id)).size, 16);
  assert.equal(PIECES.filter((p) => p.kind === 'engine').length, 6);
});

test('первым ходит Папа и ставит фюзеляж, потом ход ребёнка', () => {
  const s = startPuzzle();
  assert.equal(s.turn, 'papa');
  assert.deepEqual(papaChoice(s), { piece: 'fuselage', slot: 'fuselage' });
  const r = place(s, 'papa', 'fuselage', 'fuselage');
  assert.ok(r.ok);
  assert.equal(r.state.turn, 'player');
});

test('двигатель без крыла не поставить, а крыло Марку не поднять', () => {
  const s = place(startPuzzle(), 'papa', 'fuselage', 'fuselage').state;
  assert.equal(canPick(s, 'eng1'), 'needs');
  assert.equal(canPick(s, 'wingL'), 'heavy');
  assert.equal(canPick(s, 'noseGear'), null);
  assert.deepEqual(pickable(s).sort(), ['bogie1', 'bogie2', 'noseGear']);
});

test('тележки шасси одинаковые: встают и слева, и справа', () => {
  const s = place(startPuzzle(), 'papa', 'fuselage', 'fuselage').state;
  assert.deepEqual(openSlotsFor(s, 'bogie2').sort(), ['gearL', 'gearR']);
  const wrong = place(s, 'player', 'bogie1', 'gearNose');
  assert.equal(wrong.ok, false);
  assert.equal(wrong.why, 'shape');
  assert.equal(wrong.state.misses, 1);
});

test('правило пары: третий двигатель на ту же сторону не встаёт', () => {
  let s = place(startPuzzle(), 'papa', 'fuselage', 'fuselage').state;
  s = { ...s, placed: { ...s.placed, wingL: 'wingL', wingR: 'wingR', engL1: 'eng1' }, turn: 'player' };
  const r = place(s, 'player', 'eng2', 'engL2');
  assert.equal(r.ok, false);
  assert.equal(r.why, 'balance');
  assert.ok(place(s, 'player', 'eng2', 'engR1').ok);
  assert.deepEqual(openSlotsFor(s, 'eng2').sort(), ['engR1', 'engR2', 'engR3']);
});

test('с одним крылом и одним двигателем на нём двигатель не взять', () => {
  let s = place(startPuzzle(), 'papa', 'fuselage', 'fuselage').state;
  s = { ...s, placed: { ...s.placed, wingL: 'wingL', engL1: 'eng1' }, turn: 'player' };
  assert.equal(canPick(s, 'eng2'), 'needs');
});

test('«Буран» — только когда весь самолёт собран', () => {
  const s = place(startPuzzle(), 'papa', 'fuselage', 'fuselage').state;
  assert.equal(slotOpen(s, 'buran'), false);
});

function playThrough(random) {
  let s = startPuzzle();
  const log = [];
  for (let step = 0; step < 60 && !isComplete(s); step++) {
    if (s.turn === 'papa') {
      const c = papaChoice(s);
      assert.ok(c, `у Папы должен быть ход на шаге ${step}`);
      const r = place(s, 'papa', c.piece, c.slot);
      assert.ok(r.ok, `Папа: ${c.piece} → ${c.slot}: ${r.why}`);
      s = r.state;
      log.push(['papa', c.piece]);
    } else if (slotOpen(s, 'buran')) {
      const r = place(s, 'player', 'buran', 'buran');
      assert.ok(r.ok);
      s = r.state;
      log.push(['player', 'buran']);
    } else {
      const options = pickable(s);
      assert.ok(options.length, `ребёнку должно быть что взять на шаге ${step}`);
      const piece = options[Math.floor(random() * options.length)];
      const slots = openSlotsFor(s, piece);
      assert.ok(slots.length);
      const r = place(s, 'player', piece, slots[Math.floor(random() * slots.length)]);
      assert.ok(r.ok);
      s = r.state;
      log.push(['player', piece]);
    }
    for (;;) {
      const q = questionDue(s);
      if (!q) break;
      assert.ok(q.options.includes(q.answer));
      s = markAsked(s, q.id);
    }
    assert.ok(Math.abs(enginesOn(s, 'L') - enginesOn(s, 'R')) <= 1, 'крен');
  }
  return { s, log };
}

test('любая игра доходит до конца, ходы делятся примерно поровну, «Буран» последний', () => {
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let game = 0; game < 200; game++) {
    const { s, log } = playThrough(random);
    assert.ok(isComplete(s));
    assert.equal(placedCount(s), 16);
    assert.deepEqual(log.at(-1), ['player', 'buran']);
    const mine = log.filter(([who]) => who === 'player').length;
    // Обычно восемь из шестнадцати; если ребёнок быстро разобрал двигатели,
    // Папе в конце ставить нечего и ребёнок доделывает шасси сам.
    assert.ok(mine >= 8 && mine <= 10, `у ребёнка ${mine} ходов`);
    assert.deepEqual(s.asked.sort(), ['engines2', 'enginesLeft4', 'enginesSide', 'enginesTotal', 'fins'].sort());
  }
});

test('ходы чередуются: ребёнок не ждёт два хода Папы подряд', () => {
  let seed = 3;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let game = 0; game < 100; game++) {
    const { log } = playThrough(random);
    for (let i = 2; i < log.length; i++) {
      assert.ok(!(log[i][0] === 'papa' && log[i - 1][0] === 'papa'), `два хода Папы подряд: ${JSON.stringify(log)}`);
    }
  }
});

test('вопросы: два двигателя — «сколько стоит», четыре — «сколько ещё»', () => {
  let s = place(startPuzzle(), 'papa', 'fuselage', 'fuselage').state;
  s = { ...s, placed: { ...s.placed, wingL: 'wingL', wingR: 'wingR', engL1: 'eng1', engR1: 'eng2' } };
  assert.equal(questionDue(s)?.answer, 2);
  assert.equal(questionDue(s)?.id, 'engines2');
  s = markAsked(s, 'engines2');
  assert.equal(questionDue(s), null);
  s = { ...s, placed: { ...s.placed, engL2: 'eng3', engR2: 'eng4' } };
  const q = questionDue(s);
  assert.equal(q?.id, 'enginesLeft4');
  assert.equal(q?.answer, 2);
});
