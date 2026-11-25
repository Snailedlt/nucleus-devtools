// Duo (splitscreen.me) and Nucli (these tools), the mascots, from the concept sheet (design/mascots) through
// tools/mascots-export.cjs. Inline SVG and CSS only. How they move follows Settings → Theme → Motion (src/motion.ts);
// the sheet's CSS also sits behind prefers-reduced-motion. They stay out of the alpha 8 look.
//
// Every scene loops while it's on screen when Duo and Nucli are lively: loaders (a frozen spinner reads as stuck),
// reactions ("Nothing to fix", "Oops", "Fixed": they stand for a message that stays up) and the ambient ones (dozing,
// looking around, searching). A scene that is held shows its pose (POSE): the moment of its cycle that says what it
// is for, never just its first or last frame. "Still" holds every scene; "Loaders only" (the Some level) holds all
// but the ones that show work under way (a loader marked busy, a progress).
//
// Speed: a mascot moves only while it's on screen. Off-screen ones, and ones in hidden panels, are paused (CSS and
// Nucli's SMIL electrons), and a mascot starts when it's first seen, not when it's put in the page. keepMascots()
// lets a view that redraws as you type keep the mascot it already shows instead of building (and restarting) a new one.
import { MASCOT_CSS, MASCOT_SVG } from './mascots.gen';
import { motion, onMotion } from './motion';

export type MascotId = 'n-sleep' | 'n-ok' | 'n-bad' | 'n-fix' | 'n-ring' | 'n-spin' | 'n-idle' | 'n-scan' | 'n-calc' | 'load';

/** A held scene's pose: the moment that says what the scene is for, in seconds from the start of its cycle. Dozing
 *  with the Zs up, "All good" with its check out, "Oops" with its warning, "Fixed" with the line green, the scan bar
 *  on the code. Picked by eye from a sheet of each scene's frames; a scene's first frame is often the state before
 *  anything happened, and its last one the way back to the start. The loaders that follow a progress (n-ring, load)
 *  are drawn by mascotprogress.ts instead, at the pose for that progress. */
export const POSE: Record<MascotId, number> = {
  'n-sleep': 2.6, 'n-ok': 2.05, 'n-bad': 2.05, 'n-fix': 2.4, 'n-idle': 1.5, 'n-scan': 1.4, 'n-calc': 0.7, 'n-spin': 0.7, 'n-ring': 0, load: 0,
};

/** On unless they're turned off (a toast then keeps its plain icon). */
export const mascotsOn = () => motion().mascots !== 'off';

/** Held: Still, or Loaders only for a scene that shows no work under way. */
const HELD = ':root[data-mascots="still"] .masc, :root[data-mascots="work"] .masc:not(.busy):not(.prog)';
const held = (sel: string) => HELD.split(', ').map((h) => `${h} ${sel}`).join(', ');
const LOCAL = `.masc { display: inline-block; flex: none; line-height: 0; vertical-align: middle; }
.masc > svg { display: block; width: 100%; height: 100%; overflow: visible; }
:root[data-site="alpha8"] .masc, :root[data-mascots="off"] .masc { display: none !important; }
/* Not on screen (or not seen yet): nothing moves. */
.masc.masc-wait *, .masc.masc-off * { animation-play-state: paused !important; }
/* Held: nothing moves, and pose() below puts the scene at the moment that says what it's for. No blink mid-pose. */
${held('*')} { animation-play-state: paused !important; }
${held('.eye')} { animation: none !important; }
/* A loader that follows real progress (mascotprogress.ts) moves by script, not by its demo keyframes; it still blinks. */
.masc.prog svg :not(.eye) { animation: none !important; }`;

let ready = false;
let n = 0;
let io: IntersectionObserver | null = null;

// SMIL (Nucli's electrons) ignores CSS, so it's paused and resumed here: running only while the mascot is on screen
// and lively, at its start otherwise.
function smil(m: HTMLElement) {
  const svg = m.firstElementChild as SVGSVGElement | null;
  if (!svg || typeof svg.pauseAnimations !== 'function') return;
  const seen = !m.classList.contains('masc-wait') && !m.classList.contains('masc-off');
  try {
    if (isHeld(m) || motion().mascots === 'off') { svg.pauseAnimations(); svg.setCurrentTime(POSE[idOf(m)] ?? 0); return; }
    if (seen) svg.unpauseAnimations(); else svg.pauseAnimations();
  } catch { /* not ready */ }
}

