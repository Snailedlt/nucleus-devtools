// The docs of an API member as a card: a coloured signature (owner dim, name bold, parameters and types in their own
// colours), the description, its tags (kind, required, read-only, default, category, AI-written), the engines whose
// handlers use it notably more or less (no numbers), an example (with "Insert into handler" in Docs), "How handlers use
// it" (the AI-written "In practice" part, folded) and 👍/👎 for each part. This is the handler author's view: where an
// AI-written part comes from is in its tag's tooltip, and the votes so far, "Verified by people" and the counted "By
// engine" line are on the docs pages (docs-pages.mjs). Used by the hover card (compact), Docs (full entries and search
// results, memberSummary), Form and Blocks.
import { withContext } from './report';
import { api, claudeNote, docReviewUrl, exampleSource, ownerLabel, practiceNote, type Member } from '@core/api';
import type { DocPart } from '@core/docvotes';
import { myVote, voteButtons } from './feedback';
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
  const note = claudeNote(m);
  if (opts.compact) {
    // The hover: short, as VS Code's (help on request): the signature, the doc's first sentence (marked when AI
    // wrote it) and a link to the whole card in Docs, where "In practice", the votes, the engines and the example are.
    return hlHtml(`<div class="dc compact">`
      + (opts.head === false ? '' : `<div class="dc-sig">${sigs.map((s) => `<div>${s}</div>`).join('')}</div>`)
      + `<div class="dc-text">`
      + (m.deprecated ? `<p class="dc-dep">${inline(m.deprecated)}</p>` : '')
      + (m.doc ? `<p>${inline(firstSentence(m.doc))}${note ? ` <span class="dc-ai-mark" title="${esc(note)}"><span class="ai-spark" aria-hidden="true"></span>${m.docCheckedBy ? `AI-written, checked by ${esc(m.docCheckedBy)}` : 'AI-written'}</span>` : ''}</p>` : '<p class="muted">No description yet.</p>')
      + `<p class="dc-more"><a href="#docs-${esc(path)}" data-api="${esc(path)}">More in Docs</a></p>`
      + `</div></div>`);
  }
  // Docs, for handler authors: what it is, its tags, the example to insert, then how handlers use it (folded) and a
  // vote line. Where an AI-written part comes from ("Based on …") is in its tag's tooltip; the votes so far, "Verified
  // by people" and the counted "By engine" numbers are on the docs pages (/docs), for the developers and testers.
  const pnote = practiceNote(m);
  const engines = engineFamilies(m);
  return hlHtml(`<div class="dc">`
    + (opts.head === false ? '' : `<div class="dc-sig">${sigs.map((s) => `<div>${s}</div>`).join('')}</div>`)
    + (m.deprecated ? `<p class="dc-dep">${inline(m.deprecated)}</p>` : '')
    + (m.doc ? paras(m.doc) : '<p class="muted">No description yet.</p>')
    + tagRow(owner, m)
    + (engines ? `<p class="dc-engine" title="Compared with all Hub handlers. The numbers are on the docs pages.">${esc(engines)}</p>` : '')
    + (m.example ? `<div class="dc-example"><div class="dc-ex-head"><span class="dc-ex-t">Example</span>${exampleLabel(m) ? `<span class="dc-ex-src">${esc(exampleLabel(m))}</span>` : ''}${opts.insert ? `<button type="button" class="btn small dc-insert" data-insert="${esc(path)}">Insert into handler</button>` : ''}</div><pre class="doc-code">${esc(prettyCode(m.example))}</pre></div>` : '')
    + (m.practice ? `<details class="dc-practice"><summary class="dc-pr-h"><span class="dc-pr-t">How handlers use it</span>${aiTag(pnote, m.practiceCheckedBy)}</summary>${paras(m.practice)}${voteLine(path, 'practice')}</details>` : '')
    // Every doc gets its votes, human-written or not: people say whether it's right either way.
    + (m.doc ? voteLine(path, 'doc') : '')
    + `</div>`);
}

