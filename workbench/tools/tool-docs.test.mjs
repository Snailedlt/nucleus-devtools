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
import { parseHelp, parseNppMenu, toolDocs, readToolSources, readGuideSources, RELATED_MAX } from '../playground/tool-docs.mjs';
import { rich, blocks } from '../playground/tool-docs-text.mjs';

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
  assert.deepEqual(parseHelp('Usage: ncdev <command>'), { commands: [], options: [], lint: [], exit: '' });
  assert.match(parseHelp(help).exit, /^1 when lint finds errors.*2 on bad usage\.$/);
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

/** The least the pages need, for tests of how they are laid out. */
const guideFixture = () => {
  const setup = (id) => ({ slug: `tools/${id}/setup`, title: `Set up ${id}`, desc: `Install ${id}.`, lead: `Installs ${id}.`, needs: ['A computer.'], steps: ['Download it.', 'Press `F8`.'], verify: 'It says hello.', after: [{ h: 'Updating', md: 'Do it again.' }], related: [`[${id}](@docs:tools/${id})`] });
  const tool = (id) => ({ id, slug: `tools/${id}`, group: 'reference', title: id, short: id, line: `The ${id} line.`, summary: `What ${id} is.`, facts: [['Runs on', `Anything & [setup](@docs:tools/${id}/setup)`]], related: [`[Set up](@docs:tools/${id}/setup)`], setup: setup(id) });
  const pg = (id, extra = {}) => ({ id, slug: `tools/workbench/${id}`, nav: id, title: id, desc: `About ${id}.`, intro: `Intro of ${id}.`, ...extra });
  const lsp = tool('lsp');
  lsp.setup = { ...lsp.setup, steps: undefined, sections: [{ h: 'What the snippets turn on', md: 'A setting.' }], tested: { h: 'How far each editor is tested', intro: 'Empty means nobody.', after: 'See [PORTING.md]({repo}/blob/main/PORTING.md).' } };
  return {
    tools: {
      groups: [{ id: 'start', title: 'Get started' }, { id: 'workbench', title: 'Workbench' }, { id: 'reference', title: 'Reference' }],
      index: { lead: 'The tools.', fit: 'They share `ncdev`.', path: 'A handler\'s path.', new: 'New? [Learn](@site:learn/).' },
      compare: { slug: 'tools/compare', title: 'Feature comparison', nav: 'Feature comparison', desc: 'Side by side.', lead: 'The same checks everywhere.', note: 'The last column is the [language server](@docs:tools/lsp).' },
      core: { title: 'One core', parts: ['Checks'], line: 'All share it.' },
      flow: [{ id: 'write', label: 'Write', line: 'Type' }, { id: 'test', label: 'Test', line: 'In Nucleus' }],
      tools: [{ id: 'workbench', slug: 'tools/workbench', title: 'Workbench', short: 'Browser', line: 'In a browser tab.', setupLine: 'Nothing. [Open it](@site:)', summary: 'What the workbench is.', facts: [['Install', 'Nothing']] }, tool('vscode'), tool('notepadpp'), lsp, tool('ncdev'), tool('mcp')],
    },
    guide: { skipTips: [], pages: [
      { id: 'overview', slug: 'tools/workbench', nav: 'Overview', title: 'Workbench', desc: 'The workbench.', map: { h: 'The screen', alt: 'The workbench', caption: 'The numbers.', note: 'See [settings](@guide:settings).' }, sections: [{ h: 'First <minute>', md: '1. Press {key:zoom}.\n2. Then `F8`, see [Check](@guide:check) and [the site](@site:tools/).\n\nA **bold** line with `code`.' }], related: ['[Learn](@site:learn/): a first handler'] },
      pg('editor', { sections: [{ h: 'Parts', cols: ['Part', 'Does'], rows: [['**Zoom**, {key:zoom}', 'Makes it <big>.']], md: 'After the table.' }], covers: ['t-one', 't-two'] }), pg('check'), pg('try-it'), pg('files'),
      pg('settings', { settingsTabs: { Theme: 'Colours, {key:zoom}.', 'Keys & more': 'Shortcuts.' } }), pg('shortcuts', { allKeys: true }),
    ] },
    tourParts: { parts: [{ id: 'code', title: 'The code', text: 'Write here. {key:zoom} zooms.', targets: ['#editor'], page: 'editor' }] },
    gallery: {}, videos: {}, sizes: {}, map: { width: 200, height: 100, parts: { code: { x: 25, y: 50 } } },
    compareHtml: '<tbody><tr><th scope="row">Feature</th></tr></tbody>', editors: { editors: [{ id: 'sample', name: 'Sample 2+', people: null, ai: 'Sample 2.1 <beta>', tile: { name: 'Sample', line: 'One line' } }] }, settingsTabs: ['Theme', 'Keys & more'],
  };
};
const PORTING = '# Porting\n\n### Settings\n\nSend `them`.\n\n```toml\n# not a heading\nkey = 1\n```\n\n## Wiring `ncdev lsp` into an editor\n\nAttach it to JavaScript.\n\n### Sample (LSP)\n\nSee [setup](docs/setup.md) or [above](#intro).\n\n### Notepad++\n\nPlugin internals.\n\n### Anything else\n\nAny client.\n\n## Debugging: `ncdev dap`\n\nDebug here.\n\n## How handler files are detected\n\nBy name.\n\n## What\'s VS Code only today, and how to get it elsewhere\n\n| VS Code | Elsewhere |\n|---|---|\n| Try it | `ncdev simulate` |\n\n## Not part of the docs\n\nNo.\n';
const fixtureSources = () => ({
  help: 'Commands:\n  run <file>'.padEnd('Commands:\n'.length + 30) + 'Read `<file>` & **check** it\n\nExit code: 1 on errors;\n2 on bad usage.\n',
  pkg: { engines: { vscode: '^1.85.0' }, contributes: {
    configuration: [{ properties: { enabled: { default: false, description: 'Show <details>' } } }, { properties: { paths: { default: {} } } }],
    commands: [{ command: 'sample.run', category: 'Sample', title: 'Run & check' }],
    keybindings: [{ command: 'sample.run', key: 'ctrl+r', mac: 'cmd+r' }, { command: 'sample.other', key: 'f5', mac: 'f5' }],
  } },
  nppCpp: 'static FuncItem funcs[] = {{L"Check & fix", run, 0, false, &altEnter}};',
  actions: [{ id: 'zoom', label: 'Zoom <in>', group: 'View', keys: 'Ctrl+K Ctrl+0', mac: 'Cmd+K Cmd+0', where: 'fixed' }],
  porting: PORTING,
  mcpTools: [
    { name: 'sample_check', title: 'Check <input>', description: 'Check **once**.', inputSchema: { required: ['source'], properties: { source: { type: 'string' }, mode: { enum: ['simple', 'full'], description: 'Choose a mode' } } } },
    { name: 'sample_info', description: 'Show details.' },
  ],
  repoUrl: 'https://example.test/owner/repo',
});

