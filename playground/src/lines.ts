// The "Lines" column's data: every name a handler can use (like Pawno's function list), with
// what the workbench knows about each: type, default, topic, how many Hub handlers use it, where it
// belongs (top level or inside callbacks), and what clicking it inserts.
import { api, memberSignature, ownerLabel, Member } from '@core/api';
import { BEFORE_SESSION } from '@core/lifecycle';
import { allEntries } from '@core/lookup';
import { parseLikeJint } from '@core/jsparse';
import USAGE from './usage.json';

export type Kind = 'bool' | 'number' | 'string' | 'list' | 'function' | 'other';
export const KINDS: [Kind, string][] = [
  ['bool', 'bool'],
  ['number', 'number'],
  ['string', 'string'],
  ['list', 'list'],
  ['function', 'function'],
  ['other', 'other'],
];
/** Where a name can be used: anywhere, or only in Game.Play and other callbacks. */
/** 'top': read before the session starts, so only at the top level (core/lifecycle.ts). */
export type Scope = 'any' | 'callback' | 'top';

export interface Line {
  path: string; // Game.KillMutex, Context.ModifySaveFile, Nucleus.DPIHandling.True
  text: string; // as listed (methods get "()")
  owner: string; // object group
  topic: string;
  kind: Kind;
  typeLabel: string; // bool, string[], enum DPIHandling, fn
  default?: string;
  sig: string;
  doc: string;
  /** The doc was written by Claude (AI), not taken from the official docs. */
  aiDoc?: boolean;
  deprecated?: boolean;
  scope: Scope;
  /** Settable with `path = value;` */
  assignable: boolean;
  params: string[];
  method: boolean;
  /** Values offered after `path = ` (enum values, true/false). */
  values?: string[];
  used: number; // Hub handlers using it
  /** Out of how many Hub handlers (System.* comes from a separate, smaller sample). */
  of: number;
}

export const USAGE_TOTAL: number = USAGE.handlers;
const usage = USAGE.counts as Record<string, number>;
/** Uses and sample size for a path (one sample for every name, System.* included: tools/usage-counts.mjs). */
const usedOf = (path: string): { used: number; of: number } => ({ used: usage[path] ?? 0, of: USAGE_TOTAL });

function kindOf(m: Member): Kind {
  if (m.kind === 'method' || m.type === 'function') return 'function';
  if (m.type?.startsWith('enum:')) return 'number';
  switch (m.type) {
    case 'boolean':
      return 'bool';
    case 'number':
      return 'number';
    case 'string':
      return 'string';
    case 'string[]':
    case 'number[]':
    case 'boolean[]':
    case 'array':
      return 'list';
    default:
      return 'other';
  }
}
function typeLabel(m: Member): string {
  if (m.kind === 'method') return 'fn';
  if (m.type?.startsWith('enum:')) return m.type.slice(5);
  if (m.type === 'boolean') return 'bool';
  return m.type ?? m.csType ?? '';
}
const firstSentence = (s: string) => {
  const t = s.replace(/\s+/g, ' ').trim();
  const m = t.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : t).trim();
};
const CALLBACK_OWNERS = new Set(['Context', 'PlayerInfo', 'ProtoInputRuntime', 'ProtoInputValues']);
const SETTABLE_OWNERS = new Set(['Game', 'GameHook', 'GameProtoInput', 'Context', 'PlayerInfo']);
function topicOf(owner: string, m: Member): string {
  if (m.category) return m.category;
  if (owner === 'GameProtoInput' || owner === 'ProtoInputRuntime' || owner === 'ProtoInputValues') return 'Proto Input';
  if (owner === 'GameHook') return 'Hooks (Game.Hook)';
  if (owner === 'Context') return 'Context';
  if (owner === 'PlayerInfo') return 'Players';
  return 'Other options';
}

