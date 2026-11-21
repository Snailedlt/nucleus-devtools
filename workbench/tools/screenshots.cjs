// Takes the workbench screenshots, light and dark: the gallery (start page and README) and the release-note ones.
//   (cd playground/dist/pages && python3 -m http.server 8765) &
//   node tools/screenshots.cjs [http://127.0.0.1:8765/] [--only check,looks]
// Needs Python with Pillow (WebP, and the phone collage). Writes docs/images/gallery/workbench-<view>-light.webp and
// -dark.webp (the start page's gallery and the README; the VS Code and Notepad++ ones are in the repository root's
// docs/images/gallery), and the release-note images under docs/images/changelog/.
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const { chromium, devices } = require('playwright');
const args = process.argv.slice(2);
const onlyAt = args.indexOf('--only');
// --only <names>: just these (comma-separated). Gallery: check, suggestions, try-it, debugger, test-all,
// looks, fix-all, phone. The docs' guide: map. Release notes: lines, whats-new, guide.
const ONLY = onlyAt >= 0 ? args[onlyAt + 1].split(',') : null;
const want = (name) => !ONLY || ONLY.includes(name);
const BASE = args.find((a, i) => !a.startsWith('--') && (onlyAt < 0 || i !== onlyAt + 1)) || 'http://127.0.0.1:8765/';
const IMG = path.join(__dirname, '..', 'docs', 'images');
const GALLERY = path.join(IMG, 'gallery');
const CH = path.join(IMG, 'changelog');
// The docs' guide pictures (docs/tools/workbench/…): the labelled screenshot and its positions.
const GUIDE = path.join(IMG, 'guide');
// A gallery picture: a 960×600 window at 2× (1920×1200), saved as WebP.
const GAL = { viewport: { width: 960, height: 600 }, deviceScaleFactor: 2 };
async function gallery(p, name, theme) {
  const tmp = path.join(os.tmpdir(), `wb-${name}-${theme}.png`);
  await p.screenshot({ path: tmp });
  execFileSync('python3', ['-I', '-c', 'import sys\nfrom PIL import Image\nImage.open(sys.argv[1]).convert("RGB").save(sys.argv[2], "WEBP", quality=82, method=6)', tmp, path.join(GALLERY, `workbench-${name}-${theme}.webp`)]);
  fs.rmSync(tmp, { force: true });
}
const STARDEW = 'LT3wMdrR7gPrKgfzb';

async function open(b, theme, opts, hash, look) {
  const ctx = await b.newContext({ colorScheme: theme, ...opts });
  await ctx.addInitScript(([t, l]) => {
    try {
      localStorage.setItem('nucleus-workbench-welcomed', '1');
      localStorage.setItem('nucleus-workbench-tips', '0');
      localStorage.setItem('nucleus-workbench-news', '0');
      localStorage.setItem('nucleus-workbench-dev-mode', t);
      if (l) localStorage.setItem('nucleus-workbench-dev-site', l);
    } catch {}
  }, [theme, look]);
  const p = await ctx.newPage();
  await p.goto(BASE + (hash ? '#' + hash : ''));
  await p.waitForSelector('.CodeMirror');
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    for (const s of ['#tipbar', '#updated']) { const e = document.querySelector(s); if (e) e.hidden = true; }
    document.querySelectorAll('.toast').forEach((e) => e.remove());
  });
  await p.addStyleTag({ content: '#toasts { display: none !important; }' });
  return { ctx, p };
}
const cmTop = (p, line) => p.evaluate((l) => { const cm = document.querySelector('.CodeMirror').CodeMirror; cm.scrollTo(null, cm.heightAtLine(l, 'local')); }, line);
// Rests the pointer on a word of a line (0-based), as a person would, for its hover.
async function hoverWord(p, line, word) {
  const at = await p.evaluate(([l, w]) => { const cm = document.querySelector('.CodeMirror').CodeMirror; const ch = cm.getLine(l).indexOf(w) + Math.floor(w.length / 2); const c = cm.charCoords({ line: l, ch }, 'window'); return { x: c.left + 2, y: (c.top + c.bottom) / 2 }; }, [line, word]);
  await p.mouse.move(at.x - 6, at.y);
  await p.mouse.move(at.x, at.y, { steps: 4 });
  await p.waitForTimeout(1400);
}
const box = (p, sel) => p.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });

