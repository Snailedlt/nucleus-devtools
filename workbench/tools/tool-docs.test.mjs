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
import { parseHelp, parseNppMenu, toolDocs, readToolSources, readGuideSources } from '../playground/tool-docs.mjs';

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

/** The least the guide and the introductions need, for tests of the reference parts. */
const guideFixture = () => {
  const tool = (id, slug, group) => ({ id, slug, group, title: id, short: id, what: `What ${id} is.`, when: ['When one.', 'When two.'], get: { href: 'tools/', label: 'Get it' } });
  const pg = (id, extra = {}) => ({ id, slug: `tools/workbench/${id}`, nav: id, title: id, desc: `About ${id}.`, intro: `Intro of ${id}.`, ...extra });
  return {
    tools: {
      groups: [{ id: 'workbench', title: 'Workbench', line: 'In the browser.' }, { id: 'editors', title: 'Editors', line: 'In your editor.' }, { id: 'cli-ai', title: 'Command line and AI', line: 'For scripts.' }],
      core: { title: 'One engine', parts: ['Checks'], line: 'All share it.' },
      flow: [{ id: 'write', label: 'Write', line: 'Type' }, { id: 'test', label: 'Test', line: 'In Nucleus' }],
      tools: [tool('workbench', 'tools/workbench', 'workbench'), tool('vscode', 'tools/vscode', 'editors'), tool('notepadpp', 'tools/notepadpp', 'editors'), tool('other-editors', 'tools/other-editors', 'editors'), tool('ncdev', 'tools/ncdev', 'cli-ai'), tool('mcp', 'tools/mcp', 'cli-ai')],
    },
    guide: { skipTips: [], pages: [
      { id: 'overview', slug: 'tools/workbench', nav: 'Overview', title: 'Workbench', desc: 'The workbench.', sections: [{ h: 'First <minute>', md: '1. Press {key:zoom}.\n2. Then `F8`, see [Check](@guide:check) and [the site](@site:tools/).\n\nA **bold** line with `code`.' }] },
      pg('writing', { keys: ['zoom'], tips: ['t-one'], said: ['t-two'] }), pg('check'), pg('try-it'), pg('files'), pg('settings', { settingsTabs: true }), pg('shortcuts', { allKeys: true }),
    ] },
    tourParts: { parts: [{ id: 'code', title: 'The code', text: 'Write here. {key:zoom} zooms.', targets: ['#editor'], page: 'writing' }] },
    tips: [{ id: 't-one', text: 'A tip with {key:zoom} & more.', kind: 'gui' }, { id: 't-two', text: 'Already said.', kind: 'gui' }],
    gallery: {}, videos: {}, sizes: {}, map: { width: 200, height: 100, parts: { code: { x: 25, y: 50 } } },
    compareHtml: '<tbody><tr><th scope="row">Feature</th></tr></tbody>', editors: { editors: [{ id: 'sample', name: 'Sample 2+', tile: { name: 'Sample', line: 'One line' } }] }, editorTag: (id) => `<span>tested:${id}</span>`, settingsTabs: ['Theme', 'Keys & more'],
  };
};

