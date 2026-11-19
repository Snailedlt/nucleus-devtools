// Docs: every option, Context member, enum and .NET call, searchable, with the groups to browse and a path to go
// back along. The address follows it (#docs, #docs-Context, #docs-Context.ModifySaveFile, #docs-mutex: links.ts).
import { reportButton } from '@core/reporticons';
import { api, type Member } from '@core/api';
import { allEntries, lookup, search, type Entry } from '@core/lookup';
import { apiPathOf } from '@core/features';
import USAGE from './usage.json';
import { $, esc, md } from './dom';
import { API_GROUPS, API_GROUP_KEYS, groupOf, unchecked } from './docsgroups';
import { docsHashOf, docsView } from './links';
import { memberCard, memberSummary } from './doccard';
import { keepMascots, mascot } from './mascots';

// API names in hovers, parameter hints and suggestion docs are links: a click (or Enter) opens that name in the
// Reference tab, as VS Code's hovers link to the docs.
// Which names are API (`ModifySaveFile` → Context.ModifySaveFile; `path` is a parameter): core decides, as for VS Code.
export function linkApiNames(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('code').forEach((c) => {
    if (c.closest('pre, a, button')) return;
    const path = apiPathOf(c.textContent ?? '');
    if (path) markApiLink(c, path);
  });
  // The signature on top of a doc card: the name is the link.
  root.querySelectorAll<HTMLElement>('.dc-sig:not(.nolink) .sg-n').forEach((n) => {
    const owner = n.previousElementSibling?.classList.contains('sg-o') ? n.previousElementSibling.textContent ?? '' : '';
    markApiLink(n, owner + (n.textContent ?? ''));
  });
}
export function markApiLink(el: HTMLElement, path: string) {
  el.classList.add('api-link');
  el.dataset.api = path;
  el.tabIndex = 0;
  el.setAttribute('role', 'link');
  el.title = `${path} in Docs`;
}
/** Clicks (or Enter) on API links in `el` open that name in Docs (`open`). */
export function wireApiLinkClicks(el: HTMLElement, open: (path: string) => void, on: 'click' | 'mousedown' = 'click') {
  el.addEventListener(on, (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-api]');
    if (!a) return;
    e.preventDefault();
    open(a.dataset.api!);
  });
  el.addEventListener('keydown', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-api]');
    if (a && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(a.dataset.api!); }
  });
}

export interface DocsDeps {
  selectTab: (id: string) => void;
  /** The open handler's own link (#hub-…, #share-…), which comes back when you leave Docs. */
  handlerHash: () => string | undefined;
  /** Counts a use (feedback.ts). */
  used: (what: string) => void;
  /** The address of a name's own docs page (docs/<name>/ on the site), to link to and share. */
  pageUrl: (path: string) => string;
  /** What "Insert into handler" would do with a member's example in the open handler now: 'insert', 'update' (the
   *  option is set: its value changes), 'callback' (added with its callback), 'same' (it's there), or undefined when the
   *  handler doesn't parse. */
  exampleAction?: (path: string, m: Member) => string | undefined;
  /** Puts a member's example into the open handler (app.ts, lines.ts placeExample). When the handler sets the option
   *  already, `replace` false only shows that line; true replaces its value with the example's. */
  insertExample?: (path: string, m: Member, replace?: boolean) => void;
}

export interface DocsUI {
  /** Shows a view: `home`, `group:<key>` or `q:<text>` (a name or a search). */
  go: (view: string, push?: boolean) => void;
  back: () => void;
  /** Opens a #docs… link. */
  openHash: (h: string) => void;
  /** Puts the current view's link in the address bar. */
  setHash: () => void;
  /** Gives the address bar back to the handler's own link. */
  leaveHash: () => void;
  /** Shows a name's docs without changing the view's history or the address (Lines' preview). */
  preview: (q: string) => void;
}

