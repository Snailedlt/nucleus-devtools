// The report dialog, shared by the workbench and Learn: "This check is wrong", "Nucleus did something different",
// "Something went wrong", "Ask for this to be documented", "I'm stuck here", Report a problem and Request a feature.
// core/report.ts decides where the report goes and fills the form; this shows what will be sent (the flagged code, the
// simulation, the error, the details: each optional part with its own checkbox), asks the one question that needs the
// person, lists open reports that may be the same, then opens GitHub (recommended) or copies the report for the
// testers' Discord thread. Nothing is sent by itself. Opened on request only: nothing here is on screen until asked.
import { buildReport, findDuplicates, handlerHelp, handlerOrigin, CHECK_VERDICTS, DISCORD_THREAD, HANDLER_OR_TOOLS, type HandlerOrigin, type IssueHit, type ReportInput, type ReportKind } from '@core/report';
import { reportIcon, type ReportIconKind } from '@core/reporticons';
import { contextLines, openHandler, openReport, workbenchVersion, GH_APP_NOTE, onPhone } from './report';

export interface FlowOptions {
  kind: ReportKind;
  tool?: 'workbench' | 'learn';
  title?: string;
  rule?: string;
  message?: string;
  line?: number;
  /** The flagged lines (check), the learner's code (stuck): shown, and sent only when ticked. */
  code?: string;
  sim?: string;
  error?: { message: string; stack?: string; count?: number };
  query?: string;
  lesson?: { id: string; title: string };
  /** The open handler's code, only to read its Hub lines (never sent). */
  handlerCode?: string;
  extra?: Record<string, string | undefined>;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

interface KindText { icon: ReportIconKind; heading: string; intro: string; ask?: { label: string; required?: boolean; rows?: number }; part?: string }
const TEXT: Record<ReportKind, KindText> = {
  check: { icon: 'flag', heading: 'This check is wrong', intro: 'Checks should only warn about what really breaks or does nothing in Nucleus Co-op. Tell us what it does instead.', ask: { label: 'What does Nucleus really do? (optional: you can also write it on the form)' }, part: 'Include the flagged code' },
  tryit: { icon: 'report', heading: 'Nucleus did something different', intro: 'What Try it showed goes with the report, next to what really happened.', ask: { label: 'What really happened in Nucleus Co-op?', rows: 3 }, part: 'Include what Try it showed' },
  error: { icon: 'report', heading: 'Something went wrong', intro: "The workbench hit an error. Nothing was sent: if you report it, the error is filled in for you.", ask: { label: 'What were you doing? (optional)' }, part: "Include the error's stack (where in the workbench it happened)" },
  docs: { icon: 'idea', heading: 'Ask for this to be documented', intro: 'The Docs have nothing for this yet. Tell us what you were looking for.', ask: { label: 'What did you want to find out? (optional)' } },
  stuck: { icon: 'idea', heading: "I'm stuck here", intro: "Tell us where this lesson loses you, so we can make it clearer. The lesson is filled in for you.", ask: { label: "What's in the way? (optional)", rows: 3 }, part: 'Include your code in this lesson' },
  problem: { icon: 'report', heading: 'Report a problem', intro: 'Something wrong, confusing or missing? The details below are filled in for you.', ask: { label: 'What happened, and what did you expect? (optional: you can also write it on the form)', rows: 3 } },
  feature: { icon: 'idea', heading: 'Request a feature', intro: "Start from the problem: what you're trying to do, and what's in the way. We'll work out the best way to help.", ask: { label: 'What are you trying to do?', rows: 3 } },
};

let dlg: HTMLDialogElement | undefined;
function dialog(): HTMLDialogElement {
  if (dlg && document.body.contains(dlg)) return dlg;
  if (!document.getElementById('rf-style')) {
    const st = document.createElement('style');
    st.id = 'rf-style';
    st.textContent = CSS;
    document.head.append(st);
  }
  dlg = document.createElement('dialog');
  dlg.id = 'report-dialog';
  dlg.className = 'rf';
  dlg.setAttribute('aria-labelledby', 'rf-h');
  document.body.append(dlg);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg!.close(); }); // a click outside the box
  return dlg;
}

