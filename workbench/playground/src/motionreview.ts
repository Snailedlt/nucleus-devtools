// The motion review (#motion-review): everything that moves in the workbench on one sheet, drawn by the same code
// that ships, so it can be judged in every look, light and dark, and at every Motion level. The list is data
// (motionlist.json); a test keeps it complete. Loaded the first time it's opened.
import list from './motionlist.json';
import { esc } from './dom';
import { mascot, type MascotId } from './mascots';
import { barProgress, ringProgress } from './mascotprogress';
import { PRESETS, PRESET_TEXT, motion, onMotion, presetOf, savedMotion, setMotion, type Preset } from './motion';

export interface MotionReviewDeps {
  toast: (text: string) => void;
  /** A note beside the line the cursor is on. */
  note: (text: string) => void;
}
type Scene = { id: string; name: string; who: string; where: string; says: string; size: number; zoom?: number; busy?: boolean; progress?: 'ring' | 'bar' };
type Ui = { name: string; moves: string; ms: number; when: string; keyframes: string[]; show?: 'dialog' | 'toast' | 'note' };

const CSS = `#motion-dialog { width: min(980px, calc(100vw - 32px)); max-height: min(90dvh, 900px); overflow: auto; }
#motion-dialog h2 { margin: 0 0 4px; } #motion-dialog h3 { font: 600 14px var(--font-display); margin: 22px 0 8px; }
.mr-bar-top { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; margin: 10px 0 0; font-size: 13px; }
.mr-bar-top label { display: inline-flex; gap: 6px; align-items: center; }
.mr-what { margin: 8px 0 0; font-size: 13px; }
.mr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; list-style: none; margin: 0; padding: 0; }
.mr-card { border: 1px solid var(--line); border-radius: var(--r-ctl); padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; min-width: 0; }
.mr-card.wide { grid-column: 1 / -1; }
.mr-stage { min-height: 88px; display: flex; align-items: center; justify-content: center; background: var(--surface-2); border-radius: 8px; padding: 8px; }
.mr-card.wide .mr-stage { display: block; min-height: 0; padding: 14px 12px 10px; }
.mr-stage .masc-load.wide { display: block; width: 100% !important; height: 41px !important; }
.mr-card b { font-size: 13px; } .mr-card .muted { line-height: 1.4; }
.mr-ctl { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: auto; }
.mr-ctl input[type=range] { flex: 1 1 120px; min-width: 0; accent-color: var(--accent); }
.mr-ctl .btn, .mr-ui .btn { padding: 3px 10px; font-size: 12px; }
.mr-ui { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.mr-ui th, .mr-ui td { text-align: left; vertical-align: top; padding: 6px 8px; border-top: 1px solid var(--line); }
.mr-ui th { font-weight: 600; } .mr-ui td:nth-child(3) { white-space: nowrap; }
.mr-wrap { overflow-x: auto; }`;

let dialog: HTMLDialogElement | null = null;
let big = false;

export function openMotionReview(deps: MotionReviewDeps): void {
  if (!dialog) {
    const s = document.createElement('style');
    s.textContent = CSS;
    document.head.append(s);
    dialog = document.createElement('dialog');
    dialog.id = 'motion-dialog';
    dialog.setAttribute('aria-labelledby', 'mr-h');
    document.body.append(dialog);
    onMotion(() => { if (dialog?.open) draw(deps); });
  }
  draw(deps);
  if (!dialog.open) dialog.showModal();
}

function sceneHtml(s: Scene): string {
  const scale = big && !s.progress ? 2 : 1;
  const art = s.progress === 'bar'
    ? mascot('load', { size: 280, view: [4, 56, 300, 51], className: 'wide' })
    : mascot(s.id as MascotId, { size: s.size * (s.progress ? (big ? 2 : 1) : scale), zoom: s.zoom ?? 1, busy: s.busy });
  const ctl = s.progress
    ? `<label class="sr-only" for="mr-p-${s.id}">${esc(s.name)}: progress</label><input type="range" id="mr-p-${s.id}" data-p="${s.id}" min="0" max="100" value="35"><button class="btn" type="button" data-jump="${s.id}">Jump +30</button><button class="btn" type="button" data-full="${s.id}">Finish</button>${s.progress === 'bar' ? `<label><input type="checkbox" data-wait="${s.id}"> No total yet</label>` : `<label><input type="checkbox" data-bad="${s.id}"> It went wrong</label>`}`
    : `<button class="btn" type="button" data-replay="${s.id}">Replay</button>`;
  return `<li class="mr-card${s.progress === 'bar' ? ' wide' : ''}" data-scene="${s.id}"><div class="mr-stage">${art}</div><b>${esc(s.name)} <span class="muted">· ${esc(s.who)}</span></b><span>${esc(s.says)}</span><span class="muted">${esc(s.where)}.</span><div class="mr-ctl">${ctl}</div></li>`;
}

