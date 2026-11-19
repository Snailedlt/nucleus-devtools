// The loaders that follow real progress (issue #47), driven here instead of by their looping keyframes:
// - Nucli's ring (n-ring, Test all): the arc grows to the progress, and the four electrons ride just behind its tip on
//   springs. When the progress jumps they chase it: the first slams into the tip and bounces back, the others bump
//   into each other (squash, rebound), then they settle. The physics are the concept sheet's (design/mascots, "Progress
//   ring, v2"), run live.
// - Duo's bar (load, reading a game's folder): he pushes the end of the bar. While it moves he walks; when it stalls he
//   leans in and strains (a sweat drop); at 100 % he lets go, the bar turns green, a check pops and he hops.
// Call ringProgress / barProgress with 0..1 as often as the progress changes; a mascot redrawn by keepMascots() keeps
// its state (it lives on the element). "Still" (and reduced motion) shows the pose for that progress, nothing moving.
import { motion } from './motion';

type Sim = { raf: number; last: number; [k: string]: unknown };
type El = HTMLElement & { _prog?: Sim };
const still = () => motion().mascots !== 'loop' && motion().mascots !== 'once';
const loader = (root: ParentNode, cls: string): El | null =>
  root instanceof HTMLElement && root.classList.contains(cls) ? (root as El) : root.querySelector<El>('.' + cls);

function run(m: El, step: (dt: number) => boolean) {
  const s = m._prog!;
  if (s.raf) return;
  const tick = (now: number) => {
    // A frame at most 1/20 s: back from a hidden tab, it carries on instead of jumping.
    const dt = Math.min(0.05, (now - s.last) / 1000);
    s.last = now;
    // Off screen or taken out of the page: stop until the next update.
    if (!m.isConnected || m.classList.contains('masc-off')) { s.raf = 0; return; }
    s.raf = step(dt) ? requestAnimationFrame(tick) : 0;
  };
  s.last = performance.now();
  s.raf = requestAnimationFrame(tick);
}

// ---- The ring ----
const CAP = 0.034, GAP = 0.046, K0 = 1400, K1 = 700, D0 = 2 * Math.sqrt(K0) * 0.3, D1 = 2 * Math.sqrt(K1) * 0.3, E = 0.45, ARC = 276.5;
type Ring = Sim & { p: number; head: number; x: number[]; v: number[]; sq: number[] };

/** Nucli's ring (n-ring) under `root` shows `p` (0..1). */
export function ringProgress(root: ParentNode, p: number): void {
  const m = loader(root, 'masc-n-ring');
  if (!m) return;
  p = Math.max(0, Math.min(1, p));
  m.classList.add('prog');
  const s = (m._prog ??= { raf: 0, last: 0, p, head: 0, x: [0, 1, 2, 3].map((k) => -CAP - k * GAP), v: [0, 0, 0, 0], sq: [0, 0, 0, 0] }) as Ring;
  s.p = p;
  const q = (sel: string) => m.querySelector<SVGElement>(sel);
  const draw = () => {
    q('.rqarc')?.style.setProperty('stroke-dashoffset', (ARC * (1 - s.head)).toFixed(1));
    for (let k = 0; k < 4; k++) {
      q('.rq' + k)?.style.setProperty('transform', `rotate(${(s.x[k] * 360).toFixed(2)}deg)`);
      const sq = s.sq[k];
      q('.rqb' + k)?.style.setProperty('transform', sq > 0.002 ? `scale(${(1 - sq).toFixed(3)}, ${(1 + sq * 0.7).toFixed(3)})` : 'none');
    }
    q('.n-core')?.style.setProperty('transform', Math.max(...s.sq) > 0.12 ? 'scale(1.025, .975)' : 'none');
  };
  if (still()) {
    // The pose for this progress: the arc to it, the electrons lined up behind its tip.
    s.head = p; s.x = s.x.map((_, k) => p - CAP - k * GAP); s.v = [0, 0, 0, 0]; s.sq = [0, 0, 0, 0];
    return draw();
  }
  run(m, (dt) => {
    // Small steps, so the springs and the bumps stay stable at any frame rate.
    for (let t = 0; t < dt; t += 1 / 600) {
      const h = Math.min(1 / 600, dt - t);
      const before = s.head;
      s.head += (s.p - s.head) * (1 - Math.exp(-h / 0.06));
      const vh = (s.head - before) / h;
      s.v[0] += (K0 * (s.head - CAP - s.x[0]) - D0 * s.v[0]) * h;
      for (let k = 1; k < 4; k++) s.v[k] += (K1 * (s.x[k - 1] - GAP - s.x[k]) - D1 * s.v[k]) * h;
      for (let k = 0; k < 4; k++) s.x[k] += s.v[k] * h;
      // The first one against the tip, the rest against each other.
      if (s.x[0] > s.head - CAP) {
        s.x[0] = s.head - CAP;
        if (s.v[0] > vh) { s.sq[0] = Math.max(s.sq[0], Math.min(0.34, (s.v[0] - vh) * 0.22)); s.v[0] = vh - E * (s.v[0] - vh); }
      }
      for (let k = 1; k < 4; k++) {
        const lim = s.x[k - 1] - GAP * 0.92;
        if (s.x[k] <= lim) continue;
        s.x[k] = lim;
        const rel = s.v[k] - s.v[k - 1];
        if (rel > 0) {
          const mid = (s.v[k] + s.v[k - 1]) / 2;
          s.v[k] = mid - (E * rel) / 2; s.v[k - 1] = mid + (E * rel) / 2;
          const sq = Math.min(0.34, rel * 0.25);
          s.sq[k] = Math.max(s.sq[k], sq); s.sq[k - 1] = Math.max(s.sq[k - 1], sq * 0.8);
        }
      }
      for (let k = 0; k < 4; k++) s.sq[k] *= Math.exp(-h / 0.07);
    }
    draw();
    // Settled: everything still and in place.
    return Math.abs(s.p - s.head) > 1e-4 || s.v.some((v) => Math.abs(v) > 1e-3) || s.sq.some((x) => x > 0.002) || Math.abs(s.x[0] - (s.head - CAP)) > 1e-3;
  });
}

