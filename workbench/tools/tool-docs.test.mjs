// The docs' Tools pages (playground/tool-docs.mjs) read the tools' own data: these check the readers against the real
// sources, so a change to `ncdev --help`'s layout or the Notepad++ menu table that they can't read fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHelp, parseNppMenu } from '../playground/tool-docs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('tool docs: every ncdev command in --help is read, with its usage and description', () => {
  const src = read('src/clihelp.ts');
  const help = src.slice(src.indexOf('`', src.indexOf('helpText')) + 1, src.lastIndexOf('`')).replace(/\$\{[^}]*\}/g, 'x');
  const { commands, options } = parseHelp(help);
  const names = commands.map((c) => c.use[0].split(' ')[0]);
  for (const n of ['lint', 'format', 'simulate', 'debug', 'mcp', 'lsp', 'dap', 'init-agent', 'report']) assert.ok(names.includes(n), n);
  for (const c of commands) assert.ok(c.desc.length > 5, `${c.use[0]} has a description`);
  assert.ok(commands.find((c) => c.use[0].startsWith('debug')).use.length >= 2, 'a usage over two lines stays one command');
  assert.ok(options.some((o) => o.use[0].startsWith('--json')));
});

test('tool docs: the Notepad++ menu is read in order, with its keys and separators', () => {
  const menu = parseNppMenu(read('npp-plugin/src/NcDev.cpp'));
  assert.ok(menu.length > 20);
  assert.deepEqual(menu[0], { label: 'Quick fix on this line', keys: 'Alt+Enter' });
  assert.equal(menu.find((m) => m.label === 'Go to definition').keys, 'Alt+F12');
  assert.ok(menu.some((m) => m.label === ''), 'separators');
});

// What the README and the site still name by hand must exist in the tools; what's generated must be current. A
// command may be named by its title's start ("Nucleus: Try It" for "Nucleus: Try It (Simulate Each Player)").
const { updatedReadme } = await import('../../scripts/readme-blocks.mjs');
const SKILL = 'plugin/skills/nucleus-handler';
const PAGES = ['README.md', 'PORTING.md', 'TESTING.md', 'CONTRIBUTING.md', 'workbench/README.md', 'workbench/playground/src/tools.html', 'workbench/playground/src/ai.html', 'workbench/playground/src/start.html', 'workbench/playground/src/llms.txt',
  `${SKILL}/SKILL.md`, `${SKILL}/templates/AGENTS.section.md`, ...fs.readdirSync(path.join(root, SKILL, 'reference')).filter((f) => f.endsWith('.md') && f !== 'api.md').map((f) => `${SKILL}/reference/${f}`)];

test('docs sync: README.md\'s generated parts are current (node scripts/readme-blocks.mjs)', async () => {
  assert.equal(read('README.md'), await updatedReadme(read('README.md')), 'README.md is out of date: run node scripts/readme-blocks.mjs');
});

test('ncdev --help: the lint options are read too (they have their own section in the help)', () => {
  const src = read('src/clihelp.ts');
  const { lint } = parseHelp(src.slice(src.indexOf('`', src.indexOf('helpText')) + 1, src.lastIndexOf('`')).replace(/\$\{[^}]*\}/g, 'x'));
  const flags = lint.flatMap((o) => o.use.map((u) => u.split(' ')[0]));
  for (const f of ['--fix', '--fix-dry-run', '--rule']) assert.ok(flags.includes(f), `${f} is in the lint options`);
  assert.ok(lint.every((o) => o.desc), 'each has a description');
});

test('docs sync: every `ncdev <command>` the docs name is a real command', () => {
  const src = read('src/clihelp.ts');
  const real = new Set(parseHelp(src.slice(src.indexOf('`', src.indexOf('helpText')) + 1, src.lastIndexOf('`')).replace(/\$\{[^}]*\}/g, 'x')).commands.flatMap((c) => c.use.map((u) => u.split(' ')[0])));
  const bad = [];
  for (const p of PAGES) for (const m of read(p).matchAll(/(?:`|<code[^>]*>|^)(?:\.\\)?(?:ncdev|node (?:[\w./-]*\/)?nucleus\.js) ([a-z][\w-]*)/gm)) if (!real.has(m[1])) bad.push(`${p}: ncdev ${m[1]}`);
  assert.deepEqual(bad, []);
});

test('docs sync: every "Nucleus: …" command the README names is in the extension', () => {
  const pkg = JSON.parse(read('package.json'));
  const titles = new Set(pkg.contributes.commands.map((c) => `${c.category}: ${c.title}`));
  const bad = [...read('README.md').matchAll(/\*\*(Nucleus: [^*]+)\*\*/g)].map((m) => m[1]).filter((t) => ![...titles].some((x) => x === t || x.startsWith(`${t} (`)) && !/^Nucleus: check this handler$/.test(t));
  assert.deepEqual(bad, []);
});

test('docs sync: the Notepad++ menu is named as the plugin names it', () => {
  const name = /PLUGIN_NAME = L"([^"]+)"/.exec(read('npp-plugin/src/NcDev.cpp'))[1];
  const bad = [];
  for (const p of PAGES) for (const m of read(p).matchAll(/Plugins (?:›|&rsaquo;) (?:<strong>)?([A-Z][\w+ -]*?)(?:<\/strong>|\*\*|[,.:)])/g)) if (m[1].trim().replace(/ menu$/, '') !== name) bad.push(`${p}: ${m[1]}`);
  assert.deepEqual(bad, []);
});

test('docs sync: every {key:…} in the workbench tips is a shortcut in the list', () => {
  const ids = new Set([...read('workbench/playground/src/keyactions.ts').matchAll(/id: '([\w]+)'/g)].map((m) => m[1]));
  const bad = [...read('workbench/playground/src/tips.ts').matchAll(/\{key:(\w+)\}/g)].map((m) => m[1]).filter((id) => !ids.has(id));
  assert.deepEqual(bad, []);
});
