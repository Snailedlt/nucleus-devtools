// "Try it" panel: shows what Nucleus would set up for each player of the handler being edited
// (window, launch arguments, file changes), updated as you type. The simulation runs isolated
// from VS Code and Node (src/sandbox.ts), in a worker thread (src/simworker.ts), so a looping
// handler never freezes the editor: a new edit cancels the run before it. The webview runs one small script of ours
// (a nonce in its CSP; nothing from the handler can run): its controls are toggle buttons that post a message, and it
// puts the focus back on the button that was clicked when the panel re-renders.
import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { SimOptions, SimResult, sessionSummary, groupIgnored, EVERY_KEYBOARD } from './core/sim';
import { pluginsFor, isTimeout } from './sandbox';
import { simWorker, runMatrixInWorker, isCancelled } from './simworker';
import { MATRIX_RESOLUTIONS, MatrixResult, planMatrix } from './core/matrix';
import { reportButton, REPORT_BUTTON_CSS } from './core/reporticons';
import { simSummary, handlerOrigin, type HandlerOrigin } from './core/report';

export interface TryItState {
  players: number;
  keyboardPlayer: number; // -1: nobody, EVERY_KEYBOARD: each player their own
  width: number;
  height: number;
}
const STATE_KEY = 'splitscreenme.tryIt';
const DEFAULT_STATE: TryItState = { players: 2, keyboardPlayer: 0, width: 1920, height: 1080 };
const RESOLUTIONS = MATRIX_RESOLUTIONS;
const TEST_ALL = 'splitscreenme.tryItTestAll';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const cmd = (id: string, arg?: unknown) => `command:${id}${arg === undefined ? '' : `?${encodeURIComponent(JSON.stringify([arg]))}`}`;
const SET = 'splitscreenme.tryItSet';

/** What the panel's buttons post: a settings change, or Test all. */
export type TryItMessage = { type: 'set'; change: Partial<TryItState> } | { type: 'testAll' } | { type: 'report' } | { type: 'answer'; key: string };
/** The command that reports what Try it showed (src/reportvscode.ts). */
export const REPORT_TRY_IT = 'splitscreenme.reportTryIt';
/** A button that posts `msg`; `id` finds it again after a re-render (focus). */
const button = (id: string, label: string, msg: TryItMessage, attrs = '', cls = 'choice') => `<button type="button" class="${cls}" data-id="${esc(id)}" data-msg="${esc(JSON.stringify(msg))}"${attrs}>${label}</button>`;

/** The panel's script: buttons post their message; the focus and the "How this works" disclosure survive a re-render. */
const SCRIPT = `(function () {
  var vscode = acquireVsCodeApi();
  var st = vscode.getState() || {};
  var save = function () { vscode.setState(st); };
  var how = document.getElementById('how');
  if (how) {
    how.open = !!st.how;
    how.addEventListener('toggle', function () { st.how = how.open; save(); });
  }
  // Only after a click here, while the focus stayed in the panel (however long Test all takes): once you move to
  // the editor, a re-render never takes the focus.
  window.addEventListener('blur', function () { st.focus = undefined; save(); });
  // Moving to another control in the panel: that one is what a re-render keeps (or nothing).
  document.addEventListener('focusin', function (e) {
    var id = e.target && e.target.getAttribute ? e.target.getAttribute('data-id') : null;
    if (st.focus && id !== st.focus) { st.focus = id || undefined; save(); }
  });
  if (st.focus) {
    var el = Array.prototype.filter.call(document.querySelectorAll('[data-id]'), function (x) { return x.getAttribute('data-id') === st.focus; })[0];
    if (el) el.focus();
  }
  st.focus = undefined; save();
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('button[data-msg]') : null;
    if (!b) return;
    st.focus = b.getAttribute('data-id'); save();
    vscode.postMessage(JSON.parse(b.getAttribute('data-msg')));
  });
})();`;

