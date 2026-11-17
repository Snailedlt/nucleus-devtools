#!/usr/bin/env node
// How Hub handlers use each API name, for the docs' examples and "In practice" counts (data/hub-examples.json):
// per option, how many verified Hub handlers set it and the values they set it to most often; per method, how
// many call it, where (Game.Play, Game.OnFinishedSetup, ...) and the most common calls whose arguments are all
// literal values. Only counts and literal values leave this script, never handler code.
//
//   node scripts/hub-examples.mjs --hub <dir with hub/<id>.js and hub/packages.json>
//
// The dir is a checkout of the testbench's `data` branch (its `hub/` mirror of every Hub handler):
//   git -C ../nucleuscoop-handler-testbench fetch origin data
//   mkdir /tmp/hubdata && git -C ../nucleuscoop-handler-testbench archive origin/data hub | tar -x -C /tmp/hubdata
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { ENGINE_MIN_HANDLERS } from './hub-engines.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = process.argv.indexOf('--hub');
const hubDir = at > 0 ? path.resolve(process.argv[at + 1], 'hub') : null;
if (!hubDir || !fs.existsSync(path.join(hubDir, 'packages.json'))) {
  console.error('usage: node scripts/hub-examples.mjs --hub <dir with hub/packages.json>');
  process.exit(2);
}
const api = JSON.parse(fs.readFileSync(path.join(root, 'data', 'nucleus-api.json'), 'utf8'));
const packages = JSON.parse(fs.readFileSync(path.join(hubDir, 'packages.json'), 'utf8'));
// Each handler's game engine family (data/hub-engines.json, scripts/hub-engines.mjs), for the per-engine counts.
const enginesFile = path.join(root, 'data', 'hub-engines.json');
const engineOf = fs.existsSync(enginesFile) ? JSON.parse(fs.readFileSync(enginesFile, 'utf8')).handlers : {};
const engineTotals = {}; // family → counted handlers

// The object paths handlers write, and the model's object behind each (Jint: the first letter is case-insensitive).
const OWNERS = { Game: 'Game', 'Game.Hook': 'GameHook', 'Game.ProtoInput': 'GameProtoInput', Context: 'Context', ProtoInput: 'ProtoInputRuntime', 'ProtoInput.Values': 'ProtoInputValues' };
const known = new Map(); // lower-cased-first "Game.hook.xInputEnabled" → canonical "Game.Hook.XInputEnabled"
for (const [label, obj] of Object.entries(OWNERS)) for (const name of Object.keys(api.objects[obj].members)) known.set(`${label}.${name[0].toLowerCase()}${name.slice(1)}`, `${label}.${name}`);
const canon = (p) => {
  const parts = p.split('.');
  const name = parts.pop();
  return known.get(`${parts.join('.')}.${name[0].toLowerCase()}${name.slice(1)}`);
};
const dotted = (n) => (n.type === 'Identifier' ? n.name : n.type === 'MemberExpression' && !n.computed ? (dotted(n.object) ? `${dotted(n.object)}.${n.property.name}` : null) : null);

/** A literal value written out the same way every time (so `true` and `true ` count together), or null. */
function literal(n, src) {
  switch (n.type) {
    case 'Literal':
      return n.regex ? null : typeof n.value === 'string' ? JSON.stringify(n.value) : /^0x/i.test(n.raw) ? n.raw.toLowerCase().replace(/^0x/, '0x') : String(n.value);
    case 'UnaryExpression':
      return n.operator === '-' && n.argument.type === 'Literal' && typeof n.argument.value === 'number' ? `-${n.argument.raw}` : null;
    case 'ArrayExpression': {
      const items = n.elements.map((e) => (e ? literal(e, src) : null));
      return items.every((x) => x !== null) ? `[${items.join(', ')}]` : null;
    }
    case 'MemberExpression': {
      const d = dotted(n);
      // Names every handler has (Nucleus' enums, Proto Input's hook ids, the instance's Context and Player) count as
      // values too: `ProtoInput.InstallHook(ProtoInput.Values.GetCursorPosHookID)` is the same in every handler.
      return d && /^(Nucleus\.\w+\.\w+|ProtoInput\.Values\.\w+|Context\.\w+|[Pp]layer\.\w+)$/.test(d) ? d : null;
    }
    default:
      return null;
  }
}