const idOf = (m: HTMLElement) => (m.dataset.m ?? '').split('|')[0] as MascotId;
/** Whether this mascot holds its pose now: Still, or Loaders only when it isn't one (not busy, no progress). */
function isHeld(m: HTMLElement): boolean {
  const mode = motion().mascots;
  return mode === 'still' || (mode === 'work' && !m.classList.contains('busy') && !m.classList.contains('prog'));
}
/** A held mascot at its pose: every animation of the scene at the same moment (CSS keeps them paused there), so
 *  parts that start one after another are where the scene has them at that time. */
function pose(m: HTMLElement) {
  if (!isHeld(m) || typeof m.getAnimations !== 'function') return;
  const at = (POSE[idOf(m)] ?? 0) * 1000;
  for (const a of m.getAnimations({ subtree: true })) a.currentTime = at;
}

function watch(m: HTMLElement) {
  // A copy keepMascots() already swapped back out is gone by now: nothing to watch.
  if (m.dataset.io || !m.isConnected) return;
  m.dataset.io = '1';
  m.classList.add('masc-wait');
  io?.observe(m);
  smil(m);
  pose(m);
}

function unwatch(m: HTMLElement) {
  // Still in the page (keepMascots() put it back): keep it.
  if (m.isConnected || !m.dataset.io) return;
  io?.unobserve(m);
  delete m.dataset.io;
}

function setup() {
  if (ready) return;
  ready = true;
  const s = document.createElement('style');
  s.id = 'mascot-css';
  // The scenes' code windows and tracks take the workbench's own colours, so they suit every look, light or dark.
  // The sheet keeps its motion behind the device's reduced-motion preference. Here Settings → Motion decides, and it
  // is capped at Still when the device asks for less (motion.ts), so the scenes' rules always apply: with them, Still
  // can show a reaction's ending (the fixed code, the badge up) instead of the first frame of a scene that never plays.
  s.textContent = LOCAL + '\n' + MASCOT_CSS.split('@media (prefers-reduced-motion: no-preference)').join('@media all') + '\n.masc { --panel: var(--surface); --panel-line: var(--line); --code: color-mix(in srgb, var(--fg) 28%, transparent); --track: var(--line); }';
  document.head.append(s);
  io = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((es) => es.forEach((e) => {
      const m = e.target as HTMLElement;
      if (e.isIntersecting) {
        const was = m.classList.contains('masc-wait') || m.classList.contains('masc-off');
        m.classList.remove('masc-wait', 'masc-off');
        // A loader that follows real progress stopped while it wasn't seen: it carries on (mascotprogress.ts).
        if (was) m.dispatchEvent(new Event('masc-seen'));
        pose(m); // a scene in a panel that was hidden gets its animations only now
      } else if (!m.classList.contains('masc-wait')) m.classList.add('masc-off');
      smil(m);
    }), { rootMargin: '64px' })
    : null;
  // New mascots, wherever they're put, and ones taken out for good (so the observer doesn't keep them): the check is
  // cheap for everything else that comes and goes (the editor's lines).
  const each = (nd: Node, f: (m: HTMLElement) => void) => {
    if (!(nd instanceof Element)) return;
    if (nd.classList.contains('masc')) f(nd as HTMLElement);
    else if (nd.getElementsByClassName('masc').length) for (const m of [...nd.getElementsByClassName('masc')]) f(m as HTMLElement);
  };
  new MutationObserver((ms) => {
    for (const r of ms) {
      for (const nd of r.removedNodes) each(nd, unwatch);
      for (const nd of r.addedNodes) each(nd, watch);
    }
  }).observe(document.body, { childList: true, subtree: true });
  document.querySelectorAll<HTMLElement>('.masc').forEach(watch);
  onMotion(() => document.querySelectorAll<HTMLElement>('.masc').forEach((m) => { smil(m); pose(m); }));
}

