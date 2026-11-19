import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiPathOf, hoverAt, linkApiNames, signatureHelpAt, workbenchDocsUrl } from '../core/features';
import { docsPageUrl, docsPage, docsView, docsValue } from '../core/docspage';
import { api, firstSentence, memberMarkdown } from '../core/api';
import { lint } from '../core/lint';
import { fallbackMarkdown, highlightCode, renderDocsPanel, docsCommandLink, linksSection } from '../docspanel';

const link = (p: string) => `L(${p})`;

test('docs links: API names in Markdown become links; code blocks, existing links and parameters stay', () => {
  assert.equal(apiPathOf('ModifySaveFile'), 'Context.ModifySaveFile');
  assert.equal(apiPathOf('Context.ModifySaveFile()'), 'Context.ModifySaveFile');
  assert.equal(apiPathOf('Nucleus.DPIHandling'), 'Nucleus.DPIHandling');
  assert.equal(apiPathOf('path'), undefined, 'a parameter name');
  assert.equal(apiPathOf('true'), undefined);
  const md = 'Use `Context.Width` or `KillMutex`, not `path`.\n\n```js\nContext.Width\n```\n\n[`Game.Play`](x)';
  const out = linkApiNames(md, link);
  assert.match(out, /\[`Context\.Width`\]\(L\(Context\.Width\)\)/);
  assert.match(out, /\[`KillMutex`\]\(L\(KillMutex\)\)/, "in more than one place: a search for it");
  assert.match(out, /not `path`/);
  assert.match(out, /```js\nContext\.Width\n```/, 'code blocks untouched');
  assert.match(out, /\[`Game\.Play`\]\(x\)/, 'an existing link untouched');
  assert.equal(workbenchDocsUrl('Context.ModifySaveFile', 'neovim'), 'https://snailedlt.github.io/nucleuscoop-handler-testbench/?ref=neovim#docs-Context.ModifySaveFile');
});

test('docs links: hover ends with "Full docs" for the name (and the web page beside it); signature docs link names; nothing without docsLink', () => {
  const text = 'Game.Play = function () {\n  Context.ModifySaveFile(a, b, Nucleus.SaveType.INI, []);\n};';
  const at = text.indexOf('ModifySaveFile') + 3;
  assert.match(hoverAt(text, at, { docsLink: link })!.markdown, /\[Full docs\]\(L\(Context\.ModifySaveFile\)\)$/);
  assert.match(hoverAt(text, at, { docsLink: link, webDocsLink: (p) => docsPageUrl(p, 'vscode') })!.markdown,
    /\[Full docs\]\(L\(Context\.ModifySaveFile\)\) · \[On the web\]\(https:\/\/snailedlt\.github\.io\/nucleuscoop-handler-testbench\/docs\/Context\.ModifySaveFile\/\?ref=vscode\)$/);
  assert.doesNotMatch(hoverAt(text, at)!.markdown, /Full docs/);
  const own = 'function go() {}\ngo();';
  assert.doesNotMatch(hoverAt(own, own.lastIndexOf('go') + 1, { docsLink: link })?.markdown ?? '', /Full docs/, 'own functions have no API docs');
  const sig = signatureHelpAt(text, text.indexOf('(a') + 1, { docsLink: link })!;
  assert.ok(sig.signatures.length);
});

