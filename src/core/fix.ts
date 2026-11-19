// Apply every safe automatic fix the linter offers ("Fix all"), repeatedly until
// nothing more changes. Deterministic, offline, no AI.
import { lint, Diagnostic, LintOptions, TextEdit, lineOf } from './lint';

export interface AppliedFix {
  rule: string;
  title: string;
  line: number;
}
export interface FixAllResult {
  code: string;
  applied: AppliedFix[];
  /** Problems still present after fixing (errors and warnings). */
  remaining: Diagnostic[];
  /** Harmless cleanups (lines that do nothing) still fixable in `code`: those `cleanups: false` left alone. */
  cleanups: number;
}

/** A harmless problem whose fix only removes something that does nothing (tagged `unnecessary`). */
export const isCleanup = (d: Diagnostic) => !!d.tags?.includes('unnecessary') && d.severity !== 'error';

/**
 * Applies the preferred fix of each diagnostic. Fixes whose edits overlap an
 * already chosen fix wait for the next pass (the code is re-linted in between),
 * so nested problems (an arrow inside an arrow) resolve over several passes.
 */
export function fixAll(text: string, options: LintOptions & { maxPasses?: number; /** Also apply harmless cleanups (default true). */ cleanups?: boolean } = {}): FixAllResult {
  let code = text;
  const applied: AppliedFix[] = [];
  for (let pass = 0; pass < (options.maxPasses ?? 10); pass++) {
    const diags = lint(code, options);
    const chosen: TextEdit[] = [];
    const seen = new Set<string>();
    const overlaps = (e: TextEdit) =>
      chosen.some((c) => (e.start < c.end && c.start < e.end) || (e.start === e.end && e.start >= c.start && e.start <= c.end) || (c.start === c.end && c.start >= e.start && c.start <= e.end));
    for (const d of diags) {
      const fix = d.fixes?.find((f) => f.preferred);
      if (!fix) continue;
      // A cleanup is skipped only while it repairs nothing: a deletion that also removes an error is a fix.
      if (options.cleanups === false && isCleanup(d) && !diags.some((x) => x.severity === 'error' && fix.edits.some((e) => e.start < e.end && x.start >= e.start && x.end <= e.end))) continue;
      const key = JSON.stringify(fix.edits);
      if (seen.has(key)) continue; // the same fix offered by several diagnostics
      if (fix.edits.some(overlaps)) continue;
      seen.add(key);
      chosen.push(...fix.edits);
      applied.push({ rule: d.rule, title: fix.title.replace(/`/g, ''), line: lineOf(code, d.start) + 1 });
    }
    if (!chosen.length) break;
    for (const e of [...chosen].sort((a, b) => b.start - a.start || b.end - a.end)) code = code.slice(0, e.start) + e.text + code.slice(e.end);
  }
  const after = lint(code, options);
  return {
    code,
    applied,
    remaining: after.filter((d) => d.severity === 'error' || d.severity === 'warning'),
    cleanups: after.filter((d) => isCleanup(d) && d.fixes?.some((f) => f.preferred)).length,
  };
}

/**
 * `--fix-dry-run`: which of the file's own problems (`found`, in `text`) are still there after the fixes (`left`,
 * linted from the fixed text), so they show at the file's own lines. Each problem left is matched to one of the
 * file's by rule and message, those on lines no fix touched first; then by rule alone, since a fix can change the
 * message of one it leaves (undefined-name's depends on where the name is), and the kept one takes the new message.
 * `extra` is what's left with no match at all: still shown (at its line in the fixed text), so the dry run fails
 * whenever `--fix` would.
 */
export function matchLeftAfterFix<D extends Pick<Diagnostic, 'rule' | 'message' | 'severity' | 'start'>>(text: string, found: D[], applied: Pick<AppliedFix, 'rule' | 'line'>[], left: D[]): { kept: D[]; extra: D[] } {
  const rest = [...left];
  const touched = (d: D) => applied.some((f) => f.rule === d.rule && f.line === lineOf(text, d.start) + 1);
  const ordered = [...found.filter((d) => !touched(d)), ...found.filter(touched)];
  const kept = new Map<D, D>();
  const sameMessage = (d: D, l: D) => d.rule === l.rule && d.message === l.message;
  const sameRule = (d: D, l: D) => d.rule === l.rule && d.severity === l.severity;
  for (const same of [sameMessage, sameRule]) {
    for (const d of ordered) {
      if (kept.has(d)) continue;
      const i = rest.findIndex((l) => same(d, l));
      if (i < 0) continue;
      kept.set(d, { ...d, message: rest[i].message });
      rest.splice(i, 1);
    }
  }
  return { kept: found.flatMap((d) => kept.get(d) ?? []), extra: rest };
}
