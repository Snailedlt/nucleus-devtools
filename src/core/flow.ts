// The handler as a flow (the workbench's Flow view, "Direction B" of the visual editor research): its settings,
// the questions it asks the players, and each callback as steps in the order Nucleus runs them, an `if` as a fork
// into branches. Everything reads the real code: each step keeps its range in the source, so the code is one
// click away and nothing is ever lost (a statement this can't read is a "code" step, shown as its code).
//
// Pure (no DOM): parsed with acorn the way Jint parses (core/jsparse.ts). The phrases (which code reads as which
// plain-language step) are the idioms Hub handlers use most: the copy triple
// (`var savePath = (Context.SavePath = …); var savePkgOrigin = …; System.IO.File.Copy(savePkgOrigin, savePath, true);`),
// a folder made, lines changed with FindLineNumberInTextFile + ReplaceLinesInTextFile, a text file written,
// RunAdditionalFiles, the start arguments.
import type * as acorn from 'acorn';
import { parseLikeJint } from './jsparse';
import { api } from './api';
import { optionLabel, readableName } from './optionlabels';

/** A value as the Flow view shows it: pills and text. */
export type TokKind = 'place' | 'player' | 'opt' | 'num' | 'bool' | 'text' | 'var' | 'enum' | 'list' | 'code' | 'key';
export interface Tok {
  t: TokKind;
  /** What it says on screen */
  l: string;
  /** Its code (shown on hover, and when the field is shown as code) */
  c: string;
  /** A list's entries */
  items?: Tok[][];
  /** The API path it stands for, for Docs */
  ref?: string;
}
/** A sentence: words, and the values in it as pills. */
export type Part = string | Tok;

export interface Field {
  label: string;
  value: Tok[];
  /** The code of the value */
  code: string;
}

export type StepKind = 'act' | 'group' | 'if' | 'loop' | 'code' | 'off';
export interface Step {
  /** Stable within the handler while its shape stays: callback, path of indexes and verb. */
  id: string;
  kind: StepKind;
  icon: string;
  verb: string;
  summary: Part[];
  fields?: Field[];
  /** The API a step uses, for Docs (F1) */
  ref?: string;
  /** Its source range */
  from: number;
  to: number;
  /** if: the condition, and the branches */
  cond?: Part[];
  then?: Step[];
  else?: Step[];
  /** loop: what it repeats */
  body?: Step[];
  /** group: the steps of a run, a table */
  items?: Step[];
  /** group: the columns of its table */
  columns?: string[];
}

export interface Setting {
  path: string;
  label: string;
  section: string;
  value: Tok[];
  code: string;
  from: number;
  to: number;
}
export interface Question {
  key: string;
  question: string;
  answers: string[];
  from: number;
  to: number;
}
export interface Callback {
  id: string;
  api: string;
  label: string;
  steps: Step[];
  from: number;
  to: number;
}
export interface Flow {
  ok: boolean;
  /** Why it couldn't be read (a syntax error): the view shows the code then. */
  error?: string;
  settings: Setting[];
  questions: Question[];
  callbacks: Callback[];
  /** Top-level code that isn't a setting, a question or a callback (helper functions, variables). */
  other: Step[];
}

type N = acorn.Node & Record<string, any>;

/** The callbacks Nucleus calls, in the order a session runs them, with what each is for. */
const CALLBACKS: Record<string, string> = {
  'Game.Play': 'For each player, before their game starts',
  'Game.OnFinishedSetup': 'Once, after every player has started',
  'Game.ProtoInput.OnInputLocked': 'When input gets locked',
  'Game.ProtoInput.OnInputUnlocked': 'When input gets unlocked',
  'Game.OnCustomHotKey_1': 'When the first custom hotkey is pressed',
  'Game.OnCustomHotKey_2': 'When the second custom hotkey is pressed',
  'Game.OnCustomHotKey_3': 'When the third custom hotkey is pressed',
  'Game.OnStop': 'When the session stops',
};
const CALLBACK_ORDER = Object.keys(CALLBACKS);

