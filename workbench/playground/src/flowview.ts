// Flow: the handler as a diagram (the visual editor research's Direction B), in place of the code, on request
// (the Flow button, Ctrl+K V). Nucleus loads the handler, then its settings, the questions it asks the players and
// each callback run in order, as nodes joined by lines; an `if` forks into side-by-side branches that join again,
// and a run of the same kind of step is one stacked node. Everything is read from the real code (core/flow.ts):
// a node's </> shows its code, and "Show in code" goes there. For now it only shows: editing comes next.
import { allSteps, readFlow, stepAt, type Flow, type Part, type Step, type Tok } from '@core/flow';
import type { Diagnostic } from '@core/lint';
import { esc } from './dom';
import { hlCode } from './codehl';
import { icon, type IconName } from './icons';

interface Deps {
  editor: any; // CodeMirror 5
  /** The current Check results for the editor's text. */
  problems: () => Diagnostic[];
  /** Docs for an API name. */
  openReference: (path: string) => void;
  /** Leave Flow and select this range in the code. */
  showInCode: (from: number, to: number) => void;
}

const KEY = 'nucleus-workbench-flow';
const VIEW_KEY = 'nucleus-workbench-flow-view';

const ICON: Record<string, IconName> = {
  set: 'sliders-horizontal', copy: 'copy', folder: 'folder-plus', del: 'trash-2', run: 'square-terminal', write: 'file-text',
  edit: 'file-pen', patch: 'file-cog', reg: 'key-round', log: 'scroll-text', list: 'list-plus', var: 'variable', if: 'git-branch',
  loop: 'repeat', code: 'code', off: 'eye-off',
};
const TOK_ICON: Partial<Record<Tok['t'], IconName>> = { place: 'folder', player: 'user', opt: 'message-circle-question' };

const SEV_ORDER = { error: 0, warning: 1, info: 2, hint: 3 } as const;
type Sev = keyof typeof SEV_ORDER;

