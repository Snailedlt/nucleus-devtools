// The docs of an API member as a card: a coloured signature (owner dim, name bold, parameters and types in their own
// colours), the description, its tags (kind, required, read-only, default, category), the engines whose handlers use
// it notably more or less (no numbers), an example (with "Insert into handler" in Docs), "How handlers use it" (the
// AI-written "In practice" part, folded) and 👍/👎 for each part. Every AI-written part sits in a lightly tinted frame
// with the sparkle in its corner (core/aimark.ts, the same as the docs pages and VS Code's Docs panel); where it comes
// from is the sparkle's tooltip. This is the handler author's view: the votes so far, "Verified by people" and the counted "By
// engine" line are on the docs pages (docs-pages.mjs). Used by the hover card (compact), Docs (full entries and search
// results, memberSummary), Form and Blocks.
import { withContext } from './report';
import { reportIcon } from '@core/reporticons';
import { aiBasis, api, docReviewUrl, exampleSource, isAiPart, ownerLabel, type AiPart, type Member } from '@core/api';
import { aiMeta } from '@core/aimark';
import type { DocPart } from '@core/docvotes';
import { myVote, feedbackOn } from './feedback';
import { snapshotVotes, liveVotes, scoreText, voteTipText } from './votecounts';
import { hlHtml } from './codehl';
import { prettyCode } from '@core/pretty';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
// Code spans and links are set aside first, so bold never reaches into them (nor a link into code), then put back.
const inline = (s: string) => {
  const kept: string[] = [];
  const keep = (html: string) => `\u0000${kept.push(html) - 1}\u0000`;
  return esc(s.replace(/\u0000/g, ''))
    .replace(/`([^`]+)`/g, (_m, c: string) => keep(`<code>${c}</code>`))
    .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, (_m, t: string, u: string) => keep(`<a href="${u}" target="_blank" rel="noopener">${t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')}</a>`))
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\u0000(\d+)\u0000/g, (_m, i: string) => kept[Number(i)])
    .replace(/\u0000(\d+)\u0000/g, (_m, i: string) => kept[Number(i)]); // code inside a link's text
};
// Parameters accept numbers and booleans too (Jint converts them to text); the signature shows the declared type.
const ty = (t: string) => `<span class="sg-t">${esc(t.replace(/ \| number \| boolean$/, '').replace(/^string \| number \| boolean$/, 'string'))}</span>`;

/** The member's signatures as HTML, one per overload: a long one one parameter per line, as prettier prints it
 *  (core/pretty.ts prettySignature does the same in VS Code, the Docs panel and the CLI), measured on the plain text. */
function signatures(owner: string, name: string, m: Member): string[] {
  const label = ownerLabel(owner);
  const pre = `<span class="sg-o">${esc(label)}.</span><span class="sg-n">${esc(name)}</span>`;
  const plainType = (t: string) => t.replace(/ \| number \| boolean$/, '').replace(/^string \| number \| boolean$/, 'string');
  return m.kind === 'method'
    ? (m.overloads ?? []).map((o) => {
      const ps = o.params.map((p) => `<span class="sg-p">${p.rest ? '...' : ''}${esc(p.name)}</span>: ${ty(p.type)}`);
      const plain = `${label}.${name}(${o.params.map((p) => `${p.rest ? '...' : ''}${p.name}: ${plainType(p.type)}`).join(', ')}): ${plainType(o.returns)}`;
      const list = plain.length > 60 && ps.length > 1 ? `\n  ${ps.join(',\n  ')}\n` : ps.join(', ');
      return `${pre}(${list})<span class="sg-c">: </span>${ty(o.returns)}`;
    })
    : [`${pre}<span class="sg-c">: </span>${ty(m.kind === 'object' ? m.ref ?? m.ts ?? '' : m.ts ?? '')}`];
}

