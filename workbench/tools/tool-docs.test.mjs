// The docs' Tools pages (playground/tool-docs.mjs) read the tools' own data: these check the readers against the real
// sources, so a change to `ncdev --help`'s layout or the Notepad++ menu table that they can't read fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { writeDocPages } from '../playground/docs-pages.mjs';
import { load } from './bundle-ts.mjs';
import { parseHelp, parseNppMenu, toolPages } from '../playground/tool-docs.mjs';

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
const { updatedReadme, compareHtml, compareMarkdown, editorTag, editorsMarkdown, portingSnippet, settingsMarkdown, commandsMarkdown } = await import('../../scripts/readme-blocks.mjs');
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

test('tool docs: parse both forms of report as one command from actual CLI help', async () => {
  const { helpText } = await load(path.join(root, 'src/clihelp.ts'));
  const help = helpText('0.0.0-test');
  assert.match(help, /^ncdev 0\.0\.0-test: /);
  const { commands, options, lint } = parseHelp(help);
  const reports = commands.filter(({ use }) => use[0].startsWith('report '));
  assert.equal(reports.length, 1);
  assert.equal(reports[0].use.length, 2);
  assert.match(reports[0].use[1], /^report --check <rule>/);
  assert.match(reports[0].desc, /^Report a problem, .*Discord thread \(no GitHub account\)$/);
  assert.ok(commands.some(({ use }) => use[0] === 'dap'), 'the next command is separate');
  assert.ok(options.some(({ use }) => use.includes('-h, --help')));
  assert.ok(lint.some(({ use }) => use.includes('--hub')));
  assert.deepEqual(parseHelp('Usage: ncdev <command>'), { commands: [], options: [], lint: [] });
});

test('tool docs: menu parser keeps only menu rows, with keyless entries and separators', () => {
  const menu = parseNppMenu(`
{L"Not a menu entry", run, 0, false, nullptr}
static FuncItem funcs[] = {
  {L"Open", run, 0, false, nullptr},
  {L"", nullptr, 0, false, nullptr},
  {L"Find", find, 0, false, &ctrlF},
  {L"Next", next, 0, false, &shiftF8}
};
{L"After the menu", run, 0, false, nullptr}
`);
  assert.deepEqual(menu, [
    { label: 'Open', keys: '' },
    { label: '', keys: '' },
    { label: 'Find', keys: 'Ctrl+F' },
    { label: 'Next', keys: 'Shift+F8' },
  ]);
  assert.deepEqual(parseNppMenu(''), []);
});