let cache: Line[] | undefined;
export function allLines(): Line[] {
  if (cache) return cache;
  const out: Line[] = [];
  for (const e of allEntries()) {
    const m = e.member;
    if (m.kind === 'object') continue;
    const method = m.kind === 'method';
    const enumName = m.type?.startsWith('enum:') ? m.type.slice(5) : undefined;
    out.push({
      path: e.path,
      text: e.path + (method ? '()' : ''),
      owner: ownerLabel(e.owner),
      topic: topicOf(e.owner, m),
      kind: kindOf(m),
      typeLabel: typeLabel(m),
      default: m.default,
      sig: memberSignature(e.owner, e.name, m)[0] ?? e.path,
      doc: firstSentence(m.deprecated ? `Deprecated. ${m.deprecated}` : m.doc || ''),
      aiDoc: m.docBy === 'claude',
      deprecated: !!m.deprecated,
      scope: CALLBACK_OWNERS.has(e.owner) ? 'callback' : BEFORE_SESSION[e.path] ? 'top' : 'any',
      assignable: !method && !m.readonly && SETTABLE_OWNERS.has(e.owner),
      params: method ? (m.overloads?.[0]?.params ?? []).map((p) => p.name) : [],
      method,
      values: enumName && api.enums[enumName] ? Object.keys(api.enums[enumName].values).map((v) => `Nucleus.${enumName}.${v}`) : m.type === 'boolean' ? ['true', 'false'] : undefined,
      ...usedOf(e.path),
    });
  }
  for (const [name, c] of Object.entries(api.nucleusClasses)) {
    if (c.statics) {
      for (const [mn, m] of Object.entries(api.objects[c.statics]?.members ?? {})) {
        if (m.internal) continue;
        const method = m.kind === 'method';
        const path = `Nucleus.${name}.${mn}`;
        out.push({ path, text: path + (method ? '()' : ''), owner: 'Nucleus', topic: 'Nucleus values', kind: kindOf(m), typeLabel: typeLabel(m), sig: memberSignature(c.statics, mn, m)[0] ?? path, doc: firstSentence(m.doc || ''), scope: 'any', assignable: false, params: method ? (m.overloads?.[0]?.params ?? []).map((p) => p.name) : [], method, used: usage[path] ?? 0, of: USAGE_TOTAL });
      }
      continue;
    }
    const path = `new Nucleus.${name}`;
    out.push({ path, text: `${path}()`, owner: 'Nucleus', topic: 'Nucleus values', kind: 'other', typeLabel: 'class', sig: `${path}(${c.params.join(', ')})`, doc: firstSentence(c.doc || ''), scope: 'any', assignable: false, params: c.params, method: true, used: 0, of: USAGE_TOTAL });
  }
  for (const [name, e] of Object.entries(api.enums)) {
    for (const [v, n] of Object.entries(e.values)) {
      const path = `Nucleus.${name}.${v}`;
      out.push({ path, text: path, owner: `Nucleus.${name}`, topic: 'Nucleus values', kind: 'number', typeLabel: String(n), sig: `${path} = ${n}`, doc: firstSentence(e.doc || ''), scope: 'any', assignable: false, params: [], method: false, used: usage[path] ?? 0, of: USAGE_TOTAL });
    }
  }
  return (cache = out);
}

// ---------------------------------------------------------------------------
// What the handler already has, and where the cursor is

export interface Use {
  line: number; // 0-based
  value?: string; // source of the assigned value
}
export interface Scan {
  /** Function bodies [start, end) (callbacks like Game.Play). */
  functions: [number, number][];
  /** path -> assignments (or, when never assigned, other uses). */
  uses: Map<string, { assigned: Use[]; other: Use[] }>;
}

/** Jint matches members with only the first letter case-insensitive. */
const jintKey = (path: string) => path.split('.').map((s) => (s ? s[0].toLowerCase() + s.slice(1) : s)).join('.');
let index: Map<string, string> | undefined;
function canonical(path: string): string | undefined {
  if (!index) {
    index = new Map();
    for (const l of allLines()) index.set(jintKey(l.path), l.path);
  }
  return index.get(jintKey(path));
}

function pathOf(n: any): string | undefined {
  const parts: string[] = [];
  let x = n;
  while (x && x.type === 'MemberExpression') {
    if (x.computed) {
      // PlayerList[i].X -> Player.X
      if (x.object.type === 'Identifier' && x.object.name === 'PlayerList' && parts.length) return canonical(['Player', ...parts].join('.'));
      return undefined;
    }
    parts.unshift(x.property.name);
    x = x.object;
  }
  if (!x || x.type !== 'Identifier') return undefined;
  const root = x.name === 'player' ? 'Player' : x.name;
  return canonical([root, ...parts].join('.'));
}