/** The panel's HTML (no scripts). Exported for tests. */
export function renderTryIt(r: SimResult, state: TryItState, title: string, matrix?: MatrixResult, nonce = ''): string {
  // Toggle buttons: the one in effect is pressed (aria-pressed), each group is labelled for screen readers.
  const choice = (group: string, label: string, current: boolean, change: Partial<TryItState>, aria?: string) =>
    button(`${group}-${label}`, esc(label), { type: 'set', change }, ` aria-pressed="${current}"${aria ? ` aria-label="${esc(aria)}"` : ''}`);
  const group = (id: string, label: string, buttons: string) => `<div class="group" role="group" aria-labelledby="${id}"><span id="${id}">${label}</span>${buttons}</div>`;
  const controls = `<div class="controls">
    ${group('g-players', 'Players', [1, 2, 3, 4].map((n) => choice('players', String(n), state.players === n, { players: n, keyboardPlayer: state.keyboardPlayer >= n ? 0 : state.keyboardPlayer }, `${n} player${n === 1 ? '' : 's'}`)).join(''))}
    ${group('g-kb', 'Keyboard &amp; mouse', [...Array(state.players).keys()].map((i) => choice('kb', `P${i + 1}`, state.keyboardPlayer === i, { keyboardPlayer: i }, `Player ${i + 1}`)).join('') + choice('kb', 'each player their own', state.keyboardPlayer === EVERY_KEYBOARD, { keyboardPlayer: EVERY_KEYBOARD }) + choice('kb', 'nobody', state.keyboardPlayer === -1, { keyboardPlayer: -1 }))}
    ${group('g-monitor', 'Monitor', RESOLUTIONS.map(([w, h]) => choice('monitor', `${w}×${h}`, state.width === w && state.height === h, { width: w, height: h })).join(''))}
    ${button('test-all', 'Test all combinations', { type: 'testAll' }, ' title="Every player count, input setup and monitor size"')}</div>${
    // The handler's own options (Game.AddOption), only when it has some: each button picks that option's answer.
    r.answers?.length
      ? `<div class="controls">${group('g-answers', 'Options', r.answers.map((a) => button(`answer-${a.key}`, `${esc(a.name)}: <strong>${esc(a.value === '' ? '(empty)' : a.value)}</strong>`, { type: 'answer', key: a.key }, ` title="${esc(`Answer this option as a player would (Context.Options[&quot;${a.key}&quot;])`)}"`)).join(''))}</div>`
      : ''
  }`;

  const out: string[] = [];
  if (matrix) out.push(renderMatrix(matrix));
  if (!r.loaded) {
    out.push(`<div class="banner error"><strong>${esc(sessionSummary(r))}</strong> <a href="${cmd('workbench.actions.view.problems')}">Fix the problems</a> first.<div class="mono small">${esc(r.loadError ?? '')}</div></div>`);
  } else {
    out.push(`<div class="banner ${r.sessionEnded ? 'error' : 'ok'}"><strong>${esc(sessionSummary(r))}</strong></div>`);
  }
  for (const n of r.notes ?? []) out.push(`<p class="muted">${esc(n)}</p>`);
  if (r.inputNote) out.push(`<p class="muted">${esc(r.inputNote)}</p>`);
  const ignored = groupIgnored(r.ignored);
  if (ignored.length) out.push(`<h3>Settings Nucleus skips (${ignored.length})</h3><ul class="mono warn">${ignored.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`);
  for (const p of r.players) {
    out.push(`<section><h3>Player ${p.index + 1} <span class="tag">${p.index === state.keyboardPlayer || state.keyboardPlayer === EVERY_KEYBOARD ? 'keyboard &amp; mouse' : 'controller'}</span></h3>
      ${p.error ? `<div class="banner error">Setting up this player fails here, and Nucleus ends the session.<div class="mono small">${esc(p.error)}</div></div>` : ''}
      ${p.note ? `<p class="muted">${esc(p.note)}</p>` : ''}
      <table><tr><th>Window</th><td>${esc(p.window)}</td></tr>
      <tr><th>Starts the game with</th><td class="mono">${p.startArguments ? esc(p.startArguments) : '<span class="muted">(nothing extra)</span>'}</td></tr>
      <tr><th>Changes before the game starts</th><td>${p.effects.length ? `<ul>${p.effects.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : '<span class="muted">(none)</span>'}</td></tr></table>
      ${p.calls.length ? `<details><summary>${p.calls.length} recorded call${p.calls.length === 1 ? '' : 's'}</summary><ul class="mono">${p.calls.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></details>` : ''}</section>`);
  }
  for (const c of r.callbacks) {
    out.push(`<section><h3>${esc(c.name)}</h3>${c.error ? `<div class="banner error">${esc(c.note ?? '')}<div class="mono small">${esc(c.error)}</div></div>` : ''}<details><summary>${c.calls.length} recorded call${c.calls.length === 1 ? '' : 's'}</summary><ul class="mono">${c.calls.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details></section>`);
  }
  if (r.options.length) {
    out.push(`<details><summary>${r.options.length} option${r.options.length === 1 ? '' : 's'} set (different from Nucleus' defaults)</summary><table>${r.options.map((o) => `<tr><td class="mono">${esc(o.path)}</td><td class="mono">${esc(o.value.length > 120 ? o.value.slice(0, 117) + '…' : o.value)}</td></tr>`).join('')}</table></details>`);
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); padding: 8px 16px 24px; line-height: 1.45; }
h2 { font-size: 1.15em; margin: 4px 0 2px; } h3 { font-size: 1em; margin: 16px 0 6px; }
.lede, .muted { color: var(--vscode-descriptionForeground); } .lede { margin: 0 0 10px; max-width: 70ch; }
.controls { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 8px 0 12px; align-items: center; }
.group { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.choice { font: inherit; color: var(--vscode-textLink-foreground); background: transparent; cursor: pointer; margin-left: 4px; padding: 1px 7px; border-radius: 10px; border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.4)); }
.choice:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,.15)); }
.choice:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
.choice[aria-pressed="true"] { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: transparent; font-weight: 600; }
.how { margin: 0 0 6px; } .how summary { display: inline-block; } .how p { margin: 4px 0 0; }
.matrix { margin: 8px 0 12px; padding: 8px 10px; border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.3)); border-radius: 4px; }
.matrix table { margin-top: 6px; } .matrix td { padding: 2px 8px 2px 0; }
.cell { font: inherit; color: var(--vscode-foreground); cursor: pointer; border: 0; padding: 1px 7px; border-radius: 10px; display: inline-block; }
.cell:focus-visible { outline: 1px solid var(--vscode-focusBorder); }
.cell.ok { background: color-mix(in srgb, var(--vscode-testing-iconPassed, #3a3) 18%, transparent); }
.cell.fail { background: color-mix(in srgb, var(--vscode-errorForeground) 18%, transparent); }
.banner { padding: 8px 10px; border-radius: 4px; margin: 8px 0; border-left: 3px solid; }
.banner.ok { border-color: var(--vscode-testing-iconPassed, #3a3); background: color-mix(in srgb, var(--vscode-testing-iconPassed, #3a3) 10%, transparent); }
.banner.error { border-color: var(--vscode-errorForeground); background: color-mix(in srgb, var(--vscode-errorForeground) 10%, transparent); }
.mono, code { font-family: var(--vscode-editor-font-family); font-size: 0.95em; } .small { font-size: 0.9em; margin-top: 4px; overflow-wrap: anywhere; }
section { border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,.3)); margin-top: 12px; }
.tag { font-weight: 400; font-size: .85em; color: var(--vscode-descriptionForeground); margin-left: 6px; }
table { border-collapse: collapse; } th { text-align: left; font-weight: 400; color: var(--vscode-descriptionForeground); padding: 2px 14px 2px 0; vertical-align: top; white-space: nowrap; } td { padding: 2px 0; vertical-align: top; overflow-wrap: anywhere; }
ul { margin: 0; padding-left: 18px; } ul.mono { list-style: none; padding-left: 0; } .warn li { color: var(--vscode-editorWarning-foreground); }
details { margin: 6px 0; } summary { cursor: pointer; color: var(--vscode-descriptionForeground); }
.head { display: flex; align-items: center; gap: 8px; } .head h2 { flex: 1; }
${REPORT_BUTTON_CSS}
.rep-btn { color: var(--vscode-descriptionForeground); } .rep-btn:hover { color: var(--vscode-foreground); }
</style></head><body>
<div class="head"><h2>Try it: ${esc(title)}</h2>${reportButton('report', { label: 'Nucleus did something different', tip: 'Nucleus did something different: report what Try it showed, next to what really happened. You see everything before it is sent.', attrs: `data-id="report" data-msg="${esc(JSON.stringify({ type: 'report' }))}"` })}</div>
<details class="how" id="how"><summary>How this works ⓘ</summary><p class="lede">What Nucleus Co-op would set up for each player: where its window goes, how the game is started and which settings files it changes. Simulated, following the rules of Nucleus' Jint engine: nothing on your computer is touched, and the handler can't access it. Windows, focus and input still need a real test in Nucleus Co-op.</p></details>
${controls}${out.join('\n')}
${nonce ? `<script nonce="${nonce}">${SCRIPT}</script>` : ''}
</body></html>`;
}

/** The "Test all combinations" table: pick a cell to show that run. */
function renderMatrix(m: MatrixResult): string {
  const { plan } = m;
  const n = plan.jobs.length;
  const rows = Array.from({ length: plan.max }, (_, i) => i + 1).map((p) => `<tr><th>${p} player${p === 1 ? '' : 's'}</th>${plan.modes
    .map((mode) => {
      if (!mode.offered) return `<td class="muted" title="The handler doesn't set Game.SupportsMultipleKeyboardsAndMice = true">not offered</td>`;
      const fails = m.cells.get(`${p}|${mode.kb}`) ?? [];
      const [w, h] = fails.length ? [fails[0].width, fails[0].height] : [1920, 1080];
      const label = fails.length ? `${fails.length} of ${RESOLUTIONS.length} screens fail` : 'all screens';
      return `<td>${button(`cell-${p}-${mode.kb}`, label, { type: 'set', change: { players: p, keyboardPlayer: mode.kb, width: w, height: h } }, ` title="${esc(fails.map((f) => `${f.width}×${f.height}: ${f.why}`).join('\n') || 'Show this run')}"`, `cell ${fails.length ? 'fail' : 'ok'}`)}</td>`;
    })
    .join('')}</tr>`);
  const fails = [...m.cells.entries()].flatMap(([k, list]) => list.map((f) => ({ k, ...f })));
  return `<div class="matrix"><strong>${m.failed ? `${m.failed} of ${n} combinations fail` : `All ${n} combinations work`}</strong> <span class="muted">up to ${plan.max} player${plan.max === 1 ? '' : 's'} · ${RESOLUTIONS.map(([w, h]) => `${w}×${h}`).join(', ')}</span>
    <table><tr><th></th>${plan.modes.map((x) => `<th>${esc(x.label)}</th>`).join('')}</tr>${rows.join('')}</table>
    ${fails.length ? `<ul class="small">${fails.slice(0, 8).map((f) => { const [p, kb] = f.k.split('|'); return `<li>${p} player${p === '1' ? '' : 's'}, ${esc(plan.modes.find((x) => String(x.kb) === kb)!.label.toLowerCase())}, ${f.width}×${f.height}: ${esc(f.why)}</li>`; }).join('')}${fails.length > 8 ? `<li>…and ${fails.length - 8} more</li>` : ''}</ul>` : ''}
    <p class="muted small">Pick a cell to show that run below. Editing the handler clears this table.</p></div>`;
}

/** Registers the Try it command and its panel. */
/** Whole numbers in range (a stored 2.5 players would break every render). */
const validState = (s: TryItState) =>
  Number.isInteger(s.players) && s.players >= 1 && s.players <= 16 && Number.isInteger(s.width) && s.width > 0 && Number.isInteger(s.height) && s.height > 0 &&
  Number.isInteger(s.keyboardPlayer) && (s.keyboardPlayer >= -1 || s.keyboardPlayer === EVERY_KEYBOARD) && s.keyboardPlayer < s.players;

export function registerTryIt(context: vscode.ExtensionContext, isHandler: (doc: vscode.TextDocument) => boolean) {
  let panel: vscode.WebviewPanel | undefined;
  let doc: vscode.TextDocument | undefined;
  let timer: NodeJS.Timeout | undefined;
  const saved: TryItState = { ...DEFAULT_STATE, ...context.workspaceState?.get<Partial<TryItState>>(STATE_KEY, {}) };
  let state: TryItState = validState(saved) ? saved : { ...DEFAULT_STATE };
  let matrix: MatrixResult | undefined; // the last "Test all combinations", until the handler changes
  let shown: { r: SimResult; state: TryItState; uri: string; handler?: HandlerOrigin } | undefined; // what the panel shows (and for which handler), for "Nucleus did something different"
  // Shows the Try it button in the editor title bar only for handlers.
  const markHandler = (e: vscode.TextEditor | undefined) => void vscode.commands.executeCommand('setContext', 'splitscreenme.isHandler', !!e && isHandler(e.document));
  markHandler(vscode.window.activeTextEditor);

  let run: AbortController | undefined; // the run on screen's way; a newer one cancels it
  let stuck: string | undefined; // text + options of the last run that timed out: not re-run automatically
  let matrixRun: AbortController | undefined;
  // The answers picked for each handler's own options (Game.AddOption), while the window is open.
  const answers = new Map<string, Record<string, string>>();
  const optsFor = (d: vscode.TextDocument): SimOptions => {
    const picked = answers.get(d.uri.toString());
    return { players: state.players, width: state.width, height: state.height, keyboardPlayer: state.keyboardPlayer, plugins: d.isUntitled ? undefined : pluginsFor(d.fileName), ...(picked && Object.keys(picked).length ? { options: picked } : {}) };
  };
  const answer = async (key: string) => {
    if (!doc || !shown || shown.uri !== doc.uri.toString()) return;
    const d = doc;
    const a = shown.r.answers?.find((x) => x.key === key);
    if (!a) return;
    const value = a.choices
      ? await vscode.window.showQuickPick(a.choices.map((c) => ({ label: c, description: c === a.value ? 'now' : undefined })), { title: a.name, placeHolder: 'What the players pick for this option' }).then((p) => p?.label)
      : await vscode.window.showInputBox({ title: a.name, value: a.value, prompt: 'What the players type for this option' });
    if (value === undefined || doc !== d) return;
    answers.set(d.uri.toString(), { ...answers.get(d.uri.toString()), [key]: value });
    return render();
  };

  /** `auto`: an edit or an editor switch, not something the user picked; then a text that timed out isn't run again. */
  const render = async (auto = false) => {
    if (!panel || !doc) return;
    const d = doc;
    const opts = optsFor(d);
    const title = d.isUntitled ? 'Untitled' : d.fileName.split(/[\\/]/).pop()!;
    panel.title = `Try it: ${title}`;
    const text = d.getText();
    const key = JSON.stringify([text, opts]);
    if (auto && stuck === key) return; // still the text that didn't finish: the panel already says so
    run?.abort();
    const mine = (run = new AbortController());
    let r: SimResult;
    try {
      r = await simWorker().simulate(text, opts, { signal: mine.signal });
    } catch (e) {
      if (isCancelled(e)) return;
      throw e;
    }
    if (mine !== run || !panel || doc !== d) return;
    // An option the handler no longer has: its answer goes, and the run is done again without it.
    const picked = answers.get(d.uri.toString());
    const gone = r.loaded && picked ? Object.keys(picked).filter((k) => !r.answers?.some((a) => a.key === k)) : [];
    if (gone.length) {
      for (const k of gone) delete picked![k];
      return render(auto);
    }
    stuck = isTimeout(r) ? key : undefined;
    // The origin from the very text simulated (no code kept), for the report.
    shown = { r, state: { ...state }, uri: d.uri.toString(), handler: handlerOrigin(text) };
    panel.webview.html = renderTryIt(r, state, title, matrix, randomBytes(16).toString('base64'));
  };
  const schedule = (delay = 400) => {
    clearTimeout(timer);
    timer = setTimeout(() => void render(true), delay);
  };
  const stopMatrix = () => {
    matrixRun?.abort();
    matrixRun = undefined;
    matrix = undefined;
  };

  const open = () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !isHandler(editor.document)) {
        vscode.window.showInformationMessage('Open a Nucleus Co-op handler to try it.');
        return;
      }
      doc = editor.document;
      stuck = undefined; // asked for: run it again
      if (panel) panel.reveal(vscode.ViewColumn.Beside, true);
      else {
        panel = vscode.window.createWebviewPanel('splitscreenme.tryIt', 'Try it', { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, {
          // Our own script only (a nonce per render; the CSP refuses any other), for the buttons and the focus.
          enableScripts: true,
          enableCommandUris: ['workbench.actions.view.problems'],
          localResourceRoots: [],
        });
        panel.webview.onDidReceiveMessage((m: TryItMessage) => {
          if (m?.type === 'set' && m.change && typeof m.change === 'object') void vscode.commands.executeCommand(SET, m.change);
          else if (m?.type === 'testAll') void vscode.commands.executeCommand(TEST_ALL);
          else if (m?.type === 'answer' && typeof m.key === 'string') void answer(m.key);
          else if (m?.type === 'report' && shown) {
            // The handler the result on screen came from (the panel may already be on its way to another).
            const st = shown.state;
            const keyboard = st.keyboardPlayer === EVERY_KEYBOARD ? 'each player their own' : st.keyboardPlayer < 0 ? 'nobody' : `player ${st.keyboardPlayer + 1}`;
            void vscode.commands.executeCommand(REPORT_TRY_IT, { uri: shown.uri, handler: shown.handler, sim: simSummary(shown.r, { players: st.players, resolution: `${st.width}×${st.height}`, keyboard }) });
          }
        }, null, context.subscriptions);
        panel.onDidDispose(() => ((panel = undefined), run?.abort(), stopMatrix()), null, context.subscriptions);
      }
      return render();
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('splitscreenme.tryIt', open),
    vscode.commands.registerCommand(SET, (change: Partial<TryItState>) => {
      // Only the four numbers, whoever sent them.
      const pick = (k: keyof TryItState) => (typeof change?.[k] === 'number' ? { [k]: change[k] } : {});
      const next: TryItState = { ...state, ...pick('players'), ...pick('keyboardPlayer'), ...pick('width'), ...pick('height') };
      if (!validState(next)) return;
      if (!(next.players >= 1 && next.players <= 16) || !(next.width > 0 && next.height > 0) || (next.keyboardPlayer < -1 && next.keyboardPlayer !== EVERY_KEYBOARD) || next.keyboardPlayer >= next.players) return;
      state = next;
      void context.workspaceState?.update(STATE_KEY, state);
      return render();
    }),
    vscode.commands.registerCommand(TEST_ALL, async () => {
      // From the palette with no Try it panel yet: open it on the handler first; an open one comes to the front.
      // The handler and panel asked for are noted first: if either changed while it opened, don't start.
      // The panel is noted as open() makes it (synchronously), before its first render is awaited: closed and reopened
      // meanwhile, it is another panel and this run doesn't start.
      const want = panel && doc ? doc : vscode.window.activeTextEditor?.document;
      let wantPanel = panel;
      if (!panel || !doc) {
        const opening = open();
        wantPanel = panel;
        await opening;
      } else panel.reveal(undefined, true);
      if (!panel || !doc || doc !== want || panel !== wantPanel) return;
      const d = doc;
      const code = d.getText();
      const plugins = d.isUntitled ? undefined : pluginsFor(d.fileName);
      stopMatrix();
      const mine = (matrixRun = new AbortController());
      // In the worker, in batches: the editor stays responsive, the notification shows progress and can cancel.
      await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Testing every combination', cancellable: true }, async (progress, token) => {
        token.onCancellationRequested(() => mine.abort());
        try {
          const first = await simWorker().simulate(code, { players: 1, width: 1920, height: 1080, keyboardPlayer: -1, plugins }, { signal: mine.signal });
          const plan = planMatrix(first);
          if (!plan) return void vscode.window.showWarningMessage(isTimeout(first) ? first.loadError! : "Nucleus can't load this handler yet: fix the problems first.");
          let last = 0;
          const m = await runMatrixInWorker(plan, code, { plugins }, {
            signal: mine.signal,
            onProgress: ({ done, total }) => {
              progress.report({ increment: ((done - last) / total) * 100, message: `${done} of ${total}` });
              last = done;
            },
          });
          if (mine !== matrixRun || doc !== d) return;
          matrix = m;
          if (m.skipped) void vscode.window.showWarningMessage(`Test all stopped early: ${m.timedOut} combinations did not finish in time (an endless loop?), so the other ${m.skipped} were not run.`);
          await render();
        } catch (e) {
          if (!isCancelled(e)) throw e;
        }
      });
    }),
    vscode.workspace.onDidChangeTextDocument((e) => e.document === doc && (stopMatrix(), schedule())),
    vscode.window.onDidChangeActiveTextEditor((e) => {
      markHandler(e);
      // Follow the handler being edited.
      if (panel && e && e.document !== doc && isHandler(e.document)) {
        doc = e.document;
        stopMatrix();
        schedule(0);
      }
    }),
  );
}
