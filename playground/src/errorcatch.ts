// Errors in the workbench (or Learn) itself used to be silent. Now an uncaught error or rejected promise shows a small
// note that doesn't block anything: "Something went wrong. Report it?", with the error and its stack filled in when
// the person chooses to report it. Nothing is sent by itself. The same error (its message without numbers, and its
// top frames: core/report.ts errorId) shows once and counts its repeats, and its report carries that id, so reports of
// the same error find each other on GitHub.
import { errorId } from '@core/report';
import { reportIcon } from '@core/reporticons';
import { ensureReportStyles, openReportFlow } from './reportflow';

interface Seen { message: string; stack?: string; count: number }
const seen = new Map<string, Seen>();
let bar: HTMLElement | undefined;
let shownId = '';
let tool: 'workbench' | 'learn' = 'workbench';

/** Errors that aren't ours or say nothing: browser extensions, cross-origin "Script error.", layout loop warnings. */
export function ignoredError(message: string, stack = '', file = ''): boolean {
  if (!message || /^Script error\.?$/i.test(message.trim())) return true;
  if (/ResizeObserver loop/i.test(message)) return true;
  if (/(chrome|moz|safari(-web)?)-extension:\/\//.test(`${stack} ${file}`)) return true;
  // Aborted fetches and cancelled runs are expected (a newer one replaced them).
  if (/AbortError|The (user|operation) aborted|cancell?ed/i.test(message)) return true;
  return false;
}

function note(id: string) {
  const s = seen.get(id)!;
  ensureReportStyles();
  if (!bar || !document.body.contains(bar)) {
    bar = document.createElement('div');
    bar.id = 'error-note';
    bar.setAttribute('role', 'status');
    bar.innerHTML = `<span class="en-ico">${reportIcon('report', 18)}</span><span class="en-text"></span><button type="button" class="btn small" id="en-report">Report it</button><button type="button" class="btn small icon" id="en-close" aria-label="Dismiss" title="Dismiss">×</button>`;
    const st = document.createElement('style');
    st.textContent = `#error-note{position:fixed;left:12px;bottom:12px;z-index:2000;display:flex;align-items:center;gap:8px;max-width:min(520px,calc(100vw - 24px));padding:8px 10px;border:1px solid var(--line,#8886);border-left:4px solid var(--err,#c33);border-radius:var(--r-ctl,8px);background:var(--surface,#fff);color:var(--fg,#111);box-shadow:var(--sh-2,0 4px 16px #0003);font-size:14px}
#error-note .en-text{flex:1;min-width:0}#error-note .en-ico{color:var(--err,#c33);display:inline-flex}#error-note button{min-height:28px}`;
    bar.append(st);
    document.body.append(bar);
    bar.querySelector('#en-close')!.addEventListener('click', () => bar!.remove());
    bar.querySelector('#en-report')!.addEventListener('click', () => {
      const cur = seen.get(shownId);
      bar!.remove();
      if (cur) openReportFlow({ kind: 'error', tool, error: { message: cur.message, stack: cur.stack, count: cur.count } });
    });
  }
  shownId = id;
  bar.querySelector<HTMLElement>('.en-text')!.textContent = `Something went wrong${s.count > 1 ? ` (${s.count} times)` : ''}. Report it?`;
}

/** Records an error; returns its id, or '' when it's ignored. Exported for tests and for code that catches its own. */
export function reportableError(message: string, stack?: string, file?: string): string {
  if (ignoredError(message, stack, file)) return '';
  const id = errorId(message, stack);
  const s = seen.get(id);
  if (s) s.count++;
  else seen.set(id, { message, stack, count: 1 });
  // Shown once per error; repeats only update the count, and a dismissed one stays away until another error comes.
  if (!s || (bar && document.body.contains(bar) && shownId === id)) note(id);
  return id;
}

export function initErrorReports(where: 'workbench' | 'learn' = 'workbench'): void {
  tool = where;
  window.addEventListener('error', (e) => {
    const err = e.error as Error | undefined;
    reportableError(err?.message ?? e.message, err?.stack, e.filename);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as Error | string | undefined;
    reportableError(typeof r === 'string' ? r : r?.message ?? String(r), typeof r === 'object' ? r?.stack : undefined);
  });
}