export function scanHandler(text: string): Scan | undefined {
  let program: any;
  try {
    program = parseLikeJint(text, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true, locations: true }).program;
  } catch {
    return undefined;
  }
  const functions: [number, number][] = [];
  const uses = new Map<string, { assigned: Use[]; other: Use[] }>();
  const entry = (p: string) => {
    if (!uses.has(p)) uses.set(p, { assigned: [], other: [] });
    return uses.get(p)!;
  };
  const visit = (n: any, parent?: any) => {
    if (!n || typeof n.type !== 'string') return;
    if ((n.type === 'FunctionExpression' || n.type === 'FunctionDeclaration') && n.body) functions.push([n.body.start, n.body.end]);
    if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression') {
      const p = pathOf(n.left);
      if (p) entry(p).assigned.push({ line: n.loc.start.line - 1, value: text.slice(n.right.start, n.right.end).replace(/\s+/g, ' ') });
    } else if (n.type === 'MemberExpression' && !(parent?.type === 'MemberExpression' && parent.object === n) && !(parent?.type === 'AssignmentExpression' && parent.left === n)) {
      const p = pathOf(n);
      if (p) entry(p).other.push({ line: n.loc.start.line - 1 });
    }
    for (const k of Object.keys(n)) {
      if (k === 'loc') continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach((c) => visit(c, n));
      else if (v && typeof v.type === 'string') visit(v, n);
    }
  };
  visit(program);
  return { functions, uses };
}

export const inCallback = (scan: Scan, offset: number) => scan.functions.some(([s, e]) => offset > s && offset < e);

/** Filter match: words in the name, docs or topic, or shorthand from the starts of the name's
 *  words ("km" finds KillMutex, "kmd" KillMutexDelay, "pbs" PauseBetweenStarts). */
export function matches(l: Line, q: string, shorthand = true): boolean {
  if (!q) return true;
  const name = l.path.toLowerCase();
  if (name.includes(q) || l.doc.toLowerCase().includes(q) || l.topic.toLowerCase().includes(q)) return true;
  if (!shorthand || q.length < 2 || /[\s.]/.test(q)) return false;
  const last = l.path.slice(l.path.lastIndexOf('.') + 1);
  const words = last.split(/(?=[A-Z][a-z])|(?<=[a-z])(?=[A-Z])|_/).filter(Boolean).map((w) => w.toLowerCase());
  // Each query letter continues the current word or starts the next one, in order.
  const fit = (qi: number, wi: number, ci: number): boolean => {
    if (qi === q.length) return true;
    if (wi >= words.length) return false;
    if (ci > 0 && ci < words[wi].length && words[wi][ci] === q[qi] && fit(qi + 1, wi, ci + 1)) return true;
    for (let w = wi + (ci > 0 ? 1 : 0); w < words.length; w++) if (words[w][0] === q[qi] && fit(qi + 1, w, 1)) return true;
    return false;
  };
  return fit(0, 0, 0);
}

// ---------------------------------------------------------------------------
// A doc's example, put into the handler (Docs' "Insert into handler")

export interface Placed {
  /** The handler with the example in it. */
  text: string;
  /** 'update': the option was set, its value replaced; 'insert': added; 'callback': added with a new callback around it;
   *  'same': the handler already has exactly this (nothing changes). */
  action: 'update' | 'insert' | 'callback' | 'same';
  /** The 0-based line the example starts on, in `text`. */
  line: number;
  /** Where it went, for the message ("Game.Play", "the top level"). */
  where: string;
}