test('tool docs: render commands, settings, chords and MCP input details from source data', () => {
  const { pages, index, media } = toolDocs({
    ...guideFixture(),
    help: 'Commands:\n  run <file>'.padEnd('Commands:\n'.length + 30) + 'Read `<file>` & **check** it\n',
    pkg: { contributes: {
      configuration: [{ properties: { enabled: { default: false, description: 'Show <details>' } } }, { properties: { paths: { default: {} } } }],
      commands: [{ command: 'sample.run', category: 'Sample', title: 'Run & check' }],
      keybindings: [{ command: 'sample.run', key: 'ctrl+r', mac: 'cmd+r' }, { command: 'sample.other', key: 'f5', mac: 'f5' }],
    } },
    nppCpp: 'static FuncItem funcs[] = {{L"Check & fix", run, 0, false, &altEnter}};',
    actions: [{ id: 'zoom', label: 'Zoom <in>', group: 'View', keys: 'Ctrl+K Ctrl+0', mac: 'Cmd+K Cmd+0', where: 'fixed' }],
    porting: '## Wiring\n\n### Sample (LSP)\n\nSee [setup](docs/setup.md) or [above](#intro).\n\n## Debugging\n\nDebug here.\n\n## Not part of setup\n',
    mcpTools: [
      { name: 'sample_check', title: 'Check <input>', description: 'Check **once**.', inputSchema: { required: ['source'], properties: { source: { type: 'string' }, mode: { enum: ['simple', 'full'], description: 'Choose a mode' } } } },
      { name: 'sample_info', description: 'Show details.' },
    ],
    repoUrl: 'https://example.test/owner/repo',
  });
  const bySlug = Object.fromEntries(pages.map((page) => [page.slug, page]));
  assert.deepEqual(Object.keys(bySlug), ['tools/workbench', 'tools/workbench/writing', 'tools/workbench/check', 'tools/workbench/try-it', 'tools/workbench/files', 'tools/workbench/settings', 'tools/workbench/shortcuts', 'tools/editors', 'tools/vscode', 'tools/notepadpp', 'tools/other-editors', 'tools/ncdev', 'tools/mcp']);
  assert.deepEqual(pages.map((page) => page.group).filter((g, i, all) => all.indexOf(g) === i), ['Workbench', 'Editors', 'Command line and AI']);
  assert.match(bySlug['tools/workbench/shortcuts'].html, /Zoom &lt;in&gt;<\/td><td><kbd>Ctrl\+K Ctrl\+0<\/kbd> .*<kbd>Cmd\+K Cmd\+0<\/kbd>.*>fixed<\/span>/);
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
  // Every tool's page starts with what it is and when it is useful.
  for (const slug of ['tools/workbench', 'tools/vscode', 'tools/notepadpp', 'tools/ncdev', 'tools/mcp']) assert.match(bySlug[slug].html, /^<div class="tool-intro">\n<p class="lead">What \w+ is\.<\/p>\n<h2 id="when">When it is useful<\/h2>\n<ul class="dlist"><li>When one\.<\/li><li>When two\.<\/li><\/ul>/, slug);
  assert.match(other.intro, /^<div class="tool-intro">/);
  // The guide's text: steps, keys, links to other pages and to the site, bold and code; all escaped.
  const over = bySlug['tools/workbench'].html;
  assert.match(over, /<h2 id="first-minute">First &lt;minute&gt;<\/h2>\n<ol class="steps"><li>Press <kbd>Ctrl\+K Ctrl\+0<\/kbd>\.<\/li><li>Then <kbd>F8<\/kbd>, see <a href="__UP__docs\/tools\/workbench\/check\/">Check<\/a> and <a href="__UP__tools\/">the site<\/a>\.<\/li><\/ol>\n<p>A <strong>bold<\/strong> line with <code class="use">code<\/code>\.<\/p>/);
  // The labelled screenshot: a number on each part, the same number's line below, and the page that explains it.
  assert.match(over, /<a class="map-pin" href="#part-code" style="left:25%;top:50%" aria-label="1: The code">1<\/a>/);
  assert.match(over, /<li id="part-code"><strong>The code\.<\/strong> Write here\. <kbd>Ctrl\+K Ctrl\+0<\/kbd> zooms\. <a href="__UP__docs\/tools\/workbench\/writing\/">More: writing<\/a><\/li>/);
  assert.ok(media.includes('workbench-map'));
  // A page's own keys and tips; a tip its text already says isn't repeated.
  const writing = bySlug['tools/workbench/writing'].html;
  assert.match(writing, /<p class="lead">Intro of writing\.<\/p>/);
  assert.match(writing, /Where it is: <a href="__UP__docs\/tools\/workbench\/#part-code"/);
  assert.match(writing, /<h2 id="keys">Keys<\/h2>[\s\S]*Zoom &lt;in&gt;/);
  assert.match(writing, /<li>A tip with <kbd>Ctrl\+K Ctrl\+0<\/kbd> &amp; more\.<\/li>/);
  assert.doesNotMatch(writing, /Already said/);
  assert.match(writing, /rel="prev" href="__UP__docs\/tools\/workbench\/"[\s\S]*rel="next" href="__UP__docs\/tools\/workbench\/check\/"/);
  assert.match(bySlug['tools/workbench/settings'].html, /<ul class="chips"><li>Theme<\/li><li>Keys &amp; more<\/li><\/ul>/);
  // Editors: the comparison and how far each language-server editor is tested.
  assert.match(bySlug['tools/editors'].html, /<table class="compare">\n<tbody><tr><th scope="row">Feature<\/th><\/tr><\/tbody>\n<\/table>/);
  assert.match(bySlug['tools/editors'].html, /<td>Sample 2\+<\/td><td>One line<\/td><td><span>tested:sample<\/span><\/td>/);
  // The index: the diagram of every tool around the engine, and the pages by group (the guide's own pages under its overview).
  assert.equal((index.slice(index.indexOf('class="dg-core"'), index.indexOf('id="dg-core-cap"')).match(/<li><a href="__UP__docs\/tools\/[\w-]+\/"><strong>/g) ?? []).length, 6, 'six tools around the engine');
  assert.match(index, /<h2 id="workbench">Workbench<\/h2>\n<p>In the browser\.<\/p>\n<ul class="tool-cards"><li><a href="__UP__docs\/tools\/workbench\/"><strong>Workbench<\/strong>/);
  assert.doesNotMatch(index, /docs\/tools\/workbench\/check\//);
  assert.match(index, /<ol class="dg-flow"><li><span><strong>Write<\/strong>/);
});

test('tool docs: a key, tip, page or link the guide names that does not exist stops the build', () => {
  const base = () => ({ ...guideFixture(), help: '', pkg: { contributes: {} }, nppCpp: 'static FuncItem funcs[] = {};', actions: [{ id: 'zoom', label: 'Zoom', group: 'View', keys: 'Ctrl+0', where: 'app' }], porting: '## Wiring\n\n## Debugging\n', mcpTools: [], repoUrl: 'https://example.test/r' });
  const broken = (change) => { const d = base(); change(d); return () => toolDocs(d); };
  assert.doesNotThrow(() => toolDocs(base()));
  assert.throws(broken((d) => { d.guide.pages[1].keys = ['nope']; }), /lists the key "nope"/);
  assert.throws(broken((d) => { d.guide.pages[1].tips = ['t-none']; }), /lists the tip "t-none"/);
  assert.throws(broken((d) => { d.guide.pages[0].sections[0].md = 'Press {key:nope}.'; }), /\{key:nope\} is not an action/);
  assert.throws(broken((d) => { d.guide.pages[0].sections[0].md = 'See [it](@guide:nowhere).'; }), /@guide:nowhere is not a page/);
  assert.throws(broken((d) => { d.guide.pages[0].sections[0].md = 'See [it](other.html).'; }), /a link to "other\.html"/);
  assert.throws(broken((d) => { d.guide.pages[1].shots = ['workbench-missing']; }), /"workbench-missing" has no caption/);
  assert.throws(broken((d) => { d.tools.tools[1].video = 'missing'; d.tools.tools[1].videoLine = 'x'; }), /no video "missing"/);
});

// The real data: data/tools.json, src/guide.json, src/tourparts.json, the tips and the shortcuts, as the build reads them.
const GUIDE = readGuideSources(path.join(root, 'workbench', 'playground'));
const { ACTIONS } = await load('playground/src/keyactions.ts');
const { GENERAL_TIPS } = await load('playground/src/tips.ts');
const REAL = () => toolDocs({ ...readToolSources(root), ...GUIDE, help: 'Commands:\n', mcpTools: [], actions: ACTIONS, tips: GENERAL_TIPS, repoUrl: 'https://example.test/r', compareHtml: compareHtml(), editorTag });

test('tool docs: every tool says what it is, when it is useful and where to get it', () => {
  assert.deepEqual(GUIDE.tools.tools.map((t) => t.id), ['workbench', 'vscode', 'notepadpp', 'other-editors', 'ncdev', 'mcp']);
  const groups = new Set(GUIDE.tools.groups.map((g) => g.id));
  for (const t of GUIDE.tools.tools) {
    assert.ok(t.what.length > 60 && t.what.length < 420, `${t.id}: "what" is one or two sentences`);
    assert.ok(t.when.length >= 2 && t.when.every((w) => w.length > 15 && w.length < 140), `${t.id}: "when" is two or more short lines`);
    assert.ok(typeof t.get?.href === 'string' && t.get.label, `${t.id}: where to get it`);
    assert.ok(groups.has(t.group), `${t.id}: its group is one of ${[...groups]}`);
    if (t.video) assert.ok(GUIDE.videos[t.video] && t.videoLine, `${t.id}: the video is on the start page, with a line about it`);
  }
  const { pages } = REAL();
  for (const t of GUIDE.tools.tools) assert.ok(pages.some((p) => p.slug === t.slug), `${t.id}: a page at docs/${t.slug}/`);
});

test('tool docs: the guide covers every workbench tip, on one page each', () => {
  const gui = GENERAL_TIPS.filter((t) => t.kind === 'gui').map((t) => t.id);
  const placed = [...GUIDE.guide.pages.flatMap((p) => [...(p.tips ?? []), ...(p.said ?? [])]), ...GUIDE.guide.skipTips];
  // A new workbench feature gets a tip (AGENTS.md); give the tip a guide page here, so the docs gain it too.
  assert.deepEqual(gui.filter((id) => !placed.includes(id)), [], 'workbench tips (src/tips.ts) that no guide page (src/guide.json: tips, said or skipTips) has');
  assert.deepEqual(placed.filter((id, i) => placed.indexOf(id) !== i), [], 'tips placed twice');
  assert.deepEqual(placed.filter((id) => !gui.includes(id)), [], 'ids in guide.json that are not workbench tips');
});

test('tool docs: the labelled screenshot and the tour point at the same parts', () => {
  const pages = new Set(GUIDE.guide.pages.map((p) => p.id));
  const ids = GUIDE.tourParts.parts.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const p of GUIDE.tourParts.parts) {
    assert.ok(p.title && p.text && p.targets.length, `${p.id}: a title, a text and where it points`);
    assert.ok(pages.has(p.page), `${p.id}: its guide page "${p.page}" exists`);
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
  const site = new Set(['', 'tools/', 'ai/', 'rules/', 'start/', 'learn/']);
  for (const p of [...pages, { slug: 'tools', html: index }]) {
    const html = (p.intro ?? '') + (p.html ?? '');
    assert.doesNotMatch(html, /\{key:|undefined|@guide:|@site:|@docs:/, p.slug);
    for (const m of html.matchAll(/href="__UP__([^"#]*)(#[^"]*)?"/g)) {
      const to = m[1];
      if (to.startsWith('docs/tools/')) assert.ok(slugs.has(to.slice(5, -1)), `${p.slug}: links to ${to}, which is not a page`);
      else if (!to.startsWith('start/')) assert.ok(site.has(to), `${p.slug}: links to ${to}, which is not a page of the site`);
    }
    for (const m of html.matchAll(/<img class="th-light"[^>]* alt="([^"]*)"/g)) assert.ok(m[1].length > 8, `${p.slug}: a picture without a description`);
  }
  for (const p of GUIDE.guide.pages.slice(1)) assert.ok(p.intro?.length > 40, `guide page ${p.id}: an introduction`);
  for (const n of media) for (const t of ['light', 'dark']) assert.ok(GUIDE.galleryDirs.some((dir) => fs.existsSync(path.join(dir, `${n}-${t}.webp`))), `${n}-${t}.webp is in a gallery folder`);
  assert.ok(media.includes('workbench-map') && media.includes('workbench-check') && media.includes('vscode-debugger'));
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
    { slug: 'tools/editor', title: 'Editor & keys', nav: 'Editor', desc: 'Shortcuts', group: 'Editors', html: '<a href="__UP__start/">Start</a>' },
    { slug: 'tools/cli', title: 'CLI', desc: 'Commands', group: 'Command line and AI', md: '## Usage\n\n[Manual](manual.md)', mdHref: (url) => `https://example.test/${url}` },
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