const stats = {}; // path → { n, values: Map, calls: Map, where: Map }
const entry = (p) => (stats[p] ??= { n: 0, values: new Map(), calls: new Map(), where: new Map(), engines: {}, seen: false });
let handlers = 0;
let failed = 0;
for (const [id, info] of Object.entries(packages)) {
  if (!info.verified) continue;
  const file = path.join(hubDir, `${id}.js`);
  if (!fs.existsSync(file)) continue;
  const src = fs.readFileSync(file, 'utf8');
  let program;
  try {
    program = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true, allowHashBang: true });
  } catch {
    try {
      program = acorn.parse(src.replace(/\b(let|const)\b/g, (m) => 'var'.padEnd(m.length)), { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true });
    } catch {
      failed++;
      continue;
    }
  }
  handlers++;
  const engine = engineOf[id]?.[0];
  if (engine) engineTotals[engine] = (engineTotals[engine] ?? 0) + 1;
  const inThis = new Set();
  const mark = (p) => {
    if (!inThis.has(p)) {
      entry(p).n++;
      if (engine) entry(p).engines[engine] = (entry(p).engines[engine] ?? 0) + 1;
    }
    inThis.add(p);
  };
  // Which callback a node sits in: the Game.X / Game.ProtoInput.X a function was assigned to, else "top level".
  const ancestorsWhere = (ancestors) => {
    for (let i = ancestors.length - 1; i >= 0; i--) {
      const a = ancestors[i];
      if (a.type === 'AssignmentExpression' && /Function/.test(a.right.type)) {
        const d = dotted(a.left);
        if (d && canon(d)) return canon(d);
      }
    }
    return ancestors.some((a) => /Function/.test(a.type)) ? 'a function' : 'top level';
  };
  walk.ancestor(program, {
    AssignmentExpression(n, _s, ancestors) {
      const d = dotted(n.left);
      const p = d && canon(d);
      if (!p || n.operator !== '=') return;
      mark(p);
      const v = literal(n.right, src);
      // Options: only the top-level value counts (the one Nucleus reads when it loads the handler).
      if (v !== null && (!p.startsWith('Context.') ? ancestorsWhere(ancestors.slice(0, -1)) === 'top level' : true)) {
        const e = entry(p);
        if (!e[`v${handlers}`]) e.values.set(v, (e.values.get(v) ?? 0) + 1);
        e[`v${handlers}`] = true; // one value per handler
      }
      if (/Function/.test(n.right.type)) entry(p).where.set('defined', (entry(p).where.get('defined') ?? 0) + 1);
    },
    CallExpression(n, _s, ancestors) {
      const d = dotted(n.callee);
      const p = d && canon(d);
      if (!p) return;
      mark(p);
      const e = entry(p);
      const w = ancestorsWhere(ancestors.slice(0, -1));
      if (!e[`w${handlers}`]) e.where.set(w, (e.where.get(w) ?? 0) + 1);
      e[`w${handlers}`] = true;
      const args = n.arguments.map((a) => literal(a, src));
      const call = `${p}(${args.join(', ')})`;
      if (args.every((a) => a !== null) && !e[`c${handlers}:${call}`]) {
        e.calls.set(call, (e.calls.get(call) ?? 0) + 1);
        e[`c${handlers}:${call}`] = true; // each call once per handler
      }
    },
    MemberExpression(n) {
      const d = dotted(n);
      const p = d && canon(d);
      if (p) mark(p);
    },
  });
}

// A value or call only one or two handlers have says nothing about how handlers use a name (a game's own name, path or
// GUID): left out.
const top = (m, k = 3, min = 3) => [...m.entries()].filter(([, c]) => c >= min).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, k);
// Per engine family with enough handlers (ENGINE_MIN_HANDLERS): how many of its handlers use each name.
const engines = Object.fromEntries(Object.entries(engineTotals).filter(([, n]) => n >= ENGINE_MIN_HANDLERS).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
const members = {};
for (const [p, e] of Object.entries(stats).sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))) {
  const out = { n: e.n };
  const values = top(e.values);
  const calls = top(e.calls);
  const where = top(new Map([...e.where.entries()].filter(([w]) => w !== 'defined')), 4, 1);
  if (values.length && p !== 'Game.Description') out.values = values;
  if (calls.length) out.calls = calls;
  if (where.length) out.where = where;
  const byEngine = Object.fromEntries(Object.keys(engines).filter((k) => e.engines[k]).map((k) => [k, e.engines[k]]));
  if (Object.keys(byEngine).length) out.engines = byEngine;
  members[p] = out;
}
const out = {
  $comment: 'Generated by scripts/hub-examples.mjs from the verified Hub handlers (the testbench data branch hub/ mirror). Per name: n = handlers that use it; values = the top-level values options are set to most often [value, handlers]; calls = the most common calls with literal arguments; where = the callback calls sit in; engines = how many handlers of each engine family (top-level engines: the handlers per family, from data/hub-engines.json; only families with at least ' + ENGINE_MIN_HANDLERS + ') use it. Counts and literal values only.',
  handlers,
  engines,
  takenAt: new Date().toISOString().slice(0, 10),
  members,
};
fs.writeFileSync(path.join(root, 'data', 'hub-examples.json'), JSON.stringify(out, null, 0).replace(/,"(?=[A-Z][\w.]*":\{"n")/g, ',\n"') + '\n');
console.log(`hub-examples: ${handlers} verified handlers (${failed} didn't parse), ${Object.keys(members).length} names.`);