/** A mascot scene as HTML. With a label it's an image for screen readers; without one it's decoration. */
export function mascot(id: MascotId, opts: { size?: number; label?: string; className?: string; zoom?: number; busy?: boolean; view?: [number, number, number, number] } = {}): string {
  setup();
  // Each copy gets its own ids, so a hidden copy can't take another's gradients with it.
  const k = `m${id}-`;
  const svg = MASCOT_SVG[id].split(`"${k}`).join(`"${k}${++n}-`).split(`#${k}`).join(`#${k}${n}-`);
  const size = opts.size ?? 48;
  // Small spots (a toast, a header) zoom in on the character: the scenes leave room for sparkles and jumps.
  const z = opts.zoom ?? (size <= 48 ? 1.5 : 1);
  // A wide scene (Duo's bar) shows only its part of the square: `view` crops it, and the height follows.
  const view = opts.view ? svg.replace(/viewBox="0 0 120 120"/, `viewBox="${opts.view.join(' ')}"`)
    : z === 1 ? svg : svg.replace(/viewBox="0 0 120 120"/, `viewBox="${(60 - 60 / z).toFixed(1)} ${(60 - 60 / z).toFixed(1)} ${(120 / z).toFixed(1)} ${(120 / z).toFixed(1)}"`);
  const height = opts.view ? Math.round((size * opts.view[3]) / opts.view[2]) : size;
  const a11y = opts.label ? `role="img" aria-label="${opts.label.replace(/"/g, '&quot;')}"` : 'aria-hidden="true"';
  // The key says when two mascots are the same scene, drawn the same way (keepMascots).
  const key = [id, size, z, opts.busy ? 'busy' : '', opts.className ?? '', opts.label ?? '', opts.view?.join(' ') ?? ''].join('|').replace(/"/g, '');
  return `<span class="masc masc-${id}${opts.busy ? ' busy' : ''}${opts.className ? ' ' + opts.className : ''}" data-m="${key}" ${a11y} style="width:${size}px;height:${height}px">${view}</span>`;
}

/**
 * Redraw `el` with `draw()` but keep the mascots it already shows: a new mascot of the same scene (same key) is
 * swapped for the old one, which carries on where it was (a reaction isn't replayed on every keystroke, a loader
 * doesn't restart on every progress tick) and no new SVG has to be laid out.
 */
export function keepMascots(el: Element, draw: () => void): void {
  const old = [...el.querySelectorAll<HTMLElement>('.masc[data-m]')];
  // Taking a node out of the page ends its CSS animations and resets its SMIL clock, so note where each one was.
  const at = old.map(snapshot);
  draw();
  if (!old.length) return;
  for (const m of el.querySelectorAll<HTMLElement>('.masc[data-m]')) {
    const i = old.findIndex((o) => o.dataset.m === m.dataset.m);
    if (i < 0) continue;
    m.replaceWith(old[i]);
    restore(old[i], at[i]);
    old.splice(i, 1);
    at.splice(i, 1);
  }
}

type Snap = { css: Map<Element, Map<string, number>>; smil?: number; paused?: boolean };
function snapshot(m: HTMLElement): Snap {
  const css = new Map<Element, Map<string, number>>();
  for (const a of m.getAnimations({ subtree: true })) {
    const t = (a.effect as KeyframeEffect | null)?.target;
    const name = (a as CSSAnimation).animationName;
    if (!t || !name || typeof a.currentTime !== 'number') continue;
    if (!css.has(t)) css.set(t, new Map());
    css.get(t)!.set(name, a.currentTime);
  }
  const svg = m.firstElementChild as SVGSVGElement | null;
  try { return { css, smil: svg?.getCurrentTime(), paused: svg?.animationsPaused() }; } catch { return { css }; }
}
function restore(m: HTMLElement, s: Snap) {
  for (const a of m.getAnimations({ subtree: true })) {
    const t = (a.effect as KeyframeEffect | null)?.target;
    const was = t ? s.css.get(t)?.get((a as CSSAnimation).animationName) : undefined;
    if (was !== undefined) a.currentTime = was;
  }
  const svg = m.firstElementChild as SVGSVGElement | null;
  try {
    if (svg && s.smil !== undefined) { svg.setCurrentTime(s.smil); if (s.paused) svg.pauseAnimations(); }
  } catch { /* not ready */ }
}
