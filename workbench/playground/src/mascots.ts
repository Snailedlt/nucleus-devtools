// Duo (splitscreen.me) and Nucli (these tools), the mascots, from the concept sheet (design/mascots) through
// tools/mascots-export.cjs. Inline SVG and CSS only. How they move follows Settings → Theme → Motion (src/motion.ts);
// the sheet's CSS also sits behind prefers-reduced-motion. They stay out of the alpha 8 look.
//
// What loops and what doesn't, by what a scene means:
// - Reactions (n-ok "nothing to fix", n-bad "oops", n-fix "fixed") are an event: they play once, in every mode, and
//   hold their ending (the badge stays up, the code stays fixed). "Lively" then keeps him alive: blinking, electrons.
// - Loaders (busy: Fix with AI, Test all, Sending…) loop while they wait; a frozen spinner reads as stuck.
// - Everything else (dozing, looking around, searching) is ambient: it loops when lively, plays one cycle on "once".
// "Still" shows each scene's designed pose (a reaction its ending), never a frozen frame.
//
// Speed: a mascot moves only while it's on screen. Off-screen ones, and ones in hidden panels, are paused (CSS and
// Nucli's SMIL electrons), and a mascot starts when it's first seen, not when it's put in the page. keepMascots()
// lets a view that redraws as you type keep the mascot it already shows instead of building (and restarting) a new one.
import { MASCOT_CSS, MASCOT_SVG } from './mascots.gen';
import { motion, onMotion } from './motion';

export type MascotId = 'n-sleep' | 'n-ok' | 'n-bad' | 'n-fix' | 'n-ring' | 'n-spin' | 'n-idle' | 'n-scan' | 'n-calc';

/** Scenes that are an event: played once and held at their end, the share HOLD of their cycle (ms, from the sheet's CSS). */
const REACT: Partial<Record<MascotId, number>> = { 'n-ok': 3000, 'n-bad': 3400, 'n-fix': 3400 };
const HOLD = 0.88;
/** How long "once" lets an ambient scene's electrons run (CSS plays one cycle by itself). */
const ONCE_MS = 5000;

/** On unless they're turned off (a toast then keeps its plain icon). */
export const mascotsOn = () => motion().mascots !== 'off';

const reactSel = Object.keys(REACT).map((id) => `.masc-${id}`).join(', ');
const LOCAL = `.masc { display: inline-block; flex: none; line-height: 0; vertical-align: middle; }
.masc > svg { display: block; width: 100%; height: 100%; overflow: visible; }
:root[data-site="alpha8"] .masc, :root[data-mascots="off"] .masc { display: none !important; }
/* Not on screen (or not seen yet): nothing moves. */
.masc.masc-wait *, .masc.masc-off * { animation-play-state: paused !important; }
:root[data-mascots="once"] .masc * { animation-iteration-count: 1 !important; }
/* A loading mascot keeps moving while it waits (a frozen spinner reads as stuck); still and off still apply. */
:root[data-mascots="once"] .masc.busy * { animation-iteration-count: infinite !important; }
/* A reaction plays once whatever the mode, and holds its ending; only the blink goes on (lively). */
:root :is(${reactSel}):not(.busy) svg :not(.eye) { animation-iteration-count: ${HOLD} !important; animation-fill-mode: forwards !important; }
/* Still: the designed pose. A reaction jumps straight to its ending; the rest take no animation at all. */
:root[data-mascots="still"] .masc:not(${reactSel}) *, :root[data-mascots="still"] :is(${reactSel}) .eye { animation: none !important; }
:root[data-mascots="still"] :is(${reactSel}) svg :not(.eye) { animation-duration: 1ms !important; animation-delay: 0s !important; }`;

type MSvg = SVGSVGElement & { _left?: number; _t?: number; _since?: number };
let ready = false;
let n = 0;
let io: IntersectionObserver | null = null;

// SMIL (Nucli's electrons) ignores CSS: run it only while the mascot is on screen, and for "once", only until it has
// been seen for ONCE_MS (or a reaction's length).
function smil(m: HTMLElement) {
  const svg = m.firstElementChild as MSvg | null;
  if (!svg || typeof svg.pauseAnimations !== 'function') return;
  const mode = motion().mascots;
  const seen = !m.classList.contains('masc-wait') && !m.classList.contains('masc-off');
  clearTimeout(svg._t);
  if (svg._since !== undefined && svg._left !== undefined) svg._left -= performance.now() - svg._since;
  svg._since = undefined;
  try {
    if (mode === 'still' || mode === 'off') { svg.pauseAnimations(); svg.setCurrentTime(0); return; }
    const forever = mode === 'loop' || m.classList.contains('busy');
    if (!seen || (!forever && (svg._left ?? 1) <= 0)) { svg.pauseAnimations(); return; }
    svg.unpauseAnimations();
    if (forever) return;
    svg._left ??= reactMs(m) ?? ONCE_MS;
    svg._since = performance.now();
    svg._t = window.setTimeout(() => { svg._left = 0; svg._since = undefined; try { svg.pauseAnimations(); } catch { /* gone */ } }, svg._left);
  } catch { /* not ready */ }
}