/** A short result in a Docs search: the signature, the first sentence, the tags and a link to the whole entry. */
export function memberSummary(owner: string, name: string, m: Member): string {
  // The signature's name isn't a link here (nolink): the result has its own "Open full doc".
  return hlHtml(`<div class="dc hit"><div class="dc-sig nolink">${signatures(owner, name, m).map((s) => `<div>${s}</div>`).join('')}</div>`
    + (m.deprecated ? `<p class="dc-dep">${inline(firstSentence(m.deprecated))}</p>` : '')
    + (m.doc ? `<p>${inline(firstSentence(m.doc))}</p>` : '<p class="muted">No description yet.</p>')
    + tagRow(owner, m)
    + `</div>`);
}

/** The tags: what kind of name it is (a callback, a method, a true/false option…), required, read-only, deprecated,
 *  written by the Hub, the default and category, and AI-written when the doc is. */
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
    claudeNote(m) ? aiTag(claudeNote(m), m.docCheckedBy) : '',
  ].filter(Boolean);
  return chips.length ? `<div class="dc-facts">${chips.join('')}</div>` : '';
}
/** The AI-written tag; where the part comes from (its basis) is in the tooltip. */
const aiTag = (note: string, checkedBy?: string) =>
  `<span class="dc-chip dc-ai-tag" title="${esc(note)}"><span class="ai-spark" aria-hidden="true"></span>${checkedBy ? `AI-written, checked by ${esc(checkedBy)}` : 'AI-written'}</span>`;

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
/** Is this right? [👍 👎], the docs pages' compact control without its score (no counts here: they're on the docs pages). The follow-up link shows only after a vote: after
 *  a 👎 "Tell us what's wrong", after a 👍 "Give feedback" (the same form, titled as feedback); taking the vote back
 *  hides it again. */
function voteLine(path: string, part: DocPart): string {
  const mine = myVote(part, path);
  return `<div class="dc-check"><span>${part === 'practice' ? 'Is this right?' : 'Is this doc right?'}</span>${voteButtons(part, path, VOTE_LABELS[part])}`
    + `<a class="dc-wrong" href="${esc(withContext(docReviewUrl(path), { Doc: path }))}" target="_blank" rel="noopener"${mine === 'down' ? '' : ' hidden'}>Tell us what's wrong</a>`
    + `<a class="dc-good" href="${esc(withContext(feedbackUrl(path), { Doc: path }))}" target="_blank" rel="noopener"${mine === 'up' ? '' : ' hidden'}>Give feedback</a></div>`;
}
/** The doc review form titled as feedback (after a 👍: something to add, a better example). */
export const feedbackUrl = (path: string) => docReviewUrl(path).replace(encodeURIComponent('Doc review: '), encodeURIComponent('Doc feedback: '));
/** Shows the link that fits the vote now pressed in a vote line (none when the vote was taken back). */
export function syncVoteLinks(line: Element | null | undefined) {
  if (!line) return;
  const v = line.querySelector<HTMLElement>('button[data-vote][aria-pressed="true"]')?.dataset.vote;
  line.querySelector<HTMLElement>('.dc-wrong')?.toggleAttribute('hidden', v !== 'down');
  line.querySelector<HTMLElement>('.dc-good')?.toggleAttribute('hidden', v !== 'up');
}
// One listener for every card, after the vote buttons have taken the vote (feedback.ts wireVotes).
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('click', (e) => {
    const line = (e.target as HTMLElement | null)?.closest?.('.dc-check button[data-vote]')?.closest('.dc-check');
    if (line) setTimeout(() => syncVoteLinks(line), 0);
  });
}

/** The example's source, short: "From Hub handlers" for a Hub example (never the counts an older model's note has),
 *  "AI-written", or the generated example's note; nothing for the official docs' own. */
export function exampleLabel(m: Member): string {
  if (m.exampleBy === 'hub') return 'From Hub handlers';
  return exampleSource(m);
}
