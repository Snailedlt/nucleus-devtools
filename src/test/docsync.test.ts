// What the docs still say in prose about the tools must be true of the tools: names and values a page repeats are
// checked here against the code they come from (the README's tables are generated: scripts/readme-blocks.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULTS } from '../lsp';
import { TOOLS } from '../mcp';
import { FEATURES } from '../core/templates';
import { DISCORD } from '../core/report';

const root = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const walk = (dir: string): string[] => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
/** The docs people and agents read (not the generated API reference, not the changelogs). */
const DOCS = ['README.md', 'PORTING.md', 'TESTING.md', 'CONTRIBUTING.md', 'workbench/README.md', 'workbench/playground/src/llms.txt',
  ...walk('plugin/skills/nucleus-handler').filter((f) => /\.md$/.test(f) && !f.endsWith('reference/api.md')),
  ...walk('workbench/playground/src').filter((f) => f.endsWith('.html'))].filter((f) => fs.existsSync(path.join(root, f)));

test('docs sync: PORTING.md\'s settings example has every setting the language server reads', () => {
  const s = read('PORTING.md');
  const block = s.slice(s.indexOf('### Settings'), s.indexOf('```', s.indexOf('```json', s.indexOf('### Settings')) + 7));
  const keys = Object.entries(DEFAULTS).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length ? Object.keys(v).map((x) => `${k}.${x}`) : [k]));
  const missing = keys.filter((k) => { const [a, b] = k.split('.'); return !block.includes(`"${a}"`) || (b !== undefined && !block.includes(`"${b}"`)); });
  assert.deepEqual(missing, []);
});

test('docs sync: every MCP tool the docs name exists', () => {
  const real = new Set(TOOLS.map((t) => t.name));
  const bad = DOCS.flatMap((f) => [...read(f).matchAll(/\bnucleus_[a-z_]+\b/g)].map((m) => m[0]).filter((n) => !real.has(n)).map((n) => `${f}: ${n}`));
  assert.deepEqual([...new Set(bad)], []);
});

test('docs sync: the Node.js version the docs ask for is the one the tools are built for', () => {
  const target = /target: 'node(\d+)'/.exec(read('scripts/build.mjs'))![1];
  // "Node.js 22" for working on the tools themselves (CONTRIBUTING, the README's development part) is CI's, not this.
  const bad = DOCS.flatMap((f) => [...read(f).matchAll(/Node(?:\.js)? (\d+)(?:\+| or newer)/g)].filter((m) => m[1] !== target && !/Git and Node\.js/.test(read(f).slice(Math.max(0, m.index! - 20), m.index! + 10))).map((m) => `${f}: ${m[0]}`));
  assert.deepEqual(bad, []);
});

test('docs sync: Discord links are the one invite the tools use', () => {
  const bad = DOCS.flatMap((f) => [...read(f).matchAll(/https:\/\/discord\.gg\/\w+/g)].map((m) => m[0]).filter((u) => u !== DISCORD && !u.endsWith('/typescript')).map((u) => `${f}: ${u}`));
  assert.deepEqual(bad, []);
});

test('docs sync: template features the docs name exist', () => {
  const real = new Set<string>(FEATURES.map((f) => f.id));
  const bad = DOCS.flatMap((f) => [...read(f).matchAll(/--features ([\w,-]+)/g)].flatMap((m) => m[1].split(',')).filter((id) => !real.has(id)).map((id) => `${f}: ${id}`));
  assert.deepEqual(bad, []);
});