/** Folders and per-player values as pills (labels from the mockups; checked against GenericContext.cs). */
const PLACES: Record<string, string> = {
  'Context.GetFolder(Nucleus.Folder.InstancedGameFolder)': "This player's game folder",
  'Context.GetFolder(Nucleus.Folder.MainGameFolder)': "The game's own folder",
  'Context.GetFolder(Nucleus.Folder.Documents)': "This player's Documents",
  'Game.Folder': "Handler's own folder",
  // GenericContext.ScriptFolder: GetJsScriptsPath() + "\\" + the handler's file name, so handlers\<name>.
  'Context.ScriptFolder': "Handler's own folder",
  'Context.HandlersFolder': 'Nucleus handlers folder',
  'Context.RootInstallFolder': "Game's install folder",
  'Context.RootFolder': "This player's game root",
  'Context.NucleusFolder': 'Nucleus folder',
  'Context.UtilFolder': "Nucleus' utils folder",
  'Context.ExePath': "This player's game .exe",
  'Context.EnvironmentPlayer': "This player's user folder",
  'Context.DocumentsPlayer': "This player's Documents",
  'Context.NucleusUserRoot': 'Your user folder',
};
const PLAYER: Record<string, string> = {
  'Context.Width': 'Window width',
  'Context.Height': 'Window height',
  'Context.PosX': 'Window left',
  'Context.PosY': 'Window top',
  'Context.GamepadId': 'Controller number',
  'Context.PlayerID': 'Player number (from 0)',
  'Context.Nickname': 'Player name',
  'Context.IsKeyboardPlayer': 'Uses keyboard & mouse',
  'Player.IsKeyboardPlayer': 'Uses keyboard & mouse',
  'Context.NumberOfPlayers': 'Number of players',
  'Context.MonitorWidth': 'Screen width',
  'Context.MonitorHeight': 'Screen height',
  'Context.AspectRatioDecimal': 'Window aspect ratio',
  'Context.PlayerSteamID': "Player's Steam ID",
  'Context.LocalIP': 'Local IP address',
  'Context.UserName': 'Windows user name',
  'Context.StartArguments': 'Start arguments',
};

const src = (text: string, n: N) => text.slice(n.start, n.end);
/** `a.b.c` of a member expression, or undefined when it isn't one (computed parts, calls). */
function path(n: N | undefined): string | undefined {
  if (!n) return undefined;
  if (n.type === 'Identifier') return n.name;
  if (n.type === 'MemberExpression' && !n.computed) {
    const o = path(n.object);
    return o && `${o}.${n.property.name}`;
  }
  return undefined;
}
const short = (s: string, n = 60) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** The values of `var`s in a function, for following a value through it ("var native = Context.Options['Native']"). */
type Vars = Map<string, { init: N; once: boolean; uses: number }>;

/** Adjacent pieces of text as one ("\\" + "file.ini" reads as "\\file.ini"). */
function mergeText(toks: Tok[]): Tok[] {
  const out: Tok[] = [];
  for (const t of toks) {
    const last = out[out.length - 1];
    if (t.t === 'text' && last?.t === 'text') out[out.length - 1] = { t: 'text', l: last.l + t.l, c: `${last.c} + ${t.c}` };
    else out.push(t);
  }
  return out;
}

/** For each `var x = …` (by the declarator's start), how often x is used before it's declared again. */
function regionUses(body: N): Map<number, number[]> {
  const refs: { name: string; pos: number }[] = [];
  const decls: { name: string; start: number; end: number }[] = [];
  const walk = (n: any, key?: string, parent?: any) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach((x) => walk(x, key, parent));
    if (n.type === 'VariableDeclarator' && n.id?.type === 'Identifier') decls.push({ name: n.id.name, start: n.start, end: n.end });
    if (n.type === 'Identifier' && !(key === 'id' && parent?.type === 'VariableDeclarator') && !(key === 'property' && parent?.type === 'MemberExpression' && !parent.computed)) refs.push({ name: n.name, pos: n.start });
    for (const k of Object.keys(n)) if (k !== 'type' && typeof n[k] === 'object') walk(n[k], k, n);
  };
  walk(body);
  const out = new Map<number, number[]>();
  for (const d of decls) {
    const next = decls.find((x) => x.name === d.name && x.start > d.start)?.start ?? Infinity;
    out.set(d.start, refs.filter((r) => r.name === d.name && r.pos > d.end && r.pos < next).map((r) => r.pos));
  }
  return out;
}

class Reader {
  constructor(private text: string) {}
  vars: Vars = new Map();
  /** Uses of each `var` before it's declared again (regionUses): one that's used once reads as what it holds. */
  uses = new Map<number, number[]>();
  /** The statements after the one being read (a `var` folds into one of the next two). */
  next: N[] = [];