// ---- The bar ----
const X0 = 18.5, L = 83, XMAX = 84, SC = 0.46;
type Bar = Sim & { p: number; shown: number; ph: number; still: number; t: number; done: number };

/** Duo's bar (load) under `root` shows `p` (0..1). */
export function barProgress(root: ParentNode, p: number): void {
  const m = loader(root, 'masc-load');
  if (!m) return;
  p = Math.max(0, Math.min(1, p));
  m.classList.add('prog');
  const s = (m._prog ??= { raf: 0, last: 0, p, shown: p, ph: 0, still: 0, t: 0, done: 0 }) as Bar;
  if (p !== s.p) s.still = 0; // it moved: no longer stalled
  s.p = p;
  const q = (sel: string) => m.querySelector<SVGElement>(sel);
  const set = (sel: string, prop: string, v: string) => q(sel)?.style.setProperty(prop, v);
  const draw = () => {
    const x = Math.min(X0 + L * s.shown + 4.5 - 10, XMAX);
    const moving = !s.done && s.still < 0.6;
    const stall = !s.done && !moving;
    let rot = 0, y = 0, sy = 1, lf = 0, rf = 0;
    if (s.done) {
      // He lets go and hops once.
      const h = (s.done - 0.15) / 0.42;
      if (h > 0 && h < 1) { y = -16 * Math.sin(h * Math.PI); sy = 1 + 0.1 * Math.sin(h * Math.PI); }
      rot = 6 * Math.max(0, 1 - s.done / 0.15);
    } else if (stall) {
      rot = 13 + 1.6 * Math.sin(s.t * 42);
      sy = 1 - 0.05 * Math.abs(Math.sin(s.t * 17));
    } else {
      rot = 6 + 3 * Math.sin(s.ph);
      y = -Math.abs(Math.sin(s.ph)) * 1.5;
      sy = 1 + 0.03 * Math.cos(2 * s.ph);
      lf = -2.2 * Math.max(0, Math.sin(s.ph)); rf = -2.2 * Math.max(0, -Math.sin(s.ph));
    }
    set('.ld-w', 'transform', `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`);
    set('.ld-b', 'transform', `rotate(${rot.toFixed(2)}deg) scale(${(1 / Math.sqrt(sy)).toFixed(3)}, ${sy.toFixed(3)})`);
    set('.d-fl', 'transform', `translateY(${(lf / SC).toFixed(2)}px)`);
    set('.d-fr', 'transform', `translateY(${(rf / SC).toFixed(2)}px)`);
    set('.ld-fill', 'stroke-dashoffset', (L * (1 - s.shown)).toFixed(2));
    set('.ld-done', 'opacity', s.done ? '1' : '0');
    const ck = !s.done ? 0 : s.done < 0.1 ? 1.3 * (s.done / 0.1) : s.done < 0.22 ? 1.3 - (0.3 * (s.done - 0.1)) / 0.12 : 1;
    set('.ld-chk', 'transform', `scale(${ck.toFixed(3)})`);
    set('.ld-chk', 'opacity', ck ? '1' : '0');
    set('.ld-sw', 'opacity', stall ? '1' : '0');
    set('.ld-sw', 'transform', `translateY(${stall ? (((s.t * 1.4) % 1) * 7).toFixed(2) : 0}px)`);
    set('.fa', 'opacity', s.done ? '0' : '1');
    set('.fb', 'opacity', s.done ? '1' : '0');
    set('.look', 'transform', s.done ? 'none' : 'translate(2.6px, .4px)');
  };
  if (still()) {
    s.shown = p; s.done = p >= 1 ? 1 : 0; s.still = 0;
    return draw();
  }
  run(m, (dt) => {
    s.t += dt;
    const before = s.shown;
    s.shown += (s.p - s.shown) * (1 - Math.exp(-dt / 0.12));
    if (Math.abs(s.p - s.shown) < 1e-4) s.shown = s.p;
    const dx = Math.abs(s.shown - before) * L;
    s.ph += dx * 0.6;
    if (dx < 0.02) s.still += dt;
    if (s.shown >= 1) s.done += dt;
    draw();
    // Done and landed: stop. A stall keeps him straining (until the next update or he's off screen).
    return !(s.done > 0.8);
  });
}