const lineStart = (t: string, at: number) => t.lastIndexOf('\n', at - 1) + 1;
const lineEnd = (t: string, at: number) => {
  const e = t.indexOf('\n', at);
  return e < 0 ? t.length : e;
};
const indentOf = (t: string, at: number) => /^[ \t]*/.exec(t.slice(lineStart(t, at)))![0];
const unitOf = (t: string) => (/^\t/m.test(t) && !/^ {2}/m.test(t) ? '\t' : /^ {4}\S/m.test(t) && !/^ {2}\S/m.test(t) ? '    ' : '  ');
const lineAt = (t: string, at: number) => t.slice(0, at).split('\n').length - 1;
// Spacing between tokens doesn't count (`[]` and `[ ]` are the same); inside a string it does.
const norm = (s: string) => s.replace(/("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|\s+/g, (_m, str?: string) => str ?? '').replace(/;$/, '');

/**
 * Where a doc's example goes, as Lines (scanHandler) sees the handler: an option assignment at the top level, replacing
 * the one already there (the value changes, nothing is added twice); anything else (Context, Player and ProtoInput
 * calls, reading a value) at the end of the callback it belongs in (`where`: Game.Play, Game.ProtoInput.OnInputLocked,
 * ...), made when the handler has none. `player.` in the example follows the callback's own parameter name.
 * Undefined when the handler doesn't parse (fix that first).
 */
export function placeExample(text: string, path: string, example: string, where = 'top'): Placed | undefined {
  const scan = scanHandler(text);
  if (!scan) return undefined;
  const program = parseLikeJint(text, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true }).program as any;
  const unit = unitOf(text);
  const top = program.body as any[];
  const assignOf = (s: any) => (s?.type === 'ExpressionStatement' && s.expression.type === 'AssignmentExpression' && s.expression.operator === '=' ? s.expression : undefined);
  const pathOfStmt = (s: any) => {
    const a = assignOf(s);
    return a && a.left.type === 'MemberExpression' ? pathOf(a.left) : undefined;
  };
  const isFn = (s: any) => /Function/.test(assignOf(s)?.right?.type ?? '');
  const block = (code: string, ind: string) => code.split('\n').map((l) => (l ? ind + l : l)).join('\n');
  // Where the example's statements stand already, one after another in `stmts` (an example can be several:
  // `var cfg = ...;` then the call), whatever the spacing; -1 when they don't.
  const foundIn = (stmts: any[], code: string) => {
    let want = [norm(code)];
    try {
      const ex = (parseLikeJint(code, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true }).program as any).body as any[];
      if (ex.length) want = ex.map((s) => norm(code.slice(s.start, s.end)));
    } catch { /* compared as one piece */ }
    const have = stmts.map((s) => norm(text.slice(s.start, s.end)));
    return have.findIndex((_, i) => want.every((w, k) => have[i + k] === w));
  };
  const insertAt = (at: number, code: string, label: string, action: Placed['action'] = 'insert'): Placed => {
    const out = text.slice(0, at) + code + text.slice(at);
    return { text: out, action, line: lineAt(out, at + (code.startsWith('\n') ? 1 : 0)), where: label };
  };

  if (where === 'top') {
    // Set already: the last top-level assignment (the one that counts) gets the example's value.
    const have = top.filter((s) => pathOfStmt(s) === path);
    let mine: any;
    try {
      const ex = (parseLikeJint(example, { ecmaVersion: 'latest', sourceType: 'script' }).program as any).body;
      if (ex.length === 1) mine = assignOf(ex[0]);
    } catch { /* not one statement: inserted as it is */ }
    const at = have.length && mine ? -1 : foundIn(top, example);
    if (at >= 0) return { text, action: 'same', line: lineAt(text, top[at].start), where: 'the top level' };
    if (have.length && mine) {
      const s = have[have.length - 1];
      const a = assignOf(s);
      const value = example.slice(mine.right.start, mine.right.end);
      if (norm(text.slice(a.right.start, a.right.end)) === norm(value)) return { text, action: 'same', line: lineAt(text, s.start), where: 'the top level' };
      const out = text.slice(0, a.right.start) + value + text.slice(a.right.end);
      return { text: out, action: 'update', line: lineAt(out, s.start), where: 'the top level' };
    }
    // New: after the last top-level option of the same object (Game.ProtoInput with Game.ProtoInput, ...), else after
    // the last option before the first callback, else before the first callback, else at the end.
    const owner = path.slice(0, path.lastIndexOf('.'));
    const firstFn = top.find(isFn);
    const options = top.filter((s) => pathOfStmt(s) && !isFn(s) && (!firstFn || s.start < firstFn.start));
    const same = top.filter((s) => { const p = pathOfStmt(s); return p && !isFn(s) && p.slice(0, p.lastIndexOf('.')) === owner; });
    const after = same[same.length - 1] ?? options[options.length - 1];
    if (after) {
      // After its line, unless more code follows it on that line (`Game.GUID = "x"; Game.Play = function () {`).
      const eol = lineEnd(text, after.end);
      const at = /^\s*(\/\/.*)?$/.test(text.slice(after.end, eol)) ? eol : after.end;
      return insertAt(at, `\n${block(example, indentOf(text, after.start))}`, 'the top level');
    }
    if (firstFn) return insertAt(lineStart(text, firstFn.start), `${example}\n\n`, 'the top level');
    return insertAt(text.length, `${text && !text.endsWith('\n') ? '\n' : ''}${example}\n`, 'the top level');
  }

  // In a callback: the top-level `Game.Play = function () { ... }` (or the one named). `player.` in an example is the
  // player whose instance it is: `Player` in Game.Play; in the other callbacks (Game.ProtoInput.OnInputLocked, ...,
  // which Nucleus calls once, with no arguments) each player in turn, inside the loop over PlayerList that Hub handlers
  // write there (made when the callback has none).
  const usesPlayer = /\bplayer\./.test(example);
  // A new loop's index and player get names the callback and the example don't use already (`return record(i);`
  // after it would otherwise see the loop's last index).
  let names = { i: 'i', player: 'player' };
  const nameLoop = (src: string) => {
    const used = new Set(src.match(/[A-Za-z_$][\w$]*/g) ?? []);
    const free = (list: string[]) => list.find((x) => !used.has(x)) ?? list.map((x) => `${x}2`).find((x) => !used.has(x)) ?? `${list[0]}_${used.size}`;
    names = { i: free(['i', 'j', 'k', 'n', 'idx', 'index']), player: free(['player', 'pl', 'p', 'plyr', 'thisPlayer']) };
  };
  const loop = (code: string, ind: string) => `${ind}for (var ${names.i} = 0; ${names.i} < PlayerList.Count; ${names.i}++) {\n${ind}${unit}var ${names.player} = PlayerList[${names.i}];\n${block(names.player === 'player' ? code : code.replace(/\bplayer\./g, `${names.player}.`), ind + unit)}\n${ind}}`;
  const exampleNames = example.replace(/\bplayer\./g, ' ');
  let fnStmt = top.filter((s) => pathOfStmt(s) === where && isFn(s)).pop();
  let fn = fnStmt && assignOf(fnStmt).right;
  // Set by name (`Game.Play = play;`): the top-level function of that name; anything else is left alone (undefined).
  const byRef = top.filter((s) => pathOfStmt(s) === where).pop();
  if (byRef && !isFn(byRef)) {
    const r = assignOf(byRef).right;
    const decl = r.type === 'Identifier' ? top.filter((s) => s.type === 'FunctionDeclaration' && s.id?.name === r.name).pop() : undefined;
    if (!decl) return undefined;
    // Rebound somewhere (`play = other;`, `var play = ...`): Nucleus may run another function, so leave it alone.
    const name = r.name.replace(/\$/g, '\\$');
    if (new RegExp(`(^|[^.\\w$])${name}\\s*=(?!=)`).test(text)) return undefined;
    fnStmt = decl;
    fn = decl;
  }
  if (!fnStmt) {
    nameLoop(exampleNames);
    const inner = usesPlayer && where !== 'Game.Play' ? loop(example, unit) : block(where === 'Game.Play' ? example.replace(/\bplayer\./g, 'Player.') : example, unit);
    const code = `${where} = function () {\n${inner}\n};\n`;
    const at = text.length;
    const lead = !text ? '' : text.endsWith('\n\n') ? '' : text.endsWith('\n') ? '\n' : '\n\n';
    const out = text + lead + code;
    // The example's line (inside the new loop, when there is one).
    return { text: out, action: 'callback', line: lineAt(out, at + lead.length) + 1 + (usesPlayer && where !== 'Game.Play' ? 2 : 0), where };
  }
  let code = example;
  let body = fn.body;
  let wrap = false;
  if (usesPlayer && where === 'Game.Play') code = code.replace(/\bplayer\./g, 'Player.');
  else if (usesPlayer) {
    // The callback's own loop over PlayerList (`var p = PlayerList[i];` in a for loop's body), else a new one.
    // Only a loop over the whole list: `for (var i = 0; i < PlayerList.Count; i++)` with `PlayerList[i]`.
    const isId = (n: any, name?: string) => n?.type === 'Identifier' && (!name || n.name === name);
    const whole = (s: any) => {
      const t = s.test, init = s.init?.type === 'VariableDeclaration' ? s.init.declarations[0] : s.init?.type === 'AssignmentExpression' ? { id: s.init.left, init: s.init.right } : undefined;
      const idx = isId(t?.left) ? t.left.name : undefined;
      // One player at a time: `i++`, `++i`, `i += 1` or `i = i + 1`.
      const u = s.update;
      const one = (n: any) => n?.type === 'Literal' && n.value === 1;
      const step = (u?.type === 'UpdateExpression' && u.operator === '++' && isId(u.argument, idx))
        || (u?.type === 'AssignmentExpression' && isId(u.left, idx) && ((u.operator === '+=' && one(u.right))
          || (u.operator === '=' && u.right?.type === 'BinaryExpression' && u.right.operator === '+' && ((isId(u.right.left, idx) && one(u.right.right)) || (one(u.right.left) && isId(u.right.right, idx))))));
      return idx && step && t.operator === '<' && t.right?.type === 'MemberExpression' && isId(t.right.object, 'PlayerList') && isId(t.right.property, 'Count') && isId(init?.id, idx) && init.init?.type === 'Literal' && init.init.value === 0 ? idx : undefined;
    };
    const forLoop = (fn.body.body as any[]).filter((s) => s.type === 'ForStatement' && s.body.type === 'BlockStatement' && whole(s)).map((s) => {
      const idx = whole(s);
      const x = s.body.body.flatMap((d: any) => (d.type === 'VariableDeclaration' ? d.declarations : [])).find((x: any) => x.init?.type === 'MemberExpression' && x.init.computed && isId(x.init.object, 'PlayerList') && isId(x.init.property, idx) && isId(x.id));
      return x ? { s, name: x.id.name as string } : undefined;
    }).filter(Boolean).pop();
    if (forLoop) {
      body = forLoop.s.body;
      if (forLoop.name !== 'player') code = code.replace(/\bplayer\./g, `${forLoop.name}.`);
    } else {
      wrap = true;
      nameLoop(`${text.slice(fn.start, fn.end)} ${exampleNames}`);
    }
  }
  const stmts = body.body as any[];
  const at = foundIn(stmts, code);
  if (at >= 0) return { text, action: 'same', line: lineAt(text, stmts[at].start), where };
  const outer = indentOf(text, body === fn.body ? fnStmt.start : body.start);
  const last = stmts[stmts.length - 1];
  const ind = last && lineStart(text, last.start) > body.start ? indentOf(text, last.start) : outer + unit;
  if (wrap) code = loop(code, '');
  const shift = (p: Placed): Placed => (wrap ? { ...p, line: p.line + 2 } : p); // the example's line, inside the new loop
  // Ending in `return;`: before it, or the call would never run.
  const close = body.end - 1;
  const ls = last ? lineStart(text, last.start) : -1;
  if (last?.type === 'ReturnStatement') {
    // On a line of its own.
    if (ls > body.start && /^\s*$/.test(text.slice(ls, last.start))) return shift(insertAt(ls, `${block(code, ind)}\n`, where));
    // After other code on its line (`a(); return;`): the return moves to a line of its own.
    if (ls > body.start) {
      const before = text.slice(0, last.start).replace(/[ \t]+$/, '');
      const out = before + `\n${block(code, ind)}\n${ind}` + text.slice(last.start);
      return shift({ text: out, action: 'insert', line: lineAt(out, before.length + 1), where });
    }
    // On the line of the `{` (`function () { a(); return; }`): open it up, the example before the return.
    const head = text.slice(body.start + 1, last.start).trim();
    const ret = text.slice(last.start, close).trim();
    const out = text.slice(0, body.start + 1) + (head ? `\n${ind}${head}` : '') + `\n${block(code, ind)}\n${ind}${ret}\n${outer}` + text.slice(close);
    return shift({ text: out, action: 'insert', line: lineAt(out, body.start) + (head ? 2 : 1), where });
  }
  const cls = lineStart(text, close);
  if (cls > body.start && /^\s*$/.test(text.slice(cls, close))) return shift(insertAt(cls, `${block(code, ind)}\n`, where));
  // `function () {}` or `{ a(); }` on one line: open it up.
  const out = text.slice(0, body.start + 1) + text.slice(body.start + 1, close).replace(/^\s+|\s+$/g, '').replace(/^(.+)$/, `\n${ind}$1`) + `\n${block(code, ind)}\n${outer}` + text.slice(close);
  return shift({ text: out, action: 'insert', line: lineAt(out, body.start) + (stmts.length ? 2 : 1), where });
}