  value(n: N, depth = 0): Tok[] {
    const code = src(this.text, n);
    if (depth > 8) return [{ t: 'code', l: short(code), c: code }];
    switch (n.type) {
      case 'Literal':
        if (typeof n.value === 'string') return [{ t: 'text', l: n.value, c: code }];
        if (typeof n.value === 'number') return [{ t: /^0x/i.test(code) ? 'key' : 'num', l: code, c: code }];
        if (typeof n.value === 'boolean') return [{ t: 'bool', l: n.value ? 'On' : 'Off', c: code }];
        if (n.value === null) return [{ t: 'code', l: 'nothing', c: code }];
        break;
      case 'AssignmentExpression':
        // `(Context.SavePath = X)`: the value is X
        if (n.operator === '=') return this.value(n.right, depth + 1);
        break;
      case 'BinaryExpression':
        if (n.operator === '+') return mergeText([...this.value(n.left, depth + 1), ...this.value(n.right, depth + 1)]);
        break;
      case 'ArrayExpression':
        return [{ t: 'list', l: `${n.elements.length} ${n.elements.length === 1 ? 'entry' : 'entries'}`, c: code, items: n.elements.filter(Boolean).map((e: N) => this.value(e, depth + 1)) }];
      case 'Identifier': {
        const v = this.vars.get(n.name);
        if (v && depth < 3) {
          const inner = this.value(v.init, depth + 1);
          if (v.once) return inner;
          // A variable that holds an answer or a place reads as what it holds.
          if (inner.length === 1 && (inner[0].t === 'opt' || inner[0].t === 'place' || inner[0].t === 'player')) return inner;
        }
        return [{ t: 'var', l: n.name, c: code }];
      }
      case 'CallExpression': {
        const p = path(n.callee);
        if (p === 'System.IO.Path.Combine') {
          const out: Tok[] = [];
          n.arguments.forEach((a: N, i: number) => {
            const v = this.value(a, depth + 1);
            if (i && !(v[0]?.t === 'text' && /^[\\/]/.test(v[0].l))) out.push({ t: 'text', l: '\\', c: '"\\\\"' });
            out.push(...v);
          });
          return mergeText(out);
        }
        if (PLACES[code]) return [{ t: 'place', l: PLACES[code], c: code, ref: 'Nucleus.Folder' }];
        break;
      }
      case 'MemberExpression': {
        // Context.Options["Key"]: the player's answer to a question
        if (n.computed && path(n.object) === 'Context.Options' && n.property.type === 'Literal') return [{ t: 'opt', l: `Answer: ${n.property.value}`, c: code, ref: 'Context.Options' }];
        const p = path(n);
        if (p && PLACES[p]) return [{ t: 'place', l: PLACES[p], c: code, ref: p }];
        if (p && PLAYER[p]) return [{ t: 'player', l: PLAYER[p], c: code, ref: p }];
        if (p?.startsWith('Nucleus.')) return [{ t: 'enum', l: readableName(p.split('.').pop()!), c: code, ref: p.split('.').slice(0, 2).join('.') }];
        if (p?.startsWith('Context.')) return [{ t: 'player', l: readableName(p.slice(8)), c: code, ref: p }];
        break;
      }
      case 'UnaryExpression':
        if (n.operator === '-' && n.argument.type === 'Literal') return [{ t: 'num', l: code, c: code }];
        break;
    }
    return [{ t: 'code', l: short(code.replace(/\s+/g, ' ')), c: code }];
  }

  /** A condition in words: "Uses keyboard & mouse", "Answer: Native is Yes", "… doesn't exist". */
  cond(n: N): Part[] {
    if (n.type === 'UnaryExpression' && n.operator === '!') {
      if (n.argument.type === 'CallExpression' && /^System\.IO\.(File|Directory)\.Exists$/.test(path(n.argument.callee) ?? '')) return [...this.value(n.argument.arguments[0]), "doesn't exist"];
      const inner = this.cond(n.argument);
      return ['not', ...inner];
    }
    if (n.type === 'CallExpression' && /^System\.IO\.(File|Directory)\.Exists$/.test(path(n.callee) ?? '')) return [...this.value(n.arguments[0]), 'exists'];
    if (n.type === 'LogicalExpression') return [...this.cond(n.left), n.operator === '&&' ? 'and' : 'or', ...this.cond(n.right)];
    if (n.type === 'BinaryExpression') {
      const op: Record<string, string> = { '==': 'is', '===': 'is', '!=': 'is not', '!==': 'is not', '<': 'is less than', '>': 'is more than', '<=': 'is at most', '>=': 'is at least' };
      if (op[n.operator]) return [...this.value(n.left), op[n.operator], ...this.value(n.right)];
    }
    if (n.type === 'CallExpression' && path(n.callee)?.endsWith('.IsDualHorizontal')) return ['the screen is split side by side for two'];
    return this.value(n);
  }
}

