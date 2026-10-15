import test from 'node:test';
import assert from 'node:assert/strict';
import { ROAD_TASKS, correctRoadAnswer, taskById, TOPICS } from '../content/roads/tasks.ts';
import { initialRoads, roadsSchema, startRoadRun, answerRoad, nextRoadTask, roadStars, mistakeIds } from '../lib/roads/state.ts';
import { migrateProgress, serializeExport, parseExport } from '../lib/progress.ts';

test('каждая тема присутствует на всех уровнях, ответы валидны', () => {
  assert.equal(new Set(ROAD_TASKS.map(t => t.id)).size, ROAD_TASKS.length);
  for (const level of [1,2,3]) for (const topic of Object.keys(TOPICS)) assert.ok(ROAD_TASKS.some(t => t.level === level && t.topic === topic));
  for (const task of ROAD_TASKS) {
    assert.ok(task.explanation.length > 60);
    assert.ok(task.answer.every(i => task.options[i]));
    assert.ok(correctRoadAnswer(task, task.answer));
    assert.ok(!correctRoadAnswer(task, []));
  }
});
test('порядок важен для шагов, но не для множественного выбора', () => {
  const order = ROAD_TASKS.find(t => t.kind === 'order');
  const multi = ROAD_TASKS.find(t => t.kind === 'multi');
  assert.equal(correctRoadAnswer(order, [...order.answer].reverse()), false);
  assert.equal(correctRoadAnswer(multi, [...multi.answer].reverse()), true);
  assert.equal(correctRoadAnswer(multi, [multi.answer[0], multi.answer[0]]), false);
});
test('ошибки сохраняются, верное повторение убирает ошибку, награды не дублируются', () => {
  let state = startRoadRun(initialRoads, 1, () => .999);
  const task = taskById(state.active.queue[0]);
  state = answerRoad(state, task.id, [(task.answer[0] + 1) % task.options.length]);
  assert.deepEqual(mistakeIds(state), [task.id]);
  assert.strictEqual(answerRoad(state, task.id, task.answer), state);
  state = startRoadRun(state, 'mistakes');
  state = answerRoad(state, task.id, task.answer);
  assert.equal(roadStars(state), 1);
  assert.deepEqual(mistakeIds(state), []);
  state = nextRoadTask(state);
  assert.equal(state.runs, 1);
  assert.strictEqual(nextRoadTask(state), state);
  for(let i=0;i<100;i++) {
    state = startRoadRun(state, 1, () => .999);
    state = answerRoad(state, task.id, task.answer);
  }
  assert.equal(roadStars(state), 1);
  assert.equal(state.items[task.id].attempts, 102);
});
test('сохранение ответа и незавершённой тренировки проходит экспорт, миграцию и JSON API', () => {
  const legacy = migrateProgress({ stars: 7 });
  assert.deepEqual(legacy.roads, initialRoads);
  let roads = startRoadRun(initialRoads, 2);
  const task = taskById(roads.active.queue[0]);
  roads = answerRoad(roads, task.id, task.answer);
  const saved = { ...legacy, roads };
  assert.deepEqual(parseExport(serializeExport(saved)), saved);
  assert.deepEqual(migrateProgress(JSON.parse(JSON.stringify(saved))), saved);
  assert.equal(nextRoadTask(saved.roads).active.index, 1);
});
test('повреждённые записи не стирают соседние; некорректная сессия сбрасывается', () => {
  const state = roadsSchema.parse({items: {'crossing-1': { attempts:1, correct:1, earned:true, mistake:false }, 'lights-1': {attempts:-1}, unknown:{}}, active:{queue:['missing'],index:0,picked:null,right:0}});
  assert.equal(roadStars(state), 1);
  assert.equal(state.active, null);
  assert.equal(Object.keys(state.items).length, 1);
});
test('устаревший ответ и невозможный выбор не меняют состояние', () => {
  const state = startRoadRun(initialRoads, 1);
  assert.strictEqual(answerRoad(state, 'missing', [0]), state);
  assert.strictEqual(answerRoad(state, state.active.queue[0], [99]), state);
  assert.strictEqual(nextRoadTask(state), state);
  assert.strictEqual(startRoadRun(initialRoads, 'mistakes'), initialRoads);
});
