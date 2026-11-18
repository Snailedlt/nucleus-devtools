// "Nucleus Docs" panel: the handler API's docs beside the editor, offline, opened by clicking an API name in a hover,
// hint or suggestion (command:splitscreenme.showDocs). The same pages as the workbench's Docs tab (core/docspage.ts):
// the main page, a group (one line per name), one name, a search. A quiet path on top (Docs / Context / name) and a
// back arrow; Search opens VS Code's quick pick. Scripts are off: every control is a command link.
import * as vscode from 'vscode';
import { docsPageUrl, docsPage, docsValue, docsView, DocsPage } from './core/docspage';
import { linkApiNames } from './core/features';
import { allEntries, lookup } from './core/lookup';
import { FEEDBACK_SITE, voteEventPath, type DocPart } from './core/docvotes';
import { api, docFeedbackUrl, docReviewUrl, docSlot, type Member } from './core/api';
import { aiFrameCss, placeAiFrames } from './core/aimark';
import { WORKBENCH_URL } from './core/sharelink';

export const OPEN_DOCS = 'splitscreenme.showDocs'; // not openDocs: that is the old "Docs: Web Links…" (still works)

/** The guides, the Hub and places to ask for help: on the Docs panel's main page, and in the old Web Links… pick. */
export function webLinks(workbenchUrl: string): { label: string; url: string }[] {
  return [
    { label: 'Handler API reference', url: 'https://www.splitscreen.me/docs/handler-api' },
    { label: 'Creating handlers (guide)', url: 'https://www.splitscreen.me/docs/create-handlers' },
    { label: 'Proto Input', url: 'https://www.splitscreen.me/docs/protoinput' },
    { label: 'FAQ', url: 'https://www.splitscreen.me/docs/faq' },
    { label: 'Nucleus Co-op docs (legacy)', url: 'https://nucleus-coop.github.io/docs/' },
    { label: 'Browser workbench (Nucleus: Open in the Browser Workbench opens this handler there)', url: workbenchUrl },
    { label: 'Handler hub', url: 'https://hub.splitscreen.me/' },
    { label: 'Nucleus Co-op source code', url: 'https://github.com/SplitScreen-Me/splitscreenme-nucleus' },
    { label: 'PCGamingWiki (check input & multiplayer support)', url: 'https://www.pcgamingwiki.com/wiki/Home' },
    { label: 'Ask for help: SplitScreen.Me Discord', url: 'https://discord.gg/XxGMkqCf4r' },
    { label: 'Ask for help: r/nucleuscoop', url: 'https://www.reddit.com/r/nucleuscoop/' },
  ];
}
/** The links section of the Docs panel's main page. Exported for tests. */
export function linksSection(workbenchUrl: string): string {
  return `<section class="links" aria-labelledby="links-h"><h2 id="links-h">Links</h2><ul>${webLinks(workbenchUrl).map((l) => `<li><a href="${esc(l.url)}">${esc(l.label)}</a></li>`).join('')}</ul></section>`;
}
const BACK = 'splitscreenme.docsBack';
const SEARCH = 'splitscreenme.docsSearch';
const VOTE = 'splitscreenme.docsVote';
type Vote = 'up' | 'down';

/** People's 👍/👎 on one part of a doc page (the doc, or the AI-written "In practice"), placed inside that part: command
 *  links, since the panel runs no scripts. `mine`: this person's votes so far (globalState), so a second click takes a
 *  vote back. The follow-up link shows only after a vote (help on request): "Tell us what's wrong" after 👎, "Give
 *  feedback" (the same form, titled as feedback) after 👍; it goes again when the vote is taken back. Exported for tests. */
