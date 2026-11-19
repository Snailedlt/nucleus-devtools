// The anonymous votes and feature counts (playground/src/feedback.ts and the docs pages send them to GoatCounter as
// events: "vote/doc/<name>/up", "vote/practice/<name>/up" (a doc's AI-written "In practice" part), "vote/tip/<id>/down",
// "vote/rule/<id>/up", "use/<feature>"; AI agents' votes, from `ncdev docs vote` and the MCP tool nucleus_vote_doc, as
// "aivote/doc/<name>/up" and "aivote/practice/<name>/up", kept apart from people's), summed for the maintainers: which docs people
// find wrong, which tips help, which features get used. Read from GoatCounter's API with a token, so the counts stay
// in one place; nothing personal is in them (feedback.ts says what is sent).
//
//   GOATCOUNTER_TOKEN=… FEEDBACK_GOATCOUNTER=<site code> node tools/votes-report.mjs <out dir>
//
// Writes <out dir>/votes.json, and a table of the docs with the most 👎 to the GitHub job summary when there is one.
// Without the token or the site, it says so and writes nothing (the workflow step is then a no-op).
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2];
const token = (process.env.GOATCOUNTER_TOKEN ?? '').trim();
const site = (process.env.FEEDBACK_GOATCOUNTER ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\.goatcounter\.com\/?.*$/, '');
if (!out) { console.error('usage: node tools/votes-report.mjs <out dir>'); process.exit(2); }
if (!token || !/^[a-z0-9-]{2,50}$/.test(site)) {
  console.log('votes-report: no GOATCOUNTER_TOKEN or FEEDBACK_GOATCOUNTER site; skipped.');
  process.exit(0);
}

// GOATCOUNTER_API: another address for the API (the tests use a local stand-in).
const api = process.env.GOATCOUNTER_API || `https://${site}.goatcounter.com/api/v0`;
const day = (d) => d.toISOString().slice(0, 10);
// The API takes datetimes (RFC 3339), from the start of the first day to the end of today.
const stamp = (d, end) => `${day(d)}T${end ? '23:59:59' : '00:00:00'}Z`;
const end = new Date();
const start = new Date(end.getTime() - 365 * 864e5);

/** Every path's total for the period: /stats/hits, a page at a time (exclude_paths: the ones already read). */
async function allHits() {
  const seen = [];
  const hits = [];
  let waits = 0; // GoatCounter's rate limit: wait and retry, but not for ever (the workflow's fallback must get to run)
  for (let page = 0; page < 200; page++) {
    const q = new URLSearchParams({ start: stamp(start), end: stamp(end, true), limit: '100' });
    for (const id of seen) q.append('exclude_paths', String(id));
    const r = await fetch(`${api}/stats/hits?${q}`, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    if (r.status === 429) {
      if (++waits > 30) throw new Error('GoatCounter kept answering 429 (rate limited); try again later.');
      await new Promise((ok) => setTimeout(ok, 2000));
      page--;
      continue;
    }
    if (!r.ok) throw new Error(`GoatCounter ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    for (const h of j.hits ?? []) { seen.push(h.path_id); hits.push({ path: String(h.path ?? '').replace(/^\//, ''), count: Number(h.count ?? 0) }); }
    if (!j.more || !(j.hits ?? []).length) break;
  }
  return hits;
}

// First a cheap call that says whether the site and the token are right, with a message that says which.
{
  const r = await fetch(`${api}/me`, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 404) throw new Error(`No GoatCounter site answers at ${api} (404). Check FEEDBACK_GOATCOUNTER: it should be the site's code, the part before .goatcounter.com in its address.`);
  if (r.status === 401 || r.status === 403) throw new Error(`GoatCounter refused the token (${r.status}: ${(await r.text()).slice(0, 120)}). Make one under the site's Settings › API with "Read statistics".`);
  if (!r.ok) throw new Error(`GoatCounter ${r.status} on /me: ${(await r.text()).slice(0, 200)}`);
}
const hits = await allHits();
/** vote/<kind>/<id>/<up|down|undo-up|undo-down> → per item: up and down, undos taken off. */
const votes = { doc: new Map(), practice: new Map(), tip: new Map(), rule: new Map(), aidoc: new Map(), aipractice: new Map() };
const use = [];
for (const { path: p, count } of hits) {
  const v = /^(ai)?vote\/(doc|practice|tip|rule)\/(.+)\/(up|down|undo-up|undo-down)$/.exec(p);
  if (v) {
    const [, ai, kind, id, dir] = v;
    // AIs vote on docs only.
    if (ai && kind !== 'doc' && kind !== 'practice') continue;
    const m = votes[(ai ?? '') + kind];
    const it = m.get(id) ?? { id, up: 0, down: 0 };
    if (dir === 'up') it.up += count; else if (dir === 'down') it.down += count; else if (dir === 'undo-up') it.up -= count; else it.down -= count;
    m.set(id, it);
    continue;
  }
  const u = /^use\/(.+)$/.exec(p);
  if (u) use.push({ feature: u[1], count });
}
const sorted = (m) => [...m.values()].map((x) => ({ ...x, up: Math.max(0, x.up), down: Math.max(0, x.down) })).sort((a, b) => b.down - a.down || b.up - a.up || a.id.localeCompare(b.id));
// docs/practice: people's votes; aiDocs/aiPractice: AIs', never mixed (only people's make an AI-written doc "Verified by
// people": the core's src/core/docvotes.ts).
const report = { takenAt: new Date().toISOString(), from: day(start), to: day(end), site, docs: sorted(votes.doc), practice: sorted(votes.practice), aiDocs: sorted(votes.aidoc), aiPractice: sorted(votes.aipractice), tips: sorted(votes.tip), rules: sorted(votes.rule), use: use.sort((a, b) => b.count - a.count) };
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'votes.json'), JSON.stringify(report, null, 1) + '\n');
console.log(`votes-report: ${report.docs.length} docs, ${report.practice.length} "In practice" parts, ${report.aiDocs.length + report.aiPractice.length} with AI votes, ${report.tips.length} tips, ${report.rules.length} checks, ${report.use.length} features (${report.from} to ${report.to}).`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = (list) => list.slice(0, 30).map((x) => `| \`${x.id}\` | ${x.up} | ${x.down} |`).join('\n');
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Votes, last 12 months\n\nMost 👎 first. The full list is \`votes.json\` on the \`data\` branch, and on the site's votes/ page.\n\n### Docs\n\n| Name | 👍 | 👎 |\n|---|---|---|\n${rows(report.docs)}\n\n### In practice (AI-written)\n\n| Name | 👍 | 👎 |\n|---|---|---|\n${rows(report.practice)}\n\n### AI votes (apart from people's)\n\n| Part | 👍 | 👎 |\n|---|---|---|\n${rows([...report.aiDocs.map((x) => ({ ...x, id: `doc/${x.id}` })), ...report.aiPractice.map((x) => ({ ...x, id: `practice/${x.id}` }))].sort((a, b) => b.down - a.down || b.up - a.up))}\n\n### Tips\n\n| Tip | 👍 | 👎 |\n|---|---|---|\n${rows(report.tips)}\n\n### Checks\n\n| Check | 👍 | 👎 |\n|---|---|---|\n${rows(report.rules)}\n`);
}
