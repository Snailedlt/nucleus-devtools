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

test('docs sync: the language server\'s defaults are the extension\'s (package.json)', () => {
  const props: Record<string, { default?: unknown; enum?: unknown[] }> = Object.assign({}, ...[].concat(JSON.parse(read('package.json')).contributes.configuration).map((c: { properties?: object }) => c.properties ?? {}));
  const flat = (o: Record<string, unknown>, pre = ''): [string, unknown][] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length ? flat(v as Record<string, unknown>, `${pre}${k}.`) : [[`${pre}${k}`, v] as [string, unknown]]));
  const bad = flat(DEFAULTS as unknown as Record<string, unknown>).flatMap(([k, v]) => {
    const p = props[`splitscreenme.${k}`];
    if (!p) return [];
    return [...(JSON.stringify(p.default) !== JSON.stringify(v) ? [`${k}: ${JSON.stringify(v)} here, ${JSON.stringify(p.default)} in package.json`] : []), ...(p.enum && !p.enum.includes(v) ? [`${k}: ${JSON.stringify(v)} isn't one of ${JSON.stringify(p.enum)}`] : [])];
  });
  assert.deepEqual(bad, []);
});

test('release files: the workflow uploads what data/release-assets.json lists, and ncdev update looks for the same names', async () => {
  const listed = (JSON.parse(read('data/release-assets.json')).assets as { name: string }[]).map((a) => a.name.replace('{tag}', '$TAG'));
  const wf = read('.github/workflows/release.yml');
  const line = /gh release create "\$TAG" (.*?) --target/.exec(wf)![1];
  const uploaded = line.split(/\s+/).map((f) => f.replace(/"/g, ''));
  assert.deepEqual([...uploaded].sort(), [...listed].sort(), 'release.yml uploads something other than data/release-assets.json lists');
  // The standalone builds the release makes (scripts/release-files.sh's default targets) are the ones ncdev update downloads.
  const { assetName } = await import('../standalone');
  assert.match(wf, /sh scripts\/release-files\.sh\n/, 'release.yml builds the default targets of scripts/release-files.sh');
  const targets = /TARGETS="\$\{1:-([\w,-]+)\}"/.exec(read('scripts/release-files.sh'))![1].split(',');
  const names = Object.fromEntries([...read('scripts/sea.mjs').matchAll(/'([\w-]+)': '([\w.-]+)'/g)].map((m) => [m[1], m[2]]));
  for (const t of targets) {
    const [os, arch] = t.split('-');
    const name = assetName((os === 'win' ? 'win32' : os === 'macos' ? 'darwin' : os) as NodeJS.Platform, arch as NodeJS.Architecture);
    assert.equal(name, names[t], `ncdev update looks for ${name}, sea.mjs builds ${names[t]} (${t})`);
    assert.ok(listed.includes(name!), `${name} is built but not uploaded`);
  }
});

test('one address each: TypeScript code uses the shared constants, not its own copy', () => {
  // Where each address lives: the site (core/sharelink.ts WORKBENCH_URL), this repository and its raw files
  // (core/report.ts TOOLS_REPO, REPO_URL, DATA_RAW, MAIN_RAW), the Hub (core/hub.ts HUB; report.ts keeps its own: it
  // has no imports) and r/nucleuscoop (report.ts REDDIT).
  const homes: [string, string[]][] = [
    ['https://snailedlt.github.io/nucleus-devtools/', ['core/sharelink.ts']],
    ['Snailedlt/nucleus-devtools', ['core/report.ts']],
    ['https://hub.splitscreen.me', ['core/hub.ts', 'core/report.ts']],
    ['reddit.com/r/nucleuscoop', ['core/report.ts']],
  ];
  const files = [...walk('src'), ...walk('workbench/playground/src')].filter((f) => f.endsWith('.ts') && !f.includes('/test/'));
  const bad = homes.flatMap(([lit, home]) => files.filter((f) => !home.some((h) => f.endsWith(h)) && read(f).split('\n').some((l) => l.includes(lit) && !/^\s*(\/\/|\*)/.test(l))).map((f) => `${f}: ${lit}`));
  assert.deepEqual(bad, []);
});

test('one Jint version: every "Jint x.y.z" in the code and docs, and the testbench\'s JINT_VERSION, is the API model\'s', () => {
  const jint = JSON.parse(read('data/nucleus-api.json')).jint as string;
  assert.equal(/JINT_VERSION=([\d.]+)/.exec(read('workbench/setup.sh'))![1], jint, 'workbench/setup.sh');
  const files = [...walk('src'), ...walk('scripts'), ...walk('workbench/playground/src'), ...walk('plugin/skills'), ...DOCS, 'AGENTS.md', 'CODERABBIT.md',
    ...fs.readdirSync(path.join(root, 'workbench/playground')).filter((f) => f.endsWith('.mjs')).map((f) => `workbench/playground/${f}`)]
    .filter((f) => /\.(ts|mjs|md|html|txt)$/.test(f) && !f.includes('CHANGELOG'));
  const bad = [...new Set(files)].flatMap((f) => [...read(f).matchAll(/Jint (\d+\.\d+\.\d+)/g)].filter((m) => m[1] !== jint).map((m) => `${f}: ${m[0]}`));
  assert.deepEqual(bad, []);
});

test('one Node.js version for working on the tools: .nvmrc, the workflows and "Git and Node.js N"', () => {
  const v = read('.nvmrc').trim();
  const bad = walk('.github/workflows').flatMap((f) => [...read(f).matchAll(/node-version: (\S+)/g)].filter((m) => m[1] !== v).map((m) => `${f}: ${m[0]}`));
  bad.push(...DOCS.flatMap((f) => [...read(f).matchAll(/Git and Node\.js (\d+)/g)].filter((m) => m[1] !== v).map((m) => `${f}: ${m[0]}`)));
  assert.deepEqual(bad, []);
});