test('tool docs: render commands, settings, chords and MCP input details from source data', () => {
  const pages = toolPages({
    help: 'Commands:\n  run <file>'.padEnd('Commands:\n'.length + 30) + 'Read `<file>` & **check** it\n',
    pkg: { contributes: {
      configuration: [{ properties: { enabled: { default: false, description: 'Show <details>' } } }, { properties: { paths: { default: {} } } }],
      commands: [{ command: 'sample.run', category: 'Sample', title: 'Run & check' }],
      keybindings: [{ command: 'sample.run', key: 'ctrl+r', mac: 'cmd+r' }, { command: 'sample.other', key: 'f5', mac: 'f5' }],
    } },
    nppCpp: 'static FuncItem funcs[] = {{L"Check & fix", run, 0, false, &altEnter}};',
    actions: [{ label: 'Zoom <in>', group: 'View', keys: 'Ctrl+K Ctrl+0', mac: 'Cmd+K Cmd+0', where: 'fixed' }],
    porting: '## Wiring\n\n### Sample (LSP)\n\nSee [setup](docs/setup.md) or [above](#intro).\n\n## Debugging\n\nDebug here.\n\n## Not part of setup\n',
    mcpTools: [
      { name: 'sample_check', title: 'Check <input>', description: 'Check **once**.', inputSchema: { required: ['source'], properties: { source: { type: 'string' }, mode: { enum: ['simple', 'full'], description: 'Choose a mode' } } } },
      { name: 'sample_info', description: 'Show details.' },
    ],
    repoUrl: 'https://example.test/owner/repo',
  });
  const bySlug = Object.fromEntries(pages.map((page) => [page.slug, page]));
  assert.deepEqual(Object.keys(bySlug), ['tools/workbench', 'tools/vscode', 'tools/notepadpp', 'tools/other-editors', 'tools/ncdev', 'tools/mcp']);
  assert.match(bySlug['tools/workbench'].html, /Zoom &lt;in&gt;<\/td><td><kbd>Ctrl\+K Ctrl\+0<\/kbd> .*<kbd>Cmd\+K Cmd\+0<\/kbd>.*>fixed<\/span>/);
  assert.match(bySlug['tools/vscode'].html, /Sample: Run &amp; check<\/td><td><kbd>Ctrl\+R<\/kbd> .*<kbd>⌘\+R<\/kbd>/);
  assert.match(bySlug['tools/vscode'].html, /sample\.other<\/td><td><kbd>F5<\/kbd><\/td>/);
  assert.match(bySlug['tools/vscode'].html, /<code>enabled<\/code><\/td><td><code>false<\/code><\/td><td>Show &lt;details&gt;/);
  assert.match(bySlug['tools/vscode'].html, /<code>paths<\/code><\/td><td><\/td>/);
  assert.match(bySlug['tools/notepadpp'].html, /Check &amp; fix \(<kbd>Alt\+Enter<\/kbd>\)/);
  assert.match(bySlug['tools/ncdev'].html, /<code class="use">run &lt;file&gt;<\/code><\/td><td>Read <code>&lt;file&gt;<\/code> &amp; <strong>check<\/strong>/);
  assert.match(bySlug['tools/mcp'].html, /id="sample_check"><code>sample_check<\/code>: Check &lt;input&gt;/);
  assert.match(bySlug['tools/mcp'].html, /<code>source<\/code><\/td><td>string/);
  assert.match(bySlug['tools/mcp'].html, /<code>mode<\/code> <span class="small">\(optional\)<\/span><\/td><td>simple \| full/);
  assert.doesNotMatch(bySlug['tools/mcp'].html.split('id="sample_info"')[1], /<table>/);
  const other = bySlug['tools/other-editors'];
  assert.match(other.md, /^## Set up your editor\n[\s\S]*### Sample \(LSP\)[\s\S]*## Debugging/);
  assert.doesNotMatch(other.md, /Not part of setup/);
  assert.equal(other.mdHref('docs/setup.md'), 'https://example.test/owner/repo/blob/main/docs/setup.md');
  assert.equal(other.mdHref('#intro'), 'https://example.test/owner/repo/blob/main/PORTING.md#intro');
  assert.equal(other.mdHref('https://example.org/help'), 'https://example.org/help');
});

test('tool docs: writer registers nested pages, resolves their links and omits Tools when absent', (t) => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ncdev-tool-docs-'));
  t.after(() => fs.rmSync(outDir, { recursive: true, force: true }));
  const options = {
    outDir, startHtml: '<style></style>', docsPage: () => ({ markdown: 'API reference', crumbs: [] }),
    docsView: (value) => value, allEntries: () => [], groups: [], base: 'https://example.test/project/',
    noindex: '',
  };
  const toolPages = [
    { slug: 'tools/editor', title: 'Editor & keys', desc: 'Shortcuts', group: 'Editors', html: '<a href="__UP__start/">Start</a>' },
    { slug: 'tools/cli', title: 'CLI', desc: 'Commands', group: 'Command line and AI', md: '## Usage\n\n[Manual](manual.md)', mdHref: (url) => `https://example.test/${url}` },
  ];
  const page = (slug) => fs.readFileSync(path.join(outDir, slug, 'index.html'), 'utf8');
  const nav = () => JSON.parse(fs.readFileSync(path.join(outDir, 'nav.json'), 'utf8')).filter(({ sec }) => sec === 'tools');
  assert.deepEqual(writeDocPages({ ...options, toolPages }), ['', 'tools', 'tools/editor', 'tools/cli']);
  assert.match(page(''), /href="tools\/">Tools<\/a>/);
  assert.match(page('tools'), /href="\.\.\/\.\.\/docs\/tools\/editor\/">Editor &amp; keys<\/a>/);
  assert.match(page('tools/editor'), /href="\.\.\/\.\.\/\.\.\/start\/">Start<\/a>/);
  assert.match(page('tools/editor'), /rel="canonical" href="https:\/\/example\.test\/project\/docs\/tools\/editor\/"/);
  assert.doesNotMatch(page('tools/editor'), /__UP__/);
  assert.match(page('tools/cli'), /<h2>Usage<\/h2>/);
  assert.match(page('tools/cli'), /href="https:\/\/example\.test\/manual\.md"/);
  assert.deepEqual(nav().map(({ title, items }) => [title, items.map(({ u }) => u)]), [
    ['Editors', ['docs/tools/editor/']],
    ['Command line and AI', ['docs/tools/cli/', 'ai/']],
  ]);
  assert.deepEqual(writeDocPages(options), ['']);
  assert.doesNotMatch(page(''), /href="tools\/">Tools<\/a>/);
  assert.deepEqual(nav(), []);
  assert.ok(!fs.existsSync(path.join(outDir, 'tools')));
});

