// Which checks the problem lists show: the same in the workbench (both modes) and in Learn, and the same as the
// editors' Problems list (VS Code, the LSP editors): errors, warnings and infos. Hints (outdated options that do no
// harm) only fade the code; the workbench lists them on request (Advanced mode, the Hints filter).
import type { Diagnostic } from '@core/lint';

export const inProblemList = (d: Diagnostic): boolean => d.severity !== 'hint';

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
