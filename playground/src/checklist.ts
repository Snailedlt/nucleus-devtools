// Which checks the problem lists show: the same in the workbench (both modes) and in Learn, and the same as the
// editors' Problems list (VS Code, the LSP editors): errors, warnings and infos, plus unused code as quiet rows (faded
// in the code, as VS Code fades it). Other hints (outdated options that do no harm) are listed on request (Advanced
// mode, the Hints filter).
import type { Diagnostic } from '@core/lint';

export const inProblemList = (d: Diagnostic): boolean => d.severity !== 'hint' || quietInCheck(d);

/** Unused code (an option nothing reads, a value only a variable receives): a hint tagged unnecessary. The editor fades
 *  it without a squiggle, as VS Code does, and Check lists it as a quiet row, not counted. */
export const quietInCheck = (d: Pick<Diagnostic, 'severity' | 'tags'>): boolean => d.severity === 'hint' && !!d.tags?.includes('unnecessary');

type Sev = 'error' | 'warning' | 'info' | 'hint';
export type CheckFilter = 'all' | Sev;

/** Whether a problem of this severity shows in Check: Guided mode lists all but hints; Advanced follows the filter
 *  (All: all but hints). The same for the code's problems and the "In the package" / "Against your game" lists. */
export const shownInCheck = (severity: Sev, simple: boolean, filter: CheckFilter): boolean =>
  simple || filter === 'all' ? severity !== 'hint' : severity === filter;

/** Check's counts: the code's problems and the package's and game folder's, per severity; `total` is what the
 *  lists show under All (errors, warnings and infos; hints are counted apart). */
export function countProblems(lists: { severity: Sev }[][]): Record<Sev, number> & { total: number } {
  const c = { error: 0, warning: 0, info: 0, hint: 0, total: 0 };
  for (const l of lists) for (const d of l) c[d.severity]++;
  c.total = c.error + c.warning + c.info;
  return c;
}
