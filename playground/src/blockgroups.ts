// Repeated steps in the Blocks view (blocksview.ts): runs of statements next to each other that do the same thing
// (`Context.ModifySaveFile(…)` five times, a dozen `Game.X = …` lines, or the same two or three lines again and again,
// like "var savePath = …; var savePkgOrigin = …; System.IO.File.Copy(…)") are shown as one group with a count and a
// one-line digest per step, so a long Game.Play fits on a screen. The grouping is only a view: each step is still its
// own row with its own range in the code, and the code itself never changes.

/** What a step is, for grouping: the same call, values set on the same object, the same variable. */
export interface StepLike {
  kind: string; // call, set, var, if, code
  path?: string;
  calleeText?: string;
  varName?: string;
}
export function stepShape(s: StepLike): string | undefined {
  if (s.kind === 'call') return `call ${s.path ?? s.calleeText}`;
  if (s.kind === 'set') {
    const t = s.path ?? s.calleeText ?? '';
    const i = t.lastIndexOf('.');
    return `set ${i > 0 ? t.slice(0, i + 1) : t}`;
  }
  if (s.kind === 'var') return `var ${s.varName}`;
  return undefined; // conditions and code: never grouped
}

export interface Run {
  /** Index of the first step. */
  start: number;
  /** How many steps repeat (1: the same step again and again; 2 or 3: a short sequence). */
  period: number;
  /** How many times. */
  reps: number;
}
/** The fewest repeats that make a group: three of one step, or a sequence of two or three steps twice. */
export const MIN_REPS = (period: number) => (period === 1 ? 3 : 2);

/**
 * TEMPORARY (for the maintainer's comparison, not decided yet; no UI): which steps group. `current`: as described above;
 * `identical`: only the same call three or more times; `objects5`: values set on one object only from five on.
 * Read from localStorage `nucleus-workbench-blocks-grouprule` by blocksview.ts. Remove the others once decided.
 */
export type GroupRule = 'current' | 'identical' | 'objects5';

/** The runs of repeated steps, in order, never overlapping; the longest at each place wins (then the shortest period). */
export function findRuns(shapes: (string | undefined)[], rule: GroupRule = 'current'): Run[] {
  if (rule === 'identical') shapes = shapes.map((x) => (x?.startsWith('call ') ? x : undefined));
  const minReps = (p: number, shape: string | undefined) => (rule === 'objects5' && p === 1 && shape?.startsWith('set ') ? 5 : MIN_REPS(p));
  const runs: Run[] = [];
  const n = shapes.length;
  const same = (a: number, b: number, p: number) => {
    for (let j = 0; j < p; j++) if (shapes[a + j] !== shapes[b + j]) return false;
    return true;
  };
  for (let i = 0; i < n;) {
    let best: Run | undefined;
    for (let p = 1; p <= (rule === 'identical' ? 1 : 3) && i + p <= n; p++) {
      const unit = shapes.slice(i, i + p);
      if (unit.some((x) => !x)) break;
      if (p > 1 && unit.every((x) => x === unit[0])) continue; // that's period 1
      let reps = 1;
      while (i + (reps + 1) * p <= n && same(i, i + reps * p, p)) reps++;
      if (reps >= minReps(p, unit[0]) && (!best || reps * p > best.reps * best.period)) best = { start: i, period: p, reps };
    }
    if (best) {
      runs.push(best);
      i += best.reps * best.period;
    } else i++;
  }
  return runs;
}
