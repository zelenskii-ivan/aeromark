import test from "node:test";
import assert from "node:assert/strict";
import { execute } from "../lib/python/interpreter.ts";
import { simulate } from "../lib/python/flight.ts";
import { assemble, COURSE, grantMission, isUnlocked, missionKey, MISSIONS } from "../content/python/missions.ts";
import { migrateProgress } from "../lib/progress.ts";

function run(source) {
  const program = execute(source);
  assert.equal(program.ok, true, program.message);
  return program.commands;
}

test("Python interprets both branches and reads variables with quoted strings and comments", () => {
  for (const [fuel, expected] of [[0, "пусто # здесь"], [3, "летим"]]) {
    const commands = run(`fuel = ${fuel}\r\nmessage = 'пусто # здесь'\r\nif fuel > 0:\r\n    print("летим")\r\nelse:\r\n    print(message) # комментарий`);
    assert.deepEqual(commands.filter(c => c.kind === "print").map(c => c.text), [expected]);
  }
});

test("loops replay each iteration and down or left subtract from coordinates", () => {
  const commands = run('for i in range(3):\n    move("right", 1)\n    print(i)\nmove("up", 2)\nmove("left", 1)\nmove("down", 1)');
  const flight = simulate({ start: [0, 0], goal: [2, 1] }, commands);
  assert.equal(flight.arrived, true);
  assert.equal(flight.problem, "");
  assert.deepEqual(flight.output, ["0", "1", "2"]);
  assert.equal(flight.frames.filter(f => f.line === 2).length, 3);
  assert.deepEqual(run("for i in range(-1):\n    print(i)").filter(c => c.kind === "print"), []);
});

test("coordinates cannot cross obstacles or the edges and landing needs the goal", () => {
  const commands = run("fuel = 1\nif fuel > 0:\n    takeoff()\n    move('right', 4)\n    land()");
  const blocked = simulate({ start: [0, 0], goal: [4, 0], obstacles: [[2, 0]], needsTakeoff: true }, commands);
  assert.match(blocked.problem, /гроза/);
  assert.deepEqual(blocked.point, [1, 0]);
  assert.match(simulate({ start: [0, 0], goal: [2, 2] }, run('move("left", 1)')).problem, /Край/);
  assert.match(simulate({ start: [0, 0], goal: [2, 2] }, run("land()")).problem, /аэродрома/);
});

test("limits bound source, syntax, range, execution and output with a retry after errors", () => {
  for (const [source, line, problem] of [
    ["#".repeat(2001), 1, /длинная/],
    ["\n".repeat(41), 40, /40 строк/],
    ["import os", 1, /недоступна/],
    ["while 1:", 1, /недоступна/],
    ["if fuel > 0:\n  print(1)", 1, /четырёх/],
    ["for i in range(17):\n    print(i)", 1, /16 раз/],
    ["for i in range(16):\n    for j in range(16):\n        n = j", 3, /много команд/],
    ["for i in range(13):\n    print(i)", 2, /12 сообщений/],
    ['print("' + "я".repeat(101) + '")', 1, /длинное/],
    ['move("east", 1)', 1, /right/],
    ["print(missing)", 1, /Сначала задай/],
  ]) {
    const response = execute(source);
    assert.equal(response.ok, false, source);
    if (source.includes("for j")) {
      assert.ok(response.line >= 1 && response.line <= 3);
    } else assert.equal(response.line, line);
    assert.match(response.message, problem);
    assert.equal("commands" in response, false);
  }
  assert.equal(execute("print(1)").ok, true);
});

test("all eight missions have working solutions and final flights require a fuel guard", () => {
  const sources = [
    assemble(MISSIONS[0], ["Готов к взлёту!"]),
    assemble(MISSIONS[1], ["3", "2"]),
    assemble(MISSIONS[2], ["0"]),
    assemble(MISSIONS[3], ["right", "3", 'move("up", 2)']),
    assemble(MISSIONS[4], ["3", 'move("up", 1)']),
    ...[[1, 4, 1], [2, 5, 2], [4, 6, 2]].map(([up, right, down]) =>
      `fuel = 5\nif fuel > 0:\n    takeoff()\n    move("up", ${up})\n    move("right", ${right})\n    move("down", ${down})\n    land()`),
  ];
  assert.equal(COURSE.length, 6);
  assert.equal(sources.length, MISSIONS.length);
  MISSIONS.forEach((mission, index) => {
    const source = sources[index];
    const flight = simulate(mission.map, run(source));
    assert.equal(flight.problem, "", mission.id);
    assert.equal(mission.passes(flight, source), true, mission.id);
  });
  const mission = MISSIONS[5];
  const unguarded = 'fuel = 5\nif fuel > 0:\n    print("OK")\ntakeoff()\nmove("up", 1)\nmove("right", 4)\nmove("down", 1)\nland()';
  assert.equal(simulate(mission.map, run(unguarded)).landed, true);
  assert.equal(mission.passes(simulate(mission.map, run(unguarded)), unguarded), false);
});

test("shared profile serialization keeps Python rewards and prevents premature or repeat grants", () => {
  const progress = migrateProgress({ stars: 7, gameWins: ["an225-mriya"] });
  assert.equal(grantMission(progress, "settings"), progress);
  const first = grantMission(progress, "radio");
  const stored = migrateProgress(JSON.parse(JSON.stringify(first)));
  assert.equal(stored.stars, 8);
  assert.deepEqual(stored.gameWins, ["an225-mriya", missionKey("radio")]);
  assert.equal(isUnlocked(stored.gameWins, "settings"), true);
  assert.equal(isUnlocked(stored.gameWins, "fuel"), false);
  assert.equal(grantMission(stored, "radio"), stored);
});