export function voteLine(path: string, part: DocPart, label: string, mine: Record<string, Vote | undefined>, canSend: boolean): string {
  const link = (v: Vote) => `command:${VOTE}?${encodeURIComponent(JSON.stringify([path, part, v]))}`;
  const cur = mine[`${part}/${path}`];
  // Links (the panel runs no scripts, so no Space-to-press button): the accessible name says the part, the vote and
  // whether it is the current one.
  const btn = (v: Vote, icon: string, name: string) => {
    const what = cur === v ? `${label}: you said ${name}. Activate to take it back` : `${label}: vote ${name}`;
    return `<a class="vote${cur === v ? ' on' : ''}" href="${esc(link(v))}" aria-label="${esc(what)}" title="${esc(cur === v ? `You said: ${name}. Click again to take it back.` : name)}">${icon}</a>`;
  };
  const follow = cur === 'down' ? `<a class="follow" href="${esc(docReviewUrl(path))}">Tell us what's wrong</a>`
    : cur === 'up' ? `<a class="follow" href="${esc(docFeedbackUrl(path))}">Give feedback</a>` : '';
  const note = canSend ? '' : '<span class="note">Votes are off because VS Code telemetry is off (Settings › Telemetry).</span>';
  const ask = part === 'practice' ? 'Is this right?' : 'Is this doc right?';
  return `<div class="votes" role="group" aria-label="${esc(`${label}: is it right?`)}"><span title="Anonymous counts, no account: they show in the docs after their next build. People's votes decide &quot;Verified by people&quot;.">${ask}</span> ${btn('up', '👍', 'Right')} ${btn('down', '👎', 'Wrong or unclear')}${follow ? ` ${follow}` : ''}${note ? ` ${note}` : ''}</div>`;
}

/** The sparkle in the corner of an AI-written part's frame (inline SVG: the panel's CSP allows no images), in the
 *  workbench's purple-to-cyan (the gradient is defined once, in renderDocsPanel). */
export const AI_SPARK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="url(#ai-grad)" d="M14 1.5Q15 9.5 23 10.5Q15 11.5 14 19.5Q13 11.5 5 10.5Q13 9.5 14 1.5Z M5.5 13.5Q6 17.5 10 18Q6 18.5 5.5 22.5Q5 18.5 1 18Q5 17.5 5.5 13.5Z"/></svg>';

/** Puts each part's votes where docsPage(…, slots) marked it in the rendered page, and frames the AI-written parts
 *  ("In practice" included: core/aimark.ts placeAiFrames). `parts`: the parts that get votes, with their names for
 *  screen readers. Exported for tests. */
