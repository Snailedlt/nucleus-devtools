// Unit tests for the workbench's pure modules (playground/src): share links, packages, theme files, looks, key
// bindings and the saved file's name. Run: node tools/workbench-units.test.mjs (or npm test in playground).
// The extension's core is found as in tools/bundle-ts.mjs (the repository root; CORE_DIR overrides it).
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
  // An own two-step binding that starts with a default's key (F6, Next pane) waits for its second key.
  keys.setBinding('settings', 'F6 A');
  assert.equal(keys.appActionFor(ev({ key: 'F6', code: 'F6' })), 'pending');
  assert.equal(keys.appActionFor(ev({ key: 'a', code: 'KeyA' })), 'settings');
  keys.setBinding('settings', null);
  assert.equal(keys.appActionFor(ev({ key: 'F6', code: 'F6' })), 'nextPane');
  keys.resetAll();
  assert.equal(keys.binding('lines'), 'Ctrl+B');
  assert.equal(localStorage.getItem('nucleus-workbench-keys'), null);
  assert.equal(changed, 5);
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
  const { CHAPTERS, FINAL, solutionErrors, findLesson, hintFor, hasHint } = await load('playground/src/learn/lessons.ts');
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
  // Chapter ids are written once, in CHAPTERS (a rename is that line plus `formerIds`): tests read them from there.
  const [, ch2] = CHAPTERS;
  assert.equal(findLesson(`#${ch2.id}/window-size`).chapter, ch2, 'a link into chapter 2');
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
  const second = CHAPTERS[1];
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
  // Hint only where the learner works something out: not where the text shows the lines to copy (W29).
  assert.ok(hasHint(quiz), 'the fix-it keeps its Hint');
  assert.ok(!hasHint(CHAPTERS[0].lessons.find((l) => l.id === 'name')), 'a copy-the-lines lesson has no Hint');
  assert.ok(!hasHint({ ...quiz, hint: false }) && hasHint({ ...CHAPTERS[0].lessons.find((l) => l.id === 'name'), hint: true }), 'hint: false / true override it');
});