test('README generation: comparison cells distinguish yes, no and note-only entries in both formats', () => {
  const data = {
    columns: [{ label: 'Browser & tools', readme: '#browser' }, { label: 'Editor' }, { label: 'CLI' }],
    rows: [{ feature: 'Files <local>', cells: ['yes: run `a < b`: now', 'no', ': manual'] }],
  };
  assert.equal(compareMarkdown(data).split('\n').at(-1), '| Files <local> | ✅ run `a < b`: now | — | manual |');
  assert.match(compareMarkdown(data), /\[Browser & tools\]\(#browser\)/);
  assert.match(compareHtml(data), /<th scope="col">Browser &amp; tools<\/th>/);
  assert.match(compareHtml(data), /<th scope="row">Files &lt;local&gt;<\/th><td>✅<small>run <code>a &lt; b<\/code>: now<\/small><\/td><td class="no">—<\/td><td><small>manual<\/small><\/td>/);
});

test('README generation: editor status supports either source of testing and rejects unknown ids', () => {
  const data = { editors: [
    { id: 'a', name: 'A', setup: 'LSP', people: 'Local', ai: '' },
    { id: 'b', name: 'B', setup: 'LSP', people: '', ai: 'Verified' },
    { id: 'c', name: 'C', setup: 'LSP', people: '', ai: '' },
  ] };
  assert.deepEqual(editorsMarkdown(data).split('\n').slice(2), [
    '| A | LSP | ✅ Local | not yet |', '| B | LSP | not yet | ✅ Verified |', '| C | LSP | not yet | not yet |',
  ]);
  for (const id of ['a', 'b']) assert.match(editorTag(id, data), />Tested</);
  assert.match(editorTag('c', data), />Untested</);
  assert.throws(() => editorTag('missing', data), /has no editor "missing"/);
});

test('README generation: settings preserve false and zero, and commands show distinct Mac bindings', () => {
  const pkg = { contributes: {
    configuration: [{ properties: { enabled: { default: false, description: 'A | B\nNext line' } } },
      { properties: { retries: { default: 0 }, path: { default: '' } } }],
    commands: [{ command: 'open', category: 'Sample', title: 'Open' }, { command: 'close', title: 'Close' }, { command: 'help', title: 'Help' }],
    keybindings: [{ command: 'open', key: 'ctrl+o', mac: 'cmd+o' }, { command: 'close', key: 'f8', mac: 'f8' }],
  } };
  assert.deepEqual(settingsMarkdown(pkg).split('\n').slice(2), [
    '| `enabled` | `false` | A \\| B Next line |', '| `retries` | `0` |  |', '| `path` |  |  |',
  ]);
  assert.deepEqual(commandsMarkdown(pkg).split('\n').slice(2), [
    '| **Sample: Open** | Ctrl+O (Mac: Cmd+O) |', '| **Close** | F8 |', '| **Help** |  |',
  ]);
});

test('README generation: snippets use the first block for the requested editor and missing inputs fail', async () => {
  const porting = '# Porting\n\n### Helix\n\n```toml\ncommand = "ncdev"\n\nargs = ["lsp"]\n```\n\n```toml\nignored = true\n```\n';
  assert.equal(portingSnippet('helix', porting), 'command = "ncdev"\n\nargs = ["lsp"]');
  assert.throws(() => portingSnippet('emacs', porting), /has no heading for "emacs"/);
  await assert.rejects(updatedReadme('# README without generated markers'), /has no <!-- generated:compare --> block/);
});