function origin(o: FlowOptions): HandlerOrigin | undefined {
  const h = openHandler();
  if (!h && !o.handlerCode) return undefined;
  const kind = !h ? 'own' : h.kind === 'hub' ? 'hub' : h.kind === 'example' ? 'example' : h.kind === 'template' ? 'template' : 'own';
  return handlerOrigin(o.handlerCode, { kind, name: h?.name, hubId: h?.hubId, hubVersion: h?.hubVersion, link: h?.link });
}

/** Opens the report dialog. */
export function openReportFlow(o: FlowOptions): void {
  const d = dialog();
  const t = TEXT[o.kind];
  const tool = o.tool ?? 'workbench';
  const handler = o.kind === 'docs' || o.kind === 'stuck' || o.kind === 'feature' || o.kind === 'error' ? undefined : origin(o);
  const part = o.kind === 'check' || o.kind === 'stuck' ? o.code : o.kind === 'tryit' ? o.sim : o.kind === 'error' ? o.error?.stack ?? '' : '';
  const input = (): ReportInput => {
    const what = (d.querySelector<HTMLTextAreaElement>('#rf-what')?.value ?? '').trim();
    const include = d.querySelector<HTMLInputElement>('#rf-part')?.checked ?? false;
    const verdict = d.querySelector<HTMLSelectElement>('#rf-verdict')?.value;
    return {
      kind: o.kind,
      tool,
      title: o.title,
      version: workbenchVersion(),
      details: contextLines(o.extra ?? {}, { handler: false }),
      what: what || undefined,
      rule: o.rule,
      message: o.message,
      verdict,
      line: o.line,
      code: (o.kind === 'check' || o.kind === 'stuck') && include ? o.code : undefined,
      sim: o.kind === 'tryit' && include ? o.sim : undefined,
      // The error itself is the report: always in it (its id groups the same error), the stack only when ticked.
      error: o.kind === 'error' ? { message: o.error?.message ?? '', stack: include ? o.error?.stack : undefined, count: o.error?.count } : undefined,
      query: o.query,
      lesson: o.lesson,
      handler,
    };
  };

  // A Hub handler is open: the tools, or the handler? (A handler's own problems are for its author and the community.)
  const askWhere = (o.kind === 'problem' || o.kind === 'tryit') && !!handler?.hubId;
  const where = askWhere
    ? `<fieldset class="rf-where"><legend>${esc(HANDLER_OR_TOOLS.question)}</legend>
        <label><input type="radio" name="rf-where" value="tools" checked> ${esc(HANDLER_OR_TOOLS.tools)}</label>
        <label><input type="radio" name="rf-where" value="handler"> ${esc(HANDLER_OR_TOOLS.handler)}</label></fieldset>`
    : '';
  const help = askWhere ? handlerHelp(handler) : undefined;
  const helpHtml = help ? `<div class="rf-help" id="rf-help" hidden><p>${esc(help.note)}</p><ul>${help.links.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a></li>`).join('')}</ul></div>` : '';
  const verdict = o.kind === 'check' ? `<label class="rf-field"><span>What's wrong</span><select id="rf-verdict">${CHECK_VERDICTS.map((v) => `<option>${esc(v)}</option>`).join('')}</select></label>` : '';
  const ask = t.ask ? `<label class="rf-field"><span>${esc(t.ask.label)}</span><textarea id="rf-what" rows="${t.ask.rows ?? 2}"></textarea></label>` : '';
  const partHtml = part?.trim() && t.part
    ? `<div class="rf-part"><label><input type="checkbox" id="rf-part" checked> ${esc(t.part)}</label><pre class="rf-pre" tabindex="0" aria-label="${esc(t.part.replace(/^Include /, ''))}">${esc(part.length > 4000 ? `${part.slice(0, 4000)}\n…` : part)}</pre>${o.kind === 'check' ? '<p class="rf-note">Only these lines, never the rest of your handler.</p>' : ''}</div>`
    : '';
  d.innerHTML = `<h2 id="rf-h">${reportIcon(t.icon, 20, 'rf-h-ico')}${esc(t.heading)}${o.rule ? ` <code>${esc(o.rule)}</code>` : ''}</h2>
    ${o.message || o.error ? `<p class="rf-msg">${esc((o.message ?? o.error!.message).replace(/`/g, ''))}${o.error?.count && o.error.count > 1 ? ` (${o.error.count} times)` : ''}</p>` : ''}
    ${where}${helpHtml}
    <div id="rf-main"><div class="rf-dups" id="rf-dups" aria-live="polite"></div><p class="rf-intro">${esc(t.intro)}</p>${verdict}${ask}${partHtml}
    <details class="rf-details"><summary>What else is sent</summary><pre class="rf-pre" id="rf-block"></pre><p class="rf-note">Versions and settings, so we can find it again; never your code unless you include it above.</p></details>
    </div>
    <p class="rf-note" id="rf-copied" role="status"></p>
    <div class="rf-actions"><button type="button" class="btn" id="rf-cancel">Cancel</button><button type="button" class="btn" id="rf-copy" title="No GitHub account? Copy the report to paste in the testers' Discord thread">No GitHub account? Copy the report</button><button type="button" class="btn primary" id="rf-go">Continue on GitHub</button></div>
    ${onPhone() ? `<p class="rf-note">${esc(GH_APP_NOTE)}</p>` : ''}`;
  const block = d.querySelector<HTMLElement>('#rf-block')!;
  const refresh = () => (block.textContent = buildReport(input()).details);
  refresh();
  d.querySelectorAll('input, select').forEach((el) => el.addEventListener('change', refresh));

  // The tools or this handler.
  const main = d.querySelector<HTMLElement>('#rf-main')!;
  const go = d.querySelector<HTMLButtonElement>('#rf-go')!;
  const copy = d.querySelector<HTMLButtonElement>('#rf-copy')!;
  d.querySelectorAll<HTMLInputElement>('input[name=rf-where]').forEach((r) => r.addEventListener('change', () => {
    const inHandler = r.value === 'handler' && r.checked;
    main.hidden = inHandler;
    go.hidden = copy.hidden = inHandler;
    d.querySelector<HTMLElement>('#rf-help')!.hidden = !inHandler;
  }));

  // Open reports that may be the same (GitHub's search; quiet when it can't be reached).
  const dups = d.querySelector<HTMLElement>('#rf-dups')!;
  const first = buildReport(input());
  if (first.search) {
    dups.innerHTML = '<p class="rf-note">Looking for the same report on GitHub…</p>';
    void findDuplicates(first).then((hits: IssueHit[]) => {
      if (!d.open) return;
      dups.innerHTML = hits.length
        ? `<p class="rf-dups-h">Is it one of these? Open it and add a 👍 (or a comment) instead:</p><ul>${hits.map((h) => `<li><a href="${esc(h.url)}" target="_blank" rel="noopener">#${h.number} ${esc(h.title)}</a>${h.thumbs ? ` <span class="rf-note">👍 ${h.thumbs}</span>` : ''}</li>`).join('')}</ul>`
        : '';
    });
  }

  d.querySelector('#rf-cancel')!.addEventListener('click', () => d.close());
  go.addEventListener('click', () => {
    const what = d.querySelector<HTMLTextAreaElement>('#rf-what');
    if (o.kind === 'feature' && what && !what.value.trim()) {
      what.setAttribute('aria-invalid', 'true');
      what.focus();
      return;
    }
    openReport(buildReport(input()).url);
    d.close();
  });
  copy.addEventListener('click', async () => {
    const r = buildReport(input());
    const note = d.querySelector<HTMLElement>('#rf-copied')!;
    try {
      await navigator.clipboard.writeText(r.text);
      note.innerHTML = `Copied. Paste it in the <a href="${esc(DISCORD_THREAD)}" target="_blank" rel="noopener">testers' thread on Discord</a>. (GitHub is easier for us to work with, so use it if you can.)`;
    } catch {
      note.innerHTML = `This browser couldn't copy. Select the text below, copy it and paste it in the <a href="${esc(DISCORD_THREAD)}" target="_blank" rel="noopener">testers' thread on Discord</a>.<pre class="rf-pre" tabindex="0">${esc(r.text)}</pre>`;
    }
  });
  if (!d.open) d.showModal();
  (d.querySelector<HTMLElement>('#rf-what') ?? go).focus();
}