const act = (id: string, n: N, icon: string, verb: string, summary: Part[], fields: Field[], ref?: string): Step => ({ id, kind: 'act', icon, verb, summary, fields, ref, from: n.start, to: n.end });

export function readFlow(text: string): Flow {
  const flow: Flow = { ok: true, settings: [], questions: [], callbacks: [], other: [] };
  let program: N;
  const comments: acorn.Comment[] = [];
  try {
    program = parseLikeJint(text, { ecmaVersion: 'latest', allowReturnOutsideFunction: true, allowHashBang: true, onComment: comments }).program as N;
  } catch (e: any) {
    return { ...flow, ok: false, error: String(e?.message ?? e) };
  }
  const r = new Reader(text);

  const fieldOf = (label: string, n: N): Field => ({ label, value: r.value(n), code: src(text, n) });

  /** One statement of a callback as a step. */
  const stepOf = (n: N, id: string): Step => {
    const code = src(text, n);
    if (n.type === 'IfStatement') {
      return { id, kind: 'if', icon: 'if', verb: 'If', summary: [], cond: r.cond(n.test), then: lane(blockBody(n.consequent), `${id}.y`), else: n.alternate ? lane(blockBody(n.alternate), `${id}.n`) : undefined, from: n.start, to: n.end };
    }
    if (n.type === 'ForStatement' || n.type === 'WhileStatement' || n.type === 'ForInStatement' || n.type === 'DoWhileStatement') {
      const what = n.type === 'ForInStatement' ? [`each ${src(text, n.left).replace(/^var\s+/, '')} in`, ...r.value(n.right)] : n.type === 'ForStatement' && n.test ? ['while', ...r.cond(n.test)] : n.test ? ['while', ...r.cond(n.test)] : ['for ever'];
      return { id, kind: 'loop', icon: 'loop', verb: 'Repeat', summary: what, body: lane(blockBody(n.body), `${id}.b`), from: n.start, to: n.end };
    }
    if (n.type === 'VariableDeclaration' && n.declarations.length === 1 && n.declarations[0].init) {
      const d = n.declarations[0];
      const at = r.uses.get(d.start) ?? [];
      // Used only in the next statement, or in the next two when the first is another `var` that folds (txtPath, dict, then the call).
      const within = (k: number) => k <= r.next.length && at.every((pos) => pos >= r.next[0].start && pos < r.next[k - 1].end) && r.next[k - 1].type !== 'VariableDeclaration';
      const once = at.length > 0 && (within(1) || within(2));
      r.vars.set(d.id.name, { init: d.init, once, uses: at.length });
      onceVars.set(id, once ? d.id.name : '');
      return act(id, n, 'var', 'Name a value', [{ t: 'var', l: d.id.name, c: d.id.name }, '=', ...r.value(d.init)], [fieldOf(d.id.name, d.init)]);
    }
    if (n.type === 'ExpressionStatement') {
      const e = n.expression as N;
      if (e.type === 'AssignmentExpression' && e.operator === '=') {
        const p = path(e.left);
        if (p === 'Context.StartArguments') return act(id, n, 'set', 'Set the start arguments', r.value(e.right), [fieldOf('Start arguments', e.right)], p);
        if (p && /^Game\./.test(p)) {
          const m = memberOf(p);
          return act(id, n, 'set', 'Set an option', [optionLabel(p, m).label, 'to', ...r.value(e.right)], [fieldOf(optionLabel(p, m).label, e.right)], p);
        }
        if (p && /^Context\./.test(p)) return act(id, n, 'set', 'Set for this player', [PLAYER[p] ?? readableName(p.slice(8)), 'to', ...r.value(e.right)], [fieldOf(PLAYER[p] ?? readableName(p.slice(8)), e.right)], p);
      }
      if (e.type === 'CallExpression') {
        const p = path(e.callee) ?? '';
        const a = e.arguments as N[];
        if (p === 'System.IO.File.Copy' && a.length >= 2) return act(id, n, 'copy', 'Copy a file', [...r.value(a[0]), 'to', ...r.value(a[1])], [fieldOf('From', a[0]), fieldOf('To', a[1]), ...(a[2] ? [fieldOf('Replace if it exists', a[2])] : [])], p);
        if (p === 'System.IO.Directory.CreateDirectory' && a[0]) return act(id, n, 'folder', 'Create a folder', r.value(a[0]), [fieldOf('Folder', a[0])], p);
        if ((p === 'System.IO.File.Delete' || p === 'System.IO.Directory.Delete') && a[0]) return act(id, n, 'del', p.endsWith('File.Delete') ? 'Delete a file' : 'Delete a folder', r.value(a[0]), [fieldOf(p.endsWith('File.Delete') ? 'File' : 'Folder', a[0])], p);
        if (p === 'Context.RunAdditionalFiles' && a[0]) {
          const progs = a[0].type === 'ArrayExpression' ? a[0].elements.length : 1;
          return act(id, n, 'run', progs === 1 ? 'Run a program' : `Run ${progs} programs`, r.value(a[0]), [fieldOf('Programs', a[0]), ...(a[2] ? [fieldOf('Wait between them (s)', a[2])] : [])], p);
        }
        if (p === 'Context.WriteTextFile' && a.length >= 2) return act(id, n, 'write', 'Write a text file', [...r.value(a[0])], [fieldOf('File', a[0]), fieldOf('Lines', a[1])], p);
        if (p === 'Context.ReplaceLinesInTextFile' && a.length >= 2) {
          const held = a[1].type === 'Identifier' ? r.vars.get(a[1].name)?.init : undefined;
          const lines = a[1].type === 'ArrayExpression' ? a[1].elements.length : held?.type === 'ArrayExpression' ? held.elements.length : 0;
          return act(id, n, 'edit', lines > 1 ? `Change ${lines} lines` : 'Change a line', ['in', ...r.value(a[0])], [fieldOf('File', a[0]), fieldOf('Lines', a[1])], p);
        }
        if (p === 'Context.ModifySaveFile' && a.length >= 2) return act(id, n, 'edit', 'Change settings in a file', ['in', ...r.value(a[1])], a.map((x, i) => fieldOf(['File to copy', 'File to change', 'Kind', 'Settings'][i] ?? `Value ${i + 1}`, x)), p);
        if (p === 'Context.PatchFile' && a.length >= 2) return act(id, n, 'patch', 'Patch a file', [...r.value(a[0])], a.map((x, i) => fieldOf(['Original', 'Patched copy', 'Find', 'Replace with'][i] ?? `Value ${i + 1}`, x)), p);
        if (p === 'Context.EditRegKey' && a.length >= 3) return act(id, n, 'reg', 'Edit the registry', [...r.value(a[1]), '›', ...r.value(a[2])], a.map((x, i) => fieldOf(['Root', 'Key', 'Name', 'Value', 'Kind'][i] ?? `Value ${i + 1}`, x)), p);
        if (p === 'Context.Log' && a[0]) return act(id, n, 'log', 'Write to the log', r.value(a[0]), a.map((x, i) => fieldOf(i ? 'Value' : 'Message', x)), p);
        if (p.endsWith('.push') && a.length === 1) return act(id, n, 'list', 'Add to a list', [...r.value(a[0]), 'to', { t: 'var', l: p.slice(0, -5), c: p.slice(0, -5) }], [fieldOf('Entry', a[0])]);
        if (/^(Context|Game|System|Handler|ProtoInput)\./.test(p)) {
          const m = memberOf(p);
          return act(id, n, 'run', readableName(p.split('.').pop()!), a.map((x) => r.value(x)).flatMap((v, i) => (i ? [',', ...v] : v)), a.map((x, i) => fieldOf((m?.overloads?.find((o) => o.params.length === a.length) ?? m?.overloads?.[0])?.params[i]?.name ?? `Value ${i + 1}`, x)), p);
        }
      }
    }
    return { id, kind: 'code', icon: 'code', verb: 'Code', summary: [short(code.split('\n')[0].trim(), 70)], from: n.start, to: n.end };
  };

  const blockBody = (n: N): N[] => (n.type === 'BlockStatement' ? n.body : [n]);

  /** A run of statements as steps: the copy triple and other `var`s used once fold into their step, commented-out
   *  code between them is a "turned off" step, and runs of the same kind of step become one group. */
  const lane = (body: N[], base: string): Step[] => {
    const steps: Step[] = [];
    body.forEach((n, i) => {
      // Commented-out code right before this statement (after the previous one)
      const prevEnd = i ? body[i - 1].end : (n as N).start - 0;
      const off = comments.filter((c) => c.type === 'Line' && c.start >= (i ? prevEnd : 0) && c.end <= n.start && /[;=(]/.test(c.value) && /^\s*[\w.$[\]"' ]+\s*(=|\()/.test(c.value));
      if (off.length && i) steps.push({ id: `${base}.${i}off`, kind: 'off', icon: 'off', verb: 'Turned off', summary: [`${off.length} commented-out line${off.length === 1 ? '' : 's'}`], from: off[0].start, to: off[off.length - 1].end });
      r.next = body.slice(i + 1, i + 3);
      steps.push(stepOf(n as N, `${base}.${i}`));
    });
    // Fold `var x = …` into the next step when that's its only use.
    for (let i = 0; i < steps.length - 1; i++) {
      const s = steps[i];
      if (s.kind !== 'act' || s.verb !== 'Name a value') continue;
      const name = onceVars.get(s.id);
      if (!name) continue;
      // Its one use is in one of the next two steps (the copy triple's two vars, then the copy).
      for (let j = i + 1; j < Math.min(steps.length, i + 3); j++) {
        const t = steps[j];
        if (t.kind === 'act' && t.verb !== 'Name a value' && src(text, { start: t.from, end: t.to } as N).match(new RegExp(`\\b${name}\\b`))) {
          t.from = Math.min(t.from, s.from);
          steps.splice(i, 1);
          i--;
          break;
        }
      }
    }
    // The steps before a folded one keep their own range: recompute after the splices.
    return groupRuns(steps, base);
  };

  /** The `var` steps whose value is used once (by id: the name), to fold into the step that uses it. */
  const onceVars = new Map<string, string>();
  r.uses = regionUses(program);
  (program.body as N[]).forEach((st, idx) => {
    const e = st.type === 'ExpressionStatement' ? (st.expression as N) : undefined;
    const p = e?.type === 'AssignmentExpression' ? path(e.left) : undefined;
    if (e?.type === 'AssignmentExpression' && p && (e.right.type === 'FunctionExpression' || e.right.type === 'ArrowFunctionExpression') && /^Game\./.test(p)) {
      const top = { vars: r.vars, uses: r.uses };
      r.vars = new Map();
      r.uses = regionUses(e.right.body);
      const body = e.right.body.type === 'BlockStatement' ? e.right.body.body : [];
      flow.callbacks.push({ id: `cb:${p}`, api: p, label: CALLBACKS[p] ?? (memberOf(p)?.doc?.split(/\.\s/)[0] ?? readableName(p.split('.').pop()!)), steps: lane(body, p), from: st.start, to: st.end });
      Object.assign(r, top);
      return;
    }
    if (e?.type === 'AssignmentExpression' && e.operator === '=' && p && /^Game\./.test(p)) {
      const m = memberOf(p);
      flow.settings.push({ path: p, label: optionLabel(p, m).label, section: sectionOf(p, m), value: r.value(e.right), code: src(text, e.right), from: st.start, to: st.end });
      return;
    }
    if (e?.type === 'CallExpression' && path(e.callee) === 'Game.AddOption') {
      const a = e.arguments as N[];
      const lit = (x?: N) => (x?.type === 'Literal' ? String(x.value) : x ? src(text, x) : '');
      // The answers, also when a `var` above holds them (that var then shows here only).
      const held = a[3]?.type === 'Identifier' ? r.vars.get(a[3].name) : undefined;
      const list = held?.init.type === 'ArrayExpression' ? held.init : a[3];
      if (held && (held.once || held.uses === 1)) flow.other = flow.other.filter((o) => !(o.verb === 'Name a value' && (o.summary[0] as Tok).l === a[3].name));
      const answers = list?.type === 'ArrayExpression' ? list.elements.map((x: N) => lit(x)) : list ? [lit(list)] : [];
      flow.questions.push({ key: lit(a[2]), question: lit(a[0]), answers, from: st.start, to: st.end });
      return;
    }
    // Hub.* lines are the Hub's own (written on upload): not shown.
    if (p?.startsWith('Hub.')) return;
    r.next = (program.body as N[]).slice(idx + 1, idx + 3);
    flow.other.push(stepOf(st, `top.${flow.other.length}`));
  });
  const order = ['Game Info', 'File System', 'Window manipulation', 'Focus', 'Input', 'Support for multiple mice and keyboards', 'Proto Input', 'Hooks', 'Mutex', 'Goldberg Emulator'];
  const rank = (sec: string) => (order.indexOf(sec) + 1 || (sec === 'Other' ? 99 : 50));
  flow.settings.sort((x, y) => rank(x.section) - rank(y.section));
  flow.callbacks.sort((a, b) => (CALLBACK_ORDER.indexOf(a.api) + 1 || 99) - (CALLBACK_ORDER.indexOf(b.api) + 1 || 99));
  return flow;
}

function memberOf(p: string) {
  const parts = p.split('.');
  const owner = parts.length === 3 && parts[1] === 'ProtoInput' ? 'GameProtoInput' : parts.length === 3 && parts[1] === 'Hook' ? 'GameHook' : parts[0];
  return api.objects[owner]?.members[parts[parts.length - 1]];
}

/** The section of the settings an option is shown in: the docs' category. */
function sectionOf(p: string, m?: { category?: string }): string {
  if (p.startsWith('Game.ProtoInput.')) return 'Proto Input';
  if (p.startsWith('Game.Hook.')) return 'Hooks';
  return m?.category ?? 'Other';
}

/** Three or more steps of the same kind in a row are one group, shown as a table. */
function groupRuns(steps: Step[], base: string): Step[] {
  const out: Step[] = [];
  for (let i = 0; i < steps.length; ) {
    const s = steps[i];
    let j = i + 1;
    const key = (x: Step) => (x.kind === 'act' ? (x.verb.startsWith('Change ') ? 'edit' : x.icon === 'set' ? `set:${x.verb}` : x.verb) : undefined);
    while (j < steps.length && key(steps[j]) !== undefined && key(steps[j]) === key(s)) j++;
    if (j - i >= 3 && key(s)) {
      const items = steps.slice(i, j);
      const n = items.length;
      const verb = s.icon === 'copy' ? `Copy ${n} files` : s.icon === 'folder' ? `Create ${n} folders` : s.icon === 'set' && s.verb === 'Set an option' ? `Set ${n} options` : s.icon === 'edit' ? `Change lines in ${n} files` : s.icon === 'var' ? `Name ${n} values` : s.verb === 'Run a program' ? `Run ${n} programs` : `${s.verb} (${n}×)`;
      const columns = s.verb === 'Set an option' ? ['Option', 'Value'] : (s.fields ?? []).map((f) => f.label).filter((l) => l !== 'Replace if it exists');
      out.push({ id: `${base}.g${i}`, kind: 'group', icon: s.icon, verb, summary: commonSummary(items), items, columns, ref: s.ref, from: items[0].from, to: items[n - 1].to });
      i = j;
    } else {
      out.push(s);
      i++;
    }
  }
  return out;
}

/** What a group's steps share: the place they write to, when it's the same ("to This player's game folder"). */
function commonSummary(items: Step[]): Part[] {
  const lastField = (s: Step) => s.fields?.[s.icon === 'copy' ? 1 : 0]?.value[0];
  const first = lastField(items[0]);
  if (first && first.t === 'place' && items.every((s) => lastField(s)?.c === first.c)) return [items[0].icon === 'copy' ? 'into' : 'in', first];
  // Options: their names, the first few
  if (items[0].verb === 'Set an option') return [items.slice(0, 3).map((s) => s.fields?.[0]?.label).join(', ') + (items.length > 3 ? ', …' : '')];
  return [];
}

/** Every step of a flow, depth first, for finding one by id or by a position in the code. */
export function allSteps(f: Flow): Step[] {
  const out: Step[] = [];
  const walk = (s: Step[]) => {
    for (const x of s) {
      out.push(x);
      for (const k of ['then', 'else', 'body', 'items'] as const) if (x[k]) walk(x[k]!);
    }
  };
  walk(f.other);
  for (const c of f.callbacks) walk(c.steps);
  return out;
}

/** The innermost step whose code holds `offset` (for putting a problem on its step). */
export function stepAt(f: Flow, offset: number): Step | undefined {
  let best: Step | undefined;
  for (const s of allSteps(f)) if (offset >= s.from && offset < s.to && (!best || s.to - s.from <= best.to - best.from)) best = s;
  return best;
}