(async () => {
  const b = await chromium.launch();
  // --release-shots: only the release-note screenshots below (the README and start page ones stay).
  if (!process.argv.includes('--release-shots')) for (const t of ['light', 'dark']) {
    // Gallery (start page and README), 960×600 at 2×.
    let ctx, p;
    // Check: the example with common mistakes, a problem's hover with the docs.
    if (want('check')) {
    ({ ctx, p } = await open(b, t, GAL, 'example-mistakes'));
    await hoverWord(p, 16, 'GetFolder');
    await gallery(p, 'check', t);
    await ctx.close();
    }

    // Suggestions as you type, in a verified Hub handler, with the docs beside the list.
    if (want('suggestions')) {
    ({ ctx, p } = await open(b, t, GAL, 'hub-' + STARDEW));
    await cmTop(p, 126);
    await p.evaluate(() => { const cm = document.querySelector('.CodeMirror').CodeMirror; cm.focus(); cm.setCursor(132, 999); });
    await p.keyboard.press('Enter');
    await p.keyboard.type('Context.Mod', { delay: 60 });
    await p.waitForTimeout(1200);
    await p.mouse.move(2, 590);
    await gallery(p, 'suggestions', t);
    await ctx.close();
    }

    // Try it: StardewValley with 4 players.
    if (want('try-it')) {
    ({ ctx, p } = await open(b, t, GAL, 'hub-' + STARDEW));
    await p.click('[role=tab][data-tab=simulate]');
    await p.selectOption('#sim-players', '4');
    await p.waitForTimeout(1200);
    await gallery(p, 'try-it', t);
    await ctx.close();
    }

    // Test all: every player count, input setup and screen size.
    if (want('test-all')) {
    ({ ctx, p } = await open(b, t, GAL, 'hub-' + STARDEW));
    await p.click('[role=tab][data-tab=simulate]');
    await p.click('#sim-all');
    await p.waitForTimeout(3500);
    await p.evaluate(() => document.querySelector('#sim-matrix').scrollIntoView({ block: 'start' }));
    await p.waitForTimeout(300);
    await p.mouse.move(2, 590);
    await gallery(p, 'test-all', t);
    await ctx.close();
    }

    // The debugger: a breakpoint, then one step.
    if (want('debugger')) {
    ({ ctx, p } = await open(b, t, GAL, 'hub-' + STARDEW));
    await p.evaluate(() => { const cm = document.querySelector('.CodeMirror').CodeMirror; cm.focus(); cm.setCursor(133, 0); });
    await p.keyboard.press('F9');
    await p.click('[role=tab][data-tab=simulate]');
    await p.click('#sim-debug');
    await p.waitForTimeout(2000);
    await p.keyboard.press('F10');
    await p.waitForTimeout(1000);
    await cmTop(p, 119);
    await p.evaluate(() => document.querySelector('#sim-debug').scrollIntoView({ block: 'start' }));
    await p.waitForTimeout(300);
    await p.mouse.move(2, 590);
    await gallery(p, 'debugger', t);
    await ctx.close();
    }

    // The four looks, on the example with common mistakes.
    if (want('looks')) for (const look of ['www', 'v3', 'mac', 'alpha8']) {
      ({ ctx, p } = await open(b, t, GAL, 'example-mistakes', look));
      await p.mouse.move(2, 590);
      await gallery(p, 'look-' + look, t);
      await ctx.close();
    }

    // The docs' labelled screenshot (docs/tools/workbench/): the workbench as it opens, with the template handler, and
    // where each part the tour points at is (playground/src/tourparts.json), as a share of the picture. The page
    // draws the numbers.
    if (want('map')) {
    ({ ctx, p } = await open(b, t, GAL));
    await p.mouse.move(2, 590);
    const parts = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'playground', 'src', 'tourparts.json'), 'utf8')).parts;
    const at = await p.evaluate((list) => {
      const out = {};
      for (const part of list) {
        const el = [part.mark, ...part.targets].filter(Boolean).map((sel) => document.querySelector(sel)).find((e) => e && e.getClientRects().length && e.getBoundingClientRect().width > 0);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        // A big part (the code) gets its number in the middle; a button gets it just under, so its label stays readable.
        const big = r.width > 220 && r.height > 120;
        out[part.id] = { x: +(((r.x + r.width / 2) / innerWidth) * 100).toFixed(2), y: +(((big ? r.y + r.height / 2 : r.bottom + 9) / innerHeight) * 100).toFixed(2) };
      }
      return out;
    }, parts);
    const tmp = path.join(os.tmpdir(), `wb-map-${t}.png`);
    await p.screenshot({ path: tmp });
    fs.mkdirSync(GUIDE, { recursive: true });
    execFileSync('python3', ['-I', '-c', 'import sys\nfrom PIL import Image\nImage.open(sys.argv[1]).convert("RGB").save(sys.argv[2], "WEBP", quality=82, method=6)', tmp, path.join(GUIDE, `workbench-map-${t}.webp`)]);
    fs.rmSync(tmp, { force: true });
    if (t === 'light') fs.writeFileSync(path.join(GUIDE, 'workbench-map.json'), JSON.stringify({ width: GAL.viewport.width * GAL.deviceScaleFactor, height: GAL.viewport.height * GAL.deviceScaleFactor, parts: at }, null, 2) + '\n');
    await ctx.close();
    }

    // Fix all on the example with common mistakes (README).
    if (want('fix-all')) {
    ({ ctx, p } = await open(b, t, GAL, 'example-mistakes'));
    await p.click('#fix-all');
    await p.waitForTimeout(800);
    await gallery(p, 'fix-all', t);
    await ctx.close();
    }

    // Changelog: Lines filtered to "kill".
    if (want('lines')) {
    ({ ctx, p } = await open(b, t, { viewport: { width: 1400, height: 800 }, deviceScaleFactor: 1 }, 'example-mistakes'));
    if (!(await p.isVisible('#lines'))) await p.click('#lines-toggle');
    await p.selectOption('#lines-group', 'object').catch(() => {});
    await p.fill('#lines-q', 'kill');
    await p.waitForTimeout(300);
    await p.hover('#lines-list .ln:has(.nm:text-is("Game.KillMutex"))').catch(() => p.hover('#lines-list .ln:has(.nm:text-is("KillMutex"))'));
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(CH, `2026-11-05-lines-${t}.png`), clip: await box(p, '.pane:not(.side)') });
    await ctx.close();
    }

    // Changelog: What's new.
    if (want('whats-new')) {
    ({ ctx, p } = await open(b, t, { viewport: { width: 900, height: 760 }, deviceScaleFactor: 1 }));
    await p.click('#news-open-2');
    await p.waitForTimeout(500);
    await p.screenshot({ path: path.join(CH, `whats-new-${t}.png`), clip: await box(p, '#news-dialog') });
    await ctx.close();
    }

    // Changelog: the guide's labelled screenshot with its numbers and their lines, as the docs page shows it.
    if (want('guide')) {
    ctx = await b.newContext({ colorScheme: t, viewport: { width: 1180, height: 900 }, deviceScaleFactor: 1 });
    p = await ctx.newPage();
    await p.goto(BASE + 'docs/tools/workbench/');
    await p.waitForSelector('.map-pin');
    await p.waitForTimeout(500);
    const top = await box(p, '.wb-map');
    const list = await box(p, '.map-legend');
    await p.screenshot({ path: path.join(CH, `2026-11-21-guide-${t}.png`), fullPage: true, clip: { x: top.x - 8, y: top.y - 8, width: top.width + 16, height: list.y + list.height - top.y + 16 } });
    await ctx.close();
    }

    // Phone: Check results (README, in the gallery folder; not on the start page), and four phone views (changelog).
    if (want('phone')) {
    const phone = { ...devices['Pixel 7'] };
    ({ ctx, p } = await open(b, t, phone, 'example-mistakes'));
    await p.tap('.switch button[data-view=results]').catch(() => {});
    await p.waitForTimeout(400);
    await gallery(p, 'phone', t);
    const parts = [];
    parts.push(await p.screenshot());
    await p.tap('.switch button[data-view=code]');
    await p.waitForTimeout(300);
    await p.evaluate(() => { const cm = document.querySelector('.CodeMirror').CodeMirror; cm.focus(); cm.setCursor(10, 0); });
    await p.waitForTimeout(500);
    parts.push(await p.screenshot());
    await p.tap('#lines-toggle');
    await p.waitForTimeout(400);
    parts.push(await p.screenshot());
    await p.evaluate(() => document.activeElement && document.activeElement.blur());
    await p.tap('#lines-close');
    await p.waitForTimeout(300);
    await p.tap('#more-open', { timeout: 3000 }).catch(() => {}); // only in some layouts
    await p.waitForTimeout(400);
    parts.push(await p.screenshot());
    require('fs').writeFileSync(path.join(CH, `.phones-${t}.json`), JSON.stringify(parts.map((x) => x.toString('base64'))));
    await ctx.close();
    }
  }
  // Release-note screenshots (CHANGELOG.md), light and dark, ≈900 px wide.
  const CHW = { viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1 };
  const shot = async (p, file, sel, pad = 0) => {
    const r = sel ? await box(p, sel) : null;
    await p.screenshot({ path: path.join(CH, file), ...(r ? { clip: { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.width + pad * 2, height: r.height + pad * 2 } } : {}) });
  };
  if (!ONLY) for (const t of ['light', 'dark']) {
    // 18:33: Test all combinations.
    let { ctx, p } = await open(b, t, CHW, 'hub-' + STARDEW);
    await p.click('[role=tab][data-tab=simulate]');
    await p.click('#sim-all');
    await p.waitForTimeout(3000);
    await shot(p, `2026-11-05-test-all-${t}.png`, '.pane.side');
    await ctx.close();
    // 18:33: tap a warning next to the code.
    ({ ctx, p } = await open(b, t, { viewport: { width: 900, height: 600 }, deviceScaleFactor: 1 }, 'example-mistakes'));
    // What a click on the marker of line 20 does (CodeMirror's gutterClick).
    await p.evaluate(() => { const cm = document.querySelector('.CodeMirror').CodeMirror; cm.constructor.signal(cm, 'gutterClick', cm, 19, 'CodeMirror-lint-markers', new MouseEvent('mousedown')); });
    await p.waitForTimeout(500);
    await shot(p, `2026-11-05-line-problems-${t}.png`, '.pane:not(.side)');
    await ctx.close();
    // 23:00: the command palette.
    ({ ctx, p } = await open(b, t, CHW, 'example-mistakes'));
    await p.click('.CodeMirror');
    await p.keyboard.press('Control+Shift+P');
    await p.mouse.move(2, 2);
    await p.waitForTimeout(400);
    await shot(p, `2026-11-05-palette-${t}.png`, '#open-dialog');
    await ctx.close();
    // 23:00: a package's files.
    ({ ctx, p } = await open(b, t, CHW, 'package-nvmp'));
    await p.click('#files-open');
    await p.click('#files-body details:nth-of-type(1) summary');
    await p.waitForTimeout(300);
    await shot(p, `2026-11-05-package-files-${t}.png`, '#files-dialog');
    await ctx.close();
    // Unreleased: stacked toasts.
    ({ ctx, p } = await open(b, t, CHW, 'example-mistakes'));
    await p.addStyleTag({ content: '#toasts { display: flex !important; }' });
    for (let i = 0; i < 2; i++) {
      await p.click('.problem button:has-text("Fix this")').catch(() => {});
      await p.waitForTimeout(400);
    }
    await p.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.setValue('Game.GUID="Demo";\nGame.GameName="Demo";\nGame.ExecutableName="demo.exe";\n'));
    await p.click('.CodeMirror');
    await p.keyboard.press('Shift+Alt+F');
    await p.waitForTimeout(900);
    // Fanned out, as when the pointer is on the stack.
    const tb = await box(p, '#toasts');
    await p.mouse.move(tb.x + tb.width / 2, tb.y + tb.height - 20, { steps: 6 });
    await p.waitForTimeout(800);
    await shot(p, `toasts-${t}.png`, '#toasts', 12);
    await ctx.close();
    // The Open dialog (Ctrl+K): tiles, template chips and Hub rows, the first Hub row selected.
    ({ ctx, p } = await open(b, t, CHW, 'example-mistakes'));
    await p.click('.CodeMirror');
    await p.keyboard.press('Control+K');
    await p.waitForTimeout(400);
    for (let i = 0; i < 4; i++) await p.keyboard.press('ArrowDown');
    await p.mouse.move(2, 2);
    await p.waitForTimeout(400);
    await shot(p, `open-${t}.png`, '#open-dialog');
    await ctx.close();
    // The Theme tab: the looks and the code colours.
    ({ ctx, p } = await open(b, t, { viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 }, 'example-mistakes'));
    await p.evaluate(() => document.querySelector('#settings-open').click());
    await p.waitForTimeout(400);
    await p.click('#st-theme');
    await p.addStyleTag({ content: '#settings-dialog[open] { height: auto !important; max-height: none !important; }' }); // the whole tab, no scroll
    await p.mouse.move(2, 2);
    await p.waitForTimeout(400);
    await shot(p, `theme-tab-${t}.png`, '#settings-dialog');
    await ctx.close();
    // The two new looks, a whole window each.
    for (const look of ['mac', 'alpha8']) {
      ({ ctx, p } = await open(b, t, CHW, 'example-mistakes'));
      await p.evaluate((look) => { localStorage.setItem('nucleus-workbench-dev-site', look); }, look);
      await p.reload();
      await p.waitForSelector('.CodeMirror');
      await p.waitForTimeout(1200);
      await p.mouse.move(2, 2);
      await p.screenshot({ path: path.join(CH, `look-${look}-${t}.png`) });
      await ctx.close();
    }
  }
  await b.close();
  if (!process.argv.includes('--release-shots') && want('phone')) require('child_process').execFileSync('python3', ['-I', path.join(__dirname, 'compose-images.py'), CH], { stdio: 'inherit' });
})();