test('learn: optional lessons are skippable in one click, and the chapter works without them', async () => {
  const { CHAPTERS, chapterMinutes, skipTo, findLesson, problems, run, isUnverified, tipText } = await load('playground/src/learn/lessons.ts');
  const ch2 = CHAPTERS[1];
  const opt = ch2.lessons.findIndex((l) => l.id === 'keyboard-or-controller');
  assert.ok(ch2.lessons[opt].optional?.skip && ch2.lessons[opt].optional.invite, 'chapter 2\'s controller lesson is optional, with a Skip and an invitation');
  for (const ch of CHAPTERS) {
    ch.lessons.forEach((l, i) => {
      if (!l.optional) return;
      assert.ok(!l.overview && i > 0, `${ch.id}/${l.id}: the overview is never optional`);
      // Skipped: the lesson Skip leads to starts from code that loads and passes Check, without the learner's attempt.
      const next = ch.lessons[skipTo(ch, i)];
      if (!next) return;
      // (A quiz starts with its mistakes on purpose: what it ends with is clean.)
      if (next.start) {
        assert.ok(run(next.start).loaded, `${ch.id}/${next.id}: loads after skipping ${l.id}`);
        assert.deepEqual(problems(next.solution, next).map((d) => d.rule), [], `${ch.id}/${next.id}: ends clean after skipping ${l.id}`);
        if (next.check) assert.equal(next.check(next.solution), null, `${ch.id}/${next.id}: can be finished after skipping ${l.id}`);
      }
      // Done: the optional lesson's solution is clean too (the learner who did it carries no problem forward).
      assert.deepEqual(problems(l.solution, l).map((d) => d.rule), [], `${ch.id}/${l.id}: its solution is clean`);
    });
  }
  // skipTo jumps over a run of optional lessons; past the end it's the chapter's length.
  const fake = { lessons: [{}, { optional: {} }, { optional: {} }, {}] };
  assert.equal(skipTo(fake, 0), 3);
  assert.equal(skipTo(fake, 3), 4);
  assert.equal(skipTo(ch2, opt), opt + 1);
  // Minutes: the optional ones apart from the total.
  const m = chapterMinutes(ch2);
  assert.equal(m.optional, ch2.lessons.filter((l) => l.optional).reduce((n, l) => n + l.minutes, 0));
  assert.equal(m.total + m.optional, ch2.lessons.reduce((n, l) => n + l.minutes, 0));
  assert.ok(m.local > 0 && m.local < m.total);
  // A chapter's former ids still open it (links live for ever).
  assert.ok(ch2.formerIds?.includes('launch-options'));
  assert.equal(findLesson('#launch-options/window-size').chapter, ch2);
  assert.equal(findLesson('#launch-options/window-size').index, ch2.lessons.findIndex((l) => l.id === 'window-size'));
  // Unverified tips: marked in the data, so Learn adds "Different for you? Tell us".
  const tips = CHAPTERS.flatMap((c) => c.lessons.flatMap((l) => (l.steps ?? []).flatMap((st) => (typeof st === 'string' ? [] : st.trouble ?? []))));
  assert.ok(tips.filter(isUnverified).map(tipText).some((t) => /firewall|network/.test(t)) && tips.filter(isUnverified).map(tipText).some((t) => /DirectX/.test(t)), 'the firewall and first-start tips are marked unverified');
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
  // Strings compare exactly; the last assignment is the one that counts; never inside a callback or after `return;`;
  // a callback set by name is the function of that name; only a loop over the whole PlayerList is reused.
  assert.equal(L.placeExample('Game.KillMutex = ["My Mutex"];\n', 'Game.KillMutex', 'Game.KillMutex = ["MyMutex"];').action, 'update');
  assert.equal(L.placeExample('Game.MaxPlayers = 4;\nGame.MaxPlayers = 2;\n', 'Game.MaxPlayers', 'Game.MaxPlayers = 4;').action, 'update');
  assert.match(L.placeExample('Game.GUID = "x"; Game.Play = function () {\n};\n', 'Game.MaxPlayers', 'Game.MaxPlayers = 4;').text, /^Game\.GUID = "x";\nGame\.MaxPlayers = 4; Game\.Play/);
  assert.match(L.placeExample('Game.Play = function () {\n  a();\n  return;\n};\n', 'Context.Wait', 'Context.Wait(1);', 'Game.Play').text, /Context\.Wait\(1\);\n  return;/);
  // A `return` sharing its line with the body, or with other code: the example still goes before it.
  r = L.placeExample('Game.Play = function () { return; };\n', 'Context.Wait', 'Context.Wait(1);', 'Game.Play');
  assert.equal(r.text, 'Game.Play = function () {\n  Context.Wait(1);\n  return;\n};\n');
  assert.equal(r.text.split('\n')[r.line].trim(), 'Context.Wait(1);');
  r = L.placeExample('Game.Play = function () { a(); return; };\n', 'Context.Wait', 'Context.Wait(1);', 'Game.Play');
  assert.equal(r.text, 'Game.Play = function () {\n  a();\n  Context.Wait(1);\n  return;\n};\n');
  assert.equal(r.text.split('\n')[r.line].trim(), 'Context.Wait(1);');
  r = L.placeExample('Game.Play = function () {\n  a(); return;\n};\n', 'Context.Wait', 'Context.Wait(1);', 'Game.Play');
  assert.equal(r.text, 'Game.Play = function () {\n  a();\n  Context.Wait(1);\n  return;\n};\n');
  assert.equal(r.text.split('\n')[r.line].trim(), 'Context.Wait(1);');
  // A new loop over PlayerList never reuses a name the callback uses (`return record(i);` after it, its own `player`).
  r = L.placeExample('Game.ProtoInput.OnInputLocked = function () {\n  var i = 0, player = 1, j = 2;\n  return record(i, player, j);\n};\n', 'X', 'X(player.H);', 'Game.ProtoInput.OnInputLocked');
  assert.match(r.text, /  for \(var k = 0; k < PlayerList\.Count; k\+\+\) \{\n    var pl = PlayerList\[k\];\n    X\(pl\.H\);\n  \}\n  return record\(i, player, j\);/);
  assert.equal(r.text.split('\n')[r.line].trim(), 'X(pl.H);');
  assert.match(L.placeExample('function play() {\n  a();\n}\nGame.Play = play;\n', 'Context.Wait', 'Context.Wait(1);', 'Game.Play').text, /a\(\);\n  Context\.Wait\(1\);\n\}\nGame\.Play = play;\n$/);
  assert.equal(L.placeExample('Game.Play = other.fn;\n', 'Context.Wait', 'Context.Wait(1);', 'Game.Play'), undefined);
  // Rebound (`play = other;`): Nucleus runs another function, so nothing is edited.
  assert.equal(L.placeExample('function play() {\n}\nfunction other() {\n}\nplay = other;\nGame.Play = play;\n', 'Context.Wait', 'Context.Wait(1);', 'Game.Play'), undefined);
  // Only real code counts: a comment that looks like a reassignment doesn't.
  assert.match(L.placeExample('function play() {\n  a();\n}\n// play = other;\nGame.Play = play;\n', 'Context.Wait', 'Context.Wait(1);', 'Game.Play').text, /a\(\);\n  Context\.Wait\(1\);/);
  // `j += 0` doesn't start at 0: not reused.
  r = L.placeExample('var j = 1;\nGame.ProtoInput.OnInputLocked = function () {\n  for (j += 0; j < PlayerList.Count; j++) {\n    var p = PlayerList[j];\n  }\n};\n', 'X', 'X(player.H);', 'Game.ProtoInput.OnInputLocked');
  assert.doesNotMatch(r.text, /var p = PlayerList\[j\];\n\s*X\(p\.H\)/);
  // A one-line example loop: its body only, in one loop (it used to keep the header and lose the brace).
  r = L.placeExample('Game.ProtoInput.OnInputLocked = function () {\n};\n', 'X', 'for (var i = 0; i < PlayerList.Count; i++) { var player = PlayerList[i]; X(player.H); }', 'Game.ProtoInput.OnInputLocked');
  assert.equal(r.text.split('PlayerList.Count').length, 2);
  assert.equal(r.text.split('X(').length, 2);
  assert.doesNotThrow(() => new Function(r.text.replace(/Game\.ProtoInput\.OnInputLocked = /, 'var f = ')));
  // A loop that skips players (`j += 2`) isn't reused: a new loop over every player.
  r = L.placeExample('Game.ProtoInput.OnInputLocked = function () {\n  for (var j = 0; j < PlayerList.Count; j += 2) {\n    var p = PlayerList[j];\n  }\n};\n', 'X', 'X(player.H);', 'Game.ProtoInput.OnInputLocked');
  assert.match(r.text, /i < PlayerList\.Count; i\+\+/);
  r = L.placeExample('Game.ProtoInput.OnInputLocked = function () {\n  for (var j = 0; j < PlayerList.Count; j += 1) {\n    var p = PlayerList[j];\n  }\n};\n', 'X', 'X(player.H);', 'Game.ProtoInput.OnInputLocked');
  assert.match(r.text, /var p = PlayerList\[j\];\n    X\(p\.H\);/);
  // A loop whose player (or index) is set again inside isn't reused: the example would act on another player.
  for (const again of ['p = PlayerList[0];', 'j = 0;', 'var p = PlayerList[0];']) {
    r = L.placeExample(`Game.ProtoInput.OnInputLocked = function () {\n  for (var j = 0; j < PlayerList.Count; j++) {\n    var p = PlayerList[j];\n    ${again}\n  }\n};\n`, 'X', 'X(player.H);', 'Game.ProtoInput.OnInputLocked');
    assert.doesNotMatch(r.text, /X\(p\.H\)/, again);
    assert.match(r.text, /var player = PlayerList\[i\];\n\s*X\(player\.H\);/, again);
  }
  r = L.placeExample('Game.ProtoInput.OnInputLocked = function () {\n  for (var j = 0; j < 1; j++) {\n    var p = PlayerList[j];\n  }\n};\n', 'X', 'X(player.H);', 'Game.ProtoInput.OnInputLocked');
  assert.match(r.text, /i < PlayerList\.Count/);
  assert.equal(r.text.split('\n')[r.line].trim(), 'X(player.H);');
  // An example that loops over PlayerList itself (GetCursorPosHookID's) isn't wrapped in a second loop: one
  // InstallHook per player, in the callback's own loop or a new one.
  const parseLikeJint0 = (t) => jsp0.parseLikeJint(t, { ecmaVersion: 'latest' });
  const jsp0 = await load(path.join(coreDir, 'src/core/jsparse.ts'));
  const hookEx = 'for (var i = 0; i < PlayerList.Count; i++) {\n  var player = PlayerList[i];\n  ProtoInput.InstallHook(\n    player.ProtoInputInstanceHandle,\n    ProtoInput.Values.GetCursorPosHookID\n  );\n}';
  const loops = (t) => (t.match(/PlayerList\.Count/g) ?? []).length;
  const hooks = (t) => (t.match(/InstallHook\(/g) ?? []).length;
  for (const base of ['', 'Game.ProtoInput.OnInputLocked = function () {\n  Context.Wait(1);\n};\n', 'Game.ProtoInput.OnInputLocked = function () {\n  for (var j = 0; j < PlayerList.Count; j++) {\n    var p = PlayerList[j];\n    X(p.H);\n  }\n};\n']) {
    r = L.placeExample(base, 'ProtoInput.Values.GetCursorPosHookID', hookEx, 'Game.ProtoInput.OnInputLocked');
    assert.equal(loops(r.text), 1, r.text);
    assert.equal(hooks(r.text), 1, r.text);
    assert.doesNotThrow(() => parseLikeJint0(r.text), r.text);
    assert.equal(L.placeExample(r.text, 'ProtoInput.Values.GetCursorPosHookID', hookEx, 'Game.ProtoInput.OnInputLocked').action, 'same', r.text);
  }
  // Merged into the callback's own loop, with its player's name.
  assert.match(L.placeExample('Game.ProtoInput.OnInputLocked = function () {\n  for (var j = 0; j < PlayerList.Count; j++) {\n    var p = PlayerList[j];\n  }\n};\n', 'X', hookEx, 'Game.ProtoInput.OnInputLocked').text, /var p = PlayerList\[j\];\n    ProtoInput\.InstallHook\(\n      p\.ProtoInputInstanceHandle/);
  // A loop that uses its index for more than the player goes in as it is (no second loop round it).
  r = L.placeExample('', 'X', 'for (var i = 0; i < PlayerList.Count; i++) {\n  X(i, PlayerList[i].H);\n}', 'Game.ProtoInput.OnInputLocked');
  assert.equal(loops(r.text), 1, r.text);
  // A new loop's names: escaped identifiers count as their names (`\\u0069` is `i`), and when every name is taken the
  // next free numbered one.
  r = L.placeExample('Game.ProtoInput.OnInputLocked = function () {\n  var \\u0069 = 0;\n};\n', 'X', 'X(player.H);', 'Game.ProtoInput.OnInputLocked');
  assert.match(r.text, /for \(var j = 0;/);
  const taken = ['i', 'j', 'k', 'n', 'idx', 'index', 'i2', 'j2', 'k2', 'n2', 'idx2', 'index2', 'i3'].map((x) => `var ${x};`).join(' ');
  r = L.placeExample(`Game.ProtoInput.OnInputLocked = function () {\n  ${taken}\n};\n`, 'X', 'X(player.H);', 'Game.ProtoInput.OnInputLocked');
  assert.match(r.text, /for \(var i4 = 0;/);
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
      // Once in, the handler has it: Docs offers "Show in handler", not a second copy (several statements too).
      assert.equal(L.placeExample(p.text, `${label}.${k}`, prettyCode(m.example), m.exampleIn ?? 'top')?.action, 'same', `${label}.${k} again: ${p.text}`);
      n++;
    }
  }
  assert.ok(n > 400, `${n} examples placed`);
});

test('Check counts the package and game folder problems too (checklist.ts)', async () => {
  const C = await load('playground/src/checklist.ts');
  const code = [{ severity: 'warning' }, { severity: 'hint' }];
  const game = Array.from({ length: 5 }, () => ({ severity: 'info' }));
  const pkg = [{ severity: 'error' }];
  // A linked game folder with 5 notes and clean code: not 0.
  assert.deepEqual(C.countProblems([[], game, []]), { error: 0, warning: 0, info: 5, hint: 0, total: 5 });
  assert.deepEqual(C.countProblems([code, game, pkg]), { error: 1, warning: 1, info: 5, hint: 1, total: 7 });
  // The filter chips filter every list alike; Guided and All leave hints out.
  assert.equal(C.shownInCheck('info', true, 'error'), true);
  assert.equal(C.shownInCheck('info', false, 'error'), false);
  assert.equal(C.shownInCheck('info', false, 'info'), true);
  assert.equal(C.shownInCheck('hint', false, 'all'), false);
  assert.equal(C.shownInCheck('hint', false, 'hint'), true);
});

test('undo reveal: the region two texts differ in', async () => {
  const U = await load('playground/src/undoreveal.ts');
  assert.equal(U.changedRegion('abc', 'abc'), null);
  assert.deepEqual(U.changedRegion('var a = 1;\nvar b = 2;\n', 'var a = 1;\nvar b = 3;\n'), { start: 19, endBefore: 20, endAfter: 20 });
  assert.deepEqual(U.changedRegion('ab', 'aXb'), { start: 1, endBefore: 1, endAfter: 2 }, 'an insertion');
  assert.deepEqual(U.changedRegion('aXb', 'ab'), { start: 1, endBefore: 2, endAfter: 1 }, 'a deletion');
  assert.deepEqual(U.changedRegion('aa', 'aaa'), { start: 2, endBefore: 2, endAfter: 3 }, 'repeated text: the end never passes the start');
});

test('icons: one set, decorative, sized to the text', async () => {
  const I = await load('playground/src/icons.ts');
  for (const name of Object.keys(I.ICONS)) {
    const svg = I.icon(name);
    assert.match(svg, /aria-hidden="true"/);
    assert.match(svg, /stroke="currentColor"/);
    assert.match(svg, /width="1em"/);
    assert.doesNotMatch(I.ICONS[name], /fill="#|stroke="#|style=/, `${name}: no colours of its own`);
  }
  const src = fs.readFileSync(path.join(root, 'playground/src/app.ts'), 'utf8');
  const menu = src.slice(src.indexOf('const appItems'), src.indexOf("$('#tab-add')"));
  assert.doesNotMatch(menu, /icon: '[^<']/, 'Menu icons come from icons.ts or reporticons.ts, not emoji');
});

test('shortcuts as keys: plain sentences and backticked keys', async () => {
  const K = await load('playground/src/kbd.ts');
  const h = K.keysText('Press Ctrl+Z, then `F8`; `Escape` closes it. `Game.Play` stays code & <safe>.');
  assert.match(h, /<kbd class="keys"><kbd>Ctrl<\/kbd><span class="kplus">\+<\/span><kbd>Z<\/kbd><\/kbd>/);
  assert.match(h, /<kbd class="keys"><kbd>F8<\/kbd><\/kbd>/);
  assert.match(h, /<kbd class="keys"><kbd>Escape<\/kbd><\/kbd>/);
  assert.match(h, /<code>Game\.Play<\/code>/);
  assert.match(h, /&amp; &lt;safe&gt;/);
  const T = await load('playground/src/codetext.ts');
  assert.equal(T.looksLikeCodeText('Ctrl+.'), false, 'a shortcut in backticks is keys, not coloured code');
  assert.equal(T.looksLikeCodeText('Game.Play'), true);
  // File names and command lines aren't handler code, so they stay plain: no member colours on ".toml", no operator on "++".
  for (const plain of ['languages.toml', 'settings.json', 'ncdev.exe', '*.js', '.js', 'SHA256SUMS.txt', 'init.lua', 'ncdev setup notepad++', 'node /path/to/nucleus.js lsp', 'npm run build']) assert.equal(T.looksLikeCodeText(plain), false, plain);
  for (const code of ['Context.GetFolder(Nucleus.Folder.InstancedGameFolder)', 'Game.SymlinkGame = true;', '"-windowed"', 'System.IO.File.Copy', 'x.length']) assert.equal(T.looksLikeCodeText(code), true, code);
});

test('doc votes: live counts keep the snapshot on a counter error, and keep the vote they were read with', async () => {
  const realFetch = globalThis.fetch;
  globalThis.BUILD = { counts: 'example', docVotes: null };
  try {
    let status = 503;
    globalThis.fetch = async () => ({ status, ok: status < 400, json: async () => ({ count: '2' }) });
    const V = await load('playground/src/votecounts.ts');
    assert.equal(await V.liveVotes('Game.X', 'doc', ''), null, 'a 503 is not zero votes: the snapshot stays');
    status = 404; // (the same module: another name, as the first read is kept for the page)
    assert.deepEqual(await V.liveVotes('Game.Y', 'doc', 'up'), { up: 0, down: 0, aiUp: 0, aiDown: 0, base: 'up' }, 'a 404: nobody voted that way yet');
    // Cached for the page: a later card gets the vote the counts were read with, not its own.
    assert.equal((await V.liveVotes('Game.Y', 'doc', '')).base, 'up');
  } finally {
    globalThis.fetch = realFetch;
    delete globalThis.BUILD;
  }
});

test("game folder: Cancel stops only the read the progress shows, not another tab's", async () => {
  const G = await load('playground/src/gamefolder.ts');
  const file = (name) => ({ kind: 'file', name, getFile: async () => ({ size: 10, arrayBuffer: async () => new ArrayBuffer(10) }) });
  const dir = (name, n) => ({ kind: 'directory', name, async *values() { for (let i = 0; i < n; i++) yield file(`f${i}.dll`); } });
  const seen = [];
  G.onFolderProgress((p) => seen.push(p));
  let next;
  globalThis.window.showDirectoryPicker = async () => next;
  try {
    next = dir('A', 5);
    const a = await G.pickGameFolder();
    next = dir('B', 5);
    const b = await G.pickGameFolder();
    const done = (f) => new Promise((r) => { if (G.gameBinariesNow(f, r)) r(); });
    const aDone = done(a);
    await new Promise((r) => setTimeout(r, 0));
    const bDone = done(b);
    await new Promise((r) => setTimeout(r, 0));
    G.cancelFolderRead(); // the progress shows B now
    await Promise.all([aDone, bDone]);
    const last = (name) => seen.filter((p) => p.phase === 'binaries' && p.name === name).map((p) => p.done).pop();
    assert.equal(last('A'), 4, "A's read went on to its last file");
    assert.ok(last('B') < 4, "B's read stopped");
    // While B is shown, A's read goes on quietly: no A progress between B's first update and B's done, so Cancel
    // always stops the read on screen. A shows again once B is gone.
    const bFirst = seen.findIndex((p) => p.phase === 'binaries' && p.name === 'B');
    const bEnd = seen.findIndex((p, i) => i > bFirst && p.phase === 'done');
    assert.ok(bFirst >= 0 && bEnd > bFirst);
    assert.ok(!seen.slice(bFirst, bEnd).some((p) => p.name === 'A'), 'no A progress while B is shown');
  } finally {
    delete globalThis.window.showDirectoryPicker;
  }
});

test('doc votes: an "In practice" report says so in its title (core docReviewUrl/docFeedbackUrl, used by Docs and the docs pages)', async () => {
  const A = await load(path.join(coreDir, 'src/core/api.ts'));
  const t = (u) => new URL(u).searchParams.get('title');
  assert.equal(t(A.docReviewUrl('Game.X', 'practice')), 'Doc review: Game.X (In practice)');
  assert.equal(t(A.docFeedbackUrl('Game.X', 'practice')), 'Doc feedback: Game.X (In practice)');
  assert.equal(t(A.docReviewUrl('Game.X', 'doc')), 'Doc review: Game.X');
  assert.equal(new URL(A.docReviewUrl('Game.X', 'practice')).searchParams.get('member'), 'Game.X');
  // The docs pages pass the part on (docs-pages.mjs), as the workbench's Docs does (doccard.ts).
  const src = fs.readFileSync(path.join(root, 'playground/docs-pages.mjs'), 'utf8') + fs.readFileSync(path.join(root, 'playground/src/doccard.ts'), 'utf8');
  for (const call of ['o.docReviewUrl(page.path, part)', 'feedbackUrl(page.path, part)', 'docReviewUrl(path, part)', 'docFeedbackUrl(path, part)']) assert.ok(src.includes(call), call);
});

// Isolated browser surfaces keep clocks, storage, platform and event listeners local to each test.
async function layoutFixture(file, platform = 'Linux') {
  const { createRequire } = await import('node:module');
  const { runInNewContext } = await import('node:vm');
  const { transformSync } = createRequire(import.meta.url)('esbuild');
  const element = () => {
    const attrs = new Map(), classes = new Set(), styles = new Map(), listeners = new Map();
    return {
      hidden: true, checked: false, dataset: {}, style: {
        setProperty: (k, v) => styles.set(k, v), removeProperty: (k) => styles.delete(k),
        getPropertyValue: (k) => styles.get(k) ?? '',
      },
      classList: {
        add: (...ns) => ns.forEach((n) => classes.add(n)), remove: (...ns) => ns.forEach((n) => classes.delete(n)),
        contains: (n) => classes.has(n),
        toggle(n, force = !classes.has(n)) { force ? classes.add(n) : classes.delete(n); return force; },
      },
      setAttribute: (k, v) => attrs.set(k, String(v)), getAttribute: (k) => attrs.get(k) ?? null,
      hasAttribute: (k) => attrs.has(k), removeAttribute: (k) => attrs.delete(k),
      toggleAttribute(k, on) { on ? attrs.set(k, '') : attrs.delete(k); },
      addEventListener(k, fn) { listeners.set(k, [...(listeners.get(k) ?? []), fn]); },
      emit(k, e = {}) { for (const fn of listeners.get(k) ?? []) fn(e); },
      append() {}, getClientRects: () => [{}],
      getBoundingClientRect: () => ({ left: 100, right: 200, top: 100, bottom: 130, width: 100, height: 30 }),
      clientWidth: 1000, offsetWidth: 100, offsetHeight: 20, offsetParent: {}, isConnected: true,
      closest: () => null, matches: () => true, textContent: '', innerHTML: '',
    };
  };
  const ids = new Map(['main', 'lines', 'files-panel', 'split-main', 'split-lines', 'split-files', 'split-sheet', 'results-show', 'set-results', 'zen-exit'].map((id) => [id, element()]));
  const created = [], timers = new Map(), frames = [];
  const document = Object.assign(element(), {
    documentElement: element(), body: element(), getElementById: (id) => ids.get(id) ?? null,
    querySelector: (sel) => ids.get(sel.slice(1)) ?? null, querySelectorAll: () => [],
    createElement: () => { const el = element(); created.push(el); return el; },
  });
  let now = 10_000, nextTimer = 0;
  const storage = memoryStorage();
  const context = {
    module: { exports: {} }, document, localStorage: storage, navigator: { platform },
    Date: { now: () => now }, innerWidth: 1000, innerHeight: 800,
    setTimeout: (fn) => { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout: (id) => timers.delete(id),
    addEventListener: document.addEventListener.bind(document), requestAnimationFrame: (fn) => frames.push(fn),
    // keybindings.ts reads the shortcut list from keyactions.ts (plain data); CodeMirror is stood in for.
    require: (name) => {
      if (name === './keyactions') {
        const m = { exports: {} };
        runInNewContext(transformSync(fs.readFileSync(path.join(root, 'playground/src/keyactions.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code, { module: m, exports: m.exports });
        return m.exports;
      }
      assert.equal(name, 'codemirror');
      return { normalizeKeyMap: (m) => m };
    },
  };
  context.window = context;
  runInNewContext(transformSync(fs.readFileSync(path.join(root, 'playground/src', file), 'utf8'), { loader: 'ts', format: 'cjs' }).code, context);
  return {
    api: context.module.exports, document, ids, storage, element, created, advance: (ms) => { now += ms; },
    frame: () => { for (const fn of frames.splice(0)) fn(); },
    tick: () => { const pending = [...timers.values()]; timers.clear(); pending.forEach((fn) => fn()); },
  };
}

test('PR77 results: toggles synchronize controls and storage; explicit requests are idempotent', async () => {
  const f = await layoutFixture('panels-ui.ts');
  let refreshes = 0;
  const p = f.api.initPanels({ refresh: () => refreshes++, toast() {} });
  const check = (shown) => {
    assert.equal(p.resultsShown(), shown);
    assert.equal(f.ids.get('main').classList.contains('results-hidden'), !shown);
    assert.equal(f.ids.get('results-show').hidden, shown);
    assert.equal(f.ids.get('set-results').checked, shown);
  };
  check(true);
  p.results(true);
  assert.equal(refreshes, 1);
  assert.equal(f.storage.length, 0);
  assert.equal(p.results(false), false);
  check(false);
  assert.equal(JSON.parse(f.storage.getItem('nucleus-workbench-panels')).resultsHidden, true);
  p.results(false);
  assert.equal(refreshes, 2);
  assert.equal(p.results(), true);
  check(true);
  assert.ok(!('resultsHidden' in JSON.parse(f.storage.getItem('nucleus-workbench-panels'))));
  assert.equal(p.results(), false);
  check(false);
});

test('PR77 results: reload and size resets preserve visibility and panel sides', async () => {
  const f = await layoutFixture('panels-ui.ts');
  f.storage.setItem('nucleus-workbench-panels', JSON.stringify({ main: 0.7, lines: 400, files: 300, sheet: 40, filesSide: 'left', linesSide: 'left', resultsHidden: true }));
  const p = f.api.initPanels({ refresh() {}, toast() {} });
  assert.equal(p.resultsShown(), false);
  assert.equal(f.ids.get('results-show').hidden, false);
  assert.equal(f.ids.get('set-results').checked, false);
  assert.equal(f.ids.get('main').style.getPropertyValue('--split-l'), '0.7fr');
  p.resetOne('main');
  assert.equal(p.resultsShown(), false);
  assert.equal(JSON.parse(f.storage.getItem('nucleus-workbench-panels')).lines, 400);
  p.reset();
  assert.deepEqual(JSON.parse(f.storage.getItem('nucleus-workbench-panels')), { filesSide: 'left', linesSide: 'left', resultsHidden: true });
  assert.equal(f.ids.get('main').style.getPropertyValue('--split-l'), '');
  assert.equal(p.side('files'), 'left');
  assert.equal(p.side('lines'), 'left');
  assert.equal(p.results(true), true);
});

test('PR77 results: malformed, unavailable and legacy storage work without optional controls', async () => {
  for (const mode of ['malformed', 'unavailable', 'legacy']) {
    const f = await layoutFixture('panels-ui.ts');
    f.ids.delete('results-show'); f.ids.delete('set-results');
    if (mode === 'malformed') f.storage.setItem('nucleus-workbench-panels', '{');
    if (mode === 'legacy') f.storage.setItem('nucleus-workbench-panels', '{"main":0.6}');
    if (mode === 'unavailable') {
      f.storage.getItem = () => { throw new Error('denied'); };
      f.storage.setItem = () => { throw new Error('quota'); };
    }
    const p = f.api.initPanels({ refresh() {}, toast() {} });
    assert.equal(p.resultsShown(), true, mode);
    assert.equal(p.results(false), false, mode);
    assert.equal(p.results(), true, mode);
  }
});

async function zenFixture() {
  const f = await layoutFixture('zen.ts');
  const calls = { refresh: 0, focus: 0, announcements: [] };
  let keys = 'Ctrl+K Z';
  const zen = f.api.initZen({ refresh: () => calls.refresh++, focusCode: () => calls.focus++, announce: (s) => calls.announcements.push(s), keys: () => keys });
  return { ...f, zen, calls, setKeys: (s) => { keys = s; }, esc: (repeat = false) => f.document.emit('keydown', { key: 'Escape', repeat }) };
}

test('PR77 zen: transitions refresh and focus after layout, announce current keys and never persist', async () => {
  const f = await zenFixture();
  assert.equal(f.zen.isOn(), false);
  f.zen.set(false);
  assert.equal(f.calls.announcements.length, 0);
  f.zen.toggle();
  assert.equal(f.zen.isOn(), true);
  assert.equal(f.ids.get('zen-exit').hidden, false);
  assert.equal(f.calls.refresh, 0);
  f.frame();
  assert.equal(f.calls.refresh, 1);
  assert.equal(f.calls.focus, 1);
  assert.match(f.calls.announcements[0], /Ctrl\+K Z/);
  f.zen.set(true); f.frame();
  assert.equal(f.calls.refresh, 1);
  f.ids.get('zen-exit').emit('click'); f.frame();
  assert.equal(f.zen.isOn(), false);
  assert.equal(f.ids.get('zen-exit').hidden, true);
  assert.equal(f.calls.refresh, 2);
  assert.equal(f.calls.focus, 1, 'leaving does not steal focus');
  assert.equal(f.calls.announcements.at(-1), 'Left Zen mode.');
  f.setKeys('Alt+Z'); f.zen.toggle();
  assert.match(f.calls.announcements.at(-1), /Alt\+Z/);
  f.zen.set(false); f.setKeys(''); f.zen.toggle();
  assert.equal(f.calls.announcements.at(-1), 'Zen mode: only the code. Escape twice leaves it.');
  assert.equal(f.storage.length, 0);
});

test('PR77 zen: the way out shows on the way in, then steps aside', async () => {
  const f = await zenFixture(), exit = f.ids.get('zen-exit');
  f.zen.set(true);
  assert.equal(exit.classList.contains('hint'), true, 'shown on entering');
  f.tick();
  assert.equal(exit.classList.contains('hint'), false, 'gone after its time');
  f.zen.set(false); f.zen.set(true);
  assert.equal(exit.classList.contains('hint'), true);
  f.zen.set(false);
  assert.equal(exit.classList.contains('hint'), false, 'leaving clears it');
  f.tick();
  assert.equal(exit.classList.contains('hint'), false);
});

test('PR77 zen: double Escape requires an interval below 600ms', async () => {
  const f = await zenFixture();
  f.zen.set(true);
  f.document.emit('keydown', { key: 'Enter' });
  f.esc();
  assert.equal(f.zen.isOn(), true);
  f.advance(600); f.esc();
  assert.equal(f.zen.isOn(), true, '600ms is too late');
  f.advance(599); f.esc();
  assert.equal(f.zen.isOn(), false);
  f.esc();
  assert.equal(f.zen.isOn(), false);
});

test('PR77 zen: every visible overlay and key repeat reset the Escape sequence', async () => {
  const f = await zenFixture();
  for (const overlay of ['.CodeMirror-hints', '.find-widget.open', '.app-menu', 'dialog[open]', '#line-pop:not([hidden])', '.CodeMirror-dialog', '#tip:not([hidden])', '#sig:not([hidden])', 'repeat']) {
    f.zen.set(true); f.advance(1000); f.esc(); f.advance(100);
    f.document.querySelectorAll = overlay === 'repeat' ? () => [] : (selector) => {
      assert.ok(selector.split(', ').includes(overlay));
      return [f.element()];
    };
    f.esc(overlay === 'repeat');
    f.document.querySelectorAll = () => [];
    f.advance(100); f.esc();
    assert.equal(f.zen.isOn(), true, `${overlay}: consumed Escape must not count`);
    f.advance(100); f.esc();
    assert.equal(f.zen.isOn(), false, overlay);
  }
});

test('PR77 zen: hidden overlays allow Escape; exit proximity has a 56px boundary', async () => {
  const f = await zenFixture(), exit = f.ids.get('zen-exit');
  f.zen.set(true);
  f.document.emit('pointermove', { clientY: 55 });
  assert.equal(exit.classList.contains('near'), true);
  f.document.emit('pointermove', { clientY: 56 });
  assert.equal(exit.classList.contains('near'), false);
  const hidden = f.element(); hidden.getClientRects = () => [];
  f.document.querySelectorAll = () => [hidden];
  f.esc(); f.advance(100); f.esc();
  assert.equal(f.zen.isOn(), false);
});

for (const platform of ['Linux', 'MacIntel']) {
  test(`PR77 shortcuts: defaults, chord timeout, rebinding and disabling (${platform})`, async () => {
    const f = await layoutFixture('keybindings.ts', platform), k = f.api;
    const mod = platform === 'MacIntel' ? 'Cmd' : 'Ctrl';
    const event = (key, modified = false) => ({ key, code: `Key${key.toUpperCase()}`, ctrlKey: modified && mod === 'Ctrl', metaKey: modified && mod === 'Cmd', altKey: false, shiftKey: false });
    assert.equal(k.binding('results'), `${mod}+J`);
    assert.equal(k.binding('zen'), `${mod}+K Z`);
    assert.equal(k.appActionFor(event('j', true)), 'results');
    assert.equal(k.appActionFor(event('z')), undefined);
    assert.equal(k.appActionFor(event('k', true)), 'pending');
    assert.equal(k.appActionFor(event('z')), 'zen');
    assert.equal(k.appActionFor(event('k', true)), 'pending');
    f.advance(2000);
    assert.equal(k.appActionFor(event('z')), undefined);
    k.setBinding('results', `${mod}+Alt+R`);
    assert.equal(k.appActionFor(event('j', true)), undefined);
    assert.equal(k.appActionFor({ ...event('r', true), altKey: true }), 'results');
    k.setBinding('zen', '');
    assert.equal(k.appActionFor(event('k', true)), undefined);
    k.resetBinding('zen');
    assert.equal(k.binding('zen'), `${mod}+K Z`);
  });

  test(`PR77 key hints: live bindings, accessible modifiers and escaped imported text (${platform})`, async () => {
    const f = await layoutFixture('keyhints.ts', platform), fixed = f.element(), dynamic = f.element();
    let binding = 'Ctrl  Alt J';
    const hints = f.api.initKeyHints([{ el: null, keys: '' }, { el: fixed, what: 'Fixed', keys: 'Ctrl Alt J' }, { el: dynamic, what: '<Results & docs>', keys: () => binding }]);
    const tip = f.created[0];
    assert.equal(fixed.getAttribute('aria-keyshortcuts'), platform === 'MacIntel' ? 'Meta+Alt+J' : 'Control+Alt+J');
    assert.equal(dynamic.getAttribute('aria-keyshortcuts'), 'Control+Alt+J');
    dynamic.emit('mouseenter'); f.tick();
    assert.equal(tip.hidden, false);
    assert.match(tip.innerHTML, /&lt;Results &amp; docs&gt;/);
    assert.ok(tip.innerHTML.includes(`<kbd>${platform === 'MacIntel' ? '⌃' : 'Ctrl'}</kbd>`));
    binding = 'Cmd <img>&"'; hints.refresh();
    assert.equal(dynamic.getAttribute('aria-keyshortcuts'), 'Meta+<img>&"');
    dynamic.emit('focus'); f.tick();
    assert.match(tip.innerHTML, /<kbd>⌘<\/kbd><kbd>&lt;img&gt;&amp;&quot;<\/kbd>/);
    assert.ok(!tip.innerHTML.includes('<img>'));
    // Two strokes: "then" between them, and no aria-keyshortcuts (it can't say a chord).
    binding = 'Ctrl ; then J'; hints.refresh();
    assert.equal(dynamic.getAttribute('aria-keyshortcuts'), null);
    dynamic.emit('focus'); f.tick();
    assert.match(tip.innerHTML, /<kbd>;<\/kbd><span class="kh-then">then<\/span><kbd>J<\/kbd>/);
    binding = ''; hints.refresh();
    assert.equal(dynamic.getAttribute('aria-keyshortcuts'), null);
    dynamic.emit('mouseenter'); f.tick();
    assert.ok(!tip.innerHTML.includes('kh-keys'));
    f.document.emit('keydown', { key: 'Escape' });
    assert.equal(tip.hidden, true);
  });
}