test('hover is short: signature, first sentence, AI mark, links; no "In practice", votes, engines or examples', () => {
  // Members with a long doc, "In practice", a "By engine" line and an example: none of it beyond the first sentence.
  for (const [owner, name, code] of [['Game', 'KillMutex', 'Game.KillMutex = [];'], ['Context', 'ModifySaveFile', 'Game.Play = function () {\n  Context.ModifySaveFile(a, b, c, d);\n};'], ['Game', 'ExecutableContext', 'Game.ExecutableContext = [];']] as const) {
    const m = api.objects[owner].members[name];
    assert.ok(m.practice && m.example && m.byEngine, `${owner}.${name} still has practice, an example and an engine line`);
    const md = hoverAt(code, code.indexOf(name) + 2, { docsLink: link })!.markdown;
    assert.doesNotMatch(md, /In practice|```js|👍|votes|Is it wrong/, md);
    assert.ok(!md.includes(m.byEngine!), md);
    assert.match(md, new RegExp(`\\[Full docs\\]\\(L\\(${owner}\\.${name}\\)\\)$`));
    const prose = md.replace(/```[\s\S]*?```/g, '').replace(/_(?:Source|Hub handlers):[^\n]*_/g, '').replace(/\[Full docs\][^\n]*/, '').trim();
    assert.ok(prose.length <= 260, `${owner}.${name}: ${prose.length} characters\n${prose}`);
    if (m.docBy === 'claude') assert.match(md, /✨ [\s\S]*\n\n_Based on /, 'the AI-written mark stays: a ✨ and the basis');
    // The completion docs keep everything.
    assert.match(memberMarkdown(owner, name, m), /In practice/);
  }
});

test('firstSentence: stops at the first full stop outside code and abbreviations, or at " | "', () => {
  assert.equal(firstSentence('Runs `Game.Play` per player. Then more.'), 'Runs `Game.Play` per player.');
  assert.equal(firstSentence('Use names, e.g. `a.b`, here. Not this.'), 'Use names, e.g. `a.b`, here.');
  assert.equal(firstSentence('Enable hooks | default: false.'), 'Enable hooks.');
  assert.equal(firstSentence('```js\nx.y\n```\n\nThe text after the code block. More.'), 'The text after the code block.');
  assert.equal(firstSentence('Optional. When using the emulator. More.'), 'Optional. When using the emulator.', 'a very short one takes the next');
  assert.equal(firstSentence('The first line\ncontinues on the next one. Two.'), 'The first line continues on the next one.');
  const long = firstSentence('word '.repeat(80) + 'end.');
  assert.ok(long.length <= 201 && long.endsWith('…'), long);
  assert.equal(firstSentence('An `open code span ' + 'x '.repeat(120), 60).split('`').length % 2, 1, 'code spans stay closed');
});

test('docsPageUrl: a name with a page goes to it, anything else to the workbench', () => {
  assert.equal(docsPageUrl('Context.ModifySaveFile', 'neovim'), 'https://snailedlt.github.io/nucleuscoop-handler-testbench/docs/Context.ModifySaveFile/?ref=neovim');
  assert.equal(docsPageUrl('Nucleus.SaveType', 'x'), 'https://snailedlt.github.io/nucleuscoop-handler-testbench/docs/Nucleus.SaveType/?ref=x');
  assert.equal(docsPageUrl('', 'x'), 'https://snailedlt.github.io/nucleuscoop-handler-testbench/docs/?ref=x');
  assert.match(docsPageUrl('mutex', 'x'), /\?ref=x#docs-mutex$/);
});

test('docs pages: home, group, name, enum, search; views and #docs- values round-trip', () => {
  const home = docsPage('home', link);
  assert.match(home.markdown, /\[Context\]\(L\(Context\)\)/);
  assert.deepEqual(home.crumbs, []);
  const group = docsPage(docsView('Context'), link);
  assert.equal(group.view, 'group:Context');
  assert.match(group.markdown, /- \[`Context\.ModifySaveFile`\]\(L\(Context\.ModifySaveFile\)\)/);
  const one = docsPage(docsView('Context.ModifySaveFile'), link);
  assert.equal(one.path, 'Context.ModifySaveFile');
  assert.deepEqual(one.crumbs, [{ label: 'Context', view: 'group:Context' }, { label: 'ModifySaveFile' }]);
  const en = docsPage(docsView('Nucleus.DPIHandling'), link);
  assert.match(en.markdown, /enum Nucleus\.DPIHandling/);
  assert.match(docsPage(docsView('mutex'), link).markdown, /KillMutex/);
  assert.match(docsPage(docsView('KilMutex'), link).markdown, /Did you mean/);
  for (const v of ['', 'Context', 'Context.Width', 'window title']) assert.equal(docsValue(docsView(v)), v);
});

test('Nucleus Docs panel: path, back, search and workbench links; no scripts', () => {
  const page = docsPage(docsView('Context.ModifySaveFile'), docsCommandLink);
  const html = renderDocsPanel(page, fallbackMarkdown(page.markdown), true);
  assert.ok(!/<script/i.test(html));
  assert.match(html, /command:splitscreenme\.docsBack/);
  assert.match(html, /command:splitscreenme\.docsSearch/);
  assert.match(html, /href="command:splitscreenme\.showDocs\?%5B%22Context%22%5D">Context<\/a>/, 'the group crumb');
  assert.match(html, /<strong aria-current="page">ModifySaveFile<\/strong>/);
  assert.match(html, /docs\/Context\.ModifySaveFile\/\?ref=vscode/);
  assert.equal(fallbackMarkdown('Find it on https://steamdb.info/. Or [here](https://x.y/).'), '<p>Find it on <a href="https://steamdb.info/">https://steamdb.info/</a>. Or <a href="https://x.y/">here</a>.</p>');
  assert.match(fallbackMarkdown('## T\n\n- [`A`](u)\n\n```js\nx < 1\n```'), /<h2>T<\/h2><ul><li><a href="u"><code>A<\/code><\/a><\/li><\/ul><pre><code><span class="tk-variable">x<\/span> &lt; <span class="tk-number">1<\/span><\/code><\/pre>/);
  // Every code block is coloured: the signature on top of a name's page included.
  assert.match(html, /<pre><code><span class="tk-variable">Context<\/span>\.<span class="tk-function">ModifySaveFile<\/span>\(\n  <span class="tk-variable">installSavePath<\/span>: <span class="tk-type">string<\/span>/);
});

test('Nucleus Docs panel: code colours (keywords, strings, numbers, comments, types, calls, members)', () => {
  const h = highlightCode('var ini = Context.GetFolder(Nucleus.Folder.Documents) + "\\\\a.ini"; // x\nreturn 0x10;');
  for (const [cls, t] of [['keyword', 'var'], ['function', 'GetFolder'], ['type', 'Folder'], ['property', 'Documents'], ['comment', '// x'], ['keyword', 'return'], ['number', '0x10']])
    assert.ok(h.includes(`<span class="tk-${cls}">${t}</span>`), `${cls}: ${t} in ${h}`);
  assert.match(h, /<span class="tk-string">&quot;.*a\.ini&quot;<\/span>/);
  assert.ok(!highlightCode('a < b').includes('<b'), 'escaped');
});

test('names from Object.prototype are not API names (no crash, no bogus member)', () => {
  for (const q of ['toString', 'constructor', '__proto__', 'Nucleus.toString', 'Game.toString', 'hasOwnProperty']) {
    assert.doesNotThrow(() => docsPage(docsView(q), (v) => `#docs-${v}`), q);
  }
  const diags = lint('Game.GUID = "A";\nGame.GameName = "A";\nGame.ExecutableName = "a.exe";\nGame.Play = function () { Context.Constructor = 1; var x = Game.ValueOf; };\n');
  assert.ok(diags.some((d) => /Constructor/.test(d.message)), 'Context.Constructor is unknown');
  assert.ok(diags.some((d) => /ValueOf/.test(d.message)), 'Game.ValueOf is unknown');
});

test('Docs panel main page: the web links (the old Docs: Web Links… pick) in a Links section', () => {
  const html = linksSection('https://example.org/wb?ref=vscode');
  assert.match(html, /<h2 id="links-h">Links<\/h2>/);
  for (const url of ['https://www.splitscreen.me/docs/handler-api', 'https://hub.splitscreen.me/', 'https://discord.gg/XxGMkqCf4r', 'https://example.org/wb?ref=vscode']) assert.ok(html.includes(`href="${url}"`), url);
});