export function initDocs(deps: DocsDeps): DocsUI {
  const typeOf = (e: Entry) => (e.member.kind === 'method' ? 'fn' : ((e.member as { type?: string }).type ?? ''));
  function renderApiHome(el: HTMLElement) {
    const all = allEntries(true);
    const usage = USAGE.counts as Record<string, number>;
    const known = new Set(all.filter((e) => e.member.kind !== 'object').map((e) => e.path));
    const pct = (n: number) => `${Math.round((100 * n) / USAGE.handlers)}%`;
    const chip = (p: string) => `<button type="button" class="api-chip" data-q="${esc(p)}" title="In ${usage[p] ?? 0} of ${USAGE.handlers} Hub handlers">${esc(p)}${usage[p] ? ` <span class="pct">${pct(usage[p])}</span>` : ''}</button>`;
    // What every handler has (Nucleus needs the first three to load it), then the most used names of each object.
    const BASICS = ['Game.GUID', 'Game.GameName', 'Game.ExecutableName', 'Game.MaxPlayers', 'Game.Play'];
    const byGroup = API_GROUPS.filter((g) => g.key !== 'AI').map((g) => ({ g, top: Object.keys(usage).filter((p) => !BASICS.includes(p) && known.has(p) && g.match(p)).slice(0, 8) })).filter((x) => x.top.length);
    const enums = Object.keys(api.enums).sort();
    el.innerHTML = `<div class="api-home">
      <p class="muted">Every option, Context member, enum and .NET call a handler can use, with what Nucleus does with it. Type above, or start here. <a href="${esc(deps.pageUrl('').replace(/\/\/$/, '/'))}" target="_blank" rel="noopener">All the docs as pages ↗</a></p>
      ${unchecked().size ? `<button type="button" class="api-ai slim" data-group="AI" title="Written by AI; no person has checked these yet. Know how one really works? Vote 👍 or 👎 at the bottom of its page."><span class="ai-spark" aria-hidden="true"></span><span class="t">Help check ${unchecked().size} AI-written docs</span><span class="d">Know how one really works? 👍 or 👎</span><span aria-hidden="true">→</span></button>` : ''}
      <h3 class="api-h">Browse</h3>
      <div class="api-groups">${API_GROUPS.filter((g) => g.key !== 'AI').map((g) => `<button type="button" class="api-group" data-group="${g.key}"><span class="t">${esc(g.title)} <span class="count">${all.filter((e) => g.match(e.path)).length}</span></span><span class="s">${esc(g.doc)}</span></button>`).join('')}</div>
      <h3 class="api-h">Every handler has</h3>
      <div class="api-chips">${BASICS.map(chip).join('')}</div>
      <h3 class="api-h">Most used in Hub handlers</h3>
      <p class="muted api-note">How many of the ${USAGE.handlers} Hub handlers use each name (counted ${esc(USAGE.takenAt)}).</p>
      ${byGroup.map(({ g, top }) => `<h4 class="api-h4">${esc(g.title)}</h4><div class="api-chips">${top.map(chip).join('')}</div>`).join('')}
      <h3 class="api-h">Nucleus values (enums)</h3>
      <div class="api-chips">${enums.map((n) => `<button type="button" class="api-chip" data-q="Nucleus.${esc(n)}">Nucleus.${esc(n)}</button>`).join('')}</div>
      <h3 class="api-h">Try a search</h3>
      <p class="muted">${['mutex', 'window title', 'save file', 'keyboard', 'steam'].map((q) => `<button class="link" data-q="${q}">${q}</button>`).join(' · ')}</p>
    </div>`;
    wireApiLinks(el);
  }
  /** One object's members, as a compact list: click one for its docs. */
  function renderApiGroup(el: HTMLElement, key: string) {
    const g = API_GROUPS.find((x) => x.key === key)!;
    const list = allEntries(true).filter((e) => g.match(e.path)).sort((a, b) => a.path.localeCompare(b.path));
    el.innerHTML = refBar([{ label: g.title, count: list.length }]) + `<div class="api-home"><p class="muted">${esc(g.doc)}</p>
      <ul class="api-list">${list.map((e) => `<li><button type="button" data-q="${esc(e.path)}"><span class="n">${esc(e.path)}</span><span class="ty">${esc(typeOf(e))}</span><span class="d">${e.member.docBy === 'claude' ? '<span class="ai-spark" title="AI-written, not from the official docs" role="img" aria-label="AI-written"></span> ' : ''}${esc((e.member.doc || '').split('\n')[0].replace(/[`*\\]/g, ''))}</span></button></li>`).join('')}</ul></div>`;
    wireApiLinks(el);
    el.scrollTop = 0;
  }
  /** "Insert into handler" says what it will do. When the handler sets the option already it becomes "Show in handler"
   *  (goes to that line, changes nothing), with a quieter "Replace with the example's value" next to it: people usually
   *  want to keep their own value. "Show in handler" too when it has exactly this. */
  const insertLabel: Record<string, [string, string]> = {
    insert: ['Insert into handler', 'Adds this example where it belongs in the open handler. Ctrl+Z undoes it.'],
    callback: ['Insert into handler', 'Adds this example to the open handler, with the callback it goes in. Ctrl+Z undoes it.'],
    update: ['Show in handler', 'The handler sets this already: shows where, and keeps your value.'],
    same: ['Show in handler', 'The handler has exactly this already: shows where.'],
  };
  const REPLACE = ['Replace with the example\'s value', 'Changes the value the handler sets to the example\'s. Ctrl+Z undoes it.'];
  const memberOf = (p: string) => { const r = lookup(p); return r.kind === 'entries' && r.entries.length === 1 ? r.entries[0].member : undefined; };
  function labelInserts(el: HTMLElement) {
    el.querySelectorAll<HTMLButtonElement>('[data-insert]').forEach((b) => {
      const m = memberOf(b.dataset.insert!);
      const action = m && deps.exampleAction?.(b.dataset.insert!, m);
      const [text, title] = action ? insertLabel[action] ?? insertLabel.insert : ['Insert into handler', "The handler doesn't parse yet, so there's no telling where this goes. Fix it first."];
      b.textContent = text;
      b.title = title;
      b.setAttribute('aria-disabled', String(!action));
      // The secondary "Replace" only while the handler sets the option to another value.
      let r = b.nextElementSibling?.matches('[data-replace]') ? b.nextElementSibling as HTMLButtonElement : null;
      if (action === 'update' && !r) {
        r = document.createElement('button');
        r.type = 'button';
        r.className = 'link dc-replace';
        r.dataset.replace = b.dataset.insert!;
        [r.textContent, r.title] = REPLACE;
        b.after(r);
      } else if (action !== 'update') r?.remove();
    });
  }
  // One listener: the buttons are drawn again with each view.
  $('#api-results').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-insert], [data-replace]');
    if (!b) return;
    const p = b.dataset.insert ?? b.dataset.replace!;
    const m = memberOf(p);
    if (m) deps.insertExample?.(p, m, 'replace' in b.dataset);
    labelInserts($('#api-results'));
  });
  // The handler may change while Docs is open: the labels catch up when you come back to them.
  $('#api-results').addEventListener('pointerenter', () => labelInserts($('#api-results')));
  $('#api-results').addEventListener('focusin', () => labelInserts($('#api-results')));

  function wireApiLinks(el: HTMLElement) {
    labelInserts(el);
    el.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((b) => b.addEventListener('click', () => refGo(`q:${b.dataset.q}`)));
    // A search result's "Open full doc ›": a real #docs-<name> link (to copy or open in a new tab), opened in place.
    el.querySelectorAll<HTMLAnchorElement>('a[data-open]').forEach((a) => a.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
      e.preventDefault();
      refGo(`q:${a.dataset.open}`);
      // The link that had focus is gone: the full entry's heading takes it, so the keyboard keeps its place.
      const h = $('#api-results').querySelector<HTMLElement>('article.api:not(.api-hit) > h3');
      if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
    }));
    el.querySelectorAll<HTMLButtonElement>('[data-group]').forEach((b) => b.addEventListener('click', () => refGo(`group:${b.dataset.group}`)));
    el.querySelectorAll<HTMLButtonElement>('[data-home]').forEach((b) => b.addEventListener('click', () => refGo('home')));
    el.querySelectorAll<HTMLButtonElement>('[data-back]').forEach((b) => b.addEventListener('click', () => refBack()));
    // API names inside the docs open their own entry too.
    linkApiNames(el);
  }
  // Where you are in the Reference: "← Back · Reference › Context › ModifySaveFile", every part clickable (as a docs
  // site's breadcrumbs), and Back to the view before. Views: home, a group (Context, Game…), or a search / one name.
  let refView = 'home';
  const refHistory: string[] = [];
  function refGo(view: string, push = true) {
    if (push && view !== refView) refHistory.push(refView);
    if (refHistory.length > 50) refHistory.shift();
    refView = view;
    setDocsHash(view);
    const q = view.startsWith('q:') ? view.slice(2) : '';
    ($('#api-q') as HTMLInputElement).value = q;
    const el = $('#api-results');
    if (view.startsWith('group:')) renderApiGroup(el, view.slice(6));
    else renderApi(q);
    // Each view starts at its top: scroll whichever box holds the Reference.
    for (let n: HTMLElement | null = el; n; n = n.parentElement) if (n.scrollTop) n.scrollTop = 0;
  }
  function refBack() {
    const v = refHistory.pop();
    if (v !== undefined) refGo(v, false);
  }
  // The address follows Docs, so it can be shared: #docs (the main page), #docs-Context (a group),
  // #docs-Context.ModifySaveFile (a name) or #docs-mutex (a search). Replaced, not pushed: the handler's own link
  // (#hub-…, #share-…) comes back when you leave Docs.
  function setDocsHash(view = refView) {
    try {
      history.replaceState(history.state, '', `${location.pathname}${location.search}#${docsHashOf(view)}`);
    } catch {
      /* ignore */
    }
  }
  function leaveDocsHash() {
    if (!/^#docs(-|$)/.test(location.hash)) return;
    try {
      history.replaceState(history.state, '', `${location.pathname}${location.search}${deps.handlerHash() ? '#' + deps.handlerHash() : ''}`);
    } catch {
      /* ignore */
    }
  }
  /** A #docs… link: Docs at that name, group or search. */
  function openDocsHash(h: string) {
    deps.selectTab('api');
    refGo(docsView(h, API_GROUP_KEYS));
  }
  function refBar(crumbs: { label: string; view?: string; count?: number; code?: boolean }[]): string {
    // A quiet path, as docs sites show it: "Reference / Context / ModifySaveFile", the parents as plain links, and a
    // back arrow when there's somewhere to go back to.
    const back = refHistory.length ? `<button type="button" class="ref-back" data-back aria-label="Back" title="Back (Alt+←)">←</button>` : '';
    const parts = [`<button type="button" class="ref-crumb" data-home>Docs</button>`].concat(crumbs.map((c, i) => {
      const last = i === crumbs.length - 1;
      const attr = c.view ? (c.view.startsWith('group:') ? `data-group="${esc(c.view.slice(6))}"` : `data-q="${esc(c.view.slice(2))}"`) : '';
      return (c.view && !last ? `<button type="button" class="ref-crumb" ${attr}>${esc(c.label)}</button>` : `<span class="ref-here"${last ? ' aria-current="page"' : ''}>${esc(c.label)}</span>`) + (c.count !== undefined ? `<span class="ref-count">${c.count}</span>` : '');
    }));
    return `<nav class="api-crumbs" aria-label="Where you are in Docs">${back}${parts.join('<span class="ref-sep" aria-hidden="true">/</span>')}</nav>`;
  }

  function renderApi(q: string) {
    if (q.trim()) deps.used('reference-search');
    const el = $('#api-results');
    if (!q.trim()) return renderApiHome(el);
    const exact = lookup(q);
    // One name: the whole entry. A search: short results (the signature, the first sentence, the tags), each with
    // "Open full doc ›" to its entry (#docs-<name>; Enter opens it).
    const card = (e: Entry) => `<article class="api"><h3>${esc(e.path)}</h3>${memberCard(e.owner, e.name, e.member, { insert: !!deps.insertExample })}</article>`;
    const hit = (e: Entry) => `<article class="api api-hit" aria-label="${esc(e.path)}"><h3>${esc(e.path)}</h3>${memberSummary(e.owner, e.name, e.member)}`
      + `<p class="api-open"><a href="#${esc(docsHashOf(`q:${e.path}`))}" data-open="${esc(e.path)}" aria-label="Open the full doc of ${esc(e.path)}">Open full doc <span aria-hidden="true">›</span></a></p></article>`;
    // One name: its card, and where it sits (Reference / group / name; the group lists the names next to it).
    const one = exact.kind === 'entries' && exact.entries.length === 1 ? exact.entries[0] : undefined;
    if (one) {
      const g = groupOf(one.path);
      el.innerHTML = refBar([...(g ? [{ label: g.title, view: `group:${g.key}` }] : []), { label: one.path.slice(g && one.path.startsWith(g.key + '.') ? g.key.length + 1 : 0), code: true }])
        + card(one) + (/^[A-Za-z_$][\w$.]*$/.test(one.path) ? `<p class="api-page"><a href="${esc(deps.pageUrl(one.path))}" target="_blank" rel="noopener">Open as a page</a> <span class="muted">(to link to or share)</span></p>` : '');
      return wireApiLinks(el);
    }
    let entries: Entry[] = exact.kind === 'entries' ? exact.entries : [];
    for (const e of search(q, 30)) if (!entries.some((x) => x.path === e.path)) entries.push(e);
    let head = '';
    let crumbs: Parameters<typeof refBar>[0] = [{ label: `Results for "${q.trim()}"`, count: Math.min(entries.length, 30) }];
    if (exact.kind === 'enum') {
      crumbs = [{ label: 'Nucleus values' }, { label: `Nucleus.${exact.name}`, code: true }];
      head = `<article class="api"><h3>enum Nucleus.${esc(exact.name)}</h3>${md(exact.doc ?? '')}<p class="mono">${Object.entries(exact.values).map(([k, v]) => `${esc(k)} = ${v}`).join(' · ')}</p></article>`;
      entries = entries.filter((e) => e.member.ts?.includes(exact.name) || e.member.ref === exact.name);
      if (entries.length) head += `<h3 class="api-h">Options that take it</h3>`;
    }
    if (exact.kind === 'class') {
      crumbs = [{ label: `new Nucleus.${exact.name}`, code: true }];
      head = `<article class="api"><h3>new Nucleus.${esc(exact.name)}(${exact.params.join(', ')})</h3>${md(exact.doc)}</article>`;
    }
    if (exact.kind === 'none' && exact.didYouMean) head = `<p class="muted">"${esc(q)}" isn't part of the handler API. Did you mean <button class="link" data-q="${esc(exact.didYouMean)}">${esc(exact.didYouMean)}</button>?</p>`;
    entries = entries.slice(0, 30);
    keepMascots(el, () => el.innerHTML = refBar(crumbs) + head
      + (entries.length || head ? entries.map(hit).join('') : `<p class="empty masc-empty">${mascot('n-calc', { size: 64, zoom: 1.2 })}<span>Nothing matches "${esc(q)}". ${reportButton('idea', { text: 'Ask for this to be documented', tip: 'Ask for this to be documented: opens a request with your search filled in', attrs: `data-report-docs="${esc(q)}"` })}</span></p>`));
    wireApiLinks(el);
  }
  $('#api-q').addEventListener('input', (e) => {
    const q = (e.target as HTMLInputElement).value;
    // Typing doesn't add to Back; the view before the search does (once).
    if (!refView.startsWith('q:') || !refView.slice(2)) refHistory.push(refView);
    refView = q.trim() ? `q:${q}` : 'home';
    setDocsHash();
    renderApi(q);
  });
  // Alt+Left in the Reference goes back, as in a browser.
  $('#api-results').addEventListener('keydown', (e) => { if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); refBack(); } });
  renderApi('');

  return { go: refGo, back: refBack, openHash: openDocsHash, setHash: () => setDocsHash(), leaveHash: leaveDocsHash, preview: renderApi };
}