// A reaction's length, up to where it holds.
function reactMs(m: HTMLElement): number | undefined {
  const ms = REACT[(m.dataset.m ?? '').split('|')[0] as MascotId];
  return ms === undefined ? undefined : ms * HOLD;
}

function watch(m: HTMLElement) {
  if (m.dataset.io) return;
  m.dataset.io = '1';
  m.classList.add('masc-wait');
  io?.observe(m);
  smil(m);
}

function setup() {
  if (ready) return;
  ready = true;
  const s = document.createElement('style');
  s.id = 'mascot-css';
  // The scenes' code windows and tracks take the workbench's own colours, so they suit every look, light or dark.
  s.textContent = LOCAL + '\n' + MASCOT_CSS + '\n.masc { --panel: var(--surface); --panel-line: var(--line); --code: color-mix(in srgb, var(--fg) 28%, transparent); --track: var(--line); }';
  document.head.append(s);
  io = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((es) => es.forEach((e) => {
      const m = e.target as HTMLElement;
      if (e.isIntersecting) m.classList.remove('masc-wait', 'masc-off');
      else if (!m.classList.contains('masc-wait')) m.classList.add('masc-off');
      smil(m);
    }), { rootMargin: '64px' })
    : null;
  // New mascots, wherever they're put: the check is cheap for everything else that's added (the editor's lines).
  new MutationObserver((ms) => {
    for (const r of ms) for (const nd of r.addedNodes) {
      if (!(nd instanceof Element)) continue;
      if (nd.classList.contains('masc')) watch(nd as HTMLElement);
      else if (nd.getElementsByClassName('masc').length) for (const m of nd.getElementsByClassName('masc')) watch(m as HTMLElement);
    }
  }).observe(document.body, { childList: true, subtree: true });
  document.querySelectorAll<HTMLElement>('.masc').forEach(watch);
  onMotion(() => document.querySelectorAll<HTMLElement>('.masc').forEach((m) => {
    const svg = m.firstElementChild as MSvg | null;
    if (svg) svg._left = undefined; // a new mode starts "once" afresh
    smil(m);
  }));
}

/** A mascot scene as HTML. With a label it's an image for screen readers; without one it's decoration. */
export function mascot(id: MascotId, opts: { size?: number; label?: string; className?: string; zoom?: number; busy?: boolean } = {}): string {
  setup();
  // Each copy gets its own ids, so a hidden copy can't take another's gradients with it.
  const k = `m${id}-`;
  const svg = MASCOT_SVG[id].split(`"${k}`).join(`"${k}${++n}-`).split(`#${k}`).join(`#${k}${n}-`);
  const size = opts.size ?? 48;
  // Small spots (a toast, a header) zoom in on the character: the scenes leave room for sparkles and jumps.
  const z = opts.zoom ?? (size <= 48 ? 1.5 : 1);
  const view = z === 1 ? svg : svg.replace(/viewBox="0 0 120 120"/, `viewBox="${(60 - 60 / z).toFixed(1)} ${(60 - 60 / z).toFixed(1)} ${(120 / z).toFixed(1)} ${(120 / z).toFixed(1)}"`);
  const a11y = opts.label ? `role="img" aria-label="${opts.label.replace(/"/g, '&quot;')}"` : 'aria-hidden="true"';
  // The key says when two mascots are the same scene, drawn the same way (keepMascots).
  const key = [id, size, z, opts.busy ? 'busy' : '', opts.className ?? '', opts.label ?? ''].join('|').replace(/"/g, '');
  return `<span class="masc masc-${id}${opts.busy ? ' busy' : ''}${opts.className ? ' ' + opts.className : ''}" data-m="${key}" ${a11y} style="width:${size}px;height:${size}px">${view}</span>`;
}

/**
 * Redraw `el` with `draw()` but keep the mascots it already shows: a new mascot of the same scene (same key) is
 * swapped for the old one, which carries on where it was (a reaction isn't replayed on every keystroke, a loader
 * doesn't restart on every progress tick) and no new SVG has to be laid out.
 */
export function keepMascots(el: Element, draw: () => void): void {
  const old = [...el.querySelectorAll<HTMLElement>('.masc[data-m]')];
  draw();
  if (!old.length) return;
  for (const m of el.querySelectorAll<HTMLElement>('.masc[data-m]')) {
    const i = old.findIndex((o) => o.dataset.m === m.dataset.m);
    if (i < 0) continue;
    m.replaceWith(old[i]);
    old.splice(i, 1);
  }
}
