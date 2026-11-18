import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PIECES,
  PIECE_COUNT,
  SLOTS,
  startPuzzle,
  place,
  available,
  openSlotsFor,
  canTake,
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

test('в начале можно только одно: краном поставить фюзеляж', () => {
  const s = startPuzzle();
  assert.deepEqual(available(s, 'crane'), ['fuselage']);
  assert.deepEqual(available(s, 'hands'), []);
  assert.equal(canTake(s, 'eng1', 'hands'), 'needs');
});

test('тяжёлое руками не поднять, лёгкое краном не берут', () => {
  const s = place(startPuzzle(), 'fuselage', 'fuselage').state;
  assert.equal(canTake(s, 'wingL', 'hands'), 'heavy');
  assert.equal(canTake(s, 'noseGear', 'crane'), 'light');
  assert.equal(canTake(s, 'noseGear', 'hands'), null);
  assert.deepEqual(available(s, 'hands').sort(), ['bogie1', 'bogie2', 'noseGear']);
  assert.deepEqual(available(s, 'crane').sort(), ['stab', 'wingL', 'wingR']);
});

test('кили — только после стабилизатора; левое крыло — только слева', () => {
  let s = place(startPuzzle(), 'fuselage', 'fuselage').state;
  assert.equal(place(s, 'finL', 'finL').why, 'needs');
  assert.equal(place(s, 'wingL', 'wingR').why, 'shape');
  s = place(s, 'stab', 'stab').state;
  assert.ok(place(s, 'finL', 'finL').ok);
});

test('тележки шасси одинаковые: встают и слева, и справа', () => {
  const s = place(startPuzzle(), 'fuselage', 'fuselage').state;
  assert.deepEqual(openSlotsFor(s, 'bogie2').sort(), ['gearL', 'gearR']);
  const wrong = place(s, 'bogie1', 'gearNose');
  assert.equal(wrong.ok, false);
  assert.equal(wrong.why, 'shape');
  assert.equal(wrong.state.misses, 1);
});

test('правило пары: третий двигатель на ту же сторону не встаёт', () => {
  let s = place(startPuzzle(), 'fuselage', 'fuselage').state;
  s = { ...s, placed: { ...s.placed, wingL: 'wingL', wingR: 'wingR', engL1: 'eng1' } };
  const r = place(s, 'eng2', 'engL2');
  assert.equal(r.ok, false);
  assert.equal(r.why, 'balance');
  assert.ok(place(s, 'eng2', 'engR1').ok);
  assert.deepEqual(openSlotsFor(s, 'eng2').sort(), ['engR1', 'engR2', 'engR3']);
});

test('с одним крылом и одним двигателем на нём двигатель не взять', () => {
  let s = place(startPuzzle(), 'fuselage', 'fuselage').state;
  s = { ...s, placed: { ...s.placed, wingL: 'wingL', engL1: 'eng1' } };
  assert.equal(canTake(s, 'eng2', 'hands'), 'needs');
});

test('«Буран» — только когда весь самолёт собран', () => {
  const s = place(startPuzzle(), 'fuselage', 'fuselage').state;
  assert.equal(slotOpen(s, 'buran'), false);
  assert.equal(canTake(s, 'buran', 'crane'), 'needs');
});

test('любая игра доходит до конца, «Буран» последний, все вопросы звучат', () => {
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let game = 0; game < 300; game++) {
    let s = startPuzzle();
    const log = [];
    for (let step = 0; step < 40 && !isComplete(s); step++) {
      const options = [...available(s, 'hands'), ...available(s, 'crane')];
      assert.ok(options.length, `на шаге ${step} нечего делать`);
      const piece = options[Math.floor(random() * options.length)];
      const slots = openSlotsFor(s, piece);
      const r = place(s, piece, slots[Math.floor(random() * slots.length)]);
      assert.ok(r.ok);
      s = r.state;
      log.push(piece);
      for (;;) {
        const q = questionDue(s);
        if (!q) break;
        assert.ok(q.options.includes(q.answer));
        s = markAsked(s, q.id);
      }
      assert.ok(Math.abs(enginesOn(s, 'L') - enginesOn(s, 'R')) <= 1, 'крен');
    }
    assert.ok(isComplete(s));
    assert.equal(placedCount(s), 16);
    assert.equal(log[0], 'fuselage');
    assert.equal(log.at(-1), 'buran');
    assert.deepEqual([...s.asked].sort(), ['engines2', 'enginesLeft4', 'enginesSide', 'enginesTotal', 'fins'].sort());
  }
});

test('вопросы: два двигателя — «сколько стоит», четыре — «сколько ещё»', () => {
  let s = place(startPuzzle(), 'fuselage', 'fuselage').state;
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