export function placeVotes(html: string, path: string, parts: { part: DocPart; label: string }[], mine: Record<string, Vote | undefined>, canSend: boolean, m?: Member): string {
  const slot = (name: Parameters<typeof docSlot>[0]) => `<p>${esc(docSlot(name))}</p>`;
  let out = m ? placeAiFrames(html, m, { icon: AI_SPARK_SVG, level: 3 }) : html.replace(slot('practice-open'), '<section class="practice" aria-label="In practice">').replace(slot('practice-close'), '</section>');
  for (const p of parts) out = out.replace(slot(p.part), voteLine(path, p.part, p.label, mine, canSend));
  return out.replace(/<p>@@slot:[\w-]+@@<\/p>/g, '');
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const docsCommandLink = (value: string) => `command:${OPEN_DOCS}?${encodeURIComponent(JSON.stringify([value]))}`;

/** JavaScript / TypeScript signatures as coloured HTML (VS Code's token colours, by theme; see the panel's CSS):
 *  keywords, strings, numbers, comments, types after `:`, members after `.` (calls as functions). Exported for tests. */
export function highlightCode(src: string): string {
  const KW = /^(var|let|const|function|return|if|else|for|while|do|in|of|new|typeof|instanceof|this|true|false|null|undefined|enum|break|continue|switch|case|default|try|catch|finally|throw|delete|void)$/;
  const TYPES = /^(string|number|boolean|void|any|object|never|unknown)$/;
  const re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(\b0x[\da-fA-F]+\b|\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|([\s\S])/g;
  let out = '';
  let prev = ''; // the last non-space character before this token
  let m: RegExpExecArray | null;
  const span = (cls: string, t: string) => `<span class="tk-${cls}">${esc(t)}</span>`;
  while ((m = re.exec(src))) {
    const [t, comment, str, num, word] = m;
    if (comment) out += span('comment', t);
    else if (str) out += span('string', t);
    else if (num) out += span('number', t);
    else if (word) {
      const next = src.slice(re.lastIndex).match(/^\s*(\S)/)?.[1];
      if (KW.test(word)) out += span('keyword', word);
      else if (TYPES.test(word) || (prev === ':' && /^[A-Z]/.test(word)) || (prev === '.' && /^Nucleus\.$/.test(src.slice(Math.max(0, m.index - 8), m.index)))) out += span('type', word);
      else if (next === '(') out += span('function', word);
      else if (prev === '.') out += span('property', word);
      else if (prev === ':' || prev === '|' || prev === '<') out += span('type', word);
      else out += span('variable', word);
    } else out += esc(t);
    if (/\S/.test(t)) prev = t.trim().slice(-1);
  }
  return out;
}

const unesc = (s: string) => s.replace(/&(amp|lt|gt|quot|#39);/g, (_m, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e]!);
/** Inline code that is clearly code (a member path, a call, a literal): coloured; a plain word (`handlers`) stays
 *  plain. The workbench's rule (codehl.ts looksLikeCode). */
function looksLikeCode(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 400) return false;
  if (/^[\w$]+$/.test(t)) return /^(true|false|null|undefined|var|function|new|\d[\d.]*)$/.test(t);
  if (/[\\/]/.test(t) && !/[("=]/.test(t)) return false;
  return /[.()=;"'[\]{}+<>!-]/.test(t);
}
/** Markdown → HTML, enough for these pages (they're ours): code blocks (coloured), headings, lists, inline code, bold,
 *  italics, links. Exported for tests. */
export function fallbackMarkdown(md: string): string {
  const inline = (t: string) =>
    esc(t)
      // Of the panel's commands, only opening a docs page may come from Markdown (text from Search is in it too): the
      // vote command comes only from the vote controls.
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text, href: string) => (/^command:/i.test(href) && !href.startsWith(`command:${OPEN_DOCS}?`) ? text : `<a href="${href}">${text}</a>`))
      // A bare address in the docs ("on https://steamdb.info/"), as a hover shows it: a link (not one already in <a>).
      .replace(/(^|[\s(])(https?:\/\/[^\s<)"]+[^\s<)".,;:])/g, (_m, pre, url) => `${pre}<a href="${url}">${url}</a>`)
      .replace(/`([^`]+)`/g, (_m, c: string) => `<code>${looksLikeCode(unesc(c)) ? highlightCode(unesc(c)) : c}</code>`)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])_([^_]+)_(?=$|[\s.,)])/g, '$1<em>$2</em>');
  return md.split(/(```\w*\n[\s\S]*?```)/).map((part, i) => {
    if (i % 2) return `<pre><code>${highlightCode(part.replace(/^```\w*\n/, '').replace(/```$/, '').trimEnd())}</code></pre>`;
    return part.split(/\n{2,}/).filter((p) => p.trim()).map((p) => {
      const lines = p.trim().split('\n');
      if (/^#{1,3} /.test(lines[0])) return `<h2>${inline(lines[0].replace(/^#+ /, ''))}</h2>`;
      if (lines.every((l) => /^- /.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`;
      return `<p>${lines.map(inline).join('<br>')}</p>`;
    }).join('');
  }).join('');
}

/** The panel's HTML for a page (no scripts). Exported for tests. */
export function renderDocsPanel(page: DocsPage, body: string, canGoBack: boolean): string {
  const crumb = (label: string, value?: string) => (value === undefined ? `<strong aria-current="page">${esc(label)}</strong>` : `<a href="${docsCommandLink(value)}">${esc(label)}</a>`);
  const parts = [page.crumbs.length ? crumb('Docs', '') : crumb('Docs')].concat(page.crumbs.map((c, i) => crumb(c.label, i < page.crumbs.length - 1 && c.view ? docsValue(c.view) : undefined)));
  const web = docsPageUrl(page.path ?? '', 'vscode');
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>
body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); padding: 0 16px 24px; line-height: 1.5; max-width: 860px; }
nav { position: sticky; top: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; padding: 8px 0; margin-bottom: 6px; background: var(--vscode-editor-background); border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,.25)); color: var(--vscode-descriptionForeground); font-size: .92em; }
nav a { color: var(--vscode-descriptionForeground); text-decoration: none; } nav a:hover { color: var(--vscode-textLink-foreground); text-decoration: underline; }
nav strong { color: var(--vscode-foreground); } nav .sep { opacity: .6; }
nav .back { display: inline-grid; place-items: center; width: 22px; height: 22px; border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.35)); border-radius: 4px; color: var(--vscode-foreground); }
nav .end { margin-left: auto; display: flex; gap: 12px; }
nav .end a { color: var(--vscode-textLink-foreground); }
h2 { font-size: 1.15em; margin: 14px 0 6px; }
a { color: var(--vscode-textLink-foreground); }
code { font-family: var(--vscode-editor-font-family); font-size: .95em; background: var(--vscode-textCodeBlock-background, rgba(128,128,128,.15)); padding: 0 3px; border-radius: 3px; }
pre { background: var(--vscode-textCodeBlock-background, rgba(128,128,128,.15)); padding: 8px 10px; border-radius: 4px; overflow-x: auto; white-space: pre-wrap; }
pre code { background: none; padding: 0; }
/* Code colours: VS Code's default token colours for each kind of theme (the webview's body says which). */
.tk-keyword { color: #0000ff; } .tk-string { color: #a31515; } .tk-number { color: #098658; } .tk-comment { color: #008000; }
.tk-type { color: #267f99; } .tk-function { color: #795e26; } .tk-property { color: #001080; } .tk-variable { color: #001080; }
body.vscode-dark .tk-keyword { color: #569cd6; } body.vscode-dark .tk-string { color: #ce9178; } body.vscode-dark .tk-number { color: #b5cea8; }
body.vscode-dark .tk-comment { color: #6a9955; } body.vscode-dark .tk-type { color: #4ec9b0; } body.vscode-dark .tk-function { color: #dcdcaa; }
body.vscode-dark .tk-property, body.vscode-dark .tk-variable { color: #9cdcfe; }
body.vscode-high-contrast .tk-keyword { color: #569cd6; } body.vscode-high-contrast .tk-string { color: #ce9178; } body.vscode-high-contrast .tk-number { color: #b5cea8; }
body.vscode-high-contrast .tk-comment { color: #7ca668; } body.vscode-high-contrast .tk-type { color: #4ec9b0; } body.vscode-high-contrast .tk-function { color: #dcdcaa; }
body.vscode-high-contrast .tk-property, body.vscode-high-contrast .tk-variable { color: #9cdcfe; }
body.vscode-high-contrast-light .tk-keyword { color: #0f4a85; } body.vscode-high-contrast-light .tk-string { color: #0f4a85; }
body.vscode-high-contrast-light .tk-comment { color: #515151; } body.vscode-high-contrast-light .tk-type { color: #185e73; } body.vscode-high-contrast-light .tk-function { color: #5e2cbc; }
ul { padding-left: 20px; } li { margin: 3px 0; }
.votes { display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; margin: 4px 0 10px; font-size: .92em; color: var(--vscode-descriptionForeground); }
.votes .follow { margin-left: 4px; }
.practice { border: 1px solid var(--vscode-panel-border, #8884); border-radius: 6px; padding: 2px 12px; margin: 12px 0; }
/* AI-written parts: a frame with a light violet tint and the sparkle in its corner (core/aimark.ts). */
${aiFrameCss({ fg: 'var(--vscode-editorHoverWidget-foreground, var(--vscode-foreground))', muted: 'var(--vscode-descriptionForeground)', line: 'var(--vscode-panel-border, rgba(128,128,128,.35))', surface: 'var(--vscode-editorHoverWidget-background, var(--vscode-editor-background))' })}
.ai-box.practice { padding: 8px 12px; } .ai-box .votes { margin-bottom: 0; }
body.vscode-high-contrast .ai-box, body.vscode-high-contrast-light .ai-box { background: none; border-color: var(--vscode-contrastBorder, currentColor); }
.vote { display: inline-block; padding: 2px 8px; border: 1px solid var(--vscode-button-border, #8886); border-radius: 4px; text-decoration: none; }
.vote.on { background: var(--vscode-button-background); color: var(--vscode-button-foreground); } .votes .note { opacity: .85; }
</style></head><body>
<nav aria-label="Where you are in the docs">${canGoBack ? `<a class="back" href="command:${BACK}" title="Back" aria-label="Back">←</a>` : ''}${parts.join('<span class="sep" aria-hidden="true">/</span>')}<span class="end"><a href="command:${SEARCH}" title="Search the docs (names and words)">Search…</a><a href="${esc(web)}" title="The same page on the site, to share or read in the browser">Open on the web</a></span></nav>
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs><linearGradient id="ai-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="10%" stop-color="#a855f7"/><stop offset="90%" stop-color="#22d3ee"/></linearGradient></defs></svg>
<main>${body}</main>
</body></html>`;
}

export function registerDocsPanel(context: vscode.ExtensionContext) {
  let panel: vscode.WebviewPanel | undefined;
  let view = 'home';
  const history: string[] = [];

  const VOTES_KEY = 'splitscreenme.docVotes';
  const mine = () => context.globalState?.get<Record<string, Vote | undefined>>(VOTES_KEY) ?? {};
  const withVotes = (html: string, path?: string) => {
    if (!path) return html;
    const r = lookup(path);
    const m = r.kind === 'entries' && r.entries.length === 1 ? r.entries[0].member : undefined;
    const parts: { part: DocPart; label: string }[] = [];
    if (m?.doc) parts.push({ part: 'doc', label: m.docBy === 'claude' ? 'The doc (AI-written)' : 'The doc' });
    if (m?.practice) parts.push({ part: 'practice', label: '"In practice" (AI-written)' });
    return placeVotes(html, path, parts, mine(), vscode.env.isTelemetryEnabled !== false, m);
  };
  /** Sends one people's-vote event to the same anonymous counter as the workbench (GoatCounter); true when it was
   *  accepted, false offline or on an HTTP error (never fails loudly). */
  const send = async (event: string): Promise<boolean> => {
    // Checked again before each request: telemetry can be turned off while a vote waits its turn.
    if (vscode.env.isTelemetryEnabled === false) return false;
    try {
      const res = await fetch(`https://${FEEDBACK_SITE}.goatcounter.com/count?p=${encodeURIComponent('/' + event)}&e=true&rnd=${Math.random().toString(36).slice(2)}`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false; // offline: not counted
    }
  };
  /** One vote at a time: each reads the saved votes the one before it wrote. */
  let voting: Promise<unknown> = Promise.resolve();
  const show = async (next: string, push: boolean) => {
    if (push && panel && next !== view) history.push(view);
    if (history.length > 50) history.shift();
    view = next;
    const page = docsPage(view, docsCommandLink, true);
    // Names inside the docs open their own page too; each part's 👍/👎 goes inside it.
    const body = withVotes(fallbackMarkdown(linkApiNames(page.markdown, docsCommandLink)), page.path) + (view === 'home' ? linksSection(`${WORKBENCH_URL}?ref=vscode`) : '');
    if (!panel) {
      panel = vscode.window.createWebviewPanel('splitscreenme.docs', 'Handler Docs', { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, {
        enableScripts: false,
        enableCommandUris: [OPEN_DOCS, BACK, SEARCH, VOTE],
        localResourceRoots: [],
      });
      panel.onDidDispose(() => {
        panel = undefined;
        history.length = 0;
      }, null, context.subscriptions);
    } else panel.reveal(undefined, true);
    panel.title = page.path ? `Docs: ${page.path.split('.').pop()}` : 'Handler Docs';
    panel.webview.html = renderDocsPanel(page, body, history.length > 0);
  };

  context.subscriptions.push(
    // From a hover link (a name), Search, or the command palette (the main page).
    vscode.commands.registerCommand(OPEN_DOCS, (value?: string) => show(docsView(typeof value === 'string' ? value : ''), true)),
    // 👍/👎 on a part: a new vote, a change (the old one taken back), or a second click that takes it back, as in the workbench.
    vscode.commands.registerCommand(VOTE, (path: string, part: DocPart, v: Vote) => {
      if (typeof path !== 'string' || (part !== 'doc' && part !== 'practice') || (v !== 'up' && v !== 'down')) return;
      // Only a member's own name (as the docs write it) and a part it has.
      const r = lookup(path);
      const m = r.kind === 'entries' && r.entries.length === 1 && r.entries[0].path === path ? r.entries[0].member : undefined;
      if (!m || !(part === 'doc' ? m.doc : m.practice)) return;
      if (vscode.env.isTelemetryEnabled === false) return void vscode.window.setStatusBarMessage('Nucleus: votes are off while VS Code telemetry is off', 4000);
      const from = panel;
      const run = async () => {
        const all = { ...mine() };
        const key = `${part}/${path}`;
        const was = all[key];
        // Saved only as far as it was sent: a failed undo changes nothing; an undo that went but a new vote that
        // didn't leaves no vote (the next click sends the new one, not another undo).
        if (was && !(await send(voteEventPath('people', part, path, was === 'up' ? 'undo-up' : 'undo-down')))) {
          vscode.window.setStatusBarMessage('Nucleus: the vote could not be sent (offline?). Try again later.', 4000);
          return;
        }
        let now: Vote | undefined = undefined;
        if (was !== v) {
          if (await send(voteEventPath('people', part, path, v))) now = v;
          else vscode.window.setStatusBarMessage('Nucleus: the vote could not be sent (offline?). Try again later.', 4000);
        }
        all[key] = now;
        await context.globalState?.update(VOTES_KEY, all);
        if (was === v) vscode.window.setStatusBarMessage('Nucleus: vote taken back', 3000);
        else if (now) vscode.window.setStatusBarMessage('Nucleus: thanks, your vote is counted', 3000);
        // Refresh the panel the vote came from, if it is still open: never open it again.
        if (panel && panel === from) void show(view, false);
      };
      const done = voting.then(run, run);
      voting = done.catch(() => undefined);
      return done;
    }),
    vscode.commands.registerCommand(BACK, () => {
      const v = history.pop();
      if (v !== undefined) void show(v, false);
    }),
    vscode.commands.registerCommand(SEARCH, async () => {
      // Every name, with its first line of docs; or press Enter on words to search the docs.
      const qp = vscode.window.createQuickPick<vscode.QuickPickItem & { value?: string }>();
      qp.placeholder = 'A name (Context.ModifySaveFile, KillMutex…) or words to search for (window title, mutex)';
      qp.matchOnDescription = true;
      qp.items = [
        ...allEntries(true).map((e) => ({ label: e.path, description: (e.member.doc ?? '').split('\n')[0].slice(0, 100), value: e.path })),
        ...Object.keys(api.enums).map((n) => ({ label: `Nucleus.${n}`, description: 'Nucleus values (enum)', value: `Nucleus.${n}` })),
      ];
      qp.onDidAccept(() => {
        const pick = qp.selectedItems[0];
        const value = pick?.value ?? qp.value.trim();
        qp.hide();
        if (value) void show(docsView(value), true);
      });
      qp.onDidHide(() => qp.dispose());
      qp.show();
    }),
  );
}