function draw(deps: MotionReviewDeps) {
  const d = dialog!;
  const saved = savedMotion();
  const preset = presetOf(saved);
  const capped = JSON.stringify(motion()) !== JSON.stringify(saved);
  const scenes = list.scenes as Scene[];
  const ui = list.ui as Ui[];
  const level = (Object.keys(PRESETS) as Preset[]).map((k) => `<option value="${k}"${k === preset ? ' selected' : ''}>${k[0].toUpperCase()}${k.slice(1)}</option>`).join('') + (preset === 'custom' ? '<option value="custom" selected>Custom</option>' : '');
  d.innerHTML = `<h2 id="mr-h">Motion review</h2>
<p class="muted small" style="margin:0">Everything that moves in the workbench, drawn by the code that ships. Change the look and light or dark in Settings; the Motion level is here.</p>
<div class="mr-bar-top"><label>Motion <select id="mr-level">${level}</select></label><label><input type="checkbox" id="mr-big"${big ? ' checked' : ''}> Twice the size</label><button class="btn" type="button" id="mr-all">Replay all</button></div>
<p class="mr-what" id="mr-what"><b>${preset[0].toUpperCase()}${preset.slice(1)}:</b> ${esc(PRESET_TEXT[preset])}${capped ? ' <span class="muted">This device asks for less motion, so nothing above Still applies.</span>' : ''}</p>
<h3>Duo and Nucli</h3><ul class="mr-grid">${scenes.map(sceneHtml).join('')}</ul>
<h3>The interface</h3><div class="mr-wrap"><table class="mr-ui"><thead><tr><th>What</th><th>How it moves</th><th>Length</th><th>When</th><th><span class="sr-only">Show</span></th></tr></thead><tbody>${ui.map((u, i) => `<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.moves)}</td><td>${u.ms ? `${u.ms} ms` : 'loops'}</td><td>${esc(u.when)}</td><td>${u.show ? `<button class="btn" type="button" data-show="${i}">Show</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
<div class="actions"><button class="btn primary" type="button" id="mr-close">Close</button></div>`;
  const q = <T extends HTMLElement>(sel: string) => d.querySelector<T>(sel)!;
  const card = (id: string) => q<HTMLElement>(`[data-scene="${id}"]`);
  const range = (id: string) => q<HTMLInputElement>(`[data-p="${id}"]`);
  const show = (id: string) => {
    const s = scenes.find((x) => x.id === id)!;
    const p = Number(range(id).value) / 100;
    if (s.progress === 'ring') ringProgress(card(id), p, undefined, !!d.querySelector<HTMLInputElement>(`[data-bad="${id}"]`)?.checked);
    else barProgress(card(id), p, undefined, !!d.querySelector<HTMLInputElement>(`[data-wait="${id}"]`)?.checked && p === 0);
  };
  for (const s of scenes) if (s.progress) show(s.id);
  q<HTMLSelectElement>('#mr-level').addEventListener('change', (e) => {
    const v = (e.target as HTMLSelectElement).value;
    if (v !== 'custom') setMotion({ ...PRESETS[v as Preset] }); // redraws through onMotion
  });
  q<HTMLInputElement>('#mr-big').addEventListener('change', (e) => { big = (e.target as HTMLInputElement).checked; draw(deps); });
  q('#mr-all').addEventListener('click', () => draw(deps));
  q('#mr-close').addEventListener('click', () => d.close());
  d.querySelectorAll<HTMLElement>('[data-replay]').forEach((b) => b.addEventListener('click', () => {
    // A fresh copy starts its scene from the beginning.
    const li = card(b.dataset.replay!);
    li.querySelector('.mr-stage')!.innerHTML = sceneHtml(scenes.find((x) => x.id === b.dataset.replay)!).match(/<div class="mr-stage">(.*?)<\/div><b>/s)![1];
  }));
  d.querySelectorAll<HTMLInputElement>('[data-p]').forEach((r) => r.addEventListener('input', () => show(r.dataset.p!)));
  d.querySelectorAll<HTMLElement>('[data-jump]').forEach((b) => b.addEventListener('click', () => { const r = range(b.dataset.jump!); r.value = String(Math.min(100, Number(r.value) + 30)); show(b.dataset.jump!); }));
  d.querySelectorAll<HTMLElement>('[data-full]').forEach((b) => b.addEventListener('click', () => { range(b.dataset.full!).value = '100'; show(b.dataset.full!); }));
  d.querySelectorAll<HTMLInputElement>('[data-bad]').forEach((c) => c.addEventListener('change', () => show(c.dataset.bad!)));
  d.querySelectorAll<HTMLInputElement>('[data-wait]').forEach((c) => c.addEventListener('change', () => { if (c.checked) range(c.dataset.wait!).value = '0'; show(c.dataset.wait!); }));
  d.querySelectorAll<HTMLElement>('[data-show]').forEach((b) => b.addEventListener('click', () => {
    const u = ui[Number(b.dataset.show)];
    if (u.show === 'toast') deps.toast('This is how a message comes in.');
    else if (u.show === 'note') { d.close(); deps.note('This is how a note beside the code comes in.'); }
    else { d.close(); d.showModal(); }
  }));
}
