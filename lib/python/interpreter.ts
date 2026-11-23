type Value = number | string;
type Atom = { literal: Value } | { name: string };
type Condition = { left: Atom; op: string; right: Atom };
type Statement = { line: number } & (
  | { kind: "assign"; name: string; value: Atom }
  | { kind: "call"; name: string; args: Atom[] }
  | { kind: "if"; condition: Condition; yes: Statement[]; no: Statement[] }
  | { kind: "for"; name: string; count: Atom; body: Statement[] }
);

export type Command = { line: number } & (
  | { kind: "print"; text: string }
  | { kind: "move"; direction: Direction; steps: number }
  | { kind: "takeoff" | "land" }
  | { kind: "settings"; name: "height" | "speed" | "fuel"; value: number }
  | { kind: "check"; fuelTest: boolean; passed: boolean }
  | { kind: "step" }
);
export type Direction = "left" | "right" | "up" | "down";
const directions = new Set<string>(["left", "right", "up", "down"]);
const reserved = new Set("False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield print move takeoff land range".split(" "));
const identifier = /^[A-Za-z_][A-Za-z_0-9]*$/;
const tokenPattern = /"(?:[^"\\]|\\["\\n])*"|'(?:[^'\\]|\\['\\n])*'|[A-Za-z_][A-Za-z_0-9]*|-?[0-9]+|==|!=|>=|<=|[(),:=> <]|\S/g;
const limits = { source: 2000, lines: 40, depth: 4, steps: 160, range: 16, output: 12, text: 100, number: 999, ms: 100 };

class LessonError extends Error {
  readonly line: number;
  constructor(line: number, message: string) {
    super(message);
    this.line = line;
  }
}
function fail(line: number, message: string): never { throw new LessonError(line, message); }

function parse(source: string): Statement[] {
  if (source.length > limits.source) fail(1, "Программа слишком длинная.");
  const rows = source.replace(/\r\n?/g, "\n").split("\n");
  if (rows.length > limits.lines) fail(limits.lines, "Оставь не больше 40 строк.");
  const lines = rows.flatMap((raw, index) => {
    const line = index + 1;
    const indent = raw.match(/^ */)![0].length;
    const tokens: string[] = [];
    for (const match of raw.slice(indent).matchAll(tokenPattern)) {
      if (match[0] === "#") break;
      if (match[0] !== " ") tokens.push(match[0]);
    }
    if (!tokens.length) return [];
    if (raw[indent] === "\t" || /\t/.test(raw.slice(0, indent))) fail(line, "Для отступа используй пробелы.");
    return [{ line, indent, tokens }];
  });
  let row = 0;

  function block(indent: number, depth: number): Statement[] {
    const work: Statement[] = [];
    while (row < lines.length && lines[row]!.indent >= indent) {
      const { line, indent: actual, tokens } = lines[row++]!;
      if (actual !== indent) fail(line, "Проверь отступ. Внутри команды нужно ещё четыре пробела.");
      let position = 0;
      const take = () => tokens[position++];
      const is = (want: string) => tokens[position] === want;
      const expect = (want: string) => { if (take() !== want) fail(line, `Здесь нужно «${want}».`); };
      const end = () => { if (position < tokens.length) fail(line, "Здесь команда уже закончилась."); };
      const name = (token: string | undefined) => {
        if (!token || !identifier.test(token) || reserved.has(token)) fail(line, "Проверь имя переменной.");
        return token;
      };
      const atom = (): Atom => {
        const token = take();
        if (token && /^-?(0|[1-9][0-9]*)$/.test(token)) {
          const value = Number(token);
          if (Math.abs(value) > limits.number) fail(line, "Выбери число от −999 до 999.");
          return { literal: value };
        }
        if (token && (/^"(?:[^"\\]|\\["\\n])*"$/.test(token) || /^'(?:[^'\\]|\\['\\n])*'$/.test(token))) {
          const value = token.slice(1, -1).replace(/\\(.)/g, (_, char: string) => char === "n" ? "\n" : char);
          if (value.length > limits.text) fail(line, "Сообщение слишком длинное.");
          return { literal: value };
        }
        return { name: name(token) };
      };
      const child = () => {
        if (depth >= limits.depth) fail(line, "Здесь слишком много вложенных команд.");
        if (lines[row]?.indent !== indent + 4) fail(line, "На следующей строке начни команду с четырёх дополнительных пробелов.");
        return block(indent + 4, depth + 1);
      };
      const first = take();
      if (first === "if") {
        const left = atom();
        const op = take();
        if (!op || ![">", "<", ">=", "<=", "==", "!="].includes(op)) fail(line, "Добавь знак сравнения, например >.");
        const right = atom();
        expect(":"); end();
        const yes = child();
        let no: Statement[] = [];
        const otherwise = lines[row];
        if (otherwise?.indent === indent && otherwise.tokens[0] === "else") {
          if (otherwise.tokens.join(" ") !== "else :") fail(otherwise.line, "После else поставь двоеточие.");
          row++;
          no = child();
        }
        work.push({ kind: "if", line, condition: { left, op, right }, yes, no });
      } else if (first === "for") {
        const counter = name(take());
        expect("in"); expect("range"); expect("(");
        const count = atom();
        expect(")"); expect(":"); end();
        work.push({ kind: "for", line, name: counter, count, body: child() });
      } else if (is("=")) {
        take();
        const value = atom();
        end();
        work.push({ kind: "assign", line, name: name(first), value });
      } else {
        if (!first || !["print", "move", "takeoff", "land"].includes(first)) fail(line, "Эта команда пока недоступна. Сверься с примером.");
        expect("(");
        const args: Atom[] = [];
        while (!is(")")) {
          args.push(atom());
          if (!is(",")) break;
          take();
        }
        expect(")"); end();
        const arity = first === "print" ? 1 : first === "move" ? 2 : 0;
        if (args.length !== arity) fail(line, `Для ${first} нужно значений: ${arity}.`);
        work.push({ kind: "call", line, name: first, args });
      }
    }
    return work;
  }

  if (!lines.length) fail(1, "Добавь хотя бы одну команду.");
  return block(0, 0);
}

export type Execution = { ok: true; commands: Command[] } | { ok: false; line: number; message: string };

export function execute(source: string, overrides?: { fuel: number }): Execution {
  try {
    const deadline = performance.now() + limits.ms;
    const program = parse(source);
    const variables = new Map<string, Value>();
    const commands: Command[] = [];
    let steps = 0;
    let output = 0;
    const spend = (line: number) => {
      if (performance.now() > deadline) fail(line, "Заняло слишком много времени. Упрости программу.");
      if (++steps > limits.steps) fail(line, "Слишком много команд. Уменьши число повторов.");
    };
    const read = (atom: Atom, line: number): Value => {
      if ("literal" in atom) return atom.literal;
      const value = variables.get(atom.name);
      if (value === undefined) fail(line, `Сначала задай значение ${atom.name}.`);
      return value;
    };
    const integer = (value: Value, line: number) => {
      if (typeof value !== "number") fail(line, "В этой команде нужно число.");
      return value;
    };
    function run(body: Statement[]) {
      for (const statement of body) {
        const { line } = statement;
        spend(line);
        if (statement.kind === "assign") {
          const value = statement.name === "fuel" && overrides ? overrides.fuel : read(statement.value, line);
          variables.set(statement.name, value);
          const name = statement.name;
          if (name === "height" || name === "speed" || name === "fuel") {
            commands.push({ kind: "settings", line, name, value: integer(value, line) });
          } else commands.push({ kind: "step", line });
        } else if (statement.kind === "if") {
          const { left, right, op } = statement.condition;
          const a = read(left, line);
          const b = read(right, line);
          let passed: boolean;
          if (op === "==" || op === "!=") passed = op === "==" ? a === b : a !== b;
          else {
            const x = integer(a, line);
            const y = integer(b, line);
            passed = op === ">" ? x > y : op === "<" ? x < y : op === ">=" ? x >= y : x <= y;
          }
          const fuelTest = ("name" in left && left.name === "fuel") || ("name" in right && right.name === "fuel");
          commands.push({ kind: "check", line, fuelTest, passed });
          run(passed ? statement.yes : statement.no);
        } else if (statement.kind === "for") {
          const count = integer(read(statement.count, line), line);
          if (count > limits.range) fail(line, "Повтори команду не больше 16 раз.");
          commands.push({ kind: "step", line });
          for (let index = 0; index < count; index++) {
            spend(line);
            variables.set(statement.name, index);
            commands.push({ kind: "step", line });
            run(statement.body);
          }
        } else {
          const args = statement.args.map((arg) => read(arg, line));
          if (statement.name === "print") {
            if (++output > limits.output) fail(line, "Терминал вмещает 12 сообщений за запуск.");
            commands.push({ kind: "print", line, text: String(args[0]) });
          } else if (statement.name === "move") {
            const direction = args[0];
            const distance = integer(args[1]!, line);
            if (typeof direction !== "string" || !directions.has(direction)) fail(line, "Выбери right, left, up или down.");
            if (distance < 1 || distance > 7) fail(line, "Укажи от одной до семи клеток.");
            commands.push({ kind: "move", line, direction: direction as Direction, steps: distance });
          } else {
            commands.push({ kind: statement.name === "takeoff" ? "takeoff" : "land", line });
          }
        }
      }
    }
    run(program);
    return { ok: true, commands };
  } catch (error) {
    if (!(error instanceof LessonError)) throw error;
    return { ok: false, line: error.line, message: error.message };
  }
}