/** `compact`: the editor's hover, as VS Code shows it: signature, text, one line of facts; no example or chips. */
export function memberCard(owner: string, name: string, m: Member, opts: { head?: boolean; compact?: boolean; /** "Insert into handler" under the example (Docs). */ insert?: boolean } = {}): string {
  const path = `${ownerLabel(owner)}.${name}`;
  const sigs = signatures(owner, name, m);
  if (opts.compact) {
    // The hover: short, as VS Code's (help on request): the signature, the doc's first sentence (marked when AI
    // wrote it) and a link to the whole card in Docs, where "In practice", the votes, the engines and the example are.
    return hlHtml(`<div class="dc compact">`
      + (opts.head === false ? '' : `<div class="dc-sig">${sigs.map((s) => `<div>${s}</div>`).join('')}</div>`)
      + `<div class="dc-text">`
      + (m.deprecated ? `<p class="dc-dep">${inline(m.deprecated)}</p>` : '')
      + (m.doc ? aiFrame(m, 'doc', `<p>${inline(firstSentence(m.doc))}</p>`) : '<p class="muted">No description yet.</p>')
      + `<p class="dc-more"><a href="#docs-${esc(path)}" data-api="${esc(path)}">More in Docs</a></p>`
      + `</div></div>`);
  }
  // Docs, for handler authors: what it is, its tags, the example to insert, then how handlers use it (folded) and a
  // vote line. Where an AI-written part comes from ("Based on …") is its sparkle's tooltip; the votes so far, "Verified
  // by people" and the counted "By engine" numbers are on the docs pages (/docs), for the developers and testers.
  const engines = engineFamilies(m);
  return hlHtml(`<div class="dc">`
    + (opts.head === false ? '' : `<div class="dc-sig">${sigs.map((s) => `<div>${s}</div>`).join('')}</div>`)
    + (m.deprecated ? `<p class="dc-dep">${inline(m.deprecated)}</p>` : '')
    + (m.doc ? aiFrame(m, 'doc', paras(m.doc)) : '<p class="muted">No description yet.</p>')
    + tagRow(owner, m)
    + (engines ? `<p class="dc-engine" title="Compared with all Hub handlers. The numbers are on the docs pages.">${esc(engines)}</p>` : '')
    + (m.example ? `<div class="dc-example${isAiPart(m, 'example') ? ' ai-box' : ''}">${isAiPart(m, 'example') ? aiMeta(m, 'example', SPARK, uid('example')) : ''}<div class="dc-ex-head"><span class="dc-ex-t">Example</span>${exampleLabel(m) ? `<span class="dc-ex-src">${esc(exampleLabel(m))}</span>` : ''}${opts.insert ? `<button type="button" class="btn small dc-insert" data-insert="${esc(path)}">Insert into handler</button>` : ''}</div><pre class="doc-code">${esc(prettyCode(m.example))}</pre></div>` : '')
    + (m.practice ? practicePart(m, path) : '')
    // Every doc gets its votes, human-written or not: people say whether it's right either way.
    + (m.doc ? voteLine(path, 'doc') : '')
    + `</div>`);
}

/** A short result in a Docs search: the signature, the first sentence, the tags and a link to the whole entry. */
export function memberSummary(owner: string, name: string, m: Member): string {
  // The signature's name isn't a link here (nolink): the result has its own "Open full doc".
  return hlHtml(`<div class="dc hit"><div class="dc-sig nolink">${signatures(owner, name, m).map((s) => `<div>${s}</div>`).join('')}</div>`
    + (m.deprecated ? `<p class="dc-dep">${inline(firstSentence(m.deprecated))}</p>` : '')
    // An AI-written description: a small sparkle before it (a search result gets no frame).
    + (m.doc ? `<p>${isAiPart(m, 'doc') ? `<span class="ai-spark dc-hit-ai" role="img" aria-label="AI-written" title="AI-written. ${esc(aiBasis(m, 'doc'))}"></span> ` : ''}${inline(firstSentence(m.doc))}</p>` : '<p class="muted">No description yet.</p>')
    + tagRow(owner, m)
    + `</div>`);
}

