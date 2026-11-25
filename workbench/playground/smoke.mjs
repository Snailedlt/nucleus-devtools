// Browser smoke test of the built site (dist/pages), run before every deploy (pages.yml).
// Loads the workbench and the start page in Chromium, light and dark, desktop and phone, and checks
// that the main flows still work: Check, Fix all, editing after a fix, Try it, an example package,
// the theme of the screenshots, keyboard access, and no accessibility violations (axe-core).
//
//   npm run build   (or: node build.mjs --preview)
//   node smoke.mjs  [--headed] [--ai-guide] [--only <part of a section's name>[,…]] [--jobs <n>] [--list]
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, 'dist', 'pages');
const AXE = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('No dist/pages: run the build first.');

// A static server for dist/pages (fetches of hub/<id>.js and the start page need http).
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.txt': 'text/plain', '.json': 'application/json', '.xml': 'application/xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, path.normalize(p).replace(/^([/\\])+/, ''));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' }).end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

let failures = 0;
// The checks are grouped in sections, each with its own pages, so several run at once (--jobs <n>; default: one per
// CPU core, at most 4) and one can be run alone while working on it (--only learn, or any part of a name; --list names
// them). A section's lines are printed together when it ends, with how long it took.
const out = new AsyncLocalStorage();
const say = (line) => (out.getStore() ?? { push: (l) => console.log(l) }).push(line);
const check = (ok, what) => {
  say(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures++;
};
const sections = [];
const section = (name, run) => sections.push({ name, run });
/** An option's value; undefined when the option isn't given. Given without a value (or with the next option as one) is a mistake. */
const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  if (i < 0) return undefined;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--') || !v.trim()) throw new Error(`${flag} needs a value (node smoke.mjs --list names the sections).`);
  return v;
};
// Checked before the browser starts.
const ONLY = arg('--only')?.toLowerCase();
// "learn," would match every section (an empty name is part of every name).
if (ONLY !== undefined && ONLY.split(',').some((o) => !o.trim())) throw new Error(`--only has an empty name in "${ONLY}" (node smoke.mjs --list names the sections).`);
const JOBS = arg('--jobs');
if (JOBS !== undefined && !/^[1-9]\d*$/.test(JOBS)) throw new Error(`--jobs needs a whole number from 1 up, not "${JOBS}".`);
async function runSections() {
  if (process.argv.includes('--list')) return void console.log(sections.map((s) => s.name).join('\n'));
  const only = ONLY;
  const todo = sections.filter((s) => !only || only.split(',').some((o) => s.name.toLowerCase().includes(o.trim())));
  if (!todo.length) throw new Error(`No section matches --only ${only}. They are: ${sections.map((s) => s.name).join(', ')}`);
  const jobs = JOBS ? Number(JOBS) : Math.max(1, Math.min(4, os.availableParallelism?.() ?? os.cpus().length));
  const started = Date.now();
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(jobs, todo.length) }, async () => {
    while (next < todo.length) {
      const s = todo[next++];
      const lines = [];
      const t = Date.now();
      try {
        await out.run(lines, s.run);
      } catch (e) {
        lines.push(`FAIL ${s.name}: stopped by an error: ${String(e?.stack ?? e).split('\n').slice(0, 4).join(' | ')}`);
        failures++;
      }
      console.log(`\n== ${s.name} (${((Date.now() - t) / 1000).toFixed(0)} s)\n${lines.join('\n')}`);
    }
  }));
  console.log(`\n${todo.length} section(s), ${jobs} at a time, ${((Date.now() - started) / 1000).toFixed(0)} s`);
}

const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
async function page(theme, opts = { viewport: { width: 1280, height: 800 } }) {
  const ctx = await browser.newContext({ colorScheme: theme, ...opts });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('nucleus-workbench-welcomed', '1');
    } catch {}
  });
  // Only the page's own origin: the release lookup, fonts and the Hub are not needed here.
  await ctx.route((u) => !u.href.startsWith(BASE), (r) => r.abort());
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  return { ctx, p, errors };
}
const axe = async (p, what) => {
  await p.addScriptTag({ content: AXE });
  const v = await p.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] })).violations.map((x) => `${x.id} (${x.nodes.length}): ${x.nodes[0]?.target.join(' ')}`));
  check(!v.length, `accessibility, ${what}${v.length ? `: ${v.join('; ')}` : ''}`);
};
const count = (p) => p.$eval('#count-problems', (e) => Number(e.textContent));
const cmType = (p, find, text) =>
  p.evaluate(([f, t]) => {
    const cm = document.querySelector('.CodeMirror').CodeMirror;
    for (let i = 0; i < cm.lineCount(); i++) if (cm.getLine(i).includes(f)) return cm.replaceRange(t, { line: i, ch: cm.getLine(i).length }), true;
    return false;
  }, [find, text]);

async function checkAiGuide(s, theme) {
  // Make a handler with AI: three prompts in tabs (Claude Code first, other agents one ArrowRight away, chatbots), each with a Copy button.
  await s.p.goto(BASE + 'ai/');
  await s.p.waitForTimeout(400);
  const vis = () => s.p.evaluate(() => [...document.querySelectorAll('[role=tabpanel]')].filter((p) => !p.hidden).map((p) => p.id).join());
  const first = await vis();
  await s.p.focus('#tab-claude');
  await s.p.keyboard.press('ArrowRight');
  const second = await vis();
  const tabFocus = await s.p.evaluate(() => document.activeElement?.id);
  await s.p.fill('#ai-game-agent', 'Halo 3');
  const ai = await s.p.evaluate(() => ({ synced: [...document.querySelectorAll('.ai-game-input')].every((g) => g.value === 'Halo 3'), filled: [...document.querySelectorAll('pre.prompt.handler')].filter((p) => p.innerText.includes('for Halo 3.')).length === 3, chat: /ES5 JavaScript only/.test(document.querySelector('#panel-chat pre.prompt')?.textContent ?? ''), claude: /claude plugin install nucleus-coop@splitscreenme/.test(document.querySelector('#panel-claude pre.setup')?.textContent ?? ''), agent: /latest\/download\/nucleus\.js[\s\S]*MCP server/.test(document.querySelector('#panel-agent pre.setup')?.textContent ?? ''), copies: document.querySelectorAll('.copy-wrap pre.prompt + .copy-btn').length, focus: document.activeElement?.id }));
  check(first === 'panel-claude' && second === 'panel-agent' && tabFocus === 'tab-agent' && ai.chat && ai.claude && ai.agent && ai.copies === 5 && ai.filled && ai.synced, `${theme}: the AI guide's tabs switch with the arrow keys; setup and handler prompts, each with a Copy button, and the game's name fills all three handler prompts (${first} -> ${second}, ${JSON.stringify(ai)})`);
  await axe(s.p, `${theme}, AI guide`);
  if (theme === 'light') {
    const tabState = () => s.p.evaluate(() => ({
      selected: [...document.querySelectorAll('[role=tab][aria-selected=true]')].map((t) => t.id),
      tabbable: [...document.querySelectorAll('[role=tab]')].filter((t) => t.tabIndex === 0).map((t) => t.id),
      visible: [...document.querySelectorAll('[role=tabpanel]:not([hidden])')].map((p) => p.id),
      focused: document.activeElement?.id,
    }));
    for (const [hash, tab] of [['#agents', 'agent'], ['#chatbots', 'chat'], ['#unknown', 'claude']]) {
      // Reload even when only the fragment differs: these are entry links.
      await s.p.goto(BASE + 'ai/' + hash);
      await s.p.reload();
      const state = await tabState();
      check(state.selected.join() === 'tab-' + tab && state.tabbable.join() === 'tab-' + tab && state.visible.join() === 'panel-' + tab && !state.focused?.startsWith('tab-'), `AI guide: ${hash} opens ${tab} without moving focus (${JSON.stringify(state)})`);
    }
    await s.p.focus('#tab-claude');
    for (const [key, tab] of [['ArrowLeft', 'chat'], ['ArrowRight', 'claude'], ['End', 'chat'], ['Home', 'claude']]) {
      await s.p.keyboard.press(key);
      const state = await tabState();
      check(state.selected.join() === 'tab-' + tab && state.tabbable.join() === 'tab-' + tab && state.visible.join() === 'panel-' + tab && state.focused === 'tab-' + tab, `AI guide: ${key} selects and focuses ${tab} (${JSON.stringify(state)})`);
    }

    await s.ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
    const name = 'Portal <3 & friends';
    await s.p.fill('#ai-game-claude', '  ' + name + '  ');
    await s.p.click('#tab-chat');
    const panel = s.p.locator('#panel-chat');
    const prompt = panel.locator('pre.handler');
    const copy = panel.locator('pre.handler + .copy-btn');
    await copy.click();
    await copy.filter({ hasText: /^Copied$/ }).waitFor();
    const clipboard = await s.p.evaluate(() => navigator.clipboard.readText());
    check(clipboard.includes(`for ${name}.`) && clipboard === (await prompt.innerText()).replace(/\n$/, ''), 'AI guide: Copy writes the full chatbot prompt with the trimmed game name as literal text');
    await s.p.fill('#ai-game-chat', '   ');
    const slots = await s.p.locator('.game-slot').evaluateAll((els) => els.map((el) => [el.textContent, el.classList.contains('filled')]));
    check(slots.length === 3 && slots.every(([text, filled]) => text === '<name>' && !filled), 'AI guide: clearing the name in another tab restores all three placeholders');
  }
}

if (process.argv.includes('--ai-guide')) {
  const s = await page('light');
  try {
    await checkAiGuide(s, 'light');
    check(s.errors.length === 0, `AI guide: no page errors (${s.errors.join('; ')})`);
  } finally {
    await s.ctx.close();
    await browser.close();
    server.close();
  }
  process.exit(failures ? 1 : 0);
}