export function initFlow(deps: Deps) {
  const root = document.getElementById('flow')!;
  const btn = document.getElementById('flow-toggle') as HTMLButtonElement;
  let open = false;
  let flow: Flow | undefined;
  /** Nodes opened (their form shown), and nodes, fields and callbacks shown as code, kept per person (not in the file). */
  const opened = new Set<string>();
  let saved = new Set<string>();
  try {
    saved = new Set(JSON.parse(localStorage.getItem(VIEW_KEY) ?? '[]'));
  } catch { /* default */ }
  const saveView = () => {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify([...saved].slice(-500)));
    } catch { /* not kept */ }
  };
  /** Which handler the choices are for (its GUID, else its game name): a step's id is only unique within one. */
  let handlerKey = '';
  const asCode = {
    has: (id: string) => saved.has(`${handlerKey}|${id}`),
    add: (id: string) => saved.add(`${handlerKey}|${id}`),
    delete: (id: string) => saved.delete(`${handlerKey}|${id}`),
  };
  /** Ifs and loops folded to their head. */
  const folded = new Set<string>();
  let allOpen = false;
  /** Problems per step id, worst first. */
  let probs = new Map<string, Diagnostic[]>();

  const tok = (t: Tok) => {
    if (t.t === 'list') {
      const items = (t.items ?? []).slice(0, 6).map((v) => `<span class="chip">${v.map((x) => esc(x.l)).join('')}</span>`).join('');
      const more = (t.items?.length ?? 0) > 6 ? `<span class="chip more">+${t.items!.length - 6} more</span>` : '';
      return `<span class="chips" title="${esc(t.c)}">${items || '<span class="chip more">empty</span>'}${more}</span>`;
    }
    if (t.t === 'text') return `<span class="txt" title="${esc(t.c)}">${esc(t.l) || '&nbsp;'}</span>`;
    const ic = TOK_ICON[t.t] ? icon(TOK_ICON[t.t]!, 13) : '';
    const cls = t.t === 'bool' ? `k-bool ${t.l === 'On' ? 'on' : 'off'}` : `k-${t.t}`;
    return `<span class="tok ${cls}" title="${esc(t.c)}"${t.ref ? ` data-ref="${esc(t.ref)}"` : ''}>${ic}${esc(t.l)}</span>`;
  };
  const parts = (ps: Part[]) => ps.map((p) => (typeof p === 'string' ? `<span class="fw">${esc(p)}</span>` : tok(p))).join(' ');
  const code = (from: number, to: number) => {
    const text = deps.editor.getValue().slice(from, to);
    // As written, without the indent of its first line
    const indent = /^[ \t]*/.exec(deps.editor.getValue().slice(deps.editor.getValue().lastIndexOf('\n', from - 1) + 1, from))?.[0].length ?? 0;
    const lines = text.split('\n').map((l: string, i: number) => (i ? l.slice(Math.min(indent, /^[ \t]*/.exec(l)![0].length)) : l));
    return `<pre class="f-code">${hlCode(lines.join('\n'))}</pre>`;
  };
  const codeBtn = (id: string, what: string) => `<button type="button" class="codebtn" data-code="${esc(id)}" aria-pressed="${asCode.has(id)}" title="${asCode.has(id) ? `Show ${what} as a diagram` : `Show ${what} as code`} (C)">${icon('code', 15)}</button>`;
  const helpBtn = (ref?: string) => (ref ? `<button type="button" class="codebtn" data-help="${esc(ref)}" title="What this does (F1)">${icon('circle-help', 15)}</button>` : '');
  const goBtn = (from: number, to: number) => `<button type="button" class="codebtn" data-go="${from}:${to}" title="Show in the code">${icon('chevron-right', 15)}</button>`;
  const probChip = (id: string) => {
    const list = probs.get(id);
    if (!list?.length) return '';
    const sev = list[0].severity as Sev;
    const cls = sev === 'error' ? 'sev-err' : sev === 'warning' ? 'sev-warn' : 'sev-info';
    return `<button type="button" class="probchip ${cls}" data-go="${list[0].start}:${list[0].end}" title="${esc(list.map((d) => d.message).join('\n'))}"><span class="dot"></span>${list.length}</button>`;
  };
  const sevClass = (id: string) => {
    const s = probs.get(id)?.[0]?.severity;
    return s === 'error' ? ' has-error' : s === 'warning' ? ' has-warning' : s === 'info' ? ' has-info' : '';
  };
  const conn = () => '<div class="b-conn" aria-hidden="true"></div>';

  const node = (s: Step): string => {
    if (s.kind === 'if') return forkNode(s);
    if (s.kind === 'loop') return loopNode(s);
    const isOpen = opened.has(s.id);
    const ghost = s.kind === 'off' ? ' ghost' : '';
    const stack = s.kind === 'group' ? ' stack' : '';
    const asC = asCode.has(s.id) || s.kind === 'code';
    const icCls = s.kind === 'off' || s.kind === 'code' ? 'ic off' : 'ic';
    const count = s.kind === 'group' ? `<span class="count">${s.items!.length}×</span>` : '';
    const head = `<div class="b-nh"><button type="button" class="b-hbtn" data-open="${esc(s.id)}" aria-expanded="${isOpen}"><span class="${icCls}">${icon(ICON[s.icon] ?? 'code', 15)}</span><span class="b-verb">${esc(s.verb)}</span>${count}</button><span class="b-tools">${probChip(s.id)}${helpBtn(s.ref)}${s.kind === 'code' || s.kind === 'off' ? '' : codeBtn(s.id, 'this step')}${goBtn(s.from, s.to)}</span></div>`;
    const sum = s.summary.length && !(asC && isOpen) ? `<div class="b-sum">${parts(s.summary)}</div>` : '';
    let body = '';
    if (isOpen || (asC && s.kind !== 'code' && s.kind !== 'off' && asCode.has(s.id))) {
      if (asC) body = `<div class="b-body">${code(s.from, s.to)}</div>`;
      else if (s.kind === 'group') body = `<div class="b-body">${groupTable(s)}</div>`;
      else if (s.fields?.length) body = `<div class="b-body"><div class="b-form">${s.fields.map((f, i) => fieldRow(s.id, i, f.label, f.value, f.code)).join('')}</div></div>`;
    }
    return `<div class="b-node${ghost}${stack}${isOpen ? ' open' : ''}${sevClass(s.id)}" data-id="${esc(s.id)}">${head}${sum}${body}</div>`;
  };
  const fieldRow = (sid: string, i: number, label: string, value: Tok[], c: string) => {
    const key = `${sid}.f${i}`;
    const asC = asCode.has(key);
    const val = asC ? `<code class="inl">${hlCode(c)}</code>` : `<div class="pf">${value.map(tok).join('')}</div>`;
    return `<div class="b-fl">${esc(label)}</div>${val}<span class="b-fa"><span class="mode" role="group" aria-label="${esc(label)}: show as"><button type="button" data-fmode="${esc(key)}" data-to="visual" aria-pressed="${!asC}">Visual</button><button type="button" data-fmode="${esc(key)}" data-to="code" aria-pressed="${asC}">Code</button></span></span>`;
  };
  const groupTable = (s: Step) => {
    const cols = s.columns ?? [];
    const rows = s.items!.map((it, i) => {
      const cells = it.verb === 'Set an option' ? [`<td>${esc(it.fields?.[0]?.label ?? '')}</td>`, `<td>${(it.fields?.[0]?.value ?? []).map(tok).join('')}</td>`] : cols.map((_, j) => `<td>${(it.fields?.[j]?.value ?? []).map(tok).join('')}</td>`);
      const open = asCode.has(it.id);
      return `<tr${sevClass(it.id) ? ` class="${sevClass(it.id).trim()}"` : ''}><td class="n">${i + 1}</td>${cells.join('')}<td class="t">${probChip(it.id)}${codeBtn(it.id, 'this row')}</td></tr>${open ? `<tr class="coderow"><td></td><td colspan="${cols.length + 1}">${code(it.from, it.to)}</td></tr>` : ''}`;
    });
    return `<table class="tbl"><thead><tr><th></th>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}<th></th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
  };
  const lane = (steps: Step[]) => (steps.length ? steps.map((s) => conn() + node(s)).join('') + conn() : `<div class="b-lane-empty">${conn()}<span class="muted">nothing</span>${conn()}</div>`);
  /** Steps inside an if or a loop, all levels down. */
  const inside = (s: Step): number => [...(s.then ?? []), ...(s.else ?? []), ...(s.body ?? [])].reduce((n, x) => n + 1 + inside(x), 0);
  const condHead = (s: Step, label: Part[]) =>
    `<div class="b-cond${sevClass(s.id)}" data-id="${esc(s.id)}"><span class="ic logic">${icon(ICON[s.icon], 15)}</span><button type="button" class="b-hbtn b-cs" data-fold="${esc(s.id)}" aria-expanded="${!folded.has(s.id)}" title="${folded.has(s.id) ? 'Unfold' : 'Fold'} (Enter)">${parts(label)}${folded.has(s.id) ? `<span class="count">${inside(s)} step${inside(s) === 1 ? '' : 's'} folded</span>` : ''}</button><span class="b-tools">${probChip(s.id)}${codeBtn(s.id, 'this')}${goBtn(s.from, s.to)}</span></div>`;
  const forkNode = (s: Step) => {
    if (folded.has(s.id) && !asCode.has(s.id)) return condHead(s, ['If', ...(s.cond ?? [])]);
    if (asCode.has(s.id)) return `${condHead(s, ['If', ...(s.cond ?? [])])}${conn()}<div class="b-node">${`<div class="b-body">${code(s.from, s.to)}</div>`}</div>`;
    const branches: [string, string][] = [['Yes', lane(s.then ?? [])], ['No', s.else ? lane(s.else) : `<div class="b-skip muted">skip</div>`]];
    return `<div class="b-forkwrap" style="--n:2">${condHead(s, ['If', ...(s.cond ?? [])])}<div class="b-fork">${branches.map(([l, b]) => `<div class="b-branch"><span class="b-blabel">${l}</span>${b}<div class="b-tail"></div></div>`).join('')}</div><div class="b-join"></div></div>`;
  };
  const loopNode = (s: Step) => {
    if (folded.has(s.id) && !asCode.has(s.id)) return condHead(s, ['Repeat', ...s.summary]);
    if (asCode.has(s.id)) return `${condHead(s, ['Repeat', ...s.summary])}${conn()}<div class="b-node"><div class="b-body">${code(s.from, s.to)}</div></div>`;
    return `<div class="b-forkwrap" style="--n:1">${condHead(s, ['Repeat', ...s.summary])}<div class="b-loop">${lane(s.body ?? [])}</div></div>`;
  };

  const settingsNode = (f: Flow) => {
    const id = 'n-settings';
    const isOpen = opened.has(id);
    const asC = asCode.has(id);
    const get = (p: string) => f.settings.find((x) => x.path === p);
    const name = get('Game.GameName');
    const exe = get('Game.ExecutableName');
    const max = get('Game.MaxPlayers');
    const sum: Part[] = [];
    if (name) sum.push(...name.value);
    if (exe) sum.push('·', ...exe.value);
    if (max) sum.push('·', `up to ${max.value[0]?.l ?? '?'} players`);
    if (f.settings.some((s) => s.path.startsWith('Game.ProtoInput.'))) sum.push('· Proto Input');
    if (get('Game.UseGoldberg')?.value[0]?.l === 'On') sum.push('· Goldberg');
    const settingProbs = f.settings.flatMap((s) => probs.get(`set:${s.path}`) ?? []);
    if (settingProbs.length) probs.set(id, settingProbs.sort((a, b) => SEV_ORDER[a.severity as Sev] - SEV_ORDER[b.severity as Sev]));
    let body = '';
    if (isOpen) {
      if (asC) body = `<div class="b-body">${f.settings.map((s) => code(s.from, s.to)).join('')}</div>`;
      else {
        const secs = new Map<string, typeof f.settings>();
        for (const s of f.settings) secs.set(s.section, [...(secs.get(s.section) ?? []), s]);
        body = `<div class="b-body"><div class="b-secs">${[...secs].map(([sec, list]) => `<fieldset class="b-sec"><legend>${esc(sec)}</legend><div class="b-form opts">${list.map((s) => `<div class="b-fl${probs.has(`set:${s.path}`) ? ' has-prob' : ''}" title="${esc(s.path)}">${esc(s.label)}</div><div class="pf">${s.value.map(tok).join('')}</div><span class="b-fa">${probChip(`set:${s.path}`)}${helpBtn(s.path)}</span>`).join('')}</div></fieldset>`).join('')}</div></div>`;
      }
    }
    const empty = !f.settings.length ? `<div class="b-sum">No settings yet.</div>` : '';
    return `<div class="b-node trigger${isOpen ? ' open' : ''}${sevClass(id)}" data-id="${id}"><div class="b-nh"><button type="button" class="b-hbtn" data-open="${id}" aria-expanded="${isOpen}"><span class="ic">${icon('sliders-horizontal', 15)}</span><span class="b-verb">Game settings</span><span class="count">${f.settings.length} option${f.settings.length === 1 ? '' : 's'}</span></button><span class="b-tools">${probChip(id)}${codeBtn(id, 'the settings')}</span></div>${empty}${sum.length && !isOpen ? `<div class="b-sum">${parts(sum)}</div>` : ''}${body}</div>`;
  };
  const questionsNode = (f: Flow) => {
    if (!f.questions.length) return '';
    const id = 'n-questions';
    const rows = f.questions.map((q, qi) => `<div class="b-q">${probChip(`q:${qi}`)}<button type="button" class="tok k-opt" data-go="${q.from}:${q.to}" title="${esc(`Context.Options["${q.key}"]`)} (show in the code)">${icon('message-circle-question', 13)}${esc(q.key)}</button> <span>${esc(q.question.length > 64 ? q.question.slice(0, 63) + '…' : q.question)}</span> <span class="muted">${esc(q.answers.length > 8 ? `${q.answers.slice(0, 6).join(' / ')} / … (${q.answers.length})` : q.answers.join(' / '))}</span></div>`).join('');
    return `${conn()}<div class="b-node trigger" data-id="${id}"><div class="b-nh"><span class="b-hbtn"><span class="ic">${icon('message-circle-question', 15)}</span><span class="b-verb">Ask the players</span><span class="count">${f.questions.length} question${f.questions.length === 1 ? '' : 's'}</span></span><span class="b-tools">${helpBtn('Game.AddOption')}</span></div><div class="b-qs">${rows}</div></div>`;
  };

  const render = () => {
    if (!open) return;
    const text = deps.editor.getValue();
    flow = readFlow(text);
    const id = flow.settings.find((x) => x.path === 'Game.GUID') ?? flow.settings.find((x) => x.path === 'Game.GameName');
    handlerKey = id?.value.map((t) => t.l).join('') ?? '';
    probs = new Map();
    if (flow.ok) {
      for (const d of deps.problems()) {
        const set = flow.settings.find((s) => d.start >= s.from && d.start < s.to);
        const st = set ? undefined : stepAt(flow, d.start);
        const q = set || st ? -1 : flow.questions.findIndex((x) => d.start >= x.from && d.start < x.to);
        const cb = set || st || q >= 0 ? undefined : flow.callbacks.find((c) => d.start >= c.from && d.start < c.to);
        const key = set ? `set:${set.path}` : st ? st.id : q >= 0 ? `q:${q}` : cb?.id;
        if (key) probs.set(key, [...(probs.get(key) ?? []), d]);
      }
      // A group shows its rows' problems while it's closed.
      for (const g of allSteps(flow)) if (g.kind === 'group') probs.set(g.id, [...(probs.get(g.id) ?? []), ...g.items!.flatMap((it) => probs.get(it.id) ?? [])]);
      for (const [k, v] of [...probs]) if (!v.length) probs.delete(k);
      for (const [k, v] of probs) probs.set(k, v.sort((a, b) => SEV_ORDER[a.severity as Sev] - SEV_ORDER[b.severity as Sev]));
    }
    const scrollTop = root.scrollTop;
    if (!flow.ok) {
      root.innerHTML = `<div class="b-canvas"><div class="empty-card"><b>The flow can't be drawn: the code doesn't parse.</b><p>${esc(flow.error ?? '')}</p><div class="empty-a"><button type="button" class="btn" data-leave>Show the code</button></div></div></div>`;
      return;
    }
    const cbs = flow.callbacks.map((c) => {
      const asC = asCode.has(c.id);
      const end = c.api === 'Game.Play' ? "The player's game starts" : 'Done';
      const steps = asC ? `${conn()}<div class="b-node"><div class="b-body">${code(c.from, c.to)}</div></div>` : c.steps.length ? lane(c.steps) : `${conn()}<div class="b-node ghost empty-node">Nothing happens here yet.</div>`;
      return `${conn()}<div class="b-trig" data-id="${esc(c.id)}">${icon('play', 15)}<b>${esc(c.label)}</b><span class="b-api">${esc(c.api)}</span>${probChip(c.id)}${helpBtn(c.api)}${codeBtn(c.id, 'this callback')}${goBtn(c.from, c.to)}</div>${steps}${asC ? conn() : ''}<div class="b-end">${esc(end)}</div>`;
    });
    const other = flow.other.length ? `${conn()}<div class="b-trig b-other">${icon('code', 15)}<b>Also at the top of the file</b><span class="count">${flow.other.length}</span></div>${lane(flow.other)}` : '';
    root.innerHTML = `<div class="b-bar"><span class="b-title">Flow</span><span class="muted b-note" title="Flow is read from the code. Editing here comes later.">Read-only for now</span><span class="sp"></span><button type="button" class="btn" data-openall>${allOpen ? 'Close all' : 'Open all'}</button><button type="button" class="btn" data-leave title="Back to the code (${'Ctrl+K V'})">Code</button></div><div class="b-canvas"><div class="b-flow"><div class="b-start">${icon('flag', 15)}Nucleus loads the handler</div>${conn()}${settingsNode(flow)}${questionsNode(flow)}${other}${cbs.join('')}</div></div>`;
    root.scrollTop = scrollTop;
  };

  let timer = 0;
  const refresh = () => {
    if (!open) return;
    clearTimeout(timer);
    timer = window.setTimeout(render, 150);
  };

  const setOpen = (o: boolean, focus = false) => {
    open = o;
    root.hidden = !o;
    // Closing while a package file shows in the pane leaves that file there.
    const fileShown = ['file-editor', 'file-card'].some((id) => document.getElementById(id)?.hidden === false);
    document.getElementById('editor')!.hidden = o || fileShown;
    btn.setAttribute('aria-pressed', String(o));
    document.querySelector('.rail [data-rail=flow]')?.setAttribute('aria-pressed', String(o));
    document.documentElement.toggleAttribute('data-flow', o);
    try {
      localStorage.setItem(KEY, o ? '1' : '0');
    } catch { /* not kept */ }
    if (o) {
      render();
      if (focus) root.querySelector<HTMLElement>('.b-hbtn')?.focus();
    } else {
      deps.editor.refresh();
      if (focus) deps.editor.focus();
    }
  };
  const toggle = () => setOpen(!open, true);
  document.addEventListener('nc-package-file-shown', () => {
    if (open) setOpen(false);
  });
  // Another tab, or the code changed (an undo, a fix): drawn again.
  deps.editor.on('swapDoc', () => {
    // Another handler: what was opened or folded was this one's.
    opened.clear();
    folded.clear();
    allOpen = false;
    refresh();
  });
  deps.editor.on('changes', refresh);
  btn.addEventListener('click', toggle);

  root.addEventListener('click', (e) => {
    // A pill inside a button (an if's head) is part of that button; one on its own opens its docs.
    const el = e.target as HTMLElement;
    const t = el.closest<HTMLElement>('button') ?? el.closest<HTMLElement>('.tok[data-ref]');
    if (!t) return;
    if (t.hasAttribute('data-leave')) return setOpen(false, true);
    if (t.hasAttribute('data-openall')) {
      if (!flow) return;
      allOpen = !allOpen;
      for (const id of ['n-settings', ...allSteps(flow).filter((x) => x.kind !== 'if' && x.kind !== 'loop').map((x) => x.id)]) allOpen ? opened.add(id) : opened.delete(id);
      if (allOpen) folded.clear();
      render();
      root.querySelector<HTMLElement>('[data-openall]')?.focus();
      return;
    }
    if (t.dataset.fold) {
      folded.has(t.dataset.fold) ? folded.delete(t.dataset.fold) : folded.add(t.dataset.fold);
      render();
      root.querySelector<HTMLElement>(`[data-fold="${CSS.escape(t.dataset.fold)}"]`)?.focus();
      return;
    }
    const go = t.dataset.go;
    if (go) {
      const [a, b] = go.split(':').map(Number);
      return deps.showInCode(a, b);
    }
    if (t.dataset.help) return deps.openReference(t.dataset.help);
    if (t.dataset.ref) return deps.openReference(t.dataset.ref);
    const id = t.dataset.open ?? t.dataset.code;
    if (t.dataset.open) opened.has(id!) ? opened.delete(id!) : opened.add(id!);
    else if (t.dataset.code) {
      asCode.has(id!) ? asCode.delete(id!) : asCode.add(id!);
      if (asCode.has(id!)) opened.add(id!);
      saveView();
    } else if (t.dataset.fmode) {
      t.dataset.to === 'code' ? asCode.add(t.dataset.fmode) : asCode.delete(t.dataset.fmode);
      saveView();
    } else return;
    const focusKey = t.dataset.open ? `[data-open="${CSS.escape(id!)}"]` : t.dataset.code ? `[data-code="${CSS.escape(id!)}"]` : `[data-fmode="${CSS.escape(t.dataset.fmode!)}"][data-to="${t.dataset.to}"]`;
    render();
    root.querySelector<HTMLElement>(focusKey)?.focus();
  });

  // Keyboard: ↑ ↓ between the nodes, Enter opens one (a button), C shows it as code, F1 its docs.
  root.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    const heads = [...root.querySelectorAll<HTMLElement>('.b-hbtn')];
    const i = heads.indexOf(t.closest('.b-hbtn') as HTMLElement);
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && i >= 0) {
      e.preventDefault();
      heads[Math.max(0, Math.min(heads.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
    } else if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey && !e.altKey && i >= 0) {
      e.preventDefault();
      (t.closest('.b-node, .b-cond, .b-trig')?.querySelector<HTMLElement>('[data-code]'))?.click();
    } else if (e.key === 'F1' && i >= 0) {
      const help = t.closest('.b-node, .b-cond, .b-trig')?.querySelector<HTMLElement>('[data-help]');
      if (help) {
        e.preventDefault();
        help.click();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false, true);
    }
  });

  let wanted = false;
  try {
    wanted = localStorage.getItem(KEY) === '1';
  } catch { /* default */ }
  return {
    toggle,
    refresh,
    isOpen: () => open,
    close: () => open && setOpen(false),
    /** Opens it again when it was open at the last visit (after the editor has its text). */
    restore: () => wanted && setOpen(true),
  };
}
