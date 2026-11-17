// Unit tests for the workbench's pure modules (playground/src): share links, packages, theme files, looks, key
// bindings and the saved file's name. Run: node tools/workbench-units.test.mjs (or npm test in playground).
// The extension's core is found as in tools/bundle-ts.mjs (CORE_DIR, ./core, ../splitscreenme-vscode).
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { coreDir, load, memoryStorage, root } from './bundle-ts.mjs';

globalThis.localStorage = memoryStorage();
globalThis.window = { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) };
globalThis.matchMedia = window.matchMedia;
// The browser's CSS.supports, roughly: enough to tell a theme file's good values from bad ones.
globalThis.CSS = {
  supports: (prop, v) =>
    prop === 'color' ? /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([^()]*\)|color-mix\(.*\)|[a-z]+)$/i.test(v)
    : prop === 'border-radius' ? /^\d+(\.\d+)?(px|rem|em|%)?$/.test(v)
    : prop === 'box-shadow' ? /^(none|[\d\s.pxrgba(),#-]+)$/i.test(v)
    : prop === 'font-family' ? /^[\w\s,"'-]+$/.test(v)
    : false,
};

const share = await load('playground/src/share.ts');
const pkg = await load('playground/src/package.ts');
const theme = await load('playground/src/customtheme.ts');
const kit = await load('playground/src/themekit.ts');
const keys = await load('playground/src/keybindings.ts');
const save = await load('playground/src/savefile.ts');
const THEMES = JSON.parse(fs.readFileSync(path.join(root, 'playground/src/themes.json'), 'utf8'));

test('share links: round trip, unicode and long text, only letters and digits', async () => {
  for (const src of ['', 'Game.GameName = "x";', 'Game.GameName = "Ünïcode ✓ 日本 🎮";\n// ½ — “quotes”\n', 'var a = 1;\n'.repeat(5000) + Array.from({ length: 2000 }, (_, i) => `var v${i} = ${(i * 7919) % 1000};`).join('\n')]) {
    const h = await share.encodeShare(src);
    assert.ok(h.startsWith(share.SHARE_PREFIX));
    assert.match(h.slice(share.SHARE_PREFIX.length), /^[0-9A-Za-z]*$/);
    assert.equal(await share.decodeShare(h), src);
  }
  await assert.rejects(share.decodeShare('share-A'), 'a damaged link throws');
  await assert.rejects(share.decodeShare('share-AB_'));
});

test('packages: build then read gives the handler and files back, with folder entries', async () => {
  const enc = new TextEncoder();
  const files = [
    { name: 'My Game/readme.txt', data: enc.encode('hello') },
    { name: 'My Game/utils/x.ini', data: enc.encode('[a]\nb=ü') },
    { name: 'My Game/big.dll', data: new Uint8Array(0), remote: { size: 9e6, url: 'https://hub.splitscreen.me/handler/x' } },
    { name: 'handler.js', data: enc.encode('an old handler.js among the files: replaced') },
  ];
  const zip = pkg.buildPackage('Game.GameName = "Ünï";\n', files);
  // The directory entries Nucleus needs, sorted, after handler.js; placeholders and a second handler.js left out.
  const names = [];
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  for (let p = v.getUint32(zip.length - 22 + 16, true); v.getUint32(p, true) === 0x02014b50; p += 46 + v.getUint16(p + 28, true) + v.getUint16(p + 30, true) + v.getUint16(p + 32, true)) names.push(new TextDecoder().decode(zip.subarray(p + 46, p + 46 + v.getUint16(p + 28, true))));
  assert.deepEqual(names, ['handler.js', 'My Game/', 'My Game/utils/', 'My Game/readme.txt', 'My Game/utils/x.ini']);
  const back = await pkg.readPackage(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength));
  assert.equal(back.handler, 'Game.GameName = "Ünï";\n');
  assert.equal(back.handlerName, 'handler.js');
  assert.deepEqual(back.files.map((f) => [f.name, new TextDecoder().decode(f.data)]), [['My Game/readme.txt', 'hello'], ['My Game/utils/x.ini', '[a]\nb=ü']]);
  assert.deepEqual(back.unreadable, []);
  assert.equal(await pkg.readPackage(new TextEncoder().encode('not a zip').buffer), null);
});

test('packages: a deflated package (as the Hub and VS Code write it) reads too', async () => {
  const zlib = await import('node:zlib');
  const { packageEntries, zipBytes: zb } = await load(path.join(coreDir, 'src/core/zipbytes.ts'));
  const enc = new TextEncoder();
  const z = zb(packageEntries(enc.encode('Game.GUID = "a";\n'.repeat(50)), [{ name: 'G/a.txt', data: enc.encode('x'.repeat(4000)) }]), new Date(), (raw) => new Uint8Array(zlib.deflateRawSync(raw)));
  const back = await pkg.readPackage(z.buffer.slice(z.byteOffset, z.byteOffset + z.byteLength));
  assert.equal(back.handler, 'Game.GUID = "a";\n'.repeat(50));
  assert.equal(new TextDecoder().decode(back.files[0].data), 'x'.repeat(4000));
});

test('theme files: known tokens and safe values only, with what was left out', () => {
  const ok = theme.parseTheme({ name: ' Sunset ', base: 'v3', shared: { '--r-pane': '18px' }, light: { bg: '#fbf1e6', accent: '#b4232c', nope: '#fff' }, dark: { bg: '#1a1210', fg: 'url(x.png)' } });
  assert.ok(!('error' in ok));
  assert.equal(ok.look.name, 'Sunset');
  assert.equal(ok.look.base, 'v3');
  assert.deepEqual(ok.look.shared, { 'r-pane': '18px' }, 'a leading -- is allowed');
  assert.deepEqual(ok.look.light, { bg: '#fbf1e6', accent: '#b4232c' });
  assert.deepEqual(ok.look.dark, { bg: '#1a1210' });
  assert.deepEqual(ok.skipped, ['light.nope (not a theme token)', 'dark.fg (not a valid color)']);
  // Nothing that could leave the rule: semicolons, braces, url(), @import.
  for (const bad of ['red; } body { display: none', 'url(https://x)', '@import "x"', 'expression(alert(1))', '<script>']) {
    const r = theme.parseTheme({ light: { accent: bad, bg: '#fff' } });
    assert.deepEqual(r.look.light, { bg: '#fff' }, bad);
  }
  const unknownBase = theme.parseTheme({ base: 'nope', light: { bg: '#fff' } });
  assert.notEqual(unknownBase.look.base, 'nope');
  assert.match(unknownBase.skipped[0], /^base "nope" \(built-in looks: /);
  assert.equal(theme.parseTheme({ light: { bg: '#fff' } }).look.name, 'Custom theme');
  for (const raw of [null, 'x', 42, [], {}]) assert.ok('error' in theme.parseTheme(raw), JSON.stringify(raw));
  assert.match(theme.parseTheme({ light: { nope: 1 } }).error, /^Nothing in this file can be used: light\.nope/);
  assert.ok('error' in theme.parseTheme({ light: 'red' }));
});

test('themekit: a look builds on its base, derives what it leaves out, never loops', () => {
  const looks = { a: { name: 'A', shared: { r: '4px' }, light: { bg: '#fff', fg: '#000', surface: '#fff', accent: '#0050aa' }, dark: { bg: '#000', fg: '#fff', surface: '#111', accent: '#ffcc00' } }, b: { name: 'B', base: 'a', light: { accent: '#ffee00' } }, loop: { name: 'L', base: 'loop2' }, loop2: { name: 'L2', base: 'loop' } };
  const b = kit.resolve('b', looks, 'light');
  assert.equal(b.bg, '#fff');
  assert.equal(b.r, '4px');
  assert.equal(b.accent, '#ffee00');
  assert.equal(b['accent-fg'], '#0b0d12', 'dark text on a light accent (derived)');
  assert.equal(kit.resolve('a', looks, 'dark')['accent-fg'], '#0b0d12');
  assert.equal(kit.resolve('a', looks, 'light')['accent-fg'], '#ffffff', 'white text on a dark accent');
  assert.equal(kit.resolve('a', looks, 'light')['err-bg'], undefined, 'nothing derived from tokens the look lacks');
  assert.deepEqual(kit.resolve('loop', looks, 'light'), {});
  assert.deepEqual(kit.resolve('missing', looks, 'light'), {});
  assert.equal(kit.readableOn('#000000'), '#ffffff');
  assert.equal(kit.readableOn('#fff'), '#0b0d12');
  assert.equal(kit.readableOn('red'), '#ffffff');
  const css = kit.lookCSS(':root', { bg: '#fff' }, { bg: '#000' });
  assert.match(css, /^:root \{ --bg: #fff; color-scheme: light; \}/);
  assert.match(css, /:root\[data-theme="dark"\] \{ --bg: #000; color-scheme: dark; \}/);
  // Every built-in look resolves, with text tokens for every pair the contrast check reads.
  const file = THEMES;
  for (const id of Object.keys(file.looks)) for (const m of ['light', 'dark']) {
    const t = kit.resolve(id, file.looks, m);
    for (const [fg, bg] of kit.PAIRS) assert.ok(t[fg] && t[bg], `${id} ${m}: ${fg} on ${bg}`);
  }
  assert.match(kit.builtInCSS(file), /:root\[data-site="v3"\]\[data-site\]/);
  assert.deepEqual(kit.codeTokens({ 'code-fg': '#000', 'code-bg': '#fff' })['code-line'], 'color-mix(in srgb, #000 12%, #fff)');
});

test('key bindings: defaults, own bindings, two-step keys, conflicts and keys the browser keeps', () => {
  assert.equal(keys.binding('palette'), 'Ctrl+Shift+P');
  assert.equal(keys.binding('nope'), '');
  assert.equal(keys.keyLabel('Ctrl+Shift+P'), 'Ctrl+Shift+P');
  const ev = (o) => ({ ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...o });
  assert.equal(keys.stepOf(ev({ key: 'p', code: 'KeyP', ctrlKey: true, shiftKey: true })), 'Ctrl+Shift+P');
  assert.equal(keys.stepOf(ev({ key: 'ö', code: 'Semicolon', ctrlKey: true })), 'Ctrl+;', 'punctuation by its US position');
  assert.equal(keys.stepOf(ev({ key: 'Shift', code: 'ShiftLeft', shiftKey: true })), undefined);
  assert.equal(keys.appActionFor(ev({ key: 'P', code: 'KeyP', ctrlKey: true, shiftKey: true })), 'palette');
  // Ctrl+; A: the first step waits, the second completes it.
  assert.equal(keys.appActionFor(ev({ key: ';', code: 'Semicolon', ctrlKey: true })), 'pending');
  assert.equal(keys.appActionFor(ev({ key: 'a', code: 'KeyA' })), 'testAll');
  // Conflicts: another action with the same keys, written in any order of modifiers.
  assert.deepEqual(keys.conflicts('lines', 'Shift+Ctrl+P').map((a) => a.id), ['palette']);
  assert.deepEqual(keys.conflicts('palette', 'Ctrl+Shift+P'), []);
  assert.equal(keys.reserved('Ctrl+W'), 'closes the tab');
  assert.equal(keys.reserved('Ctrl+B'), undefined);
  // An own binding is kept, can be empty (none), and resets.
  let changed = 0;
  keys.onBindingsChange(() => changed++);
  keys.setBinding('lines', 'Ctrl+Alt+L');
  assert.equal(keys.binding('lines'), 'Ctrl+Alt+L');
  assert.ok(keys.isCustom('lines'));
  assert.deepEqual(JSON.parse(localStorage.getItem('nucleus-workbench-keys')), { lines: 'Ctrl+Alt+L' });
  assert.deepEqual(keys.conflicts('palette', 'Ctrl+B'), [], 'the old binding is free now');
  keys.setBinding('save', '');
  assert.equal(keys.binding('save'), '');
  keys.resetAll();
  assert.equal(keys.binding('lines'), 'Ctrl+B');
  assert.equal(localStorage.getItem('nucleus-workbench-keys'), null);
  assert.equal(changed, 3);
  // The code editor's keymap: CodeMirror's notation, two steps with a space.
  const map = keys.codeKeyMap({ find: () => {} });
  assert.equal(typeof map['Ctrl-F'], 'function');
  assert.equal(map['Ctrl-K Ctrl-0'], 'foldAll');
  // Every action has a unique id, and no two changeable actions share a default binding where they'd clash.
  const ids = keys.ACTIONS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const a of keys.ACTIONS) if (a.where !== 'fixed') assert.deepEqual(keys.conflicts(a.id, keys.binding(a.id)).map((x) => x.id), [], a.id);
});

test("the saved file's name: the folder a Hub install makes (Game.GameName), else the document's name", () => {
  assert.equal(save.saveFileName('Game.GameName = "Half-Life: Source";\n', 'x.js'), 'Half-Life Source');
  assert.equal(save.saveFileName('game.gamename = "lower case";', 'x.js'), 'lower case', 'Nucleus matches the line case-insensitively');
  assert.equal(save.saveFileName('Game.GameName = "A \\"quoted\\" name";', 'x.js'), 'A quoted name', 'between the first and the last quote');
  assert.equal(save.saveFileName('Game.GameName = "Back\\\\slash";', 'x.js'), 'Backslash', 'a backslash cannot be in a file name');
  assert.equal(save.saveFileName('var a = 1;', 'My handler.js'), 'My handler');
  assert.equal(save.saveFileName('', ''), 'handler');
  assert.equal(save.saveFileName('  Game.GameName = "Indented";', 'doc.js'), 'doc', 'Nucleus does not see an indented line');
});

// Learn (playground/src/learn/lessons.ts): each code lesson starts unfinished and its solution passes; solutions
// are what people copy (no errors); the finished handler has no warnings either; what the notes claim Check says,
// it says.
test('learn: every lesson starts unfinished, its solution passes, with no errors', async () => {
  const { CHAPTERS, FINAL, solutionErrors, findLesson, hintFor } = await load('playground/src/learn/lessons.ts');
  const { lint } = await load(path.join(coreDir, 'src', 'core', 'lint.ts'));
  const first = CHAPTERS.find((c) => c.id === 'first-handler');
  assert.ok(first && first.lessons.length >= 10, 'the first chapter');
  for (const ch of CHAPTERS) {
    const ids = new Set();
    for (const l of ch.lessons) {
      assert.ok(/^[a-z0-9-]+$/.test(l.id) && !ids.has(l.id), `${ch.id}/${l.id}: a unique, readable id`);
      ids.add(l.id);
      assert.ok(l.title && l.text.length, l.id);
      assert.ok((l.notes ?? []).length <= 3, `${l.id}: at most 3 notes`);
      assert.deepEqual(solutionErrors(l), [], `${l.id}: errors in the solution`);
      assert.ok(Number.isInteger(l.minutes) && l.minutes >= 1 && l.minutes <= 30, `${ch.id}/${l.id}: minutes for the overview`);
      for (const st of l.steps ?? []) assert.ok(typeof st === 'string' || (st.text && (st.trouble ?? []).length <= 4), `${l.id}: a step with its text and at most 4 fixes`);
      if (l.kind !== 'code') continue;
      assert.ok(l.task && l.check && l.pane, `${l.id}: a task, a check and a pane`);
      assert.notEqual(l.check(l.start), null, `${l.id}: the starting code is already done`);
      assert.equal(l.check(l.solution), null, `${l.id}: the solution doesn't pass: ${l.check(l.solution)}`);
      // The Hint button: something to say at the start of every code lesson, and nothing once it's done.
      assert.ok(hintFor(l, l.start).length > 20, `${ch.id}/${l.id}: a hint at the start`);
      assert.equal(hintFor(l, l.solution), '', `${ch.id}/${l.id}: no hint once done`);
      // The task line counts goals: not all met at the start, all met in the solution.
      assert.ok(l.goals?.length, `${ch.id}/${l.id}: goals for the task line`);
      assert.ok(l.goals.some((g) => !g.ok(l.start)), `${ch.id}/${l.id}: every goal already met at the start`);
      assert.deepEqual(l.goals.filter((g) => !g.ok(l.solution)).map((g) => g.label), [], `${ch.id}/${l.id}: goals the solution misses`);
    }
    assert.equal(findLesson(`#${ch.id}/${ch.lessons[2].id}`).index, 2);
    assert.ok(ch.fileName && ch.build && ch.end?.title, `${ch.id}: file name, what you'll build, the end card`);
    assert.equal(ch.lessons.filter((l) => l.overview).length, 1, `${ch.id}: one overview lesson`);
    // Every lesson has a section, and a section's lessons sit together (the lesson list groups them).
    const order = ch.lessons.map((l) => l.section).filter((s, i, a) => s !== a[i - 1]);
    assert.equal(new Set(order).size, order.length, `${ch.id}: sections out of order: ${order.join(', ')}`);
  }
  assert.equal(findLesson('#launch-options/window-size').chapter.id, 'launch-options', 'a link into chapter 2');
  assert.equal(findLesson('#nonsense').index, 0, 'an unknown link opens the start');
  const d = lint(FINAL).filter((x) => x.severity === 'error' || x.severity === 'warning');
  assert.deepEqual(d.map((x) => `${x.rule}: ${x.message}`), [], 'the finished handler: no errors or warnings');
  // Lesson notes say Check flags these.
  assert.ok(lint('Game.GUID = "a";\nGame.GameName = "a";\nGame.ExecutableName = "a.exe";\nGame.ExecutableContext = "srb2.pk3";\n').some((x) => x.severity !== 'hint'), 'ExecutableContext as plain text');
  assert.ok(lint('Game.GUID = "a";\nGame.GameName = "a";\nGame.ExecutableName = "a.exe";\nGame.MaxPlayers = "4";\n').some((x) => x.severity === 'warning' || x.severity === 'error'), 'MaxPlayers in quotes');
  // The tutorial test lesson hands over the handler without the pause settings (the bug the next lesson fixes).
  // The first full test runs without Game.Play (full-screen windows: the bug the next lesson fixes).
  const test1 = first.lessons.find((l) => l.id === 'test'), fix = first.lessons.find((l) => l.id === 'fullscreen');
  assert.ok(!/Game\.Play/.test(test1.solution) && fix.check(test1.solution) !== null && /Game\.Play/.test(FINAL));
  // Chapter 2 (Codename CURE): the finished handler is clean, and the quiz starts with exactly the three mistakes
  // its text names, each found by Check.
  const { CURE_FINAL } = await load('playground/src/learn/lessons.ts');
  const second = CHAPTERS.find((c) => c.id === 'launch-options');
  assert.ok(second && second.lessons.length >= 8, 'the second chapter');
  assert.deepEqual(lint(CURE_FINAL).filter((x) => x.severity === 'error' || x.severity === 'warning').map((x) => `${x.rule}: ${x.message}`), [], 'chapter 2\'s handler: no errors or warnings');
  const quiz = second.lessons.find((l) => l.id === 'fix-it');
  assert.deepEqual(lint(quiz.start).filter((x) => x.severity === 'error' || x.severity === 'warning').map((x) => x.rule).sort(), ['hub-install-parse', 'option-compare', 'unknown-member']);
  assert.equal(quiz.goals.filter((g) => g.ok(quiz.start)).length, 0, 'no mistake fixed at the start');
  // Applying Check's own first fix for each mistake finishes the quiz.
  const applyEditsToText = (text, edits) => [...edits].sort((a, z) => z.start - a.start).reduce((out, e) => out.slice(0, e.start) + e.text + out.slice(e.end), text);
  let fixed = quiz.start;
  for (let i = 0; i < 3; i++) { const d = lint(fixed).find((x) => x.fixes?.length && (x.severity === 'error' || x.severity === 'warning')); if (d) fixed = applyEditsToText(fixed, d.fixes[0].edits); }
  assert.equal(quiz.check(fixed), null, `Check's fixes finish the quiz: ${quiz.check(fixed)}`);
});

test('Share: the link leads while it carries everything and fits Discord, else the file', async () => {
  const { shareAdvice, shareFileMessage, DISCORD_LIMIT } = await load('playground/src/share.ts');
  const lead = (o) => (shareAdvice(o).fileFirst ? 'file' : 'link');
  assert.equal(lead({ selection: false, files: 0, linkLength: 800 }), 'link');
  assert.equal(lead({ selection: false, files: 0, linkLength: null }), 'link', 'before the length is known');
  assert.equal(lead({ selection: false, files: 0, linkLength: DISCORD_LIMIT }), 'link', 'exactly the limit still fits');
  assert.equal(lead({ selection: false, files: 0, linkLength: DISCORD_LIMIT + 1 }), 'file');
  assert.equal(lead({ selection: false, files: 3, linkLength: 800 }), 'file', "a link doesn't carry the package's files");
  assert.equal(lead({ selection: true, files: 3, linkLength: 9000 }), 'link', 'selected lines are shared by link');
  assert.equal(lead({ selection: false, files: 34, linkLength: 60, named: true }), 'link', 'an unchanged Hub handler is linked by name, files and all');
  assert.equal(shareAdvice({ selection: false, files: 34, linkLength: 60, named: true }).linkSub, 'A short link: opens it for anyone, with its 34 files');
  assert.match(shareAdvice({ selection: false, files: 0, linkLength: 5123 }).linkSub, /^5,123 characters: too long for a Discord message \(2,000\)$/);
  assert.equal(shareAdvice({ selection: false, files: 1, linkLength: 100 }).linkSub, "The code only: the 1 other file doesn't fit in a link");
  assert.match(shareAdvice({ selection: false, files: 2, linkLength: 100 }).fileSub, /its 2 files/);
  const msg = shareFileMessage({ game: 'Borderlands 2', filename: 'Borderlands 2.zip', site: 'https://example.test/' });
  assert.match(msg, /^Nucleus Co-op handler for Borderlands 2: Borderlands 2\.zip \(attached\)\n/);
  assert.match(msg, /drop the file on https:\/\/example\.test\//);
  assert.ok(msg.length < 400 && !/```|@/.test(msg), 'short, no mentions or code fences');
  assert.match(shareFileMessage({ game: '', filename: 'x.zip', site: 's' }), /^Nucleus Co-op handler: x\.zip/);
});

test('share: the file option says which Hub files the .zip leaves out', async () => {
  const { shareAdvice } = await load('playground/src/share.ts');
  const all = shareAdvice({ selection: false, files: 2, linkLength: 100, missing: 2 });
  assert.equal(all.fileSub, 'The .zip with the code, and a message to post with it');
  assert.equal(all.fileWarn, "2 big files are only on the Hub, so they aren't included.");
  const some = shareAdvice({ selection: false, files: 3, linkLength: 100, missing: 1 });
  assert.equal(some.fileSub, 'The .zip with the code and 2 of its 3 files, and a message to post with it');
  assert.equal(some.fileWarn, "1 big file is only on the Hub, so it isn't included.");
  assert.equal(shareAdvice({ selection: false, files: 3, linkLength: 100 }).fileWarn, '');
});

test('share: only a catalogue link is a name link; a #share- link carries the code and its length counts', async () => {
  const { isNamedLink, shareAdvice } = await load('playground/src/share.ts');
  assert.equal(isNamedLink('hub-123'), true);
  assert.equal(isNamedLink('package-x'), true);
  assert.equal(isNamedLink('share-abc'), false);
  assert.equal(isNamedLink(undefined), false);
  // An unchanged, opened share link that's too long still leads with the file.
  assert.equal(shareAdvice({ selection: false, files: 0, linkLength: 5000, named: isNamedLink('share-abc') }).fileFirst, true);
});

test('Learn drafts: one entry per lesson, so two tabs keep each other\'s lessons; a changed start drops the draft', async () => {
  const { createDrafts, CODE_KEY } = await load('playground/src/learn/drafts.ts');
  const store = memoryStorage();
  const a = createDrafts(() => store);
  const b = createDrafts(() => store);
  a.set('c/1', 'start1', 'mine1');
  b.set('c/2', 'start2', 'mine2');
  b.save();
  a.save(); // a's save doesn't drop b's lesson
  assert.equal(createDrafts(() => store).get('c/1', 'start1'), 'mine1');
  assert.equal(createDrafts(() => store).get('c/2', 'start2'), 'mine2');
  // b reads storage fresh: a's lesson shows up there.
  assert.equal(b.get('c/1', 'start1'), 'mine1');
  // Back to the start: forgotten.
  a.set('c/1', 'start1', 'start1');
  assert.equal(a.get('c/1', 'start1'), undefined, 'unsaved removal already counts');
  a.save();
  assert.equal(store.getItem(`${CODE_KEY}/c/1`), null);
  // The lesson's start changed: the draft is dropped.
  assert.equal(b.get('c/2', 'new start'), undefined);
  assert.equal(store.getItem(`${CODE_KEY}/c/2`), null);
  assert.equal(a.pending(), false);
  // Storage full or blocked: the draft stays in memory for this session, and is written by a later save.
  let full = true;
  const flaky = { getItem: (k) => store.getItem(k), setItem: (k, v) => { if (full) throw new Error('QuotaExceededError'); store.setItem(k, v); }, removeItem: (k) => store.removeItem(k) };
  const e = createDrafts(() => flaky);
  e.set('c/5', 's', 'typed');
  e.save();
  assert.equal(e.pending(), true);
  assert.equal(e.get('c/5', 's'), 'typed');
  full = false;
  e.save();
  assert.equal(e.pending(), false);
  assert.equal(createDrafts(() => store).get('c/5', 's'), 'typed');
  const none = createDrafts(() => undefined);
  none.set('c/6', 's', 'typed');
  none.save();
  assert.equal(none.get('c/6', 's'), 'typed', 'no storage at all: still there this session');
  // Nothing changed (start == start, nothing stored): nothing to write.
  a.set('c/3', 's', 's');
  assert.equal(a.pending(), false);
  // Opening a lesson restores its draft: that writes nothing, so a newer save from another tab isn't overwritten.
  const c = createDrafts(() => store);
  const d = createDrafts(() => store);
  c.set('c/4', 's', 'old'); c.save();
  const restored = d.get('c/4', 's');
  d.set('c/4', 's', restored); // the editor's change after setValue, if it gets through
  assert.equal(d.pending(), false);
  c.set('c/4', 's', 'newer'); c.save();
  d.save();
  assert.equal(createDrafts(() => store).get('c/4', 's'), 'newer');
});

test('code spans: inline code with backticks in it (a longer fence, as Explain writes a template string)', async () => {
  const { codeSpans } = await load('playground/src/codespans.ts');
  assert.equal(codeSpans('Sets `a` to `1`.'), 'Sets <code>a</code> to <code>1</code>.');
  assert.equal(codeSpans('stores `` `-w ${x}` `` in it'), 'stores <code>`-w ${x}`</code> in it');
  assert.equal(codeSpans('``` a ``b`` ```'), '<code>a ``b``</code>');
  assert.equal(codeSpans('a ` b'), 'a ` b', 'a lone backtick stays');
  // A fence starts where a run of backticks starts, not inside one.
  assert.equal(codeSpans('``a` b'), '``a` b');
  const { withCodeSpans } = await load('playground/src/codespans.ts');
  const bold = (t) => t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a>$2</a>');
  assert.equal(withCodeSpans('**a** `**b**` and `see https://x.y` https://z', bold), '<strong>a</strong> <code>**b**</code> and <code>see https://x.y</code> <a>https://z</a>');
  assert.equal(withCodeSpans('no code', bold), 'no code');
});

test('snippets: a bare stop repeats its default text', async () => {
  const { expandSnippet } = await load('playground/src/snippet.ts');
  assert.equal(expandSnippet('${1:player} = $1').text, 'player = player');
  assert.equal(expandSnippet('$1 = ${1:p\\}x}').text, 'p}x = p}x');
  assert.equal(expandSnippet('f(${1|a,b|}, $1)$0').text, 'f(a, a)');
  assert.equal(expandSnippet('x$1y').text, 'xy');
  // An escaped placeholder is text, not a default.
  assert.equal(expandSnippet('\\${1:player} = $1').text, '${1:player} = ');
});

test('key bindings: Reset takes the default back from whoever has it', () => {
  const a = keys.ACTIONS.find((x) => x.where !== 'fixed' && keys.binding(x.id) && keys.steps(keys.binding(x.id)).length === 1);
  const b = keys.ACTIONS.find((x) => x.where !== 'fixed' && x.id !== a.id);
  const def = keys.binding(a.id);
  keys.setBinding(a.id, '');
  keys.setBinding(b.id, def);
  assert.deepEqual(keys.resetBinding(a.id).map((x) => x.id), [b.id]);
  assert.equal(keys.binding(a.id), def);
  assert.equal(keys.binding(b.id), '');
  keys.resetAll();
  // A chord's first step clashes too: Find on Ctrl+K loses it when Fold all (Ctrl+K Ctrl+0) is reset.
  keys.setBinding('foldAll', '');
  keys.setBinding('find', 'Ctrl+K');
  assert.deepEqual(keys.resetBinding('foldAll').map((x) => x.id), ['find']);
  assert.equal(keys.binding('find'), '');
  keys.resetAll();
});

test('find: the current match skips one ending at the cursor', async () => {
  const { currentMatch } = await load('playground/src/findwidget.ts');
  const aa = [[0, 1], [1, 2]];
  assert.equal(currentMatch(aa, 0), 0);
  assert.equal(currentMatch(aa, 1), 1, 'the cursor after the first a');
  assert.equal(currentMatch(aa, 2), 0, 'wraps');
  assert.equal(currentMatch([], 0), -1);
});

test('key bindings: a chord and its first step clash', () => {
  const chord = keys.ACTIONS.find((a) => keys.steps(keys.binding(a.id)).length > 1);
  assert.ok(chord, 'a default binding with two steps');
  const first = keys.steps(keys.binding(chord.id))[0];
  const other = keys.ACTIONS.find((a) => a.id !== chord.id && a.where !== 'fixed');
  assert.ok(keys.conflicts(other.id, first).some((a) => a.id === chord.id), `${first} clashes with ${chord.id}`);
});

test('AI fix diff: a huge rewrite is shown without the n×m table', async () => {
  const { diffLines, MAX_DIFF_CELLS } = await load('playground/src/aifix.ts');
  const n = Math.ceil(Math.sqrt(MAX_DIFF_CELLS)) + 10;
  const a = Array.from({ length: n }, (_, i) => `a${i}`).join('\n');
  const b = Array.from({ length: n }, (_, i) => `b${i}`).join('\n');
  const t0 = Date.now();
  const d = diffLines(a, b);
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(d.filter((l) => l.kind === '-').length, n);
  assert.equal(d.filter((l) => l.kind === '+').length, n);
  // A big deletion (one side empty) needs no table either.
  const big = Array.from({ length: 5000 }, (_, i) => `l${i}`).join('\n');
  assert.equal(diffLines(big + '\nend', 'end').filter((l) => l.kind === '-').length, 5000);
  // Long and thin (many rows, few columns) stays within the cell limit and is still a real diff.
  const tall = Array.from({ length: 200000 }, (_, i) => `t${i}`);
  const t1 = Date.now();
  const thin = diffLines(tall.join('\n'), [tall[0], 'new', tall[100]].join('\n'));
  assert.ok(Date.now() - t1 < 3000);
  assert.equal(thin.filter((l) => l.kind === '+').length, 1);
  assert.equal(thin.filter((l) => l.kind === ' ').length, 2);
  assert.deepEqual(diffLines('x\ny\nz', 'x\nY\nz').map((l) => l.kind).sort(), [' ', ' ', '+', '-']);
});

test('Nucleus colouring: each kind of name gets its class, from the core\'s JavaScript categories', async () => {
  const sem = await load('playground/src/semhl.ts');
  const src = 'Game.Hook.ForceFocus = true;\nGame.Play = function () {\n  var d = Context.GetFolder(Nucleus.Folder.InstancedGameFolder);\n};\n';
  const got = Object.fromEntries(sem.semanticSpans(src).map((s) => [src.slice(s.start, s.end), s.cls]));
  assert.equal(got.Game, 'cm-nucleus-obj');
  assert.equal(got.Hook, 'cm-nucleus-group');
  assert.equal(got.ForceFocus, 'cm-nucleus-prop');
  assert.equal(got.Play, 'cm-nucleus-cb');
  assert.equal(got.GetFolder, 'cm-nucleus-fn');
  assert.equal(got.Folder, 'cm-nucleus-group');
  assert.equal(got.InstancedGameFolder, 'cm-nucleus-val');
  assert.equal(got.d, undefined, 'your own names stay plain');
});

test('Nucleus colouring: every look gives its colours enough contrast, a theme file without them still works', () => {
  for (const t of ['obj', 'group', 'choice']) assert.ok(kit.PAIRS.some(([a]) => a === t), `${t} is contrast-checked`);
  const looks = { a: { name: 'A', light: { num: '#123456' }, dark: { num: '#abcdef' } }, b: { name: 'B', light: { num: '#123456', obj: '#222222' }, dark: {} } };
  const a = kit.resolve('a', looks, 'light');
  assert.deepEqual([a.obj, a.group, a.choice], ['#123456', '#123456', '#123456'], 'without them: the number colour, as before');
  assert.equal(kit.resolve('b', looks, 'light').group, '#222222', 'a group follows Game\'s colour');
  const inherit = { base: looks.a, own: { name: 'Own', base: 'base', light: { obj: '#333333' }, dark: {} } };
  assert.equal(kit.resolve('own', inherit, 'light').group, '#333333', 'a theme that sets only Game\'s colour moves the groups with it');
});

test('Form labels: plain names for real options, the API name kept, units only where the docs say', async () => {
  const fl = await load('playground/src/formlabels.ts');
  const { api } = await load(path.join(coreDir, 'src/core/api.ts'));
  const owners = { Game: 'Game', 'Game.Hook': 'GameHook', 'Game.ProtoInput': 'GameProtoInput' };
  const memberOf = (p) => {
    const i = p.lastIndexOf('.');
    return api.objects[owners[p.slice(0, i)]]?.members[p.slice(i + 1)];
  };
  for (const p of Object.keys(fl.LABELS)) assert.ok(memberOf(p), `${p} is a real option`);
  // Every option most Hub handlers set has a hand-written label (the ones Form shows most).
  const usage = JSON.parse(fs.readFileSync(path.join(root, 'playground/src/usage.json'), 'utf8'));
  const top = Object.entries(usage.counts)
    .filter(([p]) => /^Game\.((Hook|ProtoInput)\.)?\w+$/.test(p) && memberOf(p) && !['object', 'method'].includes(memberOf(p).kind) && !memberOf(p).internal)
    .sort((a, b) => b[1] - a[1]).slice(0, 100).map(([p]) => p);
  const missing = top.filter((p) => !fl.LABELS[p]);
  assert.ok(missing.length <= 5, `labels for the 100 most used options (missing: ${missing.join(', ')})`);
  // Units: stated by the docs (or the source, for PauseBetweenStarts); none guessed.
  const unit = (p) => fl.optionLabel(p, memberOf(p)).unit;
  assert.equal(unit('Game.HandlerInterval'), 'ms');
  assert.equal(unit('Game.FakeFocusInterval'), 'ms');
  assert.equal(unit('Game.ProtoInput.FocusLoopIntervalMilliseconds'), 'ms');
  assert.equal(unit('Game.PauseBetweenStarts'), 's');
  assert.equal(unit('Game.PauseBetweenProcessGrab'), 's');
  assert.equal(unit('Game.KillMutexDelay'), 's');
  for (const p of ['Game.MaxPlayers', 'Game.LockInputToggleKey', 'Game.Hook.WindowX', 'Game.PlayersPerInstance', 'Game.SteamID', 'Game.GameName']) assert.equal(unit(p), undefined, `${p} has no unit`);
  // Unknown ones read as words; the label is never the bare API name for a hand-written one.
  assert.equal(fl.readableName('KillMutexDelayLauncher'), 'Kill mutex delay launcher');
  assert.equal(fl.readableName('FocusLoop_WM_SETFOCUS'), 'Focus loop WM_SETFOCUS');
  assert.equal(fl.readableName('UseDInputBlocker'), 'Use DirectInput blocker');
  assert.equal(fl.readableName('XInputPlusDll'), 'XInput plus DLL');
  assert.equal(fl.readableName('CreateSteamAppIdByExe'), 'Create Steam app ID by .exe');
  assert.deepEqual(fl.optionLabel('Game.HandlerInterval', memberOf('Game.HandlerInterval')), { label: 'Handler update interval', written: true, unit: 'ms' });
  assert.equal(fl.optionLabel('Game.KillMutexDelayLauncher', memberOf('Game.KillMutexDelayLauncher')).written, false);
});

test('Blocks: repeated steps group (the same call, values on one object, a short sequence again), others stay rows', async () => {
  const bg = await load('playground/src/blockgroups.ts');
  const call = (p) => ({ kind: 'call', path: p });
  const set = (p) => ({ kind: 'set', path: p });
  const v = (n) => ({ kind: 'var', varName: n });
  assert.equal(bg.stepShape(call('Context.ModifySaveFile')), 'call Context.ModifySaveFile');
  assert.equal(bg.stepShape(set('Game.HookGetKeyState')), bg.stepShape(set('Game.SendScrollWheel')), 'values set on Game group together');
  assert.notEqual(bg.stepShape(set('Game.ProtoInput.XinputHook')), bg.stepShape(set('Game.HookFocus')));
  assert.equal(bg.stepShape({ kind: 'if' }), undefined);
  assert.equal(bg.stepShape({ kind: 'code' }), undefined);
  const runs = (steps) => bg.findRuns(steps.map(bg.stepShape));
  const msf = call('Context.ModifySaveFile');
  // Three or more of one call: a group; two: not.
  assert.deepEqual(runs([v('a'), msf, msf, msf, msf, { kind: 'if' }]), [{ start: 1, period: 1, reps: 4 }]);
  assert.deepEqual(runs([msf, msf, { kind: 'code' }]), []);
  // The copy-a-file sequence, three lines again and again.
  const copy = [v('savePath'), v('savePkgOrigin'), call('System.IO.File.Copy')];
  assert.deepEqual(runs([call('Context.CopyScriptFolder'), ...copy, ...copy, ...copy, v('x')]), [{ start: 1, period: 3, reps: 3 }]);
  // A condition or code between breaks a run; runs never overlap.
  assert.deepEqual(runs([msf, msf, { kind: 'if' }, msf, msf, msf, set('Game.A'), set('Game.B'), set('Game.C')]), [{ start: 3, period: 1, reps: 3 }, { start: 6, period: 1, reps: 3 }]);
  assert.deepEqual(runs([]), []);
  // TEMPORARY rules being compared (blockgroups.ts GroupRule): only the same call; values on one object from five on.
  const sets = (k) => Array.from({ length: k }, (_, j) => set(`Game.O${j}`));
  assert.deepEqual(bg.findRuns([...sets(4), ...copy, ...copy, msf, msf, msf].map(bg.stepShape), 'identical'), [{ start: 10, period: 1, reps: 3 }]);
  assert.deepEqual(bg.findRuns(sets(4).map(bg.stepShape), 'objects5'), []);
  assert.deepEqual(bg.findRuns([...sets(5), msf, msf, msf].map(bg.stepShape), 'objects5'), [{ start: 0, period: 1, reps: 5 }, { start: 5, period: 1, reps: 3 }]);
});

test('docs: "Insert into handler" puts an example where it belongs (lines.ts placeExample)', async () => {
  const L = await load('playground/src/lines.ts');
  const h = 'Game.GUID = "x";\nGame.ProtoInput.InjectStartup = false;\nGame.KillMutex = [];\n\nGame.Play = function () {\n  Context.StartArguments = "-w";\n};\n';
  // An option: after the last one of the same object, before the callbacks.
  let r = L.placeExample(h, 'Game.ProtoInput.BlockedMessages', 'Game.ProtoInput.BlockedMessages = [0x0008];');
  assert.equal(r.action, 'insert');
  assert.equal(r.text.split('\n')[2], 'Game.ProtoInput.BlockedMessages = [0x0008];');
  // Set already: its value changes, nothing is added twice; the same value changes nothing.
  r = L.placeExample(h, 'Game.KillMutex', 'Game.KillMutex = ["a"];');
  assert.deepEqual([r.action, r.text.match(/KillMutex/g).length, r.line], ['update', 1, 2]);
  assert.match(r.text, /Game\.KillMutex = \["a"\];/);
  assert.equal(L.placeExample(h, 'Game.KillMutex', 'Game.KillMutex = [ ];').action, 'same');
  // A call: at the end of Game.Play, indented like the code there; `player.` is `Player.` there.
  r = L.placeExample(h, 'Context.Wait', 'Context.Wait(1500);', 'Game.Play');
  assert.match(r.text, /  Context\.StartArguments = "-w";\n  Context\.Wait\(1500\);\n\};/);
  // Proto Input callbacks are called once, with no arguments: the call goes in a loop over PlayerList (the one there, or a new one).
  r = L.placeExample(h, 'ProtoInput.InstallHook', 'ProtoInput.InstallHook(player.ProtoInputInstanceHandle, 1);', 'Game.ProtoInput.OnInputLocked');
  assert.equal(r.action, 'callback');
  assert.match(r.text, /Game\.ProtoInput\.OnInputLocked = function \(\) \{\n  for \(var i = 0; i < PlayerList\.Count; i\+\+\) \{\n    var player = PlayerList\[i\];\n    ProtoInput\.InstallHook\(player\.ProtoInputInstanceHandle, 1\);\n  \}\n\};\n$/);
  const looped = 'Game.ProtoInput.OnInputLocked = function() {\n    for (var i = 0; i < PlayerList.Count; i++) {\n        var p = PlayerList[i];\n        ProtoInput.X(p.ProtoInputInstanceHandle);\n    }\n};\n';
  r = L.placeExample(looped, 'ProtoInput.InstallHook', 'ProtoInput.InstallHook(player.ProtoInputInstanceHandle, 1);', 'Game.ProtoInput.OnInputLocked');
  assert.match(r.text, /        ProtoInput\.X\(p\.ProtoInputInstanceHandle\);\n        ProtoInput\.InstallHook\(p\.ProtoInputInstanceHandle, 1\);\n    \}/);
  // A handler that doesn't parse: no guessing.
  assert.equal(L.placeExample('Game.Play = function( {', 'Context.Wait', 'Context.Wait(1);', 'Game.Play'), undefined);
  // Every example in the docs goes somewhere in an empty handler and in a typical one, and the result still parses.
  const { api } = await load(path.join(coreDir, 'src/core/api.ts'));
  const { parseLikeJint } = await load(path.join(coreDir, 'src/core/jsparse.ts'));
  const { prettyCode } = await load(path.join(coreDir, 'src/core/pretty.ts'));
  const LABEL = { Game: 'Game', GameHook: 'Game.Hook', GameProtoInput: 'Game.ProtoInput', Context: 'Context', PlayerInfo: 'Player', ProtoInputRuntime: 'ProtoInput', ProtoInputValues: 'ProtoInput.Values' };
  let n = 0;
  for (const [o, label] of Object.entries(LABEL)) for (const [k, m] of Object.entries(api.objects[o].members)) {
    if (!m.example || !m.exampleBy) continue;
    for (const base of ['', h]) {
      const p = L.placeExample(base, `${label}.${k}`, prettyCode(m.example), m.exampleIn ?? 'top');
      assert.ok(p && p.action !== 'same', `${label}.${k}`);
      assert.doesNotThrow(() => parseLikeJint(p.text, { ecmaVersion: 'latest' }), `${label}.${k}: ${p.text}`);
      n++;
    }
  }
  assert.ok(n > 400, `${n} examples placed`);
});
