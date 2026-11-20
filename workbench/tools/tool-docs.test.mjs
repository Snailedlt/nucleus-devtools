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