for (const theme of ['light', 'dark']) section(`workbench, ${theme}`, async () => {
  // Check, Fix all, then editing: the fix box closes and Check counts the new problem.
  const { ctx, p, errors } = await page(theme);
  // This section is the slim bar's: its header buttons, menus and their geometry (the side rail, the default, gets
  // its turn below, and every other section runs in it).
  await ctx.addInitScript(() => { try { if (!localStorage.getItem('nucleus-workbench-layout')) localStorage.setItem('nucleus-workbench-layout', 'bar'); } catch {} });
  await p.goto(BASE + '#example-mistakes');
  await p.waitForSelector('.CodeMirror');
  await p.waitForTimeout(1200);
  check((await p.$$('input[type=password]')).length === 0, `${theme}: no password fields (browsers would offer to save a login)`);
  const before = await count(p);
  check(before > 0 && /can't use this handler/.test(await p.innerText('#panel-problems')), `${theme}: Check lists the example's problems (${before})`);
  await axe(p, `${theme}, Check`);
  await p.click('#fix-all');
  await p.waitForTimeout(500);
  if (await p.$('#ai-accept')) await p.click('#ai-accept');
  await p.waitForTimeout(800);
  const after = await count(p);
  check(after < before && (await p.isVisible('#ai-box')), `${theme}: Fix all fixes problems and shows what it did (${before} → ${after})`);
  await axe(p, `${theme}, after Fix all`);
  await cmType(p, 'Game.MaxPlayers', '\nvar x = sdfsdf;');
  await p.waitForTimeout(1200);
  check(!(await p.isVisible('#ai-box')), `${theme}: the fix box closes when the code changes`);
  check(/A name that doesn't exist/.test(await p.innerText('#panel-problems')), `${theme}: Check reports a name that doesn't exist`);
  // Try it
  await p.click('[role=tab][data-tab=simulate]');
  await p.waitForTimeout(800);
  check((await p.innerText('#panel-simulate')).length > 100, `${theme}: Try it renders`);
  // Keyboard: Tab reaches the editor, and typing goes into it.
  await p.focus('#lines-toggle');
  let focused = false;
  for (let i = 0; i < 10 && !focused; i++) {
    await p.keyboard.press('Tab');
    focused = await p.evaluate(() => document.activeElement === document.querySelector('.CodeMirror').CodeMirror.getInputField());
  }
  const typed = focused && (await p.keyboard.type('// typed'), await p.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue().includes('// typed')));
  check(typed, `${theme}: Tab reaches the code editor, and typing goes into it`);
  await axe(p, `${theme}, Try it`);
  // Docs with nothing typed shows what's in it.
  await p.click('[role=tab][data-tab=api]');
  await p.waitForTimeout(200);
  check((await p.$$('#api-results .api-group')).length >= 6 && (await p.$$('#api-results .api-chip')).length >= 10, `${theme}: Docs lists what's in it when nothing is typed`);
  await axe(p, `${theme}, Docs`);
  // A custom theme file: applied, unsafe values left out, removable.
  await p.$eval('#settings-open', (b) => b.click()); // in the menu now
  await p.waitForTimeout(300);
  await p.click('#st-theme');
  await p.setInputFiles('#ct-file', { name: 't.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ name: 'T', light: { accent: '#7a1f2b', bg: 'red;}body{display:none' }, dark: { accent: '#ffb4a8' } })) });
  await p.waitForTimeout(200);
  const acc = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
  check(acc === (theme === 'dark' ? '#ffb4a8' : '#7a1f2b') && /Left out: light\.bg/.test(await p.innerText('#ct-msg')) && (await p.isVisible('body')), `${theme}: a custom theme file applies, and unsafe values are left out`);
  check((await p.$$('#set-looks .look-card .lc-remove')).length === 1 && (await p.$$('#set-looks .look-card:not(.look-add)')).length >= 5 && !!(await p.$('#set-looks .look-card.on .lc-remove')), `${theme}: the loaded theme is listed with the built-in looks, and is on`);
  await p.click('#set-looks .look-card.on .lc-remove', { force: true });
  await p.keyboard.press('Escape');
  // The first-visit questions (Nucli): picking Developer turns Advanced mode on; then back.
  await p.evaluate(() => document.dispatchEvent(new CustomEvent('open-firstrun')));
  await p.waitForTimeout(200);
  await axe(p, `${theme}, first-visit questions`);
  await p.click('label.fr-opt:has(input[value=developer])');
  await p.click('#firstrun-dialog button[type=submit]');
  await p.waitForTimeout(200);
  check(await p.evaluate(() => document.documentElement.dataset.mode === 'dev'), `${theme}: the first-visit choice "I write code" turns on Advanced mode`);
  await p.evaluate(() => document.dispatchEvent(new CustomEvent('open-firstrun')));
  await p.click('label.fr-opt:has(input[value=guided])');
  await p.click('#firstrun-dialog button[type=submit]');
  await p.$eval('#settings-open', (b) => b.click());
  await p.waitForTimeout(200);
  // Settings: search shows matches from every section; Accessibility switches apply to the page.
  await p.fill('#set-q', 'colour-blind');
  await p.waitForTimeout(100);
  check((await p.isVisible('#a11y-cb')) && !(await p.isVisible('#set-wrap')), `${theme}: Settings search finds a setting in another section and hides the rest`);
  await p.fill('#set-q', '');
  await p.click('#st-a11y');
  await p.check('#a11y-focus');
  check(await p.evaluate(() => document.documentElement.hasAttribute('data-a11y-focus')), `${theme}: an Accessibility setting applies to the page`);
  await p.uncheck('#a11y-focus');
  await axe(p, `${theme}, Settings › Accessibility`);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  // The command palette (Ctrl+Shift+P, as in VS Code) and Format document (Shift+Alt+F).
  await p.click('.CodeMirror');
  await p.keyboard.press('Control+Shift+P');
  await p.waitForTimeout(300);
  check((await p.inputValue('#open-q')) === '>' && /Format document/.test(await p.innerText('#open-body')), `${theme}: Ctrl+Shift+P opens the command palette`);
  await p.fill('#open-q', '>format');
  await p.waitForTimeout(200);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(400);
  await p.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.setValue('Game.GUID="A";\nGame.GameName="A";\nGame.ExecutableName="a.exe";\nGame.Play=function(){\nContext.StartArguments="-w";\n};\n'));
  await p.waitForTimeout(300);
  await p.click('.CodeMirror');
  await p.keyboard.press('Shift+Alt+F');
  await p.waitForTimeout(400);
  check((await p.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue())) === 'Game.GUID = "A";\nGame.GameName = "A";\nGame.ExecutableName = "a.exe";\nGame.Play = function () {\n    Context.StartArguments = "-w";\n};\n', `${theme}: Shift+Alt+F formats the code`);
  check(/Shortcut|Pitfall|Best practice|Feature|Setting|Heads up/.test(await p.innerText('#tip-label').catch(() => '')), `${theme}: tips show their topic`);
  // Share: the link leads while it fits a Discord message; past that, the file does (the .zip and a message to post).
  const shareLead = async () => {
    await p.click('#share-open');
    await p.waitForTimeout(500);
    const r = await p.evaluate(() => ({ lead: document.querySelector('#code-dialog .code-hero')?.dataset.code, link: document.querySelector('#code-link-sub').textContent, file: document.querySelector('#code-file-sub').textContent }));
    await p.click('#code-close');
    return r;
  };
  const short = await shareLead();
  check(short.lead === 'link' && /Opens this handler/.test(short.link), `${theme}: Share leads with the link for a short handler (${short.lead}: ${short.link})`);
  const shortCode = await p.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue());
  // Text that doesn't compress, so the link is long whatever the compression.
  await p.evaluate(() => { let x = 7, pad = ''; for (let i = 0; i < 4000; i++) { x = (x * 1103515245 + 12345) % 2147483648; pad += String.fromCharCode(97 + (x % 26)); } const cm = document.querySelector('.CodeMirror').CodeMirror; cm.setValue(cm.getValue() + '// ' + pad + '\n'); });
  const long = await shareLead();
  check(long.lead === 'file' && /too long for a Discord message/.test(long.link) && /\.zip/.test(long.file), `${theme}: Share leads with the file when the link is too long for Discord (${long.lead}: ${long.link})`);
  await p.evaluate((c) => document.querySelector('.CodeMirror').CodeMirror.setValue(c), shortCode);
  await p.waitForTimeout(200);
  // Folding, as in VS Code: Ctrl+K Ctrl+0 folds all, Ctrl+K Ctrl+J unfolds all.
  const folds = () => p.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getAllMarks().filter((m) => m.__isFold).length);
  await p.click('.CodeMirror-code');
  await p.keyboard.press('Control+k');
  await p.keyboard.press('Control+0');
  check((await folds()) > 0, `${theme}: Ctrl+K Ctrl+0 folds the code`);
  await p.keyboard.press('Control+k');
  await p.keyboard.press('Control+j');
  check((await folds()) === 0, `${theme}: Ctrl+K Ctrl+J unfolds it`);
  // Coding keys as in VS Code: Tab indents a selection (doesn't replace it); F2 selects every use to rename.
  const cmSet = (v, a, h) => p.evaluate(([v, a, h]) => { const e = document.querySelector('.CodeMirror').CodeMirror; e.setValue(v); e.setSelection(a, h); e.focus(); }, [v, a, h]);
  const cmVal = () => p.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue());
  await cmSet('var a = 1;\nvar b = 2;\n', { line: 0, ch: 0 }, { line: 1, ch: 3 });
  await p.keyboard.press('Tab');
  check((await cmVal()) === '  var a = 1;\n  var b = 2;\n', `${theme}: Tab indents the selected lines`);
  await cmSet('function go() {}\ngo();\n', { line: 1, ch: 1 }, { line: 1, ch: 1 });
  await p.keyboard.press('F2');
  await p.keyboard.type('run');
  check((await cmVal()) === 'function run() {}\nrun();\n', `${theme}: F2 renames every use`);
  // Ctrl+.: the line's problems and fixes, even with the cursor on a name that has docs of its own.
  await cmSet('Game.GUID = "a";\nGame.GameName = "a";\nGame.ExecutableName = "a.exe";\nGame.MaxPlayers = "4";\n', { line: 3, ch: 0 }, { line: 3, ch: 0 });
  await p.waitForTimeout(400);
  await p.keyboard.press('Control+.');
  await p.waitForTimeout(300);
  check(await p.isVisible('[data-lp-fix]'), `${theme}: Ctrl+. on a name shows the line's fixes, not only the name's docs`);
  await p.keyboard.press('Escape');
  // Explain this line (Ctrl+Alt+E): plain words in the hover card.
  await cmSet('Game.Play = function () {\n};\n', { line: 0, ch: 0 }, { line: 0, ch: 0 });
  await p.keyboard.press('Control+Alt+e');
  await p.waitForTimeout(200);
  check(/once for each player/.test(await p.textContent('#tip')) && await p.isVisible('#tip'), `${theme}: Ctrl+Alt+E explains the line`);
  { const r = await p.$eval('.CodeMirror', (e) => e.getBoundingClientRect()); await p.mouse.move(r.x + 200, r.y + 120); await p.waitForTimeout(500); }
  check(await p.isVisible('#tip') && /once for each player/.test(await p.textContent('#tip')), `${theme}: the explanation stays while the mouse moves over the code`);
  await p.keyboard.press('Escape');
  // Find and replace (Ctrl+F, Ctrl+H, Ctrl+Alt+Enter), go to line (Ctrl+G), as in VS Code.
  await cmSet('var foo = 1;\nvar bar = foo;\n', { line: 0, ch: 5 }, { line: 0, ch: 5 });
  await p.keyboard.press('Control+f');
  await p.waitForTimeout(200);
  check((await p.textContent('.find-widget .fw-count')) === '1 of 2', `${theme}: Ctrl+F finds the word at the cursor, with a count`);
  await p.keyboard.press('Control+h');
  await p.keyboard.type('qux');
  await p.keyboard.press('Control+Alt+Enter');
  check((await cmVal()) === 'var qux = 1;\nvar bar = qux;\n', `${theme}: Ctrl+H, Ctrl+Alt+Enter replaces all`);
  await p.keyboard.press('Escape');
  await p.keyboard.press('Control+g');
  await p.waitForTimeout(300);
  await p.keyboard.type('2:5');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(200);
  check((await p.evaluate(() => JSON.stringify(document.querySelector('.CodeMirror').CodeMirror.getCursor()))).startsWith('{"line":1,"ch":4'), `${theme}: Ctrl+G 2:5 goes to line 2, column 5`);
  // Find, Alt+Enter: every match selected; → / ← put a cursor after / before each (suffix and prefix in one go).
  await cmSet('a.x = 1;\nb.x = 2;\nc.y = 3;\n', { line: 2, ch: 0 }, { line: 2, ch: 0 });
  await p.keyboard.press('Control+f');
  await p.keyboard.type('.x');
  await p.keyboard.press('Alt+Enter');
  await p.keyboard.press('ArrowRight');
  await p.keyboard.type('Y');
  await p.keyboard.press('ArrowLeft');
  for (let i = 0; i < 2; i++) await p.keyboard.press('ArrowLeft');
  await p.keyboard.type('_');
  check((await cmVal()) === 'a_.xY = 1;\nb_.xY = 2;\nc.y = 3;\n', `${theme}: Find, Alt+Enter, then → / ← add a suffix and a prefix to every match`);
  // Find stays quick with many matches: no mark per match, the highlight only on the lines on screen.
  await cmSet('var x = 1;\n'.repeat(30000), { line: 30000, ch: 0 }, { line: 30000, ch: 0 }); // an empty last line: nothing to seed Find with
  await p.keyboard.press('Control+f');
  const t0 = Date.now();
  check(!/of 20000/.test(await p.textContent('.find-widget .fw-count')), `${theme}: (Find starts without those matches)`);
  await p.keyboard.type('x');
  await p.waitForFunction(() => /of 20000\+/.test(document.querySelector('.find-widget .fw-count').textContent), null, { timeout: 5000 }).catch(() => {});
  const took = Date.now() - t0;
  check(/of 20000\+/.test(await p.textContent('.find-widget .fw-count')) && took < 1500, `${theme}: Find with 30000 matches counts them in ${took} ms (under 1.5 s)`);
  const t1 = Date.now();
  await p.keyboard.press('Enter');
  await p.keyboard.press('Enter');
  check(Date.now() - t1 < 400, `${theme}: and steps through them without a hang (${Date.now() - t1} ms)`);
  await p.keyboard.press('Escape');
  // A German keyboard: Ctrl + the key where a US keyboard has "/" (it prints "-") toggles a comment.
  await cmSet('var a = 1;\n', { line: 0, ch: 0 }, { line: 0, ch: 0 });
  await p.evaluate(() => {
    const e = document.querySelector('.CodeMirror').CodeMirror;
    const ev = new KeyboardEvent('keydown', { key: '-', code: 'Slash', ctrlKey: true, bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'keyCode', { get: () => 189 });
    e.getInputField().dispatchEvent(ev);
  });
  check((await cmVal()) === '// var a = 1;\n', `${theme}: shortcuts with punctuation work by key position on other keyboard layouts`);
  // Rebinding: Settings › Keyboard shortcuts, press the new keys, Enter; it works in the code at once; Reset puts it back.
  await p.keyboard.press('Control+Comma');
  await p.click('#st-keys');
  await p.fill('#sp-keys .kb-q', 'comment or');
  await p.click('#sp-keys [data-kb-change="comment"]');
  await p.keyboard.press('Control+Shift+Digit7');
  await p.keyboard.press('Enter');
  await p.keyboard.press('Escape');
  await cmSet('var a = 1;\n', { line: 0, ch: 0 }, { line: 0, ch: 0 });
  await p.keyboard.press('Control+Shift+Digit7');
  check((await cmVal()) === '// var a = 1;\n', `${theme}: a changed shortcut works in the code`);
  check((await p.evaluate(() => localStorage.getItem('nucleus-workbench-keys'))) === '{"comment":"Ctrl+Shift+7"}', `${theme}: changed shortcuts are kept (and exported with the settings)`);
  await p.evaluate(() => localStorage.removeItem('nucleus-workbench-keys'));
  // Dialogs
  // Open: the arrow keys move through tiles, chips and rows.
  await p.keyboard.press('Control+p'); // in the code Ctrl+K starts VS Code's two-key shortcuts
  await p.waitForTimeout(300);
  await p.focus('#open-q');
  const kinds = [];
  for (let k = 0; k < 5; k++) {
    await p.keyboard.press('ArrowDown');
    kinds.push(await p.$eval('#open-body .entry.active', (e) => e.closest('.entries').className));
  }
  check(kinds[0].includes('chips') && kinds.some((c) => c.includes('rows')), `${theme}: ↓ moves from the Start tiles past the templates to the Hub rows`);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  for (const [open, name] of [['ctrl-k', 'Open'], ['#settings-open', 'Settings'], ['#news-open-2', "What's new"], ['#help-open', 'Keyboard shortcuts']]) {
    if (open === 'ctrl-k') await p.keyboard.press('Control+k');
    else await p.$eval(open, (b) => b.click());
    await p.waitForTimeout(400);
    await axe(p, `${theme}, ${name} dialog`);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(200);
  }
  // The header menus (+ and the gear) and the open handlers' tabs.
  check((await p.$$('#htabs [role=tab]')).length >= 1, `${theme}: the open handlers show as tabs`);
  for (const m of ['#tab-add', '#app-menu-open']) {
    await p.click(m);
    await p.waitForTimeout(200);
    check((await p.$$('.app-menu [role^=menuitem]')).length >= 3, `${theme}: ${m} opens its menu`);
    await axe(p, `${theme}, ${m} menu`);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(150);
  }
  // A Hub handler whose package has other files: they open in Files, big ones as placeholders (Hub badge, a card).
  {
    const pick = await p.evaluate(() => {
      const hs = HUB_EXAMPLES.handlers;
      const h = hs.find((x) => x.id === 'xjBSwFNj3ndRntsZh' && x.files) ?? hs.find((x) => x.files);
      return h ? { id: h.id, title: h.title, files: h.files } : null;
    });
    // Built from the data branch (Pages): package files appear only once the daily Hub sync has mirrored them
    // (tools/hub-mirror.mjs, a few days after it first runs), so none yet is fine there. The snapshot build has them.
    const fromMirror = await p.evaluate(() => !!HUB_EXAMPLES.all);
    if (!pick && fromMirror) say(`skip ${theme}: no Hub package files mirrored yet (the daily Hub sync adds them)`);
    else check(!!pick, `${theme}: a Hub handler in this build has package files`);
    if (pick) {
      await p.goto(BASE + '#hub-' + pick.id);
      await p.waitForTimeout(1500);
      if (await p.$eval('#files-panel', (e) => e.hidden)) await p.click('#files-toggle');
      await p.waitForTimeout(300);
      const rows = (await p.$$('#files-panel .fp-h.on .fp-open[data-fp]')).length;
      check(rows === pick.files + 1, `${theme}: ${pick.title} opens with its ${pick.files} package file(s) in Files (${rows - 1} listed)`);
      const hubRow = await p.$('#files-panel .fp-open:has(.fp-hub)');
      if (hubRow) {
        await hubRow.click();
        await p.waitForTimeout(300);
        check(/not downloaded here/.test(await p.$eval('#file-card', (e) => e.textContent)), `${theme}: a big file of the Hub package shows where to get it`);
        // Before saving, Share and the Save menu say the .zip leaves the big files out, with the Hub link.
        await p.click('#share-open');
        await p.waitForTimeout(300);
        const note = await p.evaluate(() => ({ shown: !document.getElementById('code-hub-note').hidden, href: document.querySelector('#code-hub-note a').href, sub: document.getElementById('code-file-warn').hidden ? '' : document.getElementById('code-file-warn').textContent, warnColour: getComputedStyle(document.getElementById('code-file-warn')).color !== getComputedStyle(document.getElementById('code-file-sub')).color }));
        await p.click('#code-close');
        check(note.shown && note.warnColour && /hub\.splitscreen\.me/.test(note.href) && /only on the Hub/.test(note.sub), `${theme}: Share says which Hub files the .zip leaves out (${note.sub})`);
        await p.click('#save-more');
        await p.waitForTimeout(200);
        check(/only on the Hub/.test(await p.evaluate(() => document.querySelector('[role=menu]')?.textContent ?? '')), `${theme}: the Save menu says it too`);
        await p.keyboard.press('Escape');
      }
      await axe(p, `${theme}, Files panel with a Hub package`);
      // Over the code the hint covers the page; over the open Files panel, the panel says it adds the file instead.
      const drag = (sel, type = 'dragover') => p.evaluate(([sel, type]) => {
        const dt = new DataTransfer();
        dt.items.add(new File(['Game.GameName = "Dropped";\n'], 'dropped.js', { type: 'text/javascript' }));
        document.querySelector(sel).dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
        return { page: !document.getElementById('drop-hint').hidden, files: document.getElementById('files-panel').classList.contains('drop-add') };
      }, [sel, type]);
      const onCode = await drag('.CodeMirror'), onFiles = await drag('#files-panel .fp-open');
      check(onCode.page && !onCode.files && onFiles.files && !onFiles.page, `${theme}: dragging over the code shows the page hint, over Files the add-to-package hint (${JSON.stringify([onCode, onFiles])})`);
      await p.evaluate(() => window.dispatchEvent(new DragEvent('dragend', { bubbles: true })));
      // Share right after typing in one of its text files (before the pause that saves it): the edit counts, so the
      // file leads, not the Hub link (which would open the original files).
      // A Hub handler whose package has a text file that's downloaded here (hub/<id>.files.json in this build).
      const txt = (() => {
        const dir = path.join(root, 'hub');
        for (const n of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith('.files.json')).sort() : []) {
          const f = JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')).files.find((x) => x.b64 !== undefined && /\.(ini|txt|cfg|json)$/i.test(x.name));
          if (f) return { id: n.replace(/\.files\.json$/, ''), name: f.name };
        }
        return null;
      })();
      if (txt) {
        await p.goto(BASE + '#hub-' + txt.id);
        await p.waitForTimeout(1500);
        if (await p.$eval('#files-panel', (e) => e.hidden)) await p.click('#files-toggle');
        await p.waitForTimeout(300);
        await p.click(`#files-panel .fp-open[data-fp="${txt.name.replace(/"/g, '\\"')}"]`);
        await p.waitForTimeout(300);
        const opened = !(await p.$eval('#file-editor', (e) => e.hidden));
        check(opened, `${theme}: ${txt.name} opens in the file editor`);
        if (opened) {
          // Hiding the results pane from inside it puts the focus in the file that shows, not the hidden handler.js.
          await p.focus('[role=tab][data-tab=problems]');
          await p.keyboard.press('Control+J');
          await p.waitForTimeout(200);
          check(await p.evaluate(() => !!document.activeElement?.closest('#file-editor')), `${theme}: Ctrl+J from the results puts the focus in the open package file`);
          // …and typing goes into that file (then undone, so the rest of the check sees the file as it was).
          const fileText = () => p.evaluate(() => document.querySelector('#file-editor .CodeMirror').CodeMirror.getValue());
          const beforeTyping = await fileText();
          await p.keyboard.type('zq7');
          const typed = await fileText();
          await p.keyboard.press('Control+Z');
          await p.waitForTimeout(100);
          check(typed.includes('zq7') && !beforeTyping.includes('zq7') && (await fileText()) === beforeTyping, `${theme}: after Ctrl+J, typing edits the open package file`);
          await p.keyboard.press('Control+J');
          await p.waitForTimeout(200);
          await p.evaluate(() => { document.querySelector('#file-editor .CodeMirror').CodeMirror.replaceRange('; edited\n', { line: 0, ch: 0 }); document.querySelector('#share-open').click(); });
          await p.waitForTimeout(500);
          const lead = await p.evaluate(() => document.querySelector('#code-dialog .code-hero')?.dataset.code);
          await p.click('#code-close');
          check(lead === 'file', `${theme}: Share right after editing a package file leads with the file (${lead})`);
          // Edit again, go straight to handler.js and Share the file, all in the same tick (well inside the 350 ms
          // pause): the downloaded .zip has the edit. buildPackage stores files uncompressed, so the text is in the bytes.
          await p.click(`#files-panel .fp-open[data-fp="${txt.name.replace(/"/g, '\\"')}"]`);
          await p.waitForTimeout(200);
          const [zip] = await Promise.all([
            p.waitForEvent('download'),
            p.evaluate(() => {
              document.querySelector('#file-editor .CodeMirror').CodeMirror.replaceRange('; second edit\n', { line: 0, ch: 0 });
              document.querySelector('#files-panel .fp-h.on .fp-open[data-fp=""]').click();
              document.querySelector('#share-open').click();
              document.querySelector('#code-dialog [data-code=file]').click();
            }),
          ]);
          const zipText = fs.readFileSync(await zip.path()).toString('latin1');
          check(/\.zip$/.test(zip.suggestedFilename()) && zipText.includes('; second edit'), `${theme}: an edit made just before switching to handler.js and sharing at once is in the .zip (${zip.suggestedFilename()})`);
          await p.waitForTimeout(300);
          if (await p.$eval('#code-dialog', (d) => d.open)) await p.click('#code-close');
          await drag('.CodeMirror', 'drop');
          await p.waitForTimeout(500);
          check((await p.textContent('#doc-name')) === 'dropped.js' && /Dropped/.test(await p.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue())), `${theme}: dropping a .js on the code opens it`);
        }
      }
    }
  }
  // A first visit (beta): the tester questions come first, can't be skipped, and lead to the recommendations.
  {
    const fresh = await browser.newContext({ colorScheme: theme, viewport: { width: 1280, height: 800 } });
    await fresh.route((u) => !u.href.startsWith(BASE), (r) => r.abort());
    const q = await fresh.newPage();
    await q.goto(BASE);
    await q.waitForTimeout(1200);
    check(await q.isVisible('#test-dialog .tg-card'), `${theme}: a first visit opens the tester questions`);
    await axe(q, `${theme}, tester questions`);
    await q.keyboard.press('Escape');
    await q.waitForTimeout(150);
    check(await q.isVisible('#test-dialog') && await q.isDisabled('#tg-show'), `${theme}: the questions can't be skipped`);
    await q.click('label.tg-card:has(input[data-q=coding][value=new])');
    await q.click('label.tg-card:has(input[data-q=nucleus][value=new])');
    await q.click('#tg-show');
    await q.waitForTimeout(300);
    check((await q.$$('#test-body .tg-list > .tg-item')).length >= 3 && await q.isVisible('#tg-change'), `${theme}: the answers show the recommendations, with Change`);
    await axe(q, `${theme}, tester recommendations`);
    // Behind the questions: the editor with the template (there's no home page), and no tour for a program's browser.
    await q.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
    await q.waitForTimeout(200);
    check(!(await q.$('#no-handler')) && await q.isVisible('#main') && /Game\.GameName/.test(await q.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue())), `${theme}: a first visit opens the template in the editor`);
    check(!(await q.$eval('#tour', (d) => d.open)), `${theme}: the tour never starts by itself in an automated browser`);
    // Dragging a file: the same hint over the whole window, wherever the pointer is (code, header, footer).
    const dragOver = (sel) => q.evaluate((sel) => {
      const dt = new DataTransfer();
      dt.items.add(new File(['Game.GameName = "Dropped";\n'], 'dropped.js', { type: 'text/javascript' }));
      document.querySelector(sel).dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
      return !document.getElementById('drop-hint').hidden && getComputedStyle(document.getElementById('drop-hint')).position === 'fixed';
    }, sel);
    const overMain = await dragOver('#main'), overHeader = await dragOver('header'), overFooter = await dragOver('footer');
    check(overMain && overHeader && overFooter, `${theme}: dragging a file shows the drop hint over the whole page (main ${overMain}, header ${overHeader}, footer ${overFooter})`);
    // Held still: browsers repeat dragover only every ~350 ms, so the hint must outlast a pause like that.
    await q.waitForTimeout(700);
    check(await q.isVisible('#drop-hint'), `${theme}: the drop hint stays while the file is held still`);
    await q.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(['x'], 'dropped.js'));
      document.querySelector('header').dispatchEvent(new DragEvent('dragleave', { dataTransfer: dt, bubbles: true, relatedTarget: null, clientX: -1, clientY: 10 }));
    });
    check(await q.isHidden('#drop-hint'), `${theme}: the drop hint goes away when the drag leaves the window`);
    // The tour (tour.ts): from the menu, keyboard-driven, Esc skips and remembers the step, Take the tour offers to continue.
    const takeTour = async () => {
      // A new visitor gets the side rail (the default): its menu button; the slim bar's otherwise.
      await q.click((await q.isVisible('#app-menu-open')) ? '#app-menu-open' : '.rail [data-rail=menu]');
      await q.click('[role=menuitem]:has-text("Take the tour")');
      await q.waitForTimeout(400);
    };
    await takeTour();
    const tourState = () => q.evaluate(() => ({ open: document.getElementById('tour').open, count: document.getElementById('tour-count').textContent, title: document.getElementById('tour-title').textContent, inCard: !!document.activeElement?.closest('.tour-card') }));
    let ts = await tourState();
    check(ts.open && /^1 of \d+$/.test(ts.count) && ts.inCard, `${theme}: Take the tour opens step 1 with the focus in the card (${ts.count}, ${ts.title})`);
    await axe(q, `${theme}, tour`);
    await q.keyboard.press('ArrowRight');
    await q.keyboard.press('ArrowRight');
    await q.waitForTimeout(400);
    ts = await tourState();
    check(ts.title === 'Check' && /^3 of/.test(ts.count) && await q.$eval('.pane-head [data-tab=problems]', (b) => b.getAttribute('aria-selected') === 'true'), `${theme}: → steps on, to Check (${ts.count}, ${ts.title})`);
    // Try it's action: clicking the tab in the cut-out shows "✓ Done", keeps Try it open and waits for Next.
    await q.keyboard.press('ArrowRight');
    await q.waitForTimeout(300);
    await q.click('.pane-head [data-tab=simulate]');
    check(/Done/.test(await q.textContent('#tour-act')), `${theme}: doing a step's action marks it done`);
    await q.waitForTimeout(1500);
    check(/^4 of/.test(await q.textContent('#tour-count')) && await q.evaluate(() => document.activeElement?.dataset.tour === 'next') && await q.$eval('.pane-head [data-tab=simulate]', (b) => b.getAttribute('aria-selected') === 'true'), `${theme}: after the action the tour waits for Next, with what opened still shown`);
    await q.keyboard.press('Escape');
    await q.waitForTimeout(300);
    const saved = await q.evaluate(() => JSON.parse(localStorage.getItem('nucleus-workbench-tour')));
    check(!(await q.$eval('#tour', (d) => d.open)) && saved?.state === 'skipped' && saved.step === 3 && await q.evaluate(() => document.activeElement?.id === 'app-menu-open' || document.activeElement?.dataset.rail === 'menu'), `${theme}: Esc skips, remembers the step and gives the focus back to the menu button it was opened from (${JSON.stringify(saved)}, focus on ${await q.evaluate(() => document.activeElement?.id || document.activeElement?.dataset.rail || document.activeElement?.tagName)})`);
    check(await q.$eval('.pane-head [data-tab=problems]', (b) => b.getAttribute('aria-selected') === 'true'), `${theme}: the tour puts back the tab that was open`);
    await takeTour();
    check(/Continue where you left off/.test(await q.textContent('[data-tour=next]')) && /Start over/.test(await q.textContent('[data-tour=back]')), `${theme}: Take the tour after a skip offers to continue or start over`);
    await q.click('[data-tour=next]');
    await q.waitForTimeout(300);
    check(/^4 of/.test(await q.textContent('#tour-count')), `${theme}: Continue picks up at the skipped step`);
    for (let i = 0; i < 12 && await q.$eval('#tour', (d) => d.open); i++) await q.click('[data-tour=next]');
    check((await q.evaluate(() => JSON.parse(localStorage.getItem('nucleus-workbench-tour'))))?.state === 'done', `${theme}: Finish ends the tour and remembers it`);
    // A shortcut changed since the page loaded: the tour names the new keys (it looks them up when a step is shown),
    // which are the ones the step's action listens for.
    await q.keyboard.press('Control+Comma');
    await q.click('#st-keys');
    await q.fill('#sp-keys .kb-q', 'lines');
    await q.click('#sp-keys [data-kb-change="lines"]');
    await q.keyboard.press('Control+Shift+Digit9');
    await q.keyboard.press('Enter');
    await q.keyboard.press('Escape');
    await takeTour();
    for (let i = 0; i < 12 && (await q.textContent('#tour-title')) !== 'Lines'; i++) { await q.click('[data-tour=next]'); await q.waitForTimeout(200); }
    const linesStep = await q.evaluate(() => ({ title: document.getElementById('tour-title').textContent, keys: [...document.querySelectorAll('#tour-text kbd')].map((k) => k.textContent).join('+') }));
    check(linesStep.title === 'Lines' && /9/.test(linesStep.keys) && !/B/.test(linesStep.keys), `${theme}: the tour names a shortcut as it is bound now, without a reload (${JSON.stringify(linesStep)})`);
    await q.keyboard.press('Escape');
    // A shortcut that was cleared: the step names the action instead of showing an empty key.
    await q.keyboard.press('Control+Comma');
    await q.click('#st-keys');
    await q.fill('#sp-keys .kb-q', 'lines');
    await q.click('#sp-keys [data-kb-change="lines"]');
    await q.click('#sp-keys [data-kb-none="lines"]');
    await q.keyboard.press('Escape');
    await takeTour();
    for (let i = 0; i < 12 && (await q.textContent('#tour-title')) !== 'Lines'; i++) { await q.click('[data-tour=next]'); await q.waitForTimeout(200); }
    const noKey = await q.textContent('#tour-text');
    check(/\(no key set\) opens and closes the list/.test(noKey) && !noKey.includes('`'), `${theme}: the tour names an action whose shortcut was cleared (${noKey.slice(-70)})`);
    await q.keyboard.press('Escape');
    await fresh.close();
  }
  // One handler per tab: another handler opens a new tab; one that's already open switches to its tab.
  await p.goto(BASE + '#example-mistakes');
  await p.waitForTimeout(800);
  const nTabs = async () => (await p.$$('#htabs [role=tab]')).length;
  const tabsBefore = await nTabs();
  const otherHub = await p.evaluate(() => window.HUB_EXAMPLES?.handlers?.[0]?.id ?? null);
  if (otherHub) {
    await p.evaluate((id) => { location.hash = 'hub-' + id; }, otherHub);
    await p.waitForTimeout(1200);
    const tabsAfter = await nTabs();
    await p.evaluate(() => { location.hash = 'example-mistakes'; });
    await p.waitForTimeout(600);
    check(tabsAfter === tabsBefore + 1 && (await nTabs()) === tabsAfter && /mistakes/i.test(await p.innerText('#htabs [aria-selected=true]')), `${theme}: another handler opens a new tab, and an open one switches to its tab (${tabsBefore} -> ${tabsAfter})`);
    // The ▾ (all open handlers) follows the number of tabs, on a fresh load as after any change.
    const allShown = () => p.isVisible('#tab-all');
    check((await allShown()) === (tabsAfter >= 2), `${theme}: ▾ all open handlers shown with ${tabsAfter} tabs`);
    // Header buttons: one height and one centre line; ▾ and + centred on the tabs.
    const geo = await p.evaluate(() => Object.fromEntries(['#share-open', '#code-menu-open', '#save-more', '#app-menu-open', '#tab-all', '#tab-add', '.htab-w.on'].map((q) => { const r = document.querySelector(q).getBoundingClientRect(); return [q, { h: r.height, mid: r.top + r.height / 2 }]; })));
    const hdr = ['#share-open', '#code-menu-open', '#save-more', '#app-menu-open'].map((q) => geo[q]);
    check(hdr.every((g) => Math.abs(g.h - hdr[0].h) < 1 && Math.abs(g.mid - hdr[0].mid) < 1), `${theme}: Share, Save, its ▾ and the menu are one height on one line (${hdr.map((g) => g.h).join('/')})`);
    check(['#tab-all', '#tab-add'].every((q) => Math.abs(geo[q].mid - geo['.htab-w.on'].mid) <= 1.5), `${theme}: ▾ and + sit level with the tabs`);
    await p.reload();
    await p.waitForTimeout(800);
    check((await allShown()) === ((await nTabs()) >= 2), `${theme}: ▾ the same after a reload`);
    const closeOthers = () => p.evaluate(() => {
      if (document.querySelector('#files-panel').hidden) document.querySelector('#files-toggle').click();
      const x = document.querySelector('#files-panel .fp-h:not(.on) [data-fp-hclose]');
      x?.click();
      return !!x;
    });
    while (await closeOthers()) await p.waitForTimeout(150);
    check(!(await allShown()), `${theme}: ▾ hidden with one handler open`);
    await p.reload();
    await p.waitForTimeout(800);
    check(!(await allShown()), `${theme}: ▾ still hidden with one handler open after a reload (it showed on first load)`);
  }
  // The side rail's Save: right-click offers the formats, like the arrow beside Save in the slim bar.
  await p.evaluate(() => localStorage.setItem('nucleus-workbench-layout', 'rail'));
  await p.reload();
  await p.waitForSelector('.rail [data-rail=save]', { state: 'visible', timeout: 10000 });
  await p.click('.rail [data-rail=save]', { button: 'right' });
  await p.waitForTimeout(200);
  check(/For Nucleus Co-op \(\.zip\)/.test(await p.innerText('body')), `${theme}: right-click on the rail's Save offers Save as`);
  await p.keyboard.press('Escape');
  // The rail hides the header's brand, so the page's heading is its own there (one h1 either way).
  const h1 = await p.evaluate(() => [...document.querySelectorAll('h1')].filter((h) => h.getClientRects().length).map((h) => h.textContent.trim()));
  check(h1.length === 1 && /Workbench/.test(h1[0]), `${theme}: the side rail layout has the page's heading (${h1.join(' | ')})`);
  await axe(p, `${theme}, side rail`);
  await p.evaluate(() => localStorage.setItem('nucleus-workbench-layout', 'bar'));
  await p.reload();
  await p.waitForTimeout(800);
  // The value picker: a ▾ only when the cursor is on a pickable value; picking one changes the code.
  await p.evaluate(() => { const cm = document.querySelector('.CodeMirror').CodeMirror; cm.setValue('Game.GameName = "Demo";\nGame.SymlinkGame = false;\n'); cm.focus(); cm.setCursor({ line: 0, ch: 2 }); });
  await p.waitForTimeout(200);
  check((await p.locator('.vp-chip').count()) === 0, `${theme}: no value picker away from a value`);
  await p.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.setCursor({ line: 1, ch: 21 }));
  await p.waitForTimeout(200);
  await p.locator('.vp-chip').click();
  await p.locator('.vp-menu button', { hasText: 'true' }).click();
  check(await p.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getLine(1)) === 'Game.SymlinkGame = true;', `${theme}: the value picker changes the value`);
  // A fresh copy of the example with mistakes, for the debugger.
  await p.goto(BASE + '#example-mistakes');
  await p.waitForTimeout(800);
  // Already open with changes (from the checks above): open a fresh copy.
  const fresh = p.locator('button', { hasText: 'Open a fresh copy' });
  if (await fresh.count()) { await fresh.first().click(); await p.waitForTimeout(800); }
  // The debugger: a breakpoint, Step through, step, step back, the banner and the current line.
  await p.goto(BASE + '#example-mistakes');
  await p.waitForTimeout(1200);
  await p.click('#fix-all');
  await p.waitForTimeout(500);
  if (await p.$('#ai-accept')) await p.click('#ai-accept');
  await p.waitForTimeout(800);
  const bpLine = await p.evaluate(() => {
    const cm = document.querySelector('.CodeMirror').CodeMirror;
    for (let i = 0; i < cm.lineCount(); i++) if (cm.getLine(i).includes('Context.StartArguments')) return i;
    return -1;
  });
  const gutterAt = await p.evaluate((l) => {
    const cm = document.querySelector('.CodeMirror').CodeMirror;
    const g = document.querySelector('.CodeMirror-gutter.nc-bp').getBoundingClientRect();
    const r = cm.charCoords({ line: l, ch: 0 }, 'window');
    return { x: g.left + g.width / 2, y: (r.top + r.bottom) / 2 };
  }, bpLine);
  await p.mouse.click(gutterAt.x, gutterAt.y);
  await p.waitForTimeout(150);
  check(bpLine >= 0 && (await p.$$('.dbg-gm.bp')).length === 1, `${theme}: a click beside a line number sets a breakpoint`);
  await p.click('[role=tab][data-tab=simulate]');
  await p.waitForTimeout(300);
  await p.click('#sim-debug');
  await p.waitForSelector('#dbg-body:not([hidden])', { timeout: 10000 }).catch(() => {});
  const atBp = await p.innerText('#dbg-banner');
  check(atBp.includes(`Breakpoint. Paused before line ${bpLine + 1} for player 1 of`) && atBp.includes('about to set Context.StartArguments'), `${theme}: Step through stops at the breakpoint and says where in plain words (${atBp.trim().slice(0, 90)})`);
  check(await p.evaluate((l) => !!document.querySelector('.CodeMirror').CodeMirror.lineInfo(l).bgClass?.includes('dbg-line'), bpLine), `${theme}: the current line is highlighted in the code`);
  await p.click('#dbg-over');
  await p.waitForTimeout(150);
  check((await p.innerText('#dbg-banner')).includes(`line ${bpLine + 2}`) && /Context/.test(await p.innerText('#dbg-vars')), `${theme}: Step over moves to the next line and shows the variables`);
  await p.click('#dbg-back');
  await p.waitForTimeout(150);
  check((await p.innerText('#dbg-banner')).includes(`line ${bpLine + 1}`), `${theme}: Step back goes back a step`);
  check(Number(await p.inputValue('#dbg-range')) > 0 && (await p.$$('#dbg-done li')).length > 0, `${theme}: the timeline and Done so far follow the run`);
  await axe(p, `${theme}, debugger`);
  await cmType(p, 'Game.MaxPlayers', ' ');
  await p.waitForTimeout(150);
  check(/Code changed/.test(await p.innerText('#dbg-banner')), `${theme}: editing the code ends the debug session`);
  await p.click('#dbg-stop');
  await p.waitForTimeout(200);
  check((await p.isHidden('#dbg')) && (await p.innerText('#sim-out')).length > 50, `${theme}: Stop closes the debugger and shows Try it's results`);
  // Code colours everywhere.
  {
    const DESC = 'Java version only. If you use multiple keyboards and mice, set the input in the options first, then start the game and wait for every window to open.';
    await p.evaluate((c) => document.querySelector('.CodeMirror').CodeMirror.setValue(c), `Game.GUID = "Demo";\nGame.GameName = "Demo";\nGame.ExecutableName = "demo.exe";\nGame.Description = "${DESC}";\nGame.HandlerInterval = 1000 * 2;\nGame.Play = function () {\n    Context.StartArguments = "-windowed";\n    for (var i = 0; i < 2; i++) { Context.StartArguments += " x"; }\n};\n`);
    await p.waitForTimeout(1000);
    // Hover docs and Reference: code in the editor's colours.
    const at = await p.evaluate(() => { const cm = document.querySelector('.CodeMirror').CodeMirror; const r = cm.charCoords({ line: 5, ch: 6 }, 'window'); return { x: r.left + 2, y: (r.top + r.bottom) / 2 }; });
    await p.mouse.move(at.x, at.y);
    await p.waitForTimeout(900);
    // The short card: the signature (its name in the editor's property colour) and any code in the first sentence.
    check(await p.isVisible('#tip') && (await p.$$('#tip :is(code.hl :is(.cm-property, .cm-nucleus-prop), .dc-sig .sg-n)')).length > 0, `${theme}: the hover card shows code in the editor's colours`);
    // The hover is short (help on request): the first sentence and "More in Docs", no "Explain this line".
    const tipText = await p.textContent('#tip');
    check((await p.isVisible('#tip .dc-more a[data-api]')) && !/Explain this line|In practice/.test(tipText), `${theme}: the hover card is short, with More in Docs and no Explain this line`);
    await p.mouse.move(5, 5);
    // Parameter hints: not from clicking into a call; typing `,` in it opens them, Escape closes them.
    const codeBefore = await p.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue());
    await p.evaluate(() => { const cm = document.querySelector('.CodeMirror').CodeMirror; cm.setValue('Game.AddOption("Mode", "Pick one", "mode", );\n'); });
    await p.waitForTimeout(300);
    const inCall = await p.evaluate(() => { const cm = document.querySelector('.CodeMirror').CodeMirror; const r = cm.charCoords({ line: 0, ch: 22 }, 'window'); return { x: r.left + 1, y: (r.top + r.bottom) / 2 }; });
    await p.mouse.click(inCall.x, inCall.y);
    await p.waitForTimeout(250);
    check(await p.$eval('#sig', (e) => e.hidden), `${theme}: clicking into a call doesn't open parameter hints`);
    await p.evaluate(() => { const cm = document.querySelector('.CodeMirror').CodeMirror; cm.focus(); cm.setCursor({ line: 0, ch: 41 }); });
    await p.keyboard.type(',');
    await p.waitForTimeout(250);
    check(!(await p.$eval('#sig', (e) => e.hidden)), `${theme}: typing , in a call opens parameter hints`);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(100);
    check(await p.$eval('#sig', (e) => e.hidden), `${theme}: Escape closes parameter hints`);
    await p.evaluate((c) => document.querySelector('.CodeMirror').CodeMirror.setValue(c), codeBefore);
    await p.waitForTimeout(600);
    // Reports (reportflow.ts): "This check is wrong" on a problem opens the dialog with the check filled in and the
    // flagged line shown (nothing is sent); a Docs search with no results offers "Ask for this to be documented".
    {
      const before = await p.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue());
      await p.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.setValue('Game.GUID = "Demo";\nGame.GameName = "Demo";\nGame.ExecutableName = "demo.exe";\nGame.Hook.ForceFocuss = true;\n'));
      await p.waitForTimeout(700);
      await p.click('[role=tab][data-tab=problems]');
      await p.click('#problems .ptoggle');
      await p.click('#problems [data-wrong]');
      await p.waitForSelector('#report-dialog[open]');
      check((await p.textContent('#report-dialog .rf-pre')).trim() === 'Game.Hook.ForceFocuss = true;' && /Rule: unknown-member/.test(await p.textContent('#rf-block')), `${theme}: This check is wrong shows the flagged line and the check before anything is sent`);
      await axe(p, `${theme}: the report dialog`);
      await p.keyboard.press('Escape');
      await p.evaluate((c) => document.querySelector('.CodeMirror').CodeMirror.setValue(c), before);
      await p.waitForTimeout(700);
    }
    await p.click('[role=tab][data-tab=api]');
    await p.fill('#api-q', 'zzqq no such thing');
    await p.waitForTimeout(400);
    check(await p.isVisible('[data-report-docs]'), `${theme}: a Docs search with no results offers Ask for this to be documented`);
    await p.fill('#api-q', 'Game.PlayersPerInstance');
    await p.waitForTimeout(400);
    check((await p.$$('#api-results pre.doc-code.hl .cm-number')).length > 0, `${theme}: Docs shows its example coloured like the code`);
    check(/docs\/Game\.PlayersPerInstance\/$/.test((await p.getAttribute('#api-results .api-page a', 'href')) ?? ''), `${theme}: Docs' Open as a page leads to that name's docs page`);
    // The full entry, for handler authors: "How handlers use it" folded, the engines as one line with no numbers, votes
    // without counts (the counts, the basis and the counted "By engine" line are on the docs pages).
    await p.fill('#api-q', 'Context.EditRegKey');
    await p.waitForTimeout(400);
    const entry = (await p.textContent('#api-results .dc').catch(() => '')) ?? '';
    check(/More common in: Unity/.test((await p.textContent('#api-results .dc-engine').catch(() => '')) ?? '') && !/By engine:|Counted from/.test(entry), `${theme}: Docs shows the engines as one line, with no numbers or basis`);
    check((await p.$$('#api-results details.dc-practice:not([open]) > summary')).length === 1 && /How handlers use it/.test(entry), `${theme}: Docs folds "How handlers use it"`);
    // A search: short results, each with Open full doc, which opens the entry (Enter works).
    await p.fill('#api-q', 'keyboard');
    await p.waitForTimeout(400);
    check((await p.$$('#api-results .api-hit .api-open a[data-open]')).length > 3 && (await p.$$('#api-results .api-hit .doc-code, #api-results .api-hit details')).length === 0, `${theme}: Docs search shows short results with Open full doc`);
    await p.focus('#api-results .api-hit .api-open a');
    await p.keyboard.press('Enter');
    await p.waitForTimeout(400);
    // The doc's own vote line (the one in "How handlers use it" is folded away), and the keyboard on the entry's heading.
    check(await p.isVisible('#api-results .dc:not(.hit) .dc-check:has(button[data-vkind="doc"])') && (await p.evaluate(() => document.activeElement?.matches('#api-results article.api > h3'))), `${theme}: Enter on Open full doc opens the whole entry and moves focus to it`);
    // Insert into handler, twice: the second press shows it instead of adding a second copy (an example of two statements).
    {
      const cmText = () => p.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue());
      const was = await cmText();
      await p.fill('#api-q', 'Context.ReplaceLinesInTextFile');
      await p.waitForTimeout(400);
      const ins = '#api-results [data-insert="Context.ReplaceLinesInTextFile"]';
      await p.click(ins);
      await p.waitForTimeout(300);
      const label = await p.textContent(ins);
      await p.click(ins);
      await p.waitForTimeout(300);
      const cfgs = ((await cmText()).match(/var cfg\b/g) ?? []).length;
      check(label === 'Show in handler' && cfgs === 1, `${theme}: Insert into handler, pressed again, shows the example instead of adding it twice (${label}, ${cfgs}× var cfg)`);
      await p.evaluate((t) => document.querySelector('.CodeMirror').CodeMirror.setValue(t), was);
      await p.waitForTimeout(300);
    }
  }
  check(!errors.length, `${theme}: no page errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
  await ctx.close();

  // The start page: screenshots in the theme, links, accessibility.
  const s = await page(theme);
  await s.p.goto(BASE + 'start/');
  await s.p.evaluate(() => document.querySelectorAll('img').forEach((i) => (i.loading = 'eager')));
  await s.p.waitForTimeout(1500);
  // The gallery: both halves load; a view, a tool and a look switch the pictures; the slider moves the seam.
  const halves = () => s.p.$$eval('.ba img', (l) => l.map((i) => [i.currentSrc.split('/').pop(), i.naturalWidth]));
  let h = await halves();
  check(h.length === 2 && h[0][0].endsWith('-light.webp') && h[1][0].endsWith('-dark.webp') && h.every(([, w]) => w > 0), `${theme}: start page gallery shows the light and the dark screenshot (${h.map((x) => x[0]).join(', ')})`);
  await s.p.click('.ba-next');
  await s.p.waitForTimeout(500);
  h = await halves();
  check(h.every(([f, w]) => /^workbench-suggestions-/.test(f) && w > 0) && /^2 of /.test(await s.p.textContent('.g-cap')), `${theme}: start page gallery: › goes to the next view, light and dark together (${h.map((x) => x[0]).join(', ')})`);
  await s.p.click('.g-views button:last-child'); // Looks
  await s.p.click('.g-looks button:nth-child(3)'); // Mac
  await s.p.waitForTimeout(500);
  h = await halves();
  check(h.every(([f, w]) => /^workbench-look-mac-/.test(f) && w > 0), `${theme}: start page gallery: the looks switch the pictures (${h.map((x) => x[0]).join(', ')})`);
  await s.p.click('.g-tabs button:last-child');
  await s.p.waitForTimeout(500);
  h = await halves();
  check(h.every(([f, w]) => /^notepadpp-/.test(f) && w > 0) && (await s.p.isHidden('.g-looks')), `${theme}: start page gallery: another tool, its own views`);
  await s.p.focus('.ba-range');
  for (let i = 0; i < 5; i++) await s.p.keyboard.press('ArrowLeft');
  check((await s.p.$eval('.ba-frame', (e) => e.style.getPropertyValue('--pos'))) === '45%', `${theme}: start page gallery: the arrow keys move the slider`);
  check((await s.p.getAttribute('.ctas a.btn.primary', 'href')) .replace(/\?ref=[\w.-]+(#[\w-]+)?$/, '').replace(/index\.html$/, '') === '../', `${theme}: the start page links to its own workbench (by its file in a preview: some hosts don't serve ../)`);
  await axe(s.p, `${theme}, start page`);
  check(!s.errors.length, `${theme}: start page has no page errors`);
  // The tools page: a tile per tool that leads to its setup page in the docs, where the downloads and the steps are;
  // old links to a tool's steps on this page lead on to that page.
  await s.p.goto(BASE + 'tools/');
  await s.p.waitForTimeout(600);
  const tiles = await s.p.$$eval('.tool-grid a', (a) => a.map((x) => x.getAttribute('href')));
  check(tiles.length === 6 && ['vscode', 'notepadpp', 'lsp', 'ncdev'].every((t) => tiles.includes(`../docs/tools/${t}/setup/`)), `${theme}: tools page: a tile per tool, each to its setup page (${tiles.join(', ')})`);
  await axe(s.p, `${theme}, tools page`);
  // The setup pages hand out the files: the .vsix and ncdev, from GitHub.
  const dls = [];
  for (const [page, asset] of [['vscode', 'vsix'], ['notepadpp', 'ncdev.exe'], ['ncdev', 'ncdev-linux-x64']]) {
    await s.p.goto(BASE + `docs/tools/${page}/setup/`);
    dls.push(await s.p.$eval(`a[data-asset="${asset}"]`, (x) => x.getAttribute('href')).catch(() => `no ${asset} link on ${page}`));
  }
  check(dls.every((h) => /^https:\/\/github\.com\//.test(h)), `${theme}: the setup pages link the .vsix and ncdev (${dls.join(', ')})`);
  check(!(await s.p.content()).includes('__NCDEV'), `${theme}: a setup page has no placeholder left in it`);
  for (const [old, to] of [['start/#get-notepadpp', 'docs/tools/notepadpp/setup/'], ['tools/#get-vscode', 'docs/tools/vscode/setup/'], ['tools/#setup-helix', 'docs/tools/lsp/setup/'], ['tools/#command-line', 'docs/tools/ncdev/setup/']]) {
    await s.p.goto(BASE + old);
    await s.p.waitForURL((u) => u.pathname.endsWith('/' + to), { timeout: 4000 }).catch(() => {});
    check(new URL(s.p.url()).pathname.endsWith('/' + to), `${theme}: the old link ${old} leads to ${to} (${s.p.url()})`);
  }
  await checkAiGuide(s, theme);
  // Every page has the way home (the brand) and to the workbench in its header.
  for (const u of ['start/', 'tools/', 'ai/', 'docs/', 'docs/Game.Play/', 'rules/', 'rules/syntax-error/', 'learn/']) {
    await s.p.goto(BASE + u);
    const nav = await s.p.evaluate(() => ({ home: [...document.querySelectorAll('header a, .top a, nav a')].some((a) => /\/start\/$/.test(a.href)), wb: [...document.querySelectorAll('header a, .top a, nav a')].some((a) => a.textContent.trim() === 'Workbench') }));
    check(nav.home && nav.wb, `${theme}: ${u} links home and to the workbench from its header`);
  }
  check(!s.errors.length, `${theme}: tools page and the headers: no page errors ${s.errors.join(' ')}`);
  await s.ctx.close();
});

// A phone
section('phone', async () => {
const m = await page('dark', { ...devices['Pixel 7'] });
await m.p.goto(BASE + '#example-mistakes');
await m.p.waitForSelector('.CodeMirror');
await m.p.waitForTimeout(1200);
check((await count(m.p)) > 0, 'phone: Check works');
await axe(m.p, 'phone');
await m.p.tap('.switch button[data-view=code]');
await m.p.waitForTimeout(300);
check(await m.p.isVisible('.CodeMirror'), 'phone: the Handler view shows the code');
await m.p.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.setValue('Game.GUID = "Demo";\nGame.GameName = "Demo";\nGame.ExecutableName = "demo.exe";\nGame.Description = "Java version only. If you use multiple keyboards and mice, set the input in the options first, then start the game.";\n'));
await m.p.waitForTimeout(800);
await m.ctx.close();
});

// Help test the beta: pin a task, and it floats over the workbench while you test (testpins.ts).
section('test pins', async () => {
  const s = await page('light', { viewport: { width: 1440, height: 900 } });
  await s.ctx.addInitScript(() => {
    try {
      localStorage.setItem('nucleus-workbench-tester-profile', JSON.stringify({ coding: 'dev', nucleus: 'expert' }));
      // A handler open (a first visit starts on the home page, without the code editor this corner belongs to).
      if (!localStorage.getItem('nucleus-workbench-draft')) localStorage.setItem('nucleus-workbench-draft', 'Game.GUID = "Pins";\n');
    } catch {}
  });
  await s.p.goto(BASE);
  await s.p.waitForTimeout(600);
  await s.p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  check(await s.p.isHidden('#test-pins'), 'pinned tasks: nothing on screen until something is pinned');
  await s.p.click('#test-open');
  await s.p.waitForTimeout(300);
  const first = await s.p.$eval('#test-body .tg-pin', (b) => b.getAttribute('data-pin'));
  await s.p.click('#test-body .tg-pin');
  check((await s.p.getAttribute('#test-body .tg-pin', 'aria-pressed')) === 'true', 'pinned tasks: Pin says it is pinned');
  check(await s.p.isVisible(`#tg-pinned input[data-id="${first}"]`), 'pinned tasks: also listed on top of the guide');
  await s.p.click(`#tg-pinned [data-goto="${first}"]`);
  check(await s.p.evaluate((id) => { const a = document.activeElement; return a?.dataset.id === id && !a.closest('#tg-pinned'); }, first), 'pinned tasks: its name there goes to its card in the list');
  await s.p.click('#test-close');
  await s.p.waitForTimeout(200);
  check(await s.p.isVisible(`#test-pins [data-toggle="${first}"]`), 'pinned tasks: the task floats over the workbench');
  check(await s.p.isVisible('#test-pins .tf-body'), 'pinned tasks: the first one shows what to try');
  await s.p.click(`#test-pins [data-toggle="${first}"]`);
  check(await s.p.isHidden('#test-pins .tf-body'), 'pinned tasks: closing the only open task keeps it closed');
  await s.p.click(`#test-pins [data-toggle="${first}"]`);
  const inCorner = () => s.p.evaluate(() => {
    const b = document.querySelector('#test-pins').getBoundingClientRect(), e = document.querySelector('#editor').getBoundingClientRect();
    return b.left >= e.left && b.right <= e.right && b.bottom <= e.bottom && e.right - b.right < 40 && e.bottom - b.bottom < 40;
  });
  check(await inCorner(), 'pinned tasks: starts in the code editor\'s bottom-right corner');
  await axe(s.p, 'light, pinned tasks');
  await s.p.check(`#test-pins input[data-done="${first}"]`);
  await s.p.click('#test-open');
  await s.p.waitForTimeout(200);
  check(await s.p.isChecked(`#test-body input[data-id="${first}"]`), 'pinned tasks: a tick there shows in the guide');
  await s.p.click('#test-close');
  const before = await s.p.$eval('#test-pins', (e) => e.getBoundingClientRect().left);
  const h = await s.p.$eval('#test-pins .tf-title', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; });
  await s.p.mouse.move(h.x, h.y);
  await s.p.mouse.down();
  await s.p.mouse.move(h.x - 300, h.y - 200, { steps: 6 });
  await s.p.mouse.up();
  const dragged = await s.p.$eval('#test-pins', (e) => e.getBoundingClientRect().left);
  check(dragged < before - 250, 'pinned tasks: drag the header to move it');
  await s.p.focus('#test-pins .tf-grip');
  await s.p.keyboard.press('ArrowRight');
  check((await s.p.$eval('#test-pins', (e) => e.getBoundingClientRect().left)) > dragged + 10, 'pinned tasks: the arrow keys move it too');
  await s.p.dblclick('#test-pins .tf-title');
  check(await inCorner(), 'pinned tasks: double-click the header puts it back in the corner');
  await s.p.click('#test-pins .tf-fold');
  check(await s.p.isHidden('#test-pins .tf-list'), 'pinned tasks: collapse to the header');
  await s.p.reload();
  await s.p.waitForTimeout(600);
  await s.p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  check((await s.p.isVisible('#test-pins')) && (await s.p.isHidden('#test-pins .tf-list')), 'pinned tasks: still there, and still collapsed, after a reload');
  await s.p.click('#test-pins .tf-fold');
  await s.p.click(`#test-pins [data-unpin="${first}"]`);
  check(await s.p.isHidden('#test-pins'), 'pinned tasks: unpinning the last one hides the window');
  check(!s.errors.length, `pinned tasks: no page errors ${s.errors.join(' ')}`);
  await s.ctx.close();
});
section('docs pages', async () => {
  // The docs as pages: the site header, the page, the votes (kept in the browser, pressed state shown) and the
  // report link; axe in light and dark; nothing cut off on a phone.
  for (const theme of ['light', 'dark']) {
    const s = await page(theme);
    await s.p.goto(BASE + 'docs/Context.ModifySaveFile/');
    check(await s.p.isVisible('.site-nav a[aria-current="page"]') && /Context\.ModifySaveFile/.test(await s.p.textContent('main h1')), `docs page ${theme}: header and the name`);
    check(/By engine: [^.]*Source games/.test(await s.p.textContent('main')), `docs page ${theme}: "By engine" under "In practice"`);
    await s.p.click('.doc-fb [data-vote=down]');
    check((await s.p.getAttribute('.doc-fb [data-vote=down]', 'aria-pressed')) === 'true' && /Thanks/.test(await s.p.textContent('.doc-fb-thanks')), `docs page ${theme}: a vote shows as pressed, with thanks`);
    check(/doc-review/.test(await s.p.getAttribute('.doc-fb a', 'href')), `docs page ${theme}: the report link opens the doc review form`);
    await s.p.waitForSelector('#dn-list details');
    check(await s.p.isVisible('#dn-list a[aria-current]'), `docs page ${theme}: the drawer lists the docs, this page marked`);
    await s.p.fill('.dn-filter', 'save file');
    await s.p.waitForTimeout(200);
    check((await s.p.$$('#dn-list .hit')).length > 0 && /ModifySaveFile/.test(await s.p.textContent('#dn-list .hit')), `docs page ${theme}: the filter finds names by name and by words, the name first`);
    await axe(s.p, `${theme}, docs page`);
    await s.p.goto(BASE + 'docs/');
    await axe(s.p, `${theme}, docs list`);
    // Tools in the docs (tool-docs.mjs): a group per tool in the list, with an overview, a setup page and reference
    // pages whose tables are made from the tools' own data.
    await s.p.goto(BASE + 'docs/tools/ncdev/commands/');
    await s.p.waitForTimeout(300);
    const td = await s.p.evaluate(() => ({ rows: document.querySelectorAll('main table tbody tr').length, lint: /lint <file\|dir>/.test(document.querySelector('main table')?.textContent ?? ''), sec: [...document.querySelectorAll('#dn-list .dn-sec > details > summary')].map((x) => x.textContent).join(), current: document.querySelector('#dn-list [aria-current]')?.textContent, group: document.querySelector('#dn-list [aria-current]')?.closest('details')?.querySelector('summary')?.firstChild?.textContent, kinds: [...(document.querySelector('#dn-list [aria-current]')?.closest('ul')?.querySelectorAll('a') ?? [])].map((a) => a.textContent).join() }));
    check(td.rows > 15 && td.lint && /Tools/.test(td.sec) && td.current === 'Commands' && td.group === 'ncdev' && td.kinds === 'Overview,Setup,Commands,Options', `docs tools ${theme}: ncdev's commands page lists the commands, under ncdev in the Tools section (${JSON.stringify(td)})`);
    await axe(s.p, `${theme}, docs tools page`);
    await s.p.goto(BASE + 'docs/tools/mcp/tools/');
    check((await s.p.$$('main h2 code')).length >= 10, `docs tools ${theme}: the MCP page lists the server's tools`);
    // A tool's overview starts with what the tool is and its facts, and ends with one short Related list. Its
    // setup is a page of its own: what you need, the steps, how to see that it worked.
    await s.p.goto(BASE + 'docs/tools/mcp/');
    const rp = await s.p.evaluate(() => ({ lead: !!document.querySelector('main > .lead, main .lead'), facts: document.querySelectorAll('main .facts > div').length, setup: !!document.querySelector('main .facts a[href$="mcp/setup/"]'), related: document.querySelectorAll('#related + ul li').length, when: !!document.querySelector('#when') }));
    check(rp.lead && rp.facts >= 3 && rp.setup && rp.related >= 1 && rp.related <= 3 && !rp.when, `docs tools ${theme}: the MCP page starts with what it is and its facts, links its setup page, and ends with a short Related list (${JSON.stringify(rp)})`);
    await s.p.goto(BASE + 'docs/tools/notepadpp/setup/');
    const su = await s.p.evaluate(() => ({ heads: [...document.querySelectorAll('main h2')].map((h) => h.textContent).join('|'), steps: document.querySelectorAll('#steps + ol li').length, current: document.querySelector('#dn-list [aria-current]')?.textContent }));
    check(/^Before you start\|Steps\|Check that it works/.test(su.heads) && su.steps >= 3, `docs tools ${theme}: a setup page goes what you need, the steps, the check (${JSON.stringify(su)})`);
    await axe(s.p, `${theme}, setup page`);
    await s.p.goto(BASE + 'docs/tools/');
    const ti = await s.p.evaluate(() => ({ tools: document.querySelectorAll('.dg-core .dg-row a').length, engine: !!document.querySelector('.dg-engine'), flow: document.querySelectorAll('.dg-flow li').length, rows: document.querySelectorAll('#the-tools + table tbody tr').length, setups: document.querySelectorAll('#the-tools + table td:last-child a').length }));
    check(ti.tools === 6 && ti.engine && ti.flow >= 5 && ti.rows === 6 && ti.setups === 6, `docs tools ${theme}: the index has every tool in one table with its setup, the tools around the engine and a handler's path (${JSON.stringify(ti)})`);
    await axe(s.p, `${theme}, docs tools index`);
    // The workbench's pages: the labelled screenshot (a number on each part, inside the picture, the same numbers
    // in the list below, each part's name leading to its page), in the page's theme.
    await s.p.goto(BASE + 'docs/tools/workbench/');
    await s.p.waitForTimeout(300);
    const wm = await s.p.evaluate(() => {
      const frame = document.querySelector('.map-frame').getBoundingClientRect();
      const pins = [...document.querySelectorAll('.map-pin')];
      const shown = [...document.querySelectorAll('.map-frame img')].filter((i) => i.getClientRects().length);
      return {
        pins: pins.length, legend: document.querySelectorAll('.map-legend > li').length,
        inside: pins.every((p) => { const r = p.getBoundingClientRect(); return r.left >= frame.left && r.right <= frame.right && r.top >= frame.top && r.bottom <= frame.bottom; }),
        targets: pins.every((p) => document.querySelector(p.getAttribute('href'))),
        shown: shown.map((i) => i.className).join(','), loaded: shown.every((i) => i.complete && i.naturalWidth > 0),
        pages: new Set([...document.querySelectorAll('.map-legend > li strong a')].map((a) => a.getAttribute('href'))).size, facts: document.querySelectorAll('main .facts > div').length,
      };
    });
    check(wm.pins >= 8 && wm.pins === wm.legend && wm.inside && wm.targets && wm.shown === `th-${theme}` && wm.loaded && wm.pages >= 4 && wm.facts >= 3, `docs tools ${theme}: the workbench page's labelled screenshot has a number on each part and its line below (${JSON.stringify(wm)})`);
    await axe(s.p, `${theme}, workbench guide`);
    await s.p.click('.map-pin');
    check(await s.p.evaluate(() => !!document.querySelector('.map-legend > li:target')), `docs tools ${theme}: a number on the screenshot leads to its line`);
    await s.p.goto(BASE + 'docs/tools/workbench/check/');
    await s.p.waitForSelector('#dn-list [aria-current]', { timeout: 5000 }).catch(() => {});
    const gp =await s.p.evaluate(() => ({ lead: !!document.querySelector('main .lead'), shots: document.querySelectorAll('main .shot .ba-frame').length, slider: (() => { const r = document.querySelector('main .ba-range'); if (!r) return ''; r.value = '20'; r.dispatchEvent(new Event('input', { bubbles: true })); return r.parentNode.style.getPropertyValue('--pos'); })(), keys: document.querySelectorAll('main kbd').length, levels: document.querySelectorAll('#severity + table tbody tr').length, related: document.querySelectorAll('#related + ul li').length, repeats: document.querySelectorAll('#keys, #tips, .guide-nav').length, current: document.querySelector('#dn-list [aria-current]')?.textContent }));
    check(gp.lead && gp.shots === 2 && gp.slider === '20%' && gp.keys >= 4 && gp.levels === 3 && gp.related >= 1 && gp.related <= 3 && gp.repeats === 0 && gp.current === 'Check', `docs tools ${theme}: a workbench page says what the part is, with its screenshots (light and dark, a slider between them) and its keys where they're used, and has no key table or tips list of its own (${JSON.stringify(gp)})`);
    await axe(s.p, `${theme}, workbench guide page`);
    await s.p.goto(BASE + 'docs/tools/#what-each-tool-can-do');
    const ed = await s.p.evaluate(() => ({ cols: document.querySelectorAll('table.compare thead th').length, rows: document.querySelectorAll('table.compare tbody tr').length }));
    check(ed.cols === 5 && ed.rows >= 15, `docs tools ${theme}: the Tools page compares every feature by tool (${JSON.stringify(ed)})`);
    await axe(s.p, `${theme}, Tools page with the comparison`);
    await s.p.goto(BASE + 'docs/tools/lsp/setup/');
    const ls = await s.p.evaluate(() => ({ tested: document.querySelectorAll('#how-far-each-editor-is-tested + table tbody tr').length, editors: [...document.querySelectorAll('main h2')].filter((h) => /Neovim|Helix|Emacs/.test(h.textContent)).length, code: document.querySelectorAll('main pre[data-lang]').length }));
    check(ls.tested >= 5 && ls.editors >= 3 && ls.code >= 4, `docs tools ${theme}: the other editors' setup page has a section per editor and how far each is tested (${JSON.stringify(ls)})`);
    await axe(s.p, `${theme}, other editors setup page`);
    await s.p.goto(BASE + 'docs/tools/vscode/');
    check(await s.p.evaluate(() => !!document.querySelector('main video[poster]') && [...document.querySelectorAll('main .shot img')].filter((i) => i.getClientRects().length).length >= 3), `docs tools ${theme}: the VS Code page shows its video and screenshots`);
    await axe(s.p, `${theme}, VS Code tool page`);
    check(!s.errors.length, `docs page ${theme}: no page errors ${s.errors.join(' ')}`);
    await s.ctx.close();
  }
  const ph = await page('light', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  for (const u of ['docs/Context.ModifySaveFile/', 'rules/', 'rules/syntax-error/', 'start/', 'tools/', 'ai/', 'docs/tools/ncdev/', 'docs/tools/vscode/', 'docs/tools/', 'docs/tools/workbench/', 'docs/tools/workbench/settings/', 'docs/tools/workbench/shortcuts/', 'docs/tools/vscode/commands/', 'docs/tools/lsp/', 'docs/tools/lsp/setup/', 'docs/tools/notepadpp/setup/', 'docs/tools/mcp/']) {
    await ph.p.goto(BASE + u);
    const wide = await ph.p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(wide <= 1, `phone ${u}: no sideways scrolling, header included (${wide}px)`);
  }
  await ph.ctx.close();
});
section('results pane and Zen mode', async () => {
  // A wide code editor: Ctrl+J hides the results pane and brings it back (kept after a reload); Zen mode (Ctrl+K Z) hides
  // everything but the code, and Esc twice leaves it, but not an Esc that closes the suggestion list.
  const s = await page('dark');
  await s.p.goto(BASE + '#example-mistakes');
  await s.p.waitForSelector('.CodeMirror');
  await s.p.waitForTimeout(900);
  await s.p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  const vis = (sel) => s.p.evaluate((q) => { const e = document.querySelector(q); return !!e && e.getClientRects().length > 0; }, sel);
  // The pane's button is a shelf in one corner: where it hides the pane, the same corner brings it back. The tab row
  // under it never grows a scrollbar of its own on the side.
  const corner = (sel) => s.p.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.right), Math.round(r.top), Math.round(r.height)]; });
  const hideAt = await corner('#results-hide');
  const headY = await s.p.$eval('.pane.side > .pane-head', (e) => getComputedStyle(e).overflowY);
  check(headY === 'hidden', `layout: the results tabs have no scrollbar on the side (${headY})`);
  await s.p.click('.CodeMirror');
  await s.p.keyboard.press('Control+J');
  await s.p.waitForTimeout(200);
  const showAt = await corner('#results-show');
  check(String(hideAt) === String(showAt), `layout: the Results button stays in the same corner, pane in or out (${hideAt} | ${showAt})`);
  check(!(await vis('.main > .pane.side')) && (await vis('#results-show')), 'layout: Ctrl+J hides the results pane and shows the Results button');
  await s.p.reload();
  await s.p.waitForSelector('.CodeMirror');
  await s.p.waitForTimeout(900);
  await s.p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  check(!(await vis('.main > .pane.side')), 'layout: the results pane stays hidden after a reload');
  await axe(s.p, 'dark, results pane hidden');
  await s.p.click('#results-show');
  await s.p.waitForTimeout(200);
  check(await vis('.main > .pane.side'), 'layout: the Results button brings the results pane back');
  await s.p.click('.CodeMirror');
  const code = await s.p.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue());
  await s.p.keyboard.press('Control+K');
  await s.p.keyboard.press('z');
  await s.p.waitForTimeout(300);
  const zen = await s.p.evaluate(() => ({ on: document.documentElement.hasAttribute('data-zen'), header: !!document.querySelector('header')?.getClientRects().length, side: !!document.querySelector('.main > .pane.side')?.getClientRects().length }));
  const same = (await s.p.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue())) === code;
  check(zen.on && !zen.header && !zen.side && same, `layout: Ctrl+K Z in the code turns on Zen mode, typing nothing (${JSON.stringify(zen)}, code unchanged: ${same})`);
  await axe(s.p, 'dark, Zen mode');
  await s.p.keyboard.press('Control+Space');
  await s.p.waitForTimeout(250);
  await s.p.keyboard.press('Escape');
  await s.p.keyboard.press('Escape');
  await s.p.waitForTimeout(150);
  check(await s.p.evaluate(() => document.documentElement.hasAttribute('data-zen')), 'layout: an Esc that closes the suggestions doesn\'t count towards leaving Zen mode');
  await s.p.waitForTimeout(700);
  await s.p.keyboard.press('Escape');
  await s.p.keyboard.press('Escape');
  await s.p.waitForTimeout(200);
  check(!(await s.p.evaluate(() => document.documentElement.hasAttribute('data-zen'))) && (await vis('header')), 'layout: Esc twice leaves Zen mode');
  check(!s.errors.length, `layout: no page errors ${s.errors.join(' ')}`);
  await s.ctx.close();
});
section('game folder progress', async () => {
  // Linking the game's folder shows progress: listing, then the program files (n of m), and "Reading your game's
  // files…" in Check until their hints are in; all gone when done. A folder picker that answers slowly stands in.
  const s = await page('light');
  await s.ctx.addInitScript(() => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const file = (name, size, ms) => ({ kind: 'file', name, getFile: async () => (await wait(ms), { name, size, arrayBuffer: async () => (await wait(400), new ArrayBuffer(64)) }) });
    window.showDirectoryPicker = async () => ({
      kind: 'directory', name: 'SlowGame',
      async *values() { yield file('game.exe', 3e6, 500); yield file('a.dll', 2e6, 500); yield file('b.dll', 1e6, 500); yield file('readme.txt', 10, 500); },
    });
  });
  await s.p.goto(BASE + '#example-mistakes');
  await s.p.waitForTimeout(900);
  await s.p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  if (await s.p.$eval('#files-panel', (e) => e.hidden)) await s.p.click('#files-toggle');
  await s.p.waitForTimeout(300);
  await s.p.click('#files-panel [data-gf=pick]');
  await s.p.waitForTimeout(200);
  const listing = await s.p.evaluate(() => ({ text: document.getElementById('gf-prog-text')?.textContent ?? '', bar: !!document.querySelector('#files-panel .fp-prog progress') }));
  check(/Reading SlowGame/.test(listing.text) && listing.bar, `game folder: reading shows progress while listing (${listing.text})`);
  await s.p.waitForTimeout(900);
  const bins = await s.p.evaluate(() => ({ n: document.getElementById('gf-prog-n')?.textContent ?? '', check: document.querySelector('#status .st-reading')?.textContent ?? '' }));
  check(/of 3/.test(bins.n) && /Reading your game/.test(bins.check), `game folder: the program files show n of m, and Check says it's reading them (${bins.n} | ${bins.check})`);
  // Duo pushes the bar (mascotprogress.ts), standing in for it; the <progress> stays for screen readers.
  const duo = await s.p.evaluate(() => { const d = document.querySelector('.fp-duo'); const bar = document.getElementById('gf-prog-bar'); return { duo: !!d?.classList.contains('prog'), fill: d?.querySelector('.ld-fill')?.style.strokeDashoffset ?? '', hidden: bar ? bar.getBoundingClientRect().width <= 1 : false }; });
  check(duo.duo && duo.fill !== '' && duo.hidden, `game folder: Duo pushes the bar while the program files are read (${JSON.stringify(duo)})`);
  await s.p.waitForTimeout(3200);
  const done = await s.p.evaluate(() => ({ prog: !!document.querySelector('.fp-prog'), check: !!document.querySelector('#status .st-reading') }));
  check(!done.prog && !done.check, `game folder: the progress is gone when done (${JSON.stringify(done)})`);
  check(!s.errors.length, `game folder progress: no page errors ${s.errors.join(' ')}`);
  await s.ctx.close();
});
section('game folder cancel', async () => {
  // Cancelling while the program files are read: no success to show, so Duo doesn't finish the bar and hop; the
  // progress just goes.
  const s = await page('light');
  await s.ctx.addInitScript(() => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const file = (name, size) => ({ kind: 'file', name, getFile: async () => ({ name, size, arrayBuffer: async () => (await wait(500), new ArrayBuffer(64)) }) });
    window.showDirectoryPicker = async () => ({ kind: 'directory', name: 'CancelGame', async *values() { for (let i = 0; i < 8; i++) yield file(`m${i}.dll`, 1e6); } });
  });
  await s.p.goto(BASE + '#example-mistakes');
  await s.p.waitForTimeout(900);
  await s.p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  if (await s.p.$eval('#files-panel', (e) => e.hidden)) await s.p.click('#files-toggle');
  await s.p.waitForTimeout(300);
  await s.p.click('#files-panel [data-gf=pick]');
  await s.p.waitForSelector('.fp-duo', { timeout: 5000 }).catch(() => {});
  await s.p.waitForTimeout(700);
  await s.p.click('#files-panel [data-gf=cancel]');
  await s.p.waitForTimeout(800);
  const after = await s.p.evaluate(() => ({ prog: !!document.querySelector('.fp-prog'), duo: !!document.querySelector('.fp-duo') }));
  check(!after.prog && !after.duo, `game folder: Cancel takes the progress away without Duo finishing the bar (${JSON.stringify(after)})`);
  check(!s.errors.length, `game folder cancel: no page errors ${s.errors.join(' ')}`);
  await s.ctx.close();
});
section('game folder two reads', async () => {
  // Two reads at once (a second folder picked while the first's program files are still being read): the label names
  // the newest read, the one Cancel stops; after Cancel the first read shows again and runs to its end.
  const s = await page('light');
  await s.ctx.addInitScript(() => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const file = (name, size) => ({ kind: 'file', name, getFile: async () => ({ name, size, arrayBuffer: async () => (await wait(500), new ArrayBuffer(64)) }) });
    const dir = (name) => ({ kind: 'directory', name, async *values() { for (let i = 0; i < 16; i++) yield file(`m${i}.dll`, 1e6); } });
    let n = 0;
    window.showDirectoryPicker = async () => dir(n++ ? 'SecondGame' : 'FirstGame');
  });
  await s.p.goto(BASE + '#example-mistakes');
  await s.p.waitForTimeout(900);
  await s.p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  if (await s.p.$eval('#files-panel', (e) => e.hidden)) await s.p.click('#files-toggle');
  await s.p.waitForTimeout(300);
  await s.p.click('#files-panel [data-gf=pick]');
  await s.p.waitForTimeout(1300);
  const first = await s.p.evaluate(() => document.getElementById('gf-prog-text')?.textContent ?? '');
  await s.p.click('#files-panel [data-gf=pick]');
  await s.p.waitForTimeout(1300);
  const second = await s.p.evaluate(() => document.getElementById('gf-prog-text')?.textContent ?? '');
  check(/FirstGame/.test(first) && /SecondGame/.test(second), `game folder: with two reads the label names the newest (${first} | ${second})`);
  await s.p.click('#files-panel [data-gf=cancel]');
  await s.p.waitForTimeout(1300);
  const after = await s.p.evaluate(() => document.getElementById('gf-prog-text')?.textContent ?? '');
  check(/FirstGame/.test(after), `game folder: after Cancel the other read shows again (${after})`);
  check(!s.errors.length, `game folder, two reads: no page errors ${s.errors.join(' ')}`);
  await s.ctx.close();
});
section('tabs and package files', async () => {
  // Two tabs with the same code but different package files (pluginsInfo.txt in one): a Check still running when the
  // tab changes is dropped, so each tab shows its own result (the plugin known in one tab, flagged in the other).
  const s = await page('light');
  // Check runs in a worker that answers in order: hold back the answer to the next request (window.__holdNext) so it
  // arrives after the later tab's own, as a slow Check would.
  await s.ctx.addInitScript(() => {
    const W = window.Worker;
    if (!W) return;
    window.Worker = class extends W {
      constructor(...a) {
        super(...a);
        this.__held = new Set();
      }
      postMessage(m, ...r) {
        if (window.__holdNext && m && typeof m.id === 'number') { window.__holdNext = false; this.__held.add(m.id); }
        return super.postMessage(m, ...r);
      }
      set onmessage(f) {
        super.onmessage = (e) => (e.data && this.__held.has(e.data.id) ? setTimeout(() => f.call(this, e), 700) : f.call(this, e));
      }
      get onmessage() { return super.onmessage; }
    };
  });
  await s.p.goto(BASE + '#example-mistakes');
  await s.p.waitForTimeout(900);
  const otherHub = await s.p.evaluate(() => window.HUB_EXAMPLES?.handlers?.[0]?.id ?? null);
  if (otherHub) {
    const CODE = 'Game.GUID = "Plug";\nGame.GameName = "Plug";\nGame.ExecutableName = "plug.exe";\nGame.Play = function () {\n  MyPlug.Run();\n};\n';
    const prep = async () => {
      await s.p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
      await s.p.evaluate((c) => document.querySelector('.CodeMirror').CodeMirror.setValue(c), CODE);
      await s.p.waitForTimeout(900);
    };
    const flagged = async () => /MyPlug/.test(await s.p.innerText('#panel-problems'));
    // Tab A: a Hub handler, with pluginsInfo.txt added to its package.
    await s.p.evaluate((id) => { location.hash = 'hub-' + id; }, otherHub);
    await s.p.waitForTimeout(1500);
    await prep();
    if (await s.p.$eval('#files-panel', (e) => e.hidden)) await s.p.click('#files-toggle');
    await s.p.waitForTimeout(300);
    await s.p.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(['#MyPlug#MyPlug.dll#MyPlug.Main\n'], 'pluginsInfo.txt', { type: 'text/plain' }));
      document.querySelector('#files-panel').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    });
    await s.p.waitForTimeout(900);
    const inA = await flagged();
    // Tab B: the common-mistakes example (no package files), the same code.
    await s.p.evaluate(() => { location.hash = 'example-mistakes'; });
    await s.p.waitForTimeout(900);
    await prep();
    const inB = await flagged();
    check(!inA && inB, `tabs: the same code, pluginsInfo.txt in one tab only: only the other flags the plugin (${inA}, ${inB})`);
    // Start a Check in tab A, and change to tab B before its result is in: tab B keeps its own.
    await s.p.evaluate(() => {
      const ts = [...document.querySelectorAll('#htabs [role=tab]')];
      const on = ts.findIndex((t) => t.getAttribute('aria-selected') === 'true');
      const bId = (window.__tabB = ts[on].dataset.tabId);
      const a = ts.find((t) => t.dataset.tabId !== bId && !t.dataset.file); // tab A: the other handler's handler.js (its package has pluginsInfo.txt)
      a.click();
      window.__holdNext = true;
      document.querySelector('.CodeMirror').CodeMirror.performLint();
      // The tabs are drawn anew on a switch: tab B's element by its id.
      document.querySelector(`#htabs [data-tab-id="${bId}"]`).click();
    });
    await s.p.waitForTimeout(1500);
    const backOnB = await s.p.evaluate(() => document.querySelector('#htabs [aria-selected=true]')?.dataset.tabId === window.__tabB);
    check(backOnB && await flagged(), "tabs: a Check started in the other tab and finished after the switch doesn't replace this tab's result");
  } else say('skip: no Hub handler in this build for the two-tab Check test');
  check(!s.errors.length, `tabs with package files: no page errors ${s.errors.join(' ')}`);
  await s.ctx.close();
});
section('handler tab keys', async () => {
  // Next / Previous tab and Close this tab are shortcuts like the rest (keyactions.ts), so they can't take another
  // shortcut's key: in the code Ctrl+Shift+[ folds (it used to switch handlers), and in Find Alt+W is "whole word" (it
  // used to close the handler too).
  const s = await page('light');
  await s.p.goto(BASE + '#example-mistakes');
  await s.p.waitForSelector('.CodeMirror');
  await s.p.waitForTimeout(900);
  await s.p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  const now = () => s.p.evaluate(() => ({ name: document.querySelector('#doc-name')?.textContent, tabs: document.querySelectorAll('#htabs [role=tab]').length, folded: document.querySelectorAll('.CodeMirror-foldmarker').length, word: document.querySelector('.fw-opt[data-opt=word]')?.getAttribute('aria-pressed') ?? null }));
  const inCode = () => s.p.evaluate(() => { const cm = document.querySelector('.CodeMirror').CodeMirror; cm.focus(); cm.setCursor(cm.getValue().split('\n').findIndex((l) => l.includes('Game.Play')), 5); });
  const start = await now();
  await inCode();
  await s.p.keyboard.press('Control+Shift+BracketLeft');
  await s.p.waitForTimeout(300);
  const folded = await now();
  check(start.tabs >= 2 && folded.name === start.name && folded.folded === 1, `tab keys: Ctrl+Shift+[ in the code folds the block and stays on the handler (${JSON.stringify(folded)})`);
  await s.p.keyboard.press('Control+Shift+BracketRight');
  await s.p.keyboard.press('Alt+PageDown');
  await s.p.waitForTimeout(400);
  const next = await now();
  check(next.name !== start.name && next.tabs === start.tabs, `tab keys: Alt+PageDown goes to the next tab (${next.name})`);
  await s.p.keyboard.press('Alt+PageUp');
  await s.p.waitForTimeout(400);
  check((await now()).name === start.name, 'tab keys: Alt+PageUp goes back');
  await inCode();
  await s.p.keyboard.press('Control+F');
  await s.p.waitForTimeout(300);
  await s.p.keyboard.press('Alt+W');
  await s.p.waitForTimeout(300);
  const find = await now();
  check(find.word === 'true' && find.tabs === start.tabs && find.name === start.name, `tab keys: Alt+W in Find turns on whole word and closes nothing (${JSON.stringify(find)})`);
  await s.p.keyboard.press('Escape');
  await inCode();
  await s.p.keyboard.press('Alt+W');
  await s.p.waitForTimeout(400);
  check((await now()).tabs === start.tabs - 1, 'tab keys: Alt+W in the code closes the tab');
  check(await s.p.evaluate(() => /Next tab/.test(document.querySelector('#help-dialog')?.textContent ?? '')), 'tab keys: they are in the shortcut list');
  check(!s.errors.length, `tab keys: no page errors ${s.errors.join(' ')}`);
  await s.ctx.close();
});
section('word wrap note', async () => {
  // Alt+Z says what happened in the code, with the key as it is bound now (not a fixed "Alt+Z").
  const s = await page('light');
  await s.p.goto(BASE + '#example-mistakes');
  await s.p.waitForSelector('.CodeMirror');
  await s.p.waitForTimeout(900);
  await s.p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  const inCode = () => s.p.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.focus());
  const note = () => s.p.evaluate(() => ({ text: document.querySelector('.code-note .cn-text')?.textContent ?? '', toasts: document.querySelectorAll('.toast').length, wraps: document.querySelector('.CodeMirror').classList.contains('CodeMirror-wrap') }));
  const before = (await note()).wraps;
  await inCode();
  await s.p.keyboard.press('Alt+Z');
  await s.p.waitForTimeout(300);
  const first = await note();
  check(first.wraps !== before && /^Word wrap (on|off): .*\(Alt\+Z turns it (on|off)\)\.$/.test(first.text) && !first.toasts, `word wrap: Alt+Z says so in the code, with its key and no toast (${JSON.stringify(first)})`);
  await s.p.keyboard.press('Control+Comma');
  await s.p.click('#st-keys');
  await s.p.fill('#sp-keys .kb-q', 'word wrap');
  await s.p.click('#sp-keys [data-kb-change="wordWrap"]');
  await s.p.keyboard.press('Control+Shift+Digit9');
  await s.p.keyboard.press('Enter');
  await s.p.keyboard.press('Escape');
  await inCode();
  await s.p.keyboard.press('Control+Shift+Digit9');
  await s.p.waitForTimeout(300);
  const rebound = await note();
  check(rebound.wraps === before && /9 turns it/.test(rebound.text) && !/Alt\+Z/.test(rebound.text), `word wrap: the note names the shortcut as it is bound now (${JSON.stringify(rebound)})`);
  await s.p.keyboard.press('Control+Comma');
  await s.p.click('#st-keys');
  await s.p.fill('#sp-keys .kb-q', 'word wrap');
  await s.p.click('#sp-keys [data-kb-change="wordWrap"]');
  await s.p.click('#sp-keys [data-kb-none="wordWrap"]');
  await s.p.keyboard.press('Escape');
  await s.p.evaluate(() => document.querySelector('#set-wrap')?.closest('dialog')?.close());
  check(!s.errors.length, `word wrap: no page errors ${s.errors.join(' ')}`);
  await s.ctx.close();
});
section('closing handlers', async () => {
  // Every handler can be closed (the × on its folder in Files), the last one too: a new one from the template takes
  // its place (no empty page); Undo brings the closed one back and the untouched template goes.
  const s = await page('light');
  await s.p.goto(BASE + '#example-mistakes');
  await s.p.waitForTimeout(900);
  await s.p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  const tabsNow = () => s.p.$$eval('#htabs [role=tab]', (l) => l.length);
  const handlersNow = () => s.p.$$eval('#files-panel .fp-h', (l) => l.length);
  if (await s.p.$eval('#files-panel', (e) => e.hidden)) await s.p.click('#files-toggle');
  const closeHandler = async (which) => { await s.p.evaluate((q) => document.querySelector(`#files-panel ${q} [data-fp-hclose]`).click(), which); await s.p.waitForTimeout(250); };
  for (let n = await handlersNow(); n > 1; n--) await closeHandler('.fp-h:not(.on)');
  const lastName = await s.p.textContent('#doc-name');
  await closeHandler('.fp-h.on');
  check((await handlersNow()) === 1 && (await tabsNow()) === 1 && (await s.p.isVisible('#main')) && (await s.p.textContent('#doc-name')) === 'My Game.js', 'handlers: closing the last one opens a new one from the template');
  await s.p.click('#notice .notice-action');
  await s.p.waitForTimeout(400);
  check((await handlersNow()) === 1 && (await s.p.textContent('#doc-name')) === lastName, `handlers: Undo brings the last one back, with the untouched template gone (${lastName})`);
  check(!s.errors.length, `handlers: no page errors ${s.errors.join(' ')}`);
  await s.ctx.close();
});
section('files and tabs', async () => {
  // Files lists every open handler as a folder (handler.js, its other files, its game on this PC); the tabs above the
  // code are open files. A tab's × closes the tab and leaves the handler in Files; with every tab closed the code
  // pane says so and brings handler.js back; the tabs are there again after a reload.
  const s = await page('light');
  await s.p.goto(BASE + '#example-mistakes');
  await s.p.waitForSelector('.CodeMirror');
  await s.p.waitForTimeout(900);
  await s.p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  check(await s.p.isVisible('#files-panel'), 'files: the list is open beside the code on a wide screen');
  const now = () => s.p.evaluate(() => ({
    tabs: [...document.querySelectorAll('#htabs .htab-w')].map((t) => `${t.classList.contains('on') ? '*' : ''}${t.querySelector('.ht-name').textContent}`),
    handlers: document.querySelectorAll('#files-panel .fp-h').length,
    current: [...document.querySelectorAll('#files-panel .fp-open[aria-current=true]')].map((b) => b.querySelector('.fp-name').textContent),
    code: !document.querySelector('#editor').hidden, fileEd: !document.querySelector('#file-editor').hidden, card: !document.querySelector('#file-card').hidden,
  }));
  // A file in the open handler's package: it opens in a tab of its own, beside handler.js.
  await s.p.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['[Video]\nWidth=1920\n'], 'config.ini', { type: 'text/plain' }));
    document.querySelector('#files-panel').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await s.p.waitForTimeout(500);
  const withFile = await now();
  check(withFile.tabs.includes('*config.ini') && withFile.tabs.includes('handler.js') && withFile.fileEd && withFile.current.join() === 'config.ini', `files: an added file opens in its own tab (${JSON.stringify(withFile)})`);
  const handlers = withFile.handlers;
  // Each handler has its own "game on this PC" row.
  check((await s.p.$$('#files-panel .fp-h.on [data-gf=pick]')).length === 1 && (await s.p.$$('#files-panel .fp-h:not(.on) .fp-open[data-fp]')).length === 0, "files: the handler in the editor is open, with its own row for the game's folder; the others are shut");
  // Another handler's handler.js, from the list: its tab shows, the file's tab stays.
  if (handlers > 1) {
    // Another handler's folder opens where it is; a click on its handler.js brings it into the editor.
    await s.p.click('#files-panel .fp-h:not(.on) [data-fp-fold]');
    check((await s.p.$$('#files-panel .fp-h:not(.on) .fp-open[data-fp]')).length >= 1 && (await now()).tabs.includes('*config.ini'), 'files: a folder of another handler opens without leaving the file that shows');
    await s.p.click('#files-panel .fp-h:not(.on) .fp-open[data-fp=""]');
    await s.p.waitForTimeout(500);
    const other = await now();
    check(other.code && other.tabs.includes('config.ini') && other.tabs.filter((t) => t.startsWith('*')).join() === '*handler.js', `files: a file of another handler brings that handler into the editor, and the tabs stay (${JSON.stringify(other)})`);
    await s.p.click('#htabs .ftab .htab');
    await s.p.waitForTimeout(500);
    check((await now()).tabs.includes('*config.ini'), "files: a tab of another handler's file brings that handler back with the file showing");
  }
  // Closing tabs: the handlers stay in Files; the last tab leaves a note with the way back.
  for (let n = (await now()).tabs.length; n > 0; n--) { await s.p.click('#htabs .htab-w.on .ht-x', { force: true }); await s.p.waitForTimeout(250); }
  const none = await now();
  check(!none.tabs.length && none.handlers === handlers && none.card && /No file is open/.test(await s.p.innerText('#file-card')), `files: closing every tab leaves the handlers in Files and says no file is open (${JSON.stringify(none)})`);
  await axe(s.p, 'files and tabs, no file open');
  await s.p.click('#file-card [data-card=main]');
  await s.p.waitForTimeout(300);
  const back = await now();
  check(back.code && back.tabs.join() === '*handler.js', `files: Open handler.js brings the code back in a tab (${JSON.stringify(back)})`);
  if (!(await s.p.$('#files-panel .fp-open[data-fp$="config.ini"]'))) { await s.p.click('#files-panel .fp-h:not(.on) [data-fp-fold]'); await s.p.waitForTimeout(400); } // the handler that has it
  await s.p.click('#files-panel .fp-open[data-fp$="config.ini"]');
  await s.p.waitForTimeout(300);
  await s.p.reload();
  await s.p.waitForSelector('#htabs .htab-w'); // a package file may be what shows, so not the code editor
  await s.p.waitForTimeout(900);
  const again = await now();
  check(again.tabs.includes('*config.ini') && again.tabs.includes('handler.js') && again.fileEd, `files: the open tabs and the one that showed are back after a reload (${JSON.stringify(again)})`);
  // Folding a handler's folder; the rail's Files button hides and shows the list.
  await s.p.click('#files-panel .fp-h.on [data-fp-fold]');
  check((await s.p.$$('#files-panel .fp-h.on .fp-open[data-fp]')).length === 0 && (await s.p.getAttribute('#files-panel .fp-h.on [data-fp-fold]', 'aria-expanded')) === 'false', 'files: a handler folds shut');
  await s.p.click('#files-panel .fp-h.on [data-fp-fold]');
  await s.p.click('.rail [data-rail=files]');
  check(!(await s.p.isVisible('#files-panel')) && (await s.p.getAttribute('.rail [data-rail=files]', 'aria-pressed')) === 'false', "files: the rail's Files button hides the list");
  await s.p.reload();
  await s.p.waitForSelector('#htabs .htab-w'); // a package file may be what shows, so not the code editor
  await s.p.waitForTimeout(600);
  check(!(await s.p.isVisible('#files-panel')), 'files: a closed list stays closed after a reload');
  await s.p.click('.rail [data-rail=files]');
  check(await s.p.isVisible('#files-panel'), "files: the rail's Files button shows it again");
  await axe(s.p, 'files and tabs');
  // Open a folder…: <Name>.js with its files in <Name>/ (as "Save as a folder" writes it), and an unpacked package.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-folder-'));
  fs.mkdirSync(path.join(dir, 'one', 'Foo', 'cfg'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'one', 'Foo.js'), 'Game.GameName = "Foo";\n');
  fs.writeFileSync(path.join(dir, 'one', 'Foo', 'cfg', 'config.ini'), '[Video]\nWidth=1\n');
  fs.mkdirSync(path.join(dir, 'pkg', 'Stuff'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'pkg', 'handler.js'), 'Game.GameName = "Pk";\n');
  fs.writeFileSync(path.join(dir, 'pkg', 'Stuff', 'readme.txt'), 'hi\n');
  const group = (name) => s.p.evaluate((n) => { const h = [...document.querySelectorAll('#files-panel .fp-h')].find((x) => x.querySelector('.fp-hrow .fp-name').textContent === n); return h ? [...h.querySelectorAll('.fp-open[data-fp] .fp-name')].map((x) => x.textContent) : null; }, name);
  await s.p.setInputFiles('#folder-input', path.join(dir, 'one'));
  await s.p.waitForTimeout(700);
  check(((await group('Foo')) ?? []).join() === 'handler.js,config.ini' && (await s.p.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue())).includes('"Foo"'), `files: Open a folder reads <Name>.js and the files of its folder (${JSON.stringify(await group('Foo'))})`);
  await s.p.setInputFiles('#folder-input', path.join(dir, 'pkg'));
  await s.p.waitForTimeout(700);
  check(((await group('pkg')) ?? []).join() === 'handler.js,readme.txt', `files: Open a folder reads an unpacked package (${JSON.stringify(await group('pkg'))})`);
  fs.rmSync(dir, { recursive: true, force: true });
  await s.p.click('.rail [data-rail=save]', { button: 'right' });
  check(/As a folder, for another editor/.test(await s.p.innerText('.app-menu')), 'files: Save as offers a folder for another editor');
  await s.p.keyboard.press('Escape');
  // The preview tab, as in VS Code: one click shows a file in it and the next file picked takes it over; a double click
  // keeps the file in a tab of its own. Folders inside a handler fold.
  await s.p.evaluate(() => {
    const dt = new DataTransfer();
    for (const n of ['a.ini', 'b.ini', 'c.ini']) dt.items.add(new File(['[S]\nK=1\n'], n, { type: 'text/plain' }));
    document.querySelector('#files-panel').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await s.p.waitForTimeout(500);
  const names = () => s.p.evaluate(() => [...document.querySelectorAll('#htabs .htab-w')].map((t) => `${t.classList.contains('preview') ? '~' : ''}${t.querySelector('.ht-name').textContent}`));
  const before = (await names()).filter((n) => /^~?[abc]\.ini$/.test(n));
  await s.p.click('#files-panel .fp-h.on .fp-open[data-fp$="b.ini"]');
  await s.p.waitForTimeout(250);
  const oneClick = await names();
  await s.p.click('#files-panel .fp-h.on .fp-open[data-fp$="c.ini"]');
  await s.p.waitForTimeout(250);
  const next = await names();
  check(oneClick.includes('~b.ini') && next.includes('~c.ini') && !next.includes('~b.ini') && !next.includes('b.ini'), `files: one click shows a file in the preview tab, and the next file picked takes that tab over (${before.join()} | ${oneClick.join()} | ${next.join()})`);
  await s.p.dblclick('#files-panel .fp-h.on .fp-open[data-fp$="c.ini"]');
  await s.p.waitForTimeout(250);
  await s.p.click('#files-panel .fp-h.on .fp-open[data-fp$="b.ini"]');
  await s.p.waitForTimeout(250);
  const kept = await names();
  check(kept.includes('c.ini') && kept.includes('~b.ini'), `files: a double click keeps the file's tab, and the next file gets the preview tab (${kept.join()})`);
  await s.p.dblclick('#htabs .htab-w.preview .htab');
  await s.p.waitForTimeout(250);
  check(!(await names()).some((n) => n.startsWith('~')), 'files: a double click on the preview tab keeps it');
  const dirs = await s.p.$$('#files-panel .fp-h.on [data-fp-dir]');
  if (dirs.length) {
    const rowsBefore = (await s.p.$$('#files-panel .fp-h.on .fp-open[data-fp]')).length;
    await dirs[0].click();
    await s.p.waitForTimeout(150);
    const rowsShut = (await s.p.$$('#files-panel .fp-h.on .fp-open[data-fp]')).length;
    await s.p.click('#files-panel .fp-h.on [data-fp-dir]');
    await s.p.waitForTimeout(150);
    check(rowsShut < rowsBefore && (await s.p.$$('#files-panel .fp-h.on .fp-open[data-fp]')).length === rowsBefore, `files: a folder inside a handler folds shut and opens again (${rowsBefore} -> ${rowsShut})`);
  }
  // Download, with several handlers open: one prompt from every button, only its ticks differ. Sharing is one handler.
  const ticks = () => s.p.evaluate(() => ({ open: document.querySelector('#code-dialog').open, title: document.querySelector('#save-h').textContent, all: document.querySelector('#dl-all').checked, on: [...document.querySelectorAll('#dl-items input')].map((i) => i.checked), kinds: !document.querySelector('#dl-kinds').hidden, many: !document.querySelector('#dl-many').hidden }));
  const nHandlers = await s.p.$$eval('#files-panel .fp-h', (l) => l.length);
  if (nHandlers > 1) {
    await s.p.click('.rail [data-rail=save]');
    const fromSave = await ticks();
    check(fromSave.open && fromSave.title === 'Share or download' && fromSave.on.filter(Boolean).length === 1 && !fromSave.all && fromSave.kinds && !fromSave.many, `download: Save opens Share or download, with the handler in the editor ticked and the three kinds to pick from (${JSON.stringify(fromSave)})`);
    await s.p.click('#code-close');
    await s.p.evaluate(() => document.querySelector('#files-panel .fp-h:not(.on) [data-fp-dl]').click());
    const fromFolder = await ticks();
    const which = await s.p.evaluate(() => [...document.querySelectorAll('#files-panel .fp-h')].findIndex((h) => !h.classList.contains('on')));
    check(fromFolder.open && fromFolder.on.filter(Boolean).length === 1 && fromFolder.on[which], `download: a folder's button asks the same, with that handler ticked (${JSON.stringify(fromFolder)})`);
    await s.p.click('#code-close');
    await s.p.evaluate(() => document.querySelector('#files-panel .fp-head [data-fp-dl]').click());
    const fromHead = await ticks();
    check(fromHead.open && fromHead.all && fromHead.on.every(Boolean) && !fromHead.kinds && fromHead.many, `download: the button at the top of Files asks the same, with every handler ticked and one .zip offered (${JSON.stringify(fromHead)})`);
    const [zip] = await Promise.all([s.p.waitForEvent('download'), s.p.click('#dl-many')]);
    const bytes = fs.readFileSync(await zip.path()).toString('latin1');
    check(zip.suggestedFilename() === 'handlers.zip' && (bytes.match(/\.js/g) ?? []).length >= nHandlers, `download: several handlers come as one .zip with a .js each (${zip.suggestedFilename()})`);
    await s.p.click('.rail [data-rail=share]');
    await s.p.waitForTimeout(300);
    const shareTitle = await s.p.textContent('#code-share-h');
    check(/^Share ./.test(shareTitle) && shareTitle !== 'Share', `share: with several handlers open, Share names the one it shares (${shareTitle})`);
    await s.p.keyboard.press('Escape');
  }
  // One handler open: no folders, its files under its name, and tabs without the game beside them.
  while ((await s.p.$$('#files-panel .fp-h')).length > 1) { await s.p.evaluate(() => document.querySelector('#files-panel .fp-h:not(.on) [data-fp-hclose]').click()); await s.p.waitForTimeout(200); }
  const one = await s.p.evaluate(() => ({ folds: document.querySelectorAll('#files-panel [data-fp-fold]').length, title: !!document.querySelector('#files-panel .fp-hrow .fp-title'), rows: document.querySelectorAll('#files-panel .fp-h.on .fp-open[data-fp]').length, of: document.querySelectorAll('#htabs .ht-of').length }));
  check(one.folds === 0 && one.title && one.rows >= 1 && one.of === 0, `files: with one handler open its files show under its name, with no folder to open and plain tabs (${JSON.stringify(one)})`);
  await axe(s.p, 'files and tabs, one handler');
  check((await s.p.$$('#files-panel [data-fp-dl]')).length === 0, 'download: with one handler open, Files has no download buttons (Save saves it)');
  const [single] = await Promise.all([s.p.waitForEvent('download'), s.p.click('.rail [data-rail=save]')]);
  check(!(await s.p.evaluate(() => document.querySelector('#code-dialog').open && !document.querySelector('#code-main').hidden)) && /\.(zip|js|nc)$/.test(single.suggestedFilename()), `download: with one handler open, Save saves it without asking (${single.suggestedFilename()})`);
  await s.p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  // One handler: Share or download has no handler list, and its Download buttons save it.
  await s.p.click('.rail [data-rail=share]');
  await s.p.waitForTimeout(300);
  const oneDlg = await s.p.evaluate(() => ({ list: !document.querySelector('#dl-set').hidden, kinds: [...document.querySelectorAll('#dl-kinds [data-code]')].map((b) => b.dataset.code).join() }));
  check(!oneDlg.list && oneDlg.kinds === 'zip,js,nc', `download: with one handler open, Share or download offers the three kinds and no handler list (${JSON.stringify(oneDlg)})`);
  await axe(s.p, 'share or download');
  const [js] = await Promise.all([s.p.waitForEvent('download'), s.p.click('#code-dialog [data-code=js]')]);
  check(/\.js$/.test(js.suggestedFilename()), `download: The code only saves the .js (${js.suggestedFilename()})`);
  await s.p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  check(!s.errors.length, `files and tabs: no page errors ${s.errors.join(' ')}`);
  await s.ctx.close();
});
section('pane resize', async () => {
  // Dragging the border between the code and the results to the right: it follows the pointer until the results are
  // at their smallest, and stays there. (It used to jump back by a few hundred pixels at that point.)
  const s = await page('light', { viewport: { width: 1440, height: 860 } });
  await s.p.goto(BASE + '#example-mistakes');
  await s.p.waitForSelector('.CodeMirror');
  await s.p.waitForTimeout(700);
  await s.p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  const at = () => s.p.evaluate(() => Math.round(document.querySelector('#split-main').getBoundingClientRect().left));
  const start = await at();
  await s.p.mouse.move(start + 6, 400);
  await s.p.mouse.down();
  const seen = [];
  for (let x = start; x <= 1420; x += 40) { await s.p.mouse.move(x, 400); seen.push(await at()); }
  await s.p.mouse.up();
  const back = seen.findIndex((v, i) => i > 0 && v < seen[i - 1] - 2);
  const right = await s.p.evaluate(() => Math.round(document.querySelector('.main > .pane.side').getBoundingClientRect().width));
  check(back < 0 && seen[seen.length - 1] > start + 150 && right >= 298, `pane resize: the border never jumps back while dragged right (${seen.join(' ')}; results ${right}px)`);
  check(!s.errors.length, `pane resize: no page errors ${s.errors.join(' ')}`);
  await s.ctx.close();
});
section('learn', async () => {
  // Learn (learn/): the intro scene step by step; a lesson ticks when its code is done; Solve; Try it; the test
  // lesson's download; the lesson list; axe in light and dark; nothing cut off on a phone. #learn in the workbench
  // leads there.
  // Chapter 2's id, from the lesson list (it's written once, in lessons.ts' CHAPTERS).
  let CH2 = '';
  for (const theme of ['light', 'dark']) {
    const s = await page(theme, { viewport: { width: 1366, height: 800 } });
    await s.p.goto(BASE + 'learn/#first-handler/why');
    await s.p.waitForTimeout(500);
    const ch2Here = await s.p.evaluate(() => document.querySelectorAll('#drawer-list .d-chapter')[1]?.querySelector('a')?.getAttribute('href')?.replace(/^#/, '').split('/')[0] ?? '');
    check(!!ch2Here && (!CH2 || ch2Here === CH2), `learn ${theme}: chapter 2 is in the lesson list`);
    CH2 ||= ch2Here;
    check(await s.p.isVisible('#scene [data-scene=next]'), `learn ${theme}: the intro starts with one step`);
    for (let i = 0; i < 3; i++) { await s.p.click('#scene [data-scene=next]'); await s.p.waitForTimeout(150); }
    await s.p.waitForTimeout(1200); // the list's fade-in
    check((await s.p.isVisible('#scene .fixes')) && (await s.p.isVisible('#scene [data-scene=go]')), `learn ${theme}: the intro ends with what a handler does`);
    await axe(s.p, `${theme}, learn intro`);
    await s.p.click('#scene [data-scene=go]');
    await s.p.waitForTimeout(400);
    check(/#first-handler\/get-ready$/.test(s.p.url()) && (await s.p.isVisible('.steps')) && !(await s.p.isVisible('.CodeMirror')), `learn ${theme}: then getting ready, steps on their own`);
    await axe(s.p, `${theme}, learn setup`);
    await s.p.click('#next');
    await s.p.waitForTimeout(400);
    check(/#first-handler\/name$/.test(s.p.url()) && !(await s.p.isVisible('#task.ok')), `learn ${theme}: the first code lesson, unfinished`);
    await s.p.evaluate(() => { const cm = document.querySelector('.CodeMirror').CodeMirror; cm.replaceRange('Game.GUID = "SRB2 Tutorial";\nGame.GameName = "SRB2 Tutorial";\n', { line: cm.lastLine(), ch: 0 }); });
    await s.p.waitForTimeout(600);
    check(await s.p.isVisible('#task.ok'), `learn ${theme}: typing the lines ticks the task`);
    await s.p.waitForTimeout(500); // the draft is saved shortly after typing
    await s.p.reload();
    await s.p.waitForTimeout(600);
    check(/SRB2 Tutorial/.test(await s.p.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue())) && (await s.p.isVisible('#task.ok')), `learn ${theme}: typed code is still there after a reload`);
    check(/Nothing wrong so far/.test(await s.p.textContent('#pane')), `learn ${theme}: Check leaves out the lines a lesson soon adds, and says so`);
    await axe(s.p, `${theme}, learn code lesson`);
    await s.p.goto(BASE + 'learn/#first-handler/name');
    await s.p.waitForTimeout(400);
    check(/Nothing wrong so far/.test(await s.p.textContent('#pane')), `learn ${theme}: a handler without its name and exe never reads as loadable`);
    await s.p.goto(BASE + 'learn/#first-handler/game');
    await s.p.waitForTimeout(400);
    check(!(await s.p.isVisible('#checkpoint')), `learn ${theme}: no Nucleus checkpoint before the code works`);
    await s.p.click('#show');
    await s.p.waitForTimeout(600);
    check(await s.p.isVisible('#checkpoint summary'), `learn ${theme}: Try it in Nucleus Co-op, once it works`);
    await s.p.click('#checkpoint summary');
    const [cpd] = await Promise.all([s.p.waitForEvent('download'), s.p.click('#cp-download')]);
    check(cpd.suggestedFilename() === 'Boring Man Tutorial.zip', `learn ${theme}: the checkpoint downloads the handler so far, zipped for Nucleus`);
    await s.p.goto(BASE + 'learn/#first-handler/settings-file');
    await s.p.waitForTimeout(500);
    check(!(await s.p.isVisible('#task.ok')), `learn ${theme}: a lesson starts from its own code, unfinished`);
    await s.p.click('#show');
    await s.p.waitForTimeout(600);
    check((await s.p.isVisible('#task.ok')) && /Fullscreen = "0"/.test(await s.p.textContent('#pane')) && (await s.p.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.offsetParent && getComputedStyle(b).visibility !== 'hidden' && /^\s*Reset\s*$/.test(b.textContent)).length)) === 1 && !(await s.p.evaluate(() => getComputedStyle(document.querySelector('#show')).visibility === 'visible')), `learn ${theme}: the Show me button passes, Try it shows each player's settings, Show me steps aside and there's one Reset`);
    await s.p.click('#reset');
    await s.p.waitForTimeout(500);
    check(!(await s.p.isVisible('#task.ok')) && (await s.p.evaluate(() => getComputedStyle(document.querySelector('#show')).visibility === 'visible')), `learn ${theme}: Reset goes back to the lesson's start, and Show me is back`);
    await s.p.click('#show');
    await s.p.waitForTimeout(600);
    await s.p.selectOption('#try-players', '4');
    await s.p.waitForTimeout(300);
    check((await s.p.$$('#try-out .player')).length === 4, `learn ${theme}: Try it with the players you pick`);
    await s.p.click('#back');
    await s.p.waitForTimeout(300);
    check(/#first-handler\/fullscreen$/.test(s.p.url()), `learn ${theme}: Back`);
    await s.p.goto(BASE + 'learn/#first-handler/test');
    await s.p.waitForTimeout(400);
    const [dl] = await Promise.all([s.p.waitForEvent('download'), s.p.click('#download')]);
    check(dl.suggestedFilename() === 'Boring Man Tutorial.zip', `learn ${theme}: the test lesson downloads the handler, zipped`);
    await axe(s.p, `${theme}, learn test lesson`);
    check((await s.p.isVisible('#drawer-list a[aria-current]')) && (await s.p.$$('#drawer-list a')).length >= 10, `learn ${theme}: the lesson list, open beside the lesson on a wide screen`);
    await axe(s.p, `${theme}, learn lesson list`);
    await s.p.click('#drawer-toggle');
    await s.p.waitForTimeout(300);
    check(!(await s.p.isVisible('#drawer-list a[aria-current]')), `learn ${theme}: the lesson list closes`);
    await s.p.click('#drawer-toggle');
    // Hint: none in a lesson that shows the code to copy (the lesson is the hint), Show me still there; chapter 2's Try
    // it draws each player's window, and its quiz counts the mistakes left apart from the problems.
    await s.p.goto(BASE + `learn/#${CH2}/window-size`);
    await s.p.waitForTimeout(500);
    check(!(await s.p.isVisible('#hint')) && (await s.p.isVisible('#show')), `learn ${theme}: no Hint where the lesson shows the code to copy, Show me still there`);
    await s.p.click('#show');
    await s.p.waitForTimeout(700);
    check((await s.p.$$('#try-out .screen .swin')).length === Number(await s.p.inputValue('#try-players')) && /-w 960 -h (1080|540)/.test(await s.p.textContent('#try-out')) && /Task done/.test(await s.p.textContent('#pane')), `learn ${theme}: chapter 2's Try it shows each window and its arguments`);
    await axe(s.p, `${theme}, learn chapter 2 Try it`);
    await s.p.goto(BASE + `learn/#${CH2}/fix-it`);
    await s.p.waitForTimeout(500);
    check(/0 of 3 mistakes/.test(await s.p.textContent('#pane')), `learn ${theme}: the quiz's task line counts the mistakes`);
    // A fix-it keeps its Hint: folded until asked for, then what's still to do.
    check(!(await s.p.isVisible('.hint-box')) && (await s.p.isVisible('#hint')), `learn ${theme}: Hint is a button in a fix-it, its text hidden until asked for`);
    await s.p.click('#hint');
    await s.p.waitForTimeout(400);
    check((await s.p.textContent('.hint-box')).length > 20 && (await s.p.getAttribute('#hint', 'aria-expanded')) === 'true', `learn ${theme}: Hint says what's missing`);
    await s.p.goto(BASE + `learn/#${CH2}/overview`);
    await s.p.waitForTimeout(400);
    check((await s.p.$$('.ov-list li')).length >= 8 && (await s.p.isVisible('.steps .trouble summary')), `learn ${theme}: chapter 2's overview lists its lessons, and steps say what to do if it doesn't work`);
    await axe(s.p, `${theme}, learn overview`);
    // Optional lessons: tagged in the overview, and skipped in one click. Unverified tips: a quiet report button.
    check((await s.p.$$('.ov-list .opt-tag')).length >= 1 && /optional/.test(await s.p.textContent('.ov-h .muted')), `learn ${theme}: the overview marks the optional lesson and counts its minutes apart`);
    await s.p.click('.steps .trouble summary >> nth=0');
    check(await s.p.isVisible('.rep-btn.unverified'), `learn ${theme}: an unverified tip has "Different for you? Tell us"`);
    await s.p.click('.rep-btn.unverified >> nth=0');
    await s.p.waitForTimeout(300);
    check(await s.p.isVisible('#report-dialog[open]'), `learn ${theme}: "Different for you?" opens the report`);
    await s.p.keyboard.press('Escape');
    await s.p.goto(BASE + `learn/#${CH2}/keyboard-or-controller`);
    await s.p.waitForTimeout(500);
    check(await s.p.isVisible('.optional-note #skip'), `learn ${theme}: the optional lesson invites, with a Skip`);
    await axe(s.p, `${theme}, learn optional lesson`);
    await s.p.click('#skip');
    await s.p.waitForTimeout(400);
    check(/\/fix-it$/.test(s.p.url()), `learn ${theme}: Skip goes past the optional lesson (${s.p.url()})`);
    check(!s.errors.length, `learn ${theme}: no page errors ${s.errors.join(' ')}`);
    await s.ctx.close();
  }
  {
    const s = await page('light', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    for (const width of [390, 360]) {
      await s.p.setViewportSize({ width, height: 844 });
      for (const l of ['first-handler/why', 'first-handler/name', 'first-handler/settings-file', 'first-handler/test', `${CH2}/overview`, `${CH2}/keyboard-or-controller`, `${CH2}/fix-it`]) {
        await s.p.goto(BASE + `learn/#${l}`);
        await s.p.waitForTimeout(400);
        const wide = await s.p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        check(wide <= 0, `learn phone ${width}px ${l}: no sideways scrolling (${wide}px)`);
        // The header: the lesson count whole, and no "›" without a neighbour after it.
        const hdr = await s.p.evaluate(() => {
          const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
          const count = [...document.querySelectorAll('header *')].find((e) => vis(e) && /^\d+ of \d+$/.test(e.textContent.trim()) && !e.children.length);
          const r = count?.getBoundingClientRect();
          const seps = [...document.querySelectorAll('header *')].filter((e) => vis(e) && !e.children.length && e.textContent.trim() === '›');
          const lone = seps.filter((sep) => { let n = sep.nextElementSibling; while (n && !vis(n)) n = n.nextElementSibling; return !n || !n.textContent.trim(); });
          return { count: r ? r.left >= 0 && r.right <= document.documentElement.clientWidth : false, lone: lone.length };
        });
        check(hdr.count && !hdr.lone, `learn phone ${width}px ${l}: the header shows the lesson count whole, no lone ›`);
      }
    }
    check(!s.errors.length, `learn phone: no page errors ${s.errors.join(' ')}`);
    await s.ctx.close();
  }
  {
    const s = await page('light');
    await s.p.goto(BASE + '#learn');
    await s.p.waitForURL(/learn\//, { timeout: 5000 }).catch(() => {});
    check(/\/learn\//.test(s.p.url()), `learn: the workbench's #learn link leads to the lessons (${s.p.url()})`);
    await s.ctx.close();
  }
});
for (const theme of ['light', 'dark']) section(`check pages, ${theme}`, async () => {
  // One page per check, and the list of them: they load, the examples are there, the filter works, accessible.
  const s = await page(theme);
  await s.p.goto(BASE + 'rules/');
  await s.p.fill('.rsearch', 'proto input');
  const shown = await s.p.$$eval('.ruleset li', (l) => l.filter((x) => !x.hidden).length);
  check(shown > 0 && shown < 10, `${theme}: rules list: the filter narrows the list (${shown})`);
  await s.p.fill('.rsearch', '');
  await axe(s.p, `${theme}, rules list`);
  await s.p.click('.ruleset a[href="wrong-arguments/"]');
  await s.p.waitForLoadState();
  check((await s.p.$$('.ex pre')).length === 2 && /wrong number/.test(await s.p.textContent('h1')), `${theme}: a rule's page: its title and both examples`);
  await axe(s.p, `${theme}, a rule's page`);
  check(!s.errors.length, `${theme}: rules pages: no page errors ${s.errors.join(' ')}`);
  await s.ctx.close();
});
section('touch laptop', async () => {
  // A laptop with a touch screen has a real keyboard: a text field getting focus inside a frame (the claude.ai
  // preview) must not shrink the page for an on-screen keyboard that isn't there.
  const s = await page('dark', { viewport: { width: 1600, height: 730 } }); // a mouse (fine pointer) ...
  await s.ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 10 })); // ... and a touch screen
  await s.ctx.addInitScript(() => { try { if (!localStorage.getItem('nucleus-workbench-draft')) localStorage.setItem('nucleus-workbench-draft', 'Game.GUID = "Frame";\n'); } catch {} }); // a handler open, as in the claude.ai preview
  await s.p.setContent(`<style>body{margin:0}</style><iframe src="${BASE}" style="border:0;width:100vw;height:100vh"></iframe>`);
  await s.p.waitForTimeout(1200);
  const f = s.p.frames()[1];
  await f.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  await f.click('#tab-add');
  await f.getByText('Examples and Hub handlers').click();
  await f.focus('#open-dialog input');
  await f.waitForTimeout(1200);
  check(await f.evaluate(() => !document.documentElement.classList.contains('kb-up') && document.querySelector('.app').getBoundingClientRect().height >= innerHeight - 2), 'touch-screen laptop, in a frame: the page keeps its height when a text field gets focus');
  await s.ctx.close();
});
section('phone keyboard', async () => {
  const s = await page('dark', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await s.ctx.addInitScript(() => {
    try {
      localStorage.setItem('nucleus-workbench-tester-profile', JSON.stringify({ coding: 'new', nucleus: 'new' }));
      localStorage.setItem('nucleus-workbench-test-pins', JSON.stringify(['messages']));
    } catch {}
  });
  await s.p.goto(BASE);
  await s.p.waitForTimeout(600);
  const r = await s.p.$eval('#test-pins', (e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, b: b.bottom }; });
  check(r.l >= 0 && r.r <= 390 && r.b <= 844, 'phone: pinned tasks dock at the bottom, inside the screen');
  await s.ctx.close();
});

// Start-up with each general tip first (the first one is random): none may stop the page (a tip's highlight once
// asked for a control declared later in app.ts, and the whole workbench failed to start).
section('tips at start-up', async () => {
  let crashed = 0;
  for (let i = 0; i < 40; i++) {
    const s = await page('light');
    await s.ctx.addInitScript((v) => {
      const r = Math.random;
      let first = true;
      Math.random = () => (first ? ((first = false), v) : r());
    }, (i + 0.5) / 40);
    await s.p.goto(BASE + '#docs');
    await s.p.waitForTimeout(400);
    if (s.errors.length) crashed++;
    await s.ctx.close();
  }
  check(crashed === 0, `start-up with every possible first tip: no page errors (${crashed} of 40 failed)`);
});
// The main button stays readable in every look (light and dark): the looks restyle .btn.
for (const site of ['v3', 'mac', 'alpha8'])
  for (const theme of ['light', 'dark']) section(`look ${site}, ${theme}`, async () => {
    const s = await page(theme);
    await s.ctx.addInitScript((v) => {
      try {
        localStorage.setItem('nucleus-workbench-dev-site', v);
      } catch {}
    }, site);
    await s.p.goto(BASE);
    await s.p.waitForTimeout(500);
    await s.p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
    await s.p.addScriptTag({ content: AXE });
    const bad = await s.p.evaluate(async () => (await axe.run('#code-menu-open, #save-more', { runOnly: ['color-contrast'] })).violations.length);
    check(bad === 0, `${site} look, ${theme}: Save is readable (contrast)`);
    await s.ctx.close();
  });

await runSections();
await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