const CSS = `
dialog.rf{font-size:15px;max-width:min(620px,calc(100vw - 24px));width:100%;border:1px solid var(--line,#8884);border-radius:var(--r-pane,10px);background:var(--surface,var(--bg,#fff));color:var(--fg,#111);padding:18px 20px;box-sizing:border-box}
dialog.rf::backdrop{background:#0006}
.rf h2{display:flex;align-items:center;gap:8px;margin:0 0 6px;font-size:1.15rem}
.rf h2 code{font-size:.85em;font-weight:500}
.rf-h-ico{flex:none;color:var(--accent,currentColor)}
.rf-msg{margin:0 0 8px;color:var(--muted,#555)}
.rf-intro{margin:6px 0 10px}
.rf-field{display:flex;flex-direction:column;gap:4px;margin:0 0 10px}
.rf-field span{font-weight:600;font-size:.92em}
.rf textarea,.rf select{font:inherit;color:inherit;background:var(--bg,#fff);border:1px solid var(--line,#8886);border-radius:var(--r-ctl,6px);padding:6px 8px;width:100%;box-sizing:border-box}
.rf textarea{resize:vertical;min-height:2.6em}
.rf textarea[aria-invalid=true]{border-color:var(--err,#c00)}
.rf-pre{margin:4px 0 0;padding:8px;max-height:180px;overflow:auto;background:var(--code-bg,#0000000d);border:1px solid var(--line,#8884);border-radius:var(--r-ctl,6px);font:12px/1.45 var(--font-mono,var(--mono,ui-monospace,monospace));white-space:pre-wrap;overflow-wrap:anywhere}
.rf-part{margin:0 0 10px}
.rf-part label,.rf-where label{display:flex;align-items:center;gap:6px;min-height:28px}
.rf-where{border:1px solid var(--line,#8884);border-radius:var(--r-ctl,6px);padding:6px 10px 8px;margin:4px 0 10px}
.rf-where legend{font-weight:600;padding:0 4px}
.rf-help{margin:0 0 10px}.rf-help ul{margin:6px 0 0;padding-left:20px}.rf-help li{margin:4px 0}
.rf-note{color:var(--muted,#555);font-size:.88em;margin:4px 0}
.rf-details{margin:4px 0 8px}.rf-details summary{cursor:pointer;color:var(--muted,#555);min-height:24px}
.rf-dups ul{margin:4px 0 2px;padding-left:20px}.rf-dups li{margin:3px 0}.rf-dups-h{font-weight:600;margin:6px 0 2px}
.rf-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-top:12px}
.rf-actions #rf-cancel{margin-right:auto}
.rf-actions .btn{font-size:14px}
.rf-dups:not(:empty){margin:0 0 10px;padding:6px 10px;border:1px solid var(--line,#8884);border-radius:var(--r-ctl,6px)}
.rf a{color:var(--accent,#06c)}
.rep-btn{display:inline-flex;align-items:center;gap:5px;min-height:24px;min-width:24px;padding:2px 6px;border:1px solid transparent;border-radius:var(--r-ctl,6px);background:none;color:var(--muted,inherit);font:inherit;font-size:inherit;cursor:pointer}
.rep-btn:hover{color:var(--fg,inherit);border-color:var(--line,currentColor)}
.rep-btn:focus-visible{outline:2px solid var(--accent,currentColor);outline-offset:1px;color:var(--fg,inherit)}
.rep-btn.rep-only{padding:3px;justify-content:center}
.rep-ico{flex:none}
@media (max-width:600px){dialog.rf{padding:14px;max-width:100vw}.rf-actions .btn{flex:1 1 auto}}
`;
/** The report buttons' look, for pages that show them before the dialog has been opened. */
export function ensureReportStyles(): void {
  if (document.getElementById('rf-style')) return;
  const st = document.createElement('style');
  st.id = 'rf-style';
  st.textContent = CSS;
  document.head.append(st);
}
