// The shared report icons: one small set for reporting a problem, saying a check (or a doc) is wrong, and asking for
// a feature, used by the workbench, Learn and the VS Code panels so a report looks the same everywhere. Inline SVG
// (24×24, stroked with currentColor, so it follows the text colour and every theme), drawn as a decoration: the
// button carrying it gets the accessible name and the tooltip (reportButton). No imports: the workbench's tests load
// this file on its own.

export type ReportIconKind = 'report' | 'flag' | 'idea';

const PATHS: Record<ReportIconKind, string> = {
  // A speech bubble with an exclamation mark: something went wrong, tell us.
  report: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.2 3.6c-.5.4-1.3.1-1.3-.6V16A1.5 1.5 0 0 1 4 14.5z"/><path d="M12 7.5v4"/><path d="M12 13.9h.01"/>',
  // A flag on a pole: flag this check (or doc) as wrong.
  flag: '<path d="M5.5 21V4"/><path d="M5.5 4.5h11.2c.7 0 1.1.8.7 1.4L15.3 9l2.1 3.1c.4.6 0 1.4-.7 1.4H5.5"/>',
  // A light bulb: an idea, something you want to do.
  idea: '<path d="M9.5 17.5h5"/><path d="M10.5 20.5h3"/><path d="M12 3.5a5.5 5.5 0 0 0-3.4 9.8c.6.5.9 1.2.9 2v.7h5v-.7c0-.8.3-1.5.9-2A5.5 5.5 0 0 0 12 3.5z"/>',
};

/** What each icon does, in the words a button or tooltip uses. */
export const REPORT_ACTIONS: Record<ReportIconKind, { label: string; tip: string }> = {
  report: { label: 'Report a problem', tip: 'Report a problem: opens a report with the details filled in. You see everything before it is sent.' },
  flag: { label: 'This check is wrong', tip: 'This check is wrong: tell us, with the check and the line filled in. You see everything before it is sent.' },
  idea: { label: 'Request a feature', tip: 'Request a feature: say what you want to do and what is in the way.' },
};

/** The icon alone, as SVG markup: hidden from screen readers (the button says what it does). */
export function reportIcon(kind: ReportIconKind, size = 16, className = 'rep-ico'): string {
  return `<svg class="${className}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${PATHS[kind]}</svg>`;
}

const attr = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** A report button: the icon with its text where there's room (`text: true`), or the icon alone with the same words
 *  as its accessible name and tooltip where space is tight. `attrs` adds attributes (data-*, id). */
export function reportButton(kind: ReportIconKind, o: { text?: boolean | string; label?: string; tip?: string; className?: string; attrs?: string } = {}): string {
  const label = o.label ?? REPORT_ACTIONS[kind].label;
  const tip = o.tip ?? REPORT_ACTIONS[kind].tip;
  const text = o.text === true ? label : o.text || '';
  return `<button type="button" class="rep-btn${text ? '' : ' rep-only'}${o.className ? ` ${o.className}` : ''}" title="${attr(tip)}"${text ? '' : ` aria-label="${attr(label)}"`}${o.attrs ? ` ${o.attrs}` : ''}>${reportIcon(kind)}${text ? `<span>${attr(text)}</span>` : ''}</button>`;
}

/** The buttons' look, for pages that don't style them themselves (the VS Code panels use their theme's colours):
 *  quiet until hovered, a visible focus ring, at least 24×24 px to tap. */
export const REPORT_BUTTON_CSS = `.rep-btn{display:inline-flex;align-items:center;gap:5px;min-height:24px;min-width:24px;padding:2px 6px;border:1px solid transparent;border-radius:4px;background:none;color:inherit;font:inherit;cursor:pointer;opacity:.85}
.rep-btn:hover{opacity:1;border-color:currentColor}
.rep-btn:focus-visible{opacity:1;outline:2px solid var(--vscode-focusBorder,currentColor);outline-offset:1px}
.rep-btn.rep-only{padding:3px;justify-content:center}
.rep-ico{flex:none}`;