test('tool docs: the pages are a setup page and a reference page per tool, the workbench\'s pages and the comparison', () => {
  const { pages, index, media } = toolDocs({ ...guideFixture(), ...fixtureSources() });
  const bySlug = Object.fromEntries(pages.map((page) => [page.slug, page]));
  assert.deepEqual(Object.keys(bySlug), [
    'tools/vscode/setup', 'tools/notepadpp/setup', 'tools/lsp/setup', 'tools/ncdev/setup', 'tools/mcp/setup',
    'tools/workbench', 'tools/workbench/editor', 'tools/workbench/check', 'tools/workbench/try-it', 'tools/workbench/files', 'tools/workbench/settings', 'tools/workbench/shortcuts',
    'tools/vscode', 'tools/notepadpp', 'tools/lsp', 'tools/ncdev', 'tools/mcp', 'tools/compare']);
  assert.deepEqual(pages.map((page) => page.group).filter((g, i, all) => all.indexOf(g) === i), ['Get started', 'Workbench', 'Reference']);

  // A reference page: what the tool is, its facts, the reference generated from the tool, then one Related list.
  const vscode = bySlug['tools/vscode'].html;
  assert.match(vscode, /^<p class="lead">What vscode is\.<\/p>\n<dl class="facts"><div><dt>Runs on<\/dt><dd>Anything &amp; <a href="__UP__docs\/tools\/vscode\/setup\/">setup<\/a><\/dd><\/div><\/dl>\n<h2 id="commands">/);
  assert.match(vscode, /<h2 id="related">Related<\/h2>\n<ul class="dlist related"><li><a href="__UP__docs\/tools\/vscode\/setup\/">Set up<\/a><\/li><\/ul>$/);
  assert.doesNotMatch(vscode, /When to use|How it works|Next:/);
  assert.match(vscode, /Sample: Run &amp; check<\/td><td><kbd>Ctrl\+R<\/kbd> .*<kbd>⌘\+R<\/kbd>/);
  assert.match(vscode, /sample\.other<\/td><td><kbd>F5<\/kbd><\/td>/);
  assert.match(vscode, /<code>enabled<\/code><\/td><td><code>false<\/code><\/td><td>Show &lt;details&gt;/);
  assert.match(vscode, /<code>paths<\/code><\/td><td><\/td>/);
  assert.match(bySlug['tools/notepadpp'].html, /<h2 id="menu">The menu<\/h2>\n<ul class="dlist"><li>Check &amp; fix \(<kbd>Alt\+Enter<\/kbd>\)/);
  const ncdev = bySlug['tools/ncdev'].html;
  assert.match(ncdev, /<code class="use">run &lt;file&gt;<\/code><\/td><td>Read <code>&lt;file&gt;<\/code> &amp; <strong>check<\/strong>/);
  assert.match(ncdev, /<h2 id="exit-codes">Exit codes<\/h2>\n<p>1 on errors; 2 on bad usage\.<\/p>/);
  const mcp = bySlug['tools/mcp'].html;
  assert.match(mcp, /id="sample_check"><code>sample_check<\/code>: Check &lt;input&gt;/);
  assert.match(mcp, /<code>source<\/code><\/td><td>string/);
  assert.match(mcp, /<code>mode<\/code> <span class="small">\(optional\)<\/span><\/td><td>simple \| full/);
  assert.doesNotMatch(mcp.split('id="sample_info"')[1], /<table>/);
  // The language server's reference is PORTING.md's own sections; a "# comment" in a code block doesn't end one.
  const lsp = bySlug['tools/lsp'];
  assert.match(lsp.intro, /^<p class="lead">What lsp is\.<\/p>/);
  assert.match(lsp.md, /^## Settings\n\nSend `them`\.\n\n```toml\n# not a heading\nkey = 1\n```\n\n## Handler detection\n\nBy name\.\n\n## Commands in place of VS Code's panels\n\n\| VS Code \| Elsewhere \|/);
  assert.doesNotMatch(lsp.md, /Not part of the docs|Sample \(LSP\)/);
  assert.match(lsp.outro, /<h2 id="related">Related<\/h2>/);
  assert.equal(lsp.mdHref('docs/setup.md'), 'https://example.test/owner/repo/blob/main/docs/setup.md');
  assert.equal(lsp.mdHref('#intro'), 'https://example.test/owner/repo/blob/main/PORTING.md#intro');
  assert.equal(lsp.mdHref('https://example.org/help'), 'https://example.org/help');

  // A setup page: what you need, the steps, how to see that it worked, what comes after, Related.
  const setup = bySlug['tools/vscode/setup'];
  assert.equal(setup.title, 'Set up vscode');
  assert.equal(setup.nav, 'Set up vscode');
  assert.match(setup.html, /^<p class="lead">Installs vscode\.<\/p>\n<h2 id="before-you-start">Before you start<\/h2>\n<ul class="dlist"><li>A computer\.<\/li><\/ul>\n<h2 id="steps">Steps<\/h2>\n<ol class="steps"><li>Download it\.<\/li><li>Press <kbd>F8<\/kbd>\.<\/li><\/ol>\n<h2 id="check-that-it-works">Check that it works<\/h2>\n<p>It says hello\.<\/p>\n<h2 id="updating">Updating<\/h2>\n<p>Do it again\.<\/p>\n<h2 id="related">Related<\/h2>/);
  // The other editors' setup: how far each is tested (an empty cell when nobody has), then PORTING.md's setups
  // with a heading per editor, without Notepad++ (it has its own page), then the debug adapter.
  const editors = bySlug['tools/lsp/setup'];
  assert.equal(editors.desc, 'The language server and debugger config for Sample.');
  assert.match(editors.intro, /<h2 id="how-far-each-editor-is-tested">How far each editor is tested<\/h2>\n<table>.*<td>Sample 2\+<\/td><td>One line<\/td><td><\/td><td>Sample 2\.1 &lt;beta&gt;<\/td>/);
  assert.match(editors.intro, /Empty means nobody\. See <a href="https:\/\/example\.test\/owner\/repo\/blob\/main\/PORTING\.md">PORTING\.md<\/a>\./);
  assert.match(editors.md, /^Attach it to JavaScript\.\n\n## Sample \(LSP\)[\s\S]*## Anything else\n\nAny client\.\n\n## The debugger: `ncdev dap`\n\nDebug here\.$/);
  assert.doesNotMatch(editors.md, /Notepad|Plugin internals|By name/);
  assert.match(editors.outro, /^<h2 id="check-that-it-works">/);

  // The workbench's pages. Written text: steps, keys, links to other pages and to the site, bold and code; all escaped.
  const over = bySlug['tools/workbench'].html;
  assert.match(over, /^<p class="lead">What the workbench is\.<\/p>\n<dl class="facts"><div><dt>Install<\/dt><dd>Nothing<\/dd><\/div><\/dl>\n<h2 id="the-screen">The screen<\/h2>/);
  assert.match(over, /<h2 id="first-minute">First &lt;minute&gt;<\/h2>\n<ol class="steps"><li>Press <kbd>Ctrl\+K Ctrl\+0<\/kbd>\.<\/li><li>Then <kbd>F8<\/kbd>, see <a href="__UP__docs\/tools\/workbench\/check\/">Check<\/a> and <a href="__UP__tools\/">the site<\/a>\.<\/li><\/ol>\n<p>A <strong>bold<\/strong> line with <code class="use">code<\/code>\.<\/p>/);
  // The labelled screenshot: a number on each part, the same number's line below, the part's name leading to its page.
  assert.match(over, /<a class="map-pin" href="#part-code" style="left:25%;top:50%" aria-label="1: The code">1<\/a>/);
  assert.match(over, /<li id="part-code"><strong><a href="__UP__docs\/tools\/workbench\/editor\/">The code<\/a>\.<\/strong> Write here\. <kbd>Ctrl\+K Ctrl\+0<\/kbd> zooms\.<\/li>/);
  assert.match(over, /<figcaption>The numbers\.<\/figcaption>/);
  assert.match(over, /<p class="small">See <a href="__UP__docs\/tools\/workbench\/settings\/">settings<\/a>\.<\/p>/);
  assert.ok(media.includes('workbench-map'));
  // A page per area: what it is, where it is on the screen, its sections (a table of parts, then text). No key
  // table, tips list or previous/next of its own: keys are written where they're used and listed on one page.
  const editor = bySlug['tools/workbench/editor'].html;
  assert.match(editor, /^<p class="lead">Intro of editor\.<\/p>\n<p class="where small">On the screen: <a href="__UP__docs\/tools\/workbench\/#part-code">/);
  assert.match(editor, /<h2 id="parts">Parts<\/h2>\n<table><thead><tr><th>Part<\/th><th>Does<\/th><\/tr><\/thead><tbody><tr><td><strong>Zoom<\/strong>, <kbd>Ctrl\+K Ctrl\+0<\/kbd><\/td><td>Makes it &lt;big&gt;\.<\/td><\/tr><\/tbody><\/table>\n<p>After the table\.<\/p>$/);
  assert.doesNotMatch(editor, /id="keys"|id="tips"|rel="next"/);
  assert.match(bySlug['tools/workbench/shortcuts'].html, /<h2 id="view">View<\/h2>\n<table>.*Zoom &lt;in&gt;<\/td><td><kbd>Ctrl\+K Ctrl\+0<\/kbd> .*<kbd>Cmd\+K Cmd\+0<\/kbd>.*>fixed<\/span>/);
  assert.match(bySlug['tools/workbench/settings'].html, /<h2 id="sections">Sections<\/h2>\n<table><thead><tr><th>Section<\/th><th>What it has<\/th><\/tr><\/thead><tbody><tr><td>Theme<\/td><td>Colours, <kbd>Ctrl\+K Ctrl\+0<\/kbd>\.<\/td><\/tr><tr><td>Keys &amp; more<\/td><td>Shortcuts\.<\/td><\/tr>/);

  // The comparison, and the index: every tool in one table with its setup, the tools around the engine, the path.
  assert.match(bySlug['tools/compare'].html, /^<p class="lead">The same checks everywhere\.<\/p>\n<div class="compare-wrap"[^>]*>\n<table class="compare">\n<tbody><tr><th scope="row">Feature<\/th><\/tr><\/tbody>\n<\/table>\n<\/div>\n<p class="small">The last column is the <a href="__UP__docs\/tools\/lsp\/">language server<\/a>\.<\/p>$/);
  assert.match(index, /^<p class="lead">The tools\.<\/p>\n<h2 id="the-tools">The tools<\/h2>\n<table><thead><tr><th>Tool<\/th><th>What it is<\/th><th>Set up<\/th><\/tr><\/thead><tbody><tr><td><a href="__UP__docs\/tools\/workbench\/">Workbench<\/a><\/td><td>In a browser tab\.<\/td><td>Nothing\. <a href="__UP__">Open it<\/a><\/td><\/tr><tr><td><a href="__UP__docs\/tools\/vscode\/">vscode<\/a><\/td><td>The vscode line\.<\/td><td><a href="__UP__docs\/tools\/vscode\/setup\/">Set up vscode<\/a><\/td><\/tr>/);
  assert.equal((index.slice(index.indexOf('class="dg-core"'), index.indexOf('id="dg-core-cap"')).match(/<li><a href="__UP__docs\/tools\/[\w-]+\/"><strong>/g) ?? []).length, 6, 'six tools around the engine');
  assert.match(index, /<p>They share <code class="use">ncdev<\/code>\.<\/p>/);
  assert.match(index, /<ol class="dg-flow"><li><span><strong>Write<\/strong>/);
  assert.match(index, /<a href="__UP__docs\/tools\/compare\/">Feature comparison<\/a><\/p>$/);
});

test('tool docs: written sections are laid out from data: a diagram, steps, a code block, links, {names}', () => {
  const d = { ...guideFixture(), ...fixtureSources() };
  const ncdev = d.tools.tools.find((x) => x.id === 'ncdev');
  ncdev.sections = [{ h: 'Getting it', pair: { a: ['You', 'type'], b: ['ncdev', 'answers'], caption: 'It runs `ncdev`.' }, md: '1. Download `ncdev.exe`.\n2. Press `Ctrl+.` or type `.`.\n\n```json\n{ "a": "<b>" }\n```\n\nSee [the docs](@docs:tools/mcp#tools). VS Code {vscodeVersion} or newer.' }];
  ncdev.refNote = 'From `ncdev --help`.';
  const page = toolDocs(d).pages.find((p) => p.slug === 'tools/ncdev').html;
  assert.match(page, /<h2 id="getting-it">Getting it<\/h2>\n<figure class="dg" aria-labelledby="dg-getting-it-cap"><ol class="dg-flow pair"><li><span><strong>You<\/strong><small>type<\/small><\/span><\/li><li><span><strong>ncdev<\/strong>/);
  assert.match(page, /<ol class="steps"><li>Download <code class="use">ncdev\.exe<\/code>\.<\/li><li>Press <kbd>Ctrl\+\.<\/kbd> or type <code class="use">\.<\/code>\.<\/li><\/ol>/);
  assert.match(page, /<pre class="cfg" data-lang="json"><code>\{ &quot;a&quot;: &quot;&lt;b&gt;&quot; \}<\/code><\/pre>/);
  assert.match(page, /See <a href="__UP__docs\/tools\/mcp\/#tools">the docs<\/a>\. VS Code 1\.85 or newer\./);
  // The generated reference follows the written part; then where it comes from, then Related.
  assert.ok(page.indexOf('id="getting-it"') < page.indexOf('id="commands"'));
  assert.match(page, /<p class="small">From <code class="use">ncdev --help<\/code>\.<\/p>\n<h2 id="related">Related<\/h2>/);
  // Text helpers on their own.
  const c = { repo: 'https://example.test/r', keyOf: () => 'F8', guideHref: (id) => `__UP__docs/guide/${id}/` };
  assert.equal(rich('[a]({repo}/x?y=1&z=2) and [b](@guide:check#keys), {key:any}, `F8`, `=`', c), '<a href="https://example.test/r/x?y=1&z=2">a</a> and <a href="__UP__docs/guide/check/#keys">b</a>, <kbd>F8</kbd>, <kbd>F8</kbd>, <code class="use">=</code>');
  assert.equal(blocks('One.\n\n- a\n- b\n\n```\nx < y\n```', c), '<p>One.</p>\n<ul class="dlist"><li>a</li><li>b</li></ul>\n<pre class="cfg"><code>x &lt; y</code></pre>');
});

test('tool docs: a key, page, link, picture or section that does not exist stops the build', () => {
  const base = () => ({ ...guideFixture(), ...fixtureSources() });
  const broken = (change) => { const d = base(); change(d); return () => toolDocs(d); };
  assert.doesNotThrow(() => toolDocs(base()));
  assert.throws(broken((d) => { d.guide.pages[0].sections[0].md = 'Press {key:nope}.'; }), /\{key:nope\} is not an action/);
  assert.throws(broken((d) => { d.guide.pages[0].sections[0].md = 'See [it](@guide:nowhere).'; }), /@guide:nowhere is not a page/);
  assert.throws(broken((d) => { d.guide.pages[0].sections[0].md = 'See [it](other.html).'; }), /a link to "other\.html"/);
  assert.throws(broken((d) => { d.guide.pages[0].sections[0].md = 'See [it](@docs:tools/gone).'; }), /@docs:tools\/gone is not a Tools page/);
  assert.throws(broken((d) => { d.guide.pages[1].shots = ['workbench-missing']; }), /"workbench-missing" has no caption/);
  assert.throws(broken((d) => { d.tools.tools[1].video = 'missing'; d.tools.tools[1].videoLine = 'x'; }), /no video "missing"/);
  // A page ends with one short list of links, not a second table of contents.
  assert.throws(broken((d) => { d.tools.tools[1].related = Array(RELATED_MAX + 1).fill('[x](@site:tools/)'); }), /related links; 3 at most/);
  // Settings: a section the workbench gained or lost has to be on the page.
  assert.throws(broken((d) => { d.settingsTabs.push('New one'); }), /No line for: New one/);
  assert.throws(broken((d) => { d.guide.pages[5].settingsTabs.Gone = 'x'; }), /Not a section any more: Gone/);
  // PORTING.md's sections are found by their headings.
  assert.throws(broken((d) => { d.porting = d.porting.replace('### Settings', '### Options'); }), /PORTING\.md has no "### Settings" section/);
});

// The real data: data/tools.json, src/guide.json, src/tourparts.json, the tips and the shortcuts, as the build reads them.
const GUIDE = readGuideSources(path.join(root, 'workbench', 'playground'));
const { ACTIONS } = await load('playground/src/keyactions.ts');
const { GENERAL_TIPS } = await load('playground/src/tips.ts');
const REAL = () => toolDocs({ ...readToolSources(root), ...GUIDE, help: 'Commands:\n', mcpTools: [], actions: ACTIONS, repoUrl: 'https://example.test/r', compareHtml: compareHtml() });

test('tool docs: every tool has a reference page that says what it is, and a setup page when it is installed', () => {
  assert.deepEqual(GUIDE.tools.tools.map((t) => t.id), ['workbench', 'vscode', 'notepadpp', 'lsp', 'ncdev', 'mcp']);
  const { pages } = REAL();
  const at = (slug) => pages.find((p) => p.slug === slug);
  for (const t of GUIDE.tools.tools) {
    assert.ok(t.summary.length > 60 && t.summary.length < 420, `${t.id}: "summary" is one to three sentences`);
    assert.ok(t.line.length > 15 && t.line.length < 130, `${t.id}: "line" is one line for the Tools table`);
    assert.ok(t.facts.length >= 3 && t.facts.every(([name, text]) => name.length < 24 && text), `${t.id}: its facts, a short name each`);
    assert.ok(at(t.slug), `${t.id}: a page at docs/${t.slug}/`);
    if (t.video) assert.ok(GUIDE.videos[t.video] && t.videoLine, `${t.id}: the video is on the start page, with a line about it`);
    if (t.id === 'workbench') { assert.ok(t.setupLine && !t.setup, 'the workbench needs no setup, and says so'); continue; }
    // Getting started is a page of its own, and the reference page links to it once in its facts.
    const s = t.setup;
    assert.equal(at(s.slug)?.group, 'Get started', `${t.id}: its setup page`);
    assert.equal(at(t.slug).group, 'Reference');
    assert.ok(s.verify?.length > 20, `${t.id}: the setup says how to see that it worked`);
    assert.ok(s.steps?.length >= 2 || s.sections?.length, `${t.id}: the setup has steps`);
    assert.ok(t.facts.some(([, text]) => text.includes(`@docs:${s.slug})`)), `${t.id}: the facts link to the setup page`);
    assert.ok(s.related?.some((x) => x.includes(`@docs:${t.slug})`)), `${t.id}: the setup links back to the reference`);
    // What a reference page isn't: advice on when to use the tool, or the steps to install it.
    assert.ok(!('when' in t) && !('what' in t) && !('get' in t), `${t.id}: no "when to use it" on a reference page`);
    for (const sec of t.sections ?? []) assert.doesNotMatch(sec.h, /^(When|Why|Getting|Setting|Install)/i, `${t.id}: "${sec.h}" belongs on the setup page or the Tools page`);
  }
});

test('tool docs: the workbench\'s pages cover every workbench tip, on one page each', () => {
  const gui = GENERAL_TIPS.filter((t) => t.kind === 'gui').map((t) => t.id);
  const placed = [...GUIDE.guide.pages.flatMap((p) => p.covers ?? []), ...GUIDE.guide.skipTips];
  // A new workbench feature gets a tip (AGENTS.md). Describe the feature on the page of its area and add the tip's
  // id to that page's `covers`, so the docs gain it too.
  assert.deepEqual(gui.filter((id) => !placed.includes(id)), [], 'workbench tips (src/tips.ts) whose feature no page describes (src/guide.json: covers, or skipTips)');
  assert.deepEqual(placed.filter((id, i) => placed.indexOf(id) !== i), [], 'tips covered twice');
  assert.deepEqual(placed.filter((id) => !gui.includes(id)), [], 'ids in guide.json that are not workbench tips');
});

test('tool docs: a page says a thing once and links sparingly', () => {
  const { pages } = REAL();
  // The two pages that are lists of the others: the Tools page (its own table) and the workbench's screen.
  const hubs = new Set(['tools/workbench']);
  for (const p of pages) {
    const html = (p.intro ?? '') + (p.html ?? '') + (p.outro ?? '');
    const links = [...html.matchAll(/href="__UP__docs\/(tools\/[^"#]*?)\/(#[^"]*)?"/g)].map((m) => m[1]).filter((to) => to !== p.slug);
    if (!hubs.has(p.slug)) assert.ok(new Set(links).size <= 4, `${p.slug}: links to ${new Set(links).size} other Tools pages (${[...new Set(links)].join(', ')}); four at most, the rest is the docs list's job`);
    // No link is repeated in the text and again under Related.
    const [text, rel = ''] = html.split('<h2 id="related">');
    for (const to of [...rel.matchAll(/href="__UP__([^"]*)"/g)].map((m) => m[1])) assert.ok(!text.includes(`href="__UP__${to}"`) || /setup\/$/.test(to), `${p.slug}: ${to} is linked in the text and again under Related`);
    // Sections that every page used to repeat.
    assert.doesNotMatch(html, /<h2[^>]*>(When to use it|How it works|Tips from the workbench)<\/h2>/, p.slug);
    if (p.slug.startsWith('tools/workbench')) assert.doesNotMatch(html, /<h2 id="keys">/, `${p.slug}: its keys are written where they're used, and listed on the shortcuts page`);
    assert.doesNotMatch(html, /class="guide-nav"|class="small more"/, `${p.slug}: no previous/next or "Next:" line`);
  }
  // Until the full release the docs don't tell people to upload to the Hub (AGENTS.md).
  for (const p of pages) assert.doesNotMatch((p.intro ?? '') + (p.html ?? '') + (p.outro ?? ''), /upload[^.<]*\bHub\b|\bHub\b[^.<]*upload|hub\.splitscreen\.me"/i, `${p.slug}: a Hub upload step`);
  // Shortcuts are tabulated on one page.
  const tables = pages.filter((p) => /<th>Action<\/th><th>Keys<\/th>/.test(p.html ?? ''));
  assert.deepEqual(tables.map((p) => p.slug), ['tools/workbench/shortcuts']);
});

test('tool docs: the labelled screenshot and the tour point at the same parts', () => {
  const pages = new Set(GUIDE.guide.pages.map((p) => p.id));
  const ids = GUIDE.tourParts.parts.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const p of GUIDE.tourParts.parts) {
    assert.ok(p.title && p.text && p.targets.length, `${p.id}: a title, a text and where it points`);
    assert.ok(pages.has(p.page), `${p.id}: its page "${p.page}" exists`);
  }
  // The positions come from tools/screenshots.cjs --only map: run it again when a part is added or moves.
  assert.ok(GUIDE.map, 'docs/images/guide/workbench-map.json (node tools/screenshots.cjs --only map)');
  assert.deepEqual(Object.keys(GUIDE.map.parts).sort(), [...ids].sort(), 'the parts on the picture are the tour\'s parts');
  for (const [id, at] of Object.entries(GUIDE.map.parts)) assert.ok(at.x > 0 && at.x < 100 && at.y > 0 && at.y < 100, `${id}: inside the picture`);
  const app = read('workbench/playground/src/app.ts');
  for (const id of [...app.slice(app.indexOf('const TOUR_ACTS'), app.indexOf('const tour = initTour')).matchAll(/^  (\w+): \{/gm)].map((m) => m[1])) assert.ok(ids.includes(id), `app.ts has a tour action for "${id}", which is not a part in tourparts.json`);
});

test('tool docs: the real pages build, link only to pages that exist, and their pictures are there in both themes', () => {
  const { pages, index, media } = REAL();
  const slugs = new Set(pages.map((p) => p.slug));
  const site = new Set(['', 'tools/', 'ai/', 'rules/', 'start/', 'learn/', 'docs/', 'docs/tools/']);
  for (const p of [...pages, { slug: 'tools', html: index }]) {
    const html = (p.intro ?? '') + (p.html ?? '') + (p.outro ?? '');
    assert.doesNotMatch(html, /\{key:|\{repo\}|\{vscodeVersion\}|undefined|@guide:|@site:|@docs:/, p.slug);
    for (const m of html.matchAll(/href="__UP__([^"#]*)(#[^"]*)?"/g)) {
      const to = m[1];
      if (to.startsWith('docs/tools/') && to !== 'docs/tools/') assert.ok(slugs.has(to.slice(5, -1)), `${p.slug}: links to ${to}, which is not a page`);
      else if (!to.startsWith('start/')) assert.ok(site.has(to), `${p.slug}: links to ${to}, which is not a page of the site`);
    }
    for (const m of html.matchAll(/<img class="th-light"[^>]* alt="([^"]*)"/g)) assert.ok(m[1].length > 8, `${p.slug}: a picture without a description`);
  }
  for (const p of GUIDE.guide.pages.slice(1)) assert.ok(p.intro?.length > 40, `workbench page ${p.id}: what the part is`);
  for (const n of media) for (const t of ['light', 'dark']) assert.ok(GUIDE.galleryDirs.some((dir) => fs.existsSync(path.join(dir, `${n}-${t}.webp`))), `${n}-${t}.webp is in a gallery folder`);
  assert.ok(media.includes('workbench-map') && media.includes('workbench-check') && media.includes('vscode-debugger'));
});

test('tool docs: writer registers nested pages, resolves their links and omits Tools when absent', (t) => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ncdev-tool-docs-'));
  t.after(() => fs.rmSync(outDir, { recursive: true, force: true }));
  const options = {
    outDir, startHtml: '<style></style>', docsPage: () => ({ markdown: 'API reference', crumbs: [] }),
    docsView: (value) => value, allEntries: () => [], groups: [], base: 'https://example.test/project/',
    noindex: '', hl: (code) => `[${code}]`,
  };
  const toolPages = [
    { slug: 'tools/editor', title: 'Editor & keys', nav: 'Editor', desc: 'Shortcuts', group: 'Get started', html: '<a href="__UP__start/">Start</a>' },
    { slug: 'tools/cli', title: 'CLI', desc: 'Commands', group: 'Reference', md: '## Usage\n\n[Manual](manual.md)\n\n```lua\nlocal a = "<b>" -- note\n```\n\n```elisp\n(setq a 1)\n```\n\n```js\nGame.Play = 1;\n```\n\n```\nGame.GUID = 2;\n```\n\n```ini\nkey=value\n```\n\nAfter.', mdHref: (url) => `https://example.test/${url}` },
  ];
  const page = (slug) => fs.readFileSync(path.join(outDir, slug, 'index.html'), 'utf8');
  const nav = () => JSON.parse(fs.readFileSync(path.join(outDir, 'nav.json'), 'utf8')).filter(({ sec }) => sec === 'tools');
  assert.deepEqual(writeDocPages({ ...options, toolPages, toolsIndex: '<a href="__UP__docs/tools/editor/">Editor &amp; keys</a>', toolCss: '.tool-test { color: red; }' }), ['', 'tools', 'tools/editor', 'tools/cli']);
  assert.match(page(''), /href="tools\/">Tools<\/a>/);
  assert.match(page('tools'), /href="\.\.\/\.\.\/docs\/tools\/editor\/">Editor &amp; keys<\/a>/);
  assert.match(page('tools/editor'), /\.tool-test \{ color: red; \}/);
  assert.match(page('tools/editor'), /href="\.\.\/\.\.\/\.\.\/start\/">Start<\/a>/);
  assert.match(page('tools/editor'), /rel="canonical" href="https:\/\/example\.test\/project\/docs\/tools\/editor\/"/);
  assert.doesNotMatch(page('tools/editor'), /__UP__/);
  assert.match(page('tools/cli'), /<h2>Usage<\/h2>/);
  assert.match(page('tools/cli'), /href="https:\/\/example\.test\/manual\.md"/);
  // A fenced block in another language is marked for that language's colours (the site's page pass), not coloured
  // as handler JavaScript; handler code (js, or no language) gets the handler colours; an unknown one stays plain.
  assert.match(page('tools/cli'), /<pre class="cfg" data-lang="lua"><code>local a = &quot;&lt;b&gt;&quot; -- note<\/code><\/pre>/);
  assert.match(page('tools/cli'), /<pre class="cfg" data-lang="commonlisp"><code>\(setq a 1\)<\/code><\/pre>/);
  assert.match(page('tools/cli'), /<pre class="cfg hl"><code>\[Game\.Play = 1;\]<\/code><\/pre>/);
  assert.match(page('tools/cli'), /<pre class="cfg hl"><code>\[Game\.GUID = 2;\]<\/code><\/pre>/);
  assert.match(page('tools/cli'), /<pre class="cfg"><code>key=value<\/code><\/pre>\n<p>After\.<\/p>/);
  assert.deepEqual(nav().map(({ title, items }) => [title, items.map(({ u }) => u)]), [
    ['Get started', ['docs/tools/editor/', 'ai/']],
    ['Reference', ['docs/tools/cli/']],
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
