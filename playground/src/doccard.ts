// The docs of an API member as a card: a coloured signature (owner dim, name bold, parameters and types in their own
// colours), the description, small facts (default, read-only, required, category), "In practice" (AI-written, apart),
// where an engine's handlers differ ("By engine", counted from Hub handlers), an example (with "Insert into handler" in
// Docs), and, for docs Claude wrote, a footer saying so and what they're
// based on. Each part (the doc, "In practice") has its own 👍/👎, its votes (people's and AIs' apart) and, for an
// AI-written part people verified, "Verified by people (N votes)" (core/docvotes.ts). Used by the hover card and Docs.
import { appNote, withContext } from './report';
import { claudeNote, docReviewUrl, exampleSource, hubUseText, ownerLabel, practiceNote, type Member } from '@core/api';
import { partVotes, setDocVotes, verifiedLabel, votesLine, type DocPart, type VoteSnapshot } from '@core/docvotes';
import { voteButtons } from './feedback';
import { hlHtml } from './codehl';
import { prettyCode } from '@core/pretty';

declare const BUILD: { docVotes?: VoteSnapshot | null };
// The newest votes report the build had (the data branch's votes.json); else the core's own snapshot.
try { setDocVotes(BUILD.docVotes); } catch { /* no BUILD (tests) */ }

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

/** `compact`: the editor's hover, as VS Code shows it: signature, text, one line of facts; no example or chips. */
export function memberCard(owner: string, name: string, m: Member, opts: { head?: boolean; compact?: boolean; /** "Insert into handler" under the example (Docs). */ insert?: boolean } = {}): string {
  const label = ownerLabel(owner);
  const path = `${label}.${name}`;
  const pre = `<span class="sg-o">${esc(label)}.</span><span class="sg-n">${esc(name)}</span>`;
  // A long overload one parameter per line, as prettier prints it (core/pretty.ts prettySignature does the same in
  // VS Code, the Docs panel and the CLI): measured on the plain text.
  const plainType = (t: string) => t.replace(/ \| number \| boolean$/, '').replace(/^string \| number \| boolean$/, 'string');
  const sigs = m.kind === 'method'
    ? (m.overloads ?? []).map((o) => {
      const ps = o.params.map((p) => `<span class="sg-p">${p.rest ? '...' : ''}${esc(p.name)}</span>: ${ty(p.type)}`);
      const plain = `${label}.${name}(${o.params.map((p) => `${p.rest ? '...' : ''}${p.name}: ${plainType(p.type)}`).join(', ')}): ${plainType(o.returns)}`;
      const list = plain.length > 60 && ps.length > 1 ? `\n  ${ps.join(',\n  ')}\n` : ps.join(', ');
      return `${pre}(${list})<span class="sg-c">: </span>${ty(o.returns)}`;
    })
    : [`${pre}<span class="sg-c">: </span>${ty(m.kind === 'object' ? m.ref ?? m.ts ?? '' : m.ts ?? '')}`];
  const facts: string[] = [];
  if (m.required) facts.push('<span class="dc-chip req">Required</span>');
  if (m.readonly) facts.push('<span class="dc-chip">Read-only</span>');
  if (m.default !== undefined) facts.push(`<span class="dc-chip">Default <code>${esc(m.default)}</code></span>`);
  if (m.category) facts.push(`<span class="dc-chip">${esc(m.category)}</span>`);
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
  return hlHtml(`<div class="dc">`
    + (opts.head === false ? '' : `<div class="dc-sig">${sigs.map((s) => `<div>${s}</div>`).join('')}</div>`)
    + (m.deprecated ? `<p class="dc-dep">${inline(m.deprecated)}</p>` : '')
    + (m.doc ? paras(m.doc) : '<p class="muted">No description yet.</p>')
    + (note ? `<div class="dc-ai" title="${esc(note)}"><span class="ai-spark" aria-hidden="true"></span><span>${m.docCheckedBy ? `AI-written, checked by ${esc(m.docCheckedBy)}${m.docCheckedOn ? ` on ${esc(m.docCheckedOn)}` : ''}.` : 'AI-written, not from the official docs.'} Based on ${esc(m.docBasis ?? '')}.</span></div>` : '')
    // Every doc gets its votes, human-written or not: people say whether it's right either way.
    + (m.doc ? checkRow(path, 'doc', !!note) : '')
    + (m.practice ? `<section class="dc-practice" aria-label="In practice (AI-written)"><h4 class="dc-pr-h"><span class="ai-spark" aria-hidden="true"></span>In practice <span class="dc-tag">AI-written</span></h4>${paras(m.practice)}`
      + `<p class="dc-pr-basis">Based on ${esc(m.practiceBasis ?? '')}.${hubUseText(m) ? ` ${esc(hubUseText(m))}.` : ''}${m.practiceCheckedBy ? ` Checked by ${esc(m.practiceCheckedBy)}.` : ''}</p>${checkRow(path, 'practice', true)}${m.byEngine ? engineLine(m.byEngine) : ''}</section>`
      // Only the counted "By engine" line, no AI-written text: under the same heading, marked counted.
      : m.byEngine ? `<section class="dc-practice counted" aria-label="In practice (counted from Hub handlers)"><h4 class="dc-pr-h">In practice <span class="dc-tag">Counted</span></h4>${engineLine(m.byEngine)}</section>` : '')
    + (m.example ? `<div class="dc-example"><div class="dc-ex-head"><span class="dc-ex-t">Example</span>${exampleSource(m) ? `<span class="dc-ex-src">${esc(exampleSource(m))}</span>` : ''}${opts.insert ? `<button type="button" class="btn small dc-insert" data-insert="${esc(path)}">Insert into handler</button>` : ''}</div><pre class="doc-code">${esc(prettyCode(m.example))}</pre></div>` : '')
    + (facts.length ? `<div class="dc-facts">${facts.join('')}</div>` : '')
    + `</div>`);
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
const engineLine = (text: string) => `<p class="dc-engine">${esc(text)}</p>`;
const paras = (text: string) => text.split(/\n{2,}/).map((p) => `<p>${inline(p)}</p>`).join('');
/** "✓ Verified by people (12 votes)" for an AI-written part people verified ('' otherwise). */
// The doc and "In practice" each get 👍/👎: their names say which part (the buttons show only the icons).
const VOTE_LABELS: Record<DocPart, { up: string; down: string }> = {
  doc: { up: 'The doc is correct', down: 'The doc is wrong or unclear' },
  practice: { up: '“In practice” is correct', down: '“In practice” is wrong or unclear' },
};
const verified = (path: string, part: DocPart) => {
  const l = verifiedLabel(partVotes(path, part));
  return l ? `<span class="dc-verified" title="At least 10 votes from people, at least 90% of them 👍. AI votes don't count.">✓ ${esc(l)}</span>` : '';
};
/** Is this right? 👍 👎, the votes so far (people, then AIs, apart), the verified label, and the report link. */
function checkRow(path: string, part: DocPart, aiWritten: boolean): string {
  const counts = votesLine(partVotes(path, part));
  return `<div class="dc-check"><span>${part === 'practice' ? 'Is this right?' : 'Is this doc right?'}</span>${voteButtons(part, path, VOTE_LABELS[part])}`
    + (aiWritten ? verified(path, part) : '')
    + (counts ? `<span class="dc-counts" title="Votes so far. People's and AIs' are counted apart; only people's make an AI-written part verified.">${esc(counts)}</span>` : '')
    + `<a href="${esc(withContext(docReviewUrl(path), { Doc: path }))}" target="_blank" rel="noopener">Tell us what's wrong</a>${appNote()}</div>`;
}