/** The tags: what kind of name it is (a callback, a method, a true/false option…), required, read-only, deprecated,
 *  written by the Hub, the default and category. (AI-written parts are framed instead: aiFrame.) */
function tagRow(owner: string, m: Member): string {
  const t = m.type ?? '';
  const kind = m.kind === 'method' ? 'Method' : t === 'function' ? 'Callback' : m.kind === 'object' ? 'Object'
    : t === 'boolean' ? 'true / false' : t === 'string' ? 'Text' : t === 'number' ? 'Number' : /\[\]$|^array$/.test(t) ? 'List'
    : t.startsWith('enum:') ? `Nucleus.${t.slice(5)} value` : '';
  const chips = [
    kind ? `<span class="dc-chip kind">${esc(kind)}</span>` : '',
    m.required ? '<span class="dc-chip req">Required</span>' : '',
    m.deprecated ? '<span class="dc-chip dep">Deprecated</span>' : '',
    m.readonly ? '<span class="dc-chip">Read-only</span>' : '',
    owner.startsWith('Hub') ? '<span class="dc-chip">Written by the Hub</span>' : '',
    m.default !== undefined ? `<span class="dc-chip">Default <code>${esc(m.default)}</code></span>` : '',
    m.category ? `<span class="dc-chip">${esc(m.category)}</span>` : '',
  ].filter(Boolean);
  return chips.length ? `<div class="dc-facts">${chips.join('')}</div>` : '';
}
/** The sparkle in an AI-written part's corner (page.html .ai-spark). */
const SPARK = '<span class="ai-spark" aria-hidden="true"></span>';
let uids = 0;
/** An id for a sparkle's tooltip, unique on the page (many cards can be open at once). */
const uid = (part: string) => `ai-${part}-${++uids}`;
/** `html` in an AI-written part's frame when that part is AI-written (core/aimark.ts aiMeta: the sparkle, its tooltip
 *  with the basis, a hidden "AI-written", "Checked by …"); as it is otherwise. */
const aiFrame = (m: Member, part: AiPart, html: string) => (isAiPart(m, part) ? `<div class="ai-box" data-ai="${part}">${aiMeta(m, part, SPARK, uid(part))}${html}</div>` : html);
/** "How handlers use it" ("In practice", always AI-written), folded, in its frame. The summary is the toggle, so the
 *  sparkle in it is no control of its own: hovering it, or focusing the summary, shows where it comes from. */
function practicePart(m: Member, path: string): string {
  const id = uid('practice');
  const checked = m.practiceCheckedBy ? `<span class="ai-checked">✓ Checked by ${esc(m.practiceCheckedBy)}${m.practiceCheckedOn ? ` on ${esc(m.practiceCheckedOn)}` : ''}</span>` : '';
  return `<details class="dc-practice ai-box" data-ai="practice"><summary class="dc-pr-h" aria-describedby="${id}"><span class="dc-pr-t">How handlers use it</span><span class="ai-meta">${checked}<span class="ai-badge">${SPARK}<span class="sr-only">AI-written</span><span class="ai-tip" role="tooltip" id="${id}">AI-written. ${esc(aiBasis(m, 'practice'))}</span></span></span></summary>${paras(m.practice!)}${voteLine(path, 'practice')}</details>`;
}

/** "More common in: Source · Less common in: Unity": the engine families whose Hub handlers use it notably more or
 *  less than all handlers (the rule of the core's byEngine line: at least twice or at most half the share, 15 points
 *  apart), with no numbers; '' when the model has no "By engine" line for it. */
export function engineFamilies(m: Member): string {
  const totals = api.hubHandlers?.engines;
  if (!m.byEngine || !m.engineUse || !totals || !api.hubHandlers?.count) return '';
  const all = (m.hubUse ?? 0) / api.hubHandlers.count;
  const more: string[] = [], less: string[] = [];
  for (const [fam, n] of Object.entries(m.engineUse)) {
    const total = totals[fam];
    if (!total || total < 30) continue;
    const share = n / total;
    if (Math.abs(share - all) * 100 < 15) continue;
    if (share >= 2 * all) more.push(fam);
    else if (all >= 2 * share) less.push(fam);
  }
  return [more.length ? `More common in: ${more.join(', ')}` : '', less.length ? `Less common in: ${less.join(', ')}` : ''].filter(Boolean).join(' · ');
}

/** "By engine: Unity games 74% of 203 handlers (all Hub handlers 20%). Counted from …": mechanical, not AI-written. */
/** A doc's first sentence (its first paragraph's), cut at a word near 200 characters when longer. */
export function firstSentence(doc: string): string {
  const p = doc.split(/\n{2,}/)[0].replace(/\s+/g, ' ').trim();
  // A full stop that ends a sentence: not inside `code`, not "e.g." / "i.e.", followed by a capital or code.
  let s = p;
  let tick = false;
  for (let i = 0; i < p.length; i++) {
    if (p[i] === '`') tick = !tick;
    if (!tick && /[.!?]/.test(p[i]) && / [A-Z`(]/.test(p.slice(i + 1, i + 3)) && !/\b(e\.g|i\.e|etc|vs)$/i.test(p.slice(Math.max(0, i - 4), i))) { s = p.slice(0, i + 1); break; }
  }
  if (s.length <= 220) return s;
  const cut = s.slice(0, 200);
  const sp = cut.lastIndexOf(' ');
  const out = cut.slice(0, sp > 120 ? sp : 200);
  // An odd number of backticks would leave code open.
  return (out.split('`').length % 2 ? out : out + '`') + '…';
}
const paras = (text: string) => text.split(/\n{2,}/).map((p) => `<p>${inline(p)}</p>`).join('');
// The doc and "How handlers use it" each get 👍/👎: their names say which part (the buttons show only the icons).
const VOTE_LABELS: Record<DocPart, { up: string; down: string }> = {
  doc: { up: 'The doc is correct', down: 'The doc is wrong or unclear' },
  practice: { up: '“How handlers use it” is correct', down: '“How handlers use it” is wrong or unclear' },
};
/** Is this right? [👍] score [👎], the docs pages' control: the score is people's 👍 minus 👎 (the build's snapshot, then
 *  live from GoatCounter), the tooltip on hover or focus tells people's and AIs' votes apart, and this browser's own
 *  vote moves the score by one. The follow-up link shows only after a vote: after a 👎 "Tell us what's wrong", after a
 *  👍 "Give feedback" (the same form, titled as feedback); taking the vote back hides it again. */
let lineSeq = 0;
function voteLine(path: string, part: DocPart): string {
  const mine = myVote(part, path);
  const q = part === 'practice' ? 'Is this right?' : 'Is this doc right?';
  const c = snapshotVotes(path, part), id = `dc-vt-${++lineSeq}`, labels = VOTE_LABELS[part];
  const b = (v: 'up' | 'down', icon: string, label: string) => `<button type="button" class="vote-btn" data-vote="${v}" data-vkind="${part}" data-vid="${esc(path)}" aria-pressed="${mine === v}" aria-label="${esc(label)}" aria-describedby="${id}">${icon}</button>`;
  setTimeout(() => fillLive(id, path, part), 0);
  return `<div class="dc-check" data-up="${c.up}" data-down="${c.down}" data-aiup="${c.aiUp}" data-aidown="${c.aiDown}" data-base="${mine ?? ''}"><span>${q}</span>`
    + `<span class="vote-ctl" role="group" aria-label="${q}">${b('up', '👍', labels.up)}<span class="vote-score" aria-hidden="true"></span>${b('down', '👎', labels.down)}<span class="vote-tip" id="${id}" role="tooltip"></span></span>`
    + `<a class="dc-wrong" href="${esc(withContext(docReviewUrl(path), { Doc: path }))}" target="_blank" rel="noopener"${mine === 'down' ? '' : ' hidden'}>${reportIcon('flag', 14)}Tell us what's wrong</a>`
    + `<a class="dc-good" href="${esc(withContext(feedbackUrl(path), { Doc: path }))}" target="_blank" rel="noopener"${mine === 'up' ? '' : ' hidden'}>Give feedback</a></div>`;
}
/** The score and the tooltip from the line's counts and the vote pressed now. Live counts already hold the vote this
 *  browser had sent before they were read (data-base), so only the change since counts. */
function showVotes(line: HTMLElement) {
  const v = line.querySelector<HTMLElement>('button[data-vote][aria-pressed="true"]')?.dataset.vote;
  const was = line.dataset.live ? line.dataset.base : '';
  const up = +line.dataset.up! + (v === 'up' ? 1 : 0) - (was === 'up' ? 1 : 0), down = +line.dataset.down! + (v === 'down' ? 1 : 0) - (was === 'down' ? 1 : 0);
  const s = line.querySelector('.vote-score'), t = line.querySelector('.vote-tip');
  if (s) s.textContent = scoreText(up - down);
  if (t) t.textContent = voteTipText(up, down, +line.dataset.aiup!, +line.dataset.aidown!);
}
function fillLive(tipId: string, path: string, part: DocPart) {
  const line = document.getElementById(tipId)?.closest<HTMLElement>('.dc-check');
  if (!line) return;
  if (!feedbackOn()) line.dataset.base = ''; // its votes were never sent, so the live counts don't hold them
  showVotes(line);
  liveVotes(path, part).then((c) => {
    if (!c || !line.isConnected) return;
    Object.assign(line.dataset, { up: String(c.up), down: String(c.down), aiup: String(c.aiUp), aidown: String(c.aiDown), live: '1' });
    showVotes(line);
  });
}
/** The doc review form titled as feedback (after a 👍: something to add, a better example). */
export const feedbackUrl = (path: string) => docReviewUrl(path).replace(encodeURIComponent('Doc review: '), encodeURIComponent('Doc feedback: '));
/** Shows the link that fits the vote now pressed in a vote line (none when the vote was taken back). */
export function syncVoteLinks(line: Element | null | undefined) {
  if (!line) return;
  const v = line.querySelector<HTMLElement>('button[data-vote][aria-pressed="true"]')?.dataset.vote;
  line.querySelector<HTMLElement>('.dc-wrong')?.toggleAttribute('hidden', v !== 'down');
  line.querySelector<HTMLElement>('.dc-good')?.toggleAttribute('hidden', v !== 'up');
  if (line instanceof HTMLElement && line.dataset.up != null) showVotes(line);
}
// One listener for every card, after the vote buttons have taken the vote (feedback.ts wireVotes).
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('click', (e) => {
    const line = (e.target as HTMLElement | null)?.closest?.('.dc-check button[data-vote]')?.closest<HTMLElement>('.dc-check');
    if (line) setTimeout(() => syncVoteLinks(line), 0);
  });
  // Escape hides a sparkle's tooltip until the pointer or focus leaves it (WCAG 1.4.13).
  const tipHosts = '.ai-badge, .dc-pr-h, .dc-check .vote-ctl';
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll(`.ai-badge:hover, .ai-badge:focus, .dc-pr-h:focus, .dc-check .vote-ctl:hover, .dc-check .vote-ctl:focus-within`).forEach((b) => b.classList.add('tip-off'));
  });
  for (const ev of ['mouseout', 'focusout'] as const) document.addEventListener(ev, (e) => {
    const b = (e.target as HTMLElement | null)?.closest?.(tipHosts);
    if (b && !(ev === 'mouseout' && b.contains((e as MouseEvent).relatedTarget as Node | null))) b.classList.remove('tip-off');
  });
}

/** The example's source, short: "From Hub handlers" for a Hub example (never the counts an older model's note has),
 *  or the generated example's note; nothing for the official docs' own, nor for an AI-written one (its frame says it). */
export function exampleLabel(m: Member): string {
  if (m.exampleBy === 'hub') return 'From Hub handlers';
  if (m.exampleBy === 'claude') return '';
  return exampleSource(m);
}
