// The issue bots (.github/workflows/doc-review.yml and report-details.yml): they read an issue opened from an issue form
// and add a comment the reporter can't edit. The logic is here, as plain functions, so src/test/bots.test.ts can test it
// with real issue bodies and check that the forms (.github/ISSUE_TEMPLATE/*.yml) still have the fields it reads.
// Never runs code from the issue: it only reads the body as text.

/** The form fields the bots read, by template: GitHub turns each field's label into a `### <label>` heading. */
export const DETAILS = 'Details from the tool';
/** The field's old label (forms before the tools' reports, issues opened from an old page). */
export const DETAILS_OLD = 'Details from the workbench';
export const BOT_FIELDS = {
  'doc-review.yml': ['Which name', DETAILS],
  'tester-feedback.yml': [DETAILS],
  'check-wrong.yml': [DETAILS],
  'feature-request.yml': [DETAILS],
};
export const DOC_MARKER = '<!-- doc-review-bot -->';
export const DETAILS_MARKER = '<!-- report-details-bot -->';

/** A form field's answer: the text under `### <label>`, without a code fence; '' when empty or `_No response_`. */
export function field(body, label) {
  const text = String(body || '').replace(/\r\n/g, '\n');
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = text.match(new RegExp(`(?:^|\\n)###[ \\t]*${esc}[ \\t]*\\n([\\s\\S]*?)(?=\\n###[ \\t]|$)`));
  if (!m) return '';
  let v = m[1].trim();
  const fence = v.match(/^```\w*\n([\s\S]*?)\n?```$/);
  if (fence) v = fence[1].trim();
  return v === '_No response_' ? '' : v;
}

/** FNV-1a over the lines, the same as checksum() in the workbench (playground/src/report.ts in nucleuscoop-handler-testbench). */
export function checksum(lines) {
  let h = 0x811c9dc5;
  for (const ch of lines.map((l) => l.trim()).filter(Boolean).join('\n')) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** The "Details from the tool" check: 'ok', 'none' (no checksum line: typed by hand) or 'changed'. */
export function checkDetails(block) {
  const lines = String(block).split('\n').map((l) => l.trim()).filter(Boolean);
  const sumLine = lines.findIndex((l) => /^Check: [0-9a-f]{8}$/.test(l));
  if (sumLine < 0) return { lines, status: 'none' };
  const ok = sumLine > 0 && sumLine === lines.length - 1 && checksum(lines.slice(0, sumLine)) === lines[sumLine].slice(7);
  return { lines, status: ok ? 'ok' : 'changed' };
}

/** The report-details comment for an issue body, or null when the form's details field is missing or empty. */
export function detailsComment(body) {
  const block = field(body, DETAILS) || field(body, DETAILS_OLD);
  if (!block) return null;
  const { lines, status } = checkDetails(block);
  const says = {
    ok: '✅ Checksum matches: as the tool filled it in.',
    none: '⚠️ No checksum supplied: typed or pasted by hand, not filled in by a tool.',
    changed: '⚠️ Changed before sending: it no longer matches its checksum.',
  }[status];
  const safe = lines.join('\n').replace(/```/g, "'''").slice(0, 4000);
  return `${DETAILS_MARKER}\n**Details from the tool**, as sent. ${says}\n\n\`\`\`text\n${safe}\n\`\`\`\n\nThis copy stays as it is if the issue is edited later.`;
}

/** The member a doc review is about (the form's "Which name"), or ''. */
export function docReviewMember(body) {
  const m = field(body, 'Which name').match(/^`?([A-Za-z_$][\w$.]*)`?/);
  return m ? m[1] : '';
}

/** The doc-review comment: the doc as it is now, with its basis and links to the Nucleus source; or a request for the name. */
export function docReviewComment(member, d, sha) {
  if (!d) return `${DOC_MARKER}\nI couldn't find an AI-written doc for \`${member || '(no name given)'}\`. Please put the exact name in **Which name** (e.g. \`Game.AddOption\`) by editing the issue, and I'll add the doc here.`;
  const search = (file) => `https://github.com/search?q=repo%3ASplitScreen-Me%2Fsplitscreenme-nucleus+path%3A${encodeURIComponent(file)}&type=code`;
  const files = [...new Set(d.basis.match(/[\w.]+\.(cs|cpp|h)\b/g) || [])];
  return `${DOC_MARKER}\n**The AI-written doc** for \`${member}\` (data/claude-docs.json @ ${sha}):\n\n> ${d.doc.replace(/\n/g, '\n> ')}\n\n**Based on:** ${d.basis}\n\n${files.length ? `**Source:** ${files.map((f) => `[${f}](${search(f)})`).join(' · ')}\n\n` : ''}A maintainer checks the report against Nucleus. When it's settled, the doc is fixed or marked \`checkedBy\` in data/claude-docs.json.`;
}

/** report-details.yml: on a new issue, keep the details block as a comment. */
export async function runReportDetails({ github, context }) {
  const text = detailsComment(context.payload.issue.body);
  if (!text) return;
  await github.rest.issues.createComment({ ...context.repo, issue_number: context.payload.issue.number, body: text });
}

/** doc-review.yml: on a new or edited doc review, attach the doc once (it then stays as it was). */
export async function runDocReview({ github, context, docs }) {
  const issue = context.payload.issue;
  const member = docReviewMember(issue.body);
  const d = docs[member];
  const comments = await github.paginate(github.rest.issues.listComments, { ...context.repo, issue_number: issue.number });
  const mine = comments.find((c) => c.user.type === 'Bot' && (c.body || '').includes(DOC_MARKER));
  if (mine && mine.body.includes('**The AI-written doc**')) return;
  const text = docReviewComment(member, d, context.sha.slice(0, 7));
  if (mine) await github.rest.issues.updateComment({ ...context.repo, comment_id: mine.id, body: text });
  else await github.rest.issues.createComment({ ...context.repo, issue_number: issue.number, body: text });
  if (d && !issue.title.includes(member)) await github.rest.issues.update({ ...context.repo, issue_number: issue.number, title: `Doc review: ${member}` });
}

// ---------------------------------------------------------------------------------------------------------------------
// Closing the loop: when a release fixes a bug or adds what was asked for, say so on its issue, with the release notes and
// a thanks to whoever reported or asked.
// Run by the Release workflow (and the workbench's pages.yml, fetching this file from main). Only issues in the repository
// the workflow runs in (its token can't write elsewhere, and other repositories aren't ours to comment on); never twice
// (a marker in the comment); never fails the release (the step is continue-on-error, and every issue is tried alone).

export const FIXED_MARKER = '<!-- fixed-in-bot -->';

/** The issues in `repo` ("owner/name") a release delivers, each with what it was: `fixed` (a bug) or `added` (a
 *  feature or improvement). Release notes name them inline, at the entry they belong to: "- **Thing.** What changed.
 *  (#12)"; under a "Fixed" heading that's a fix, elsewhere an addition. Commit messages count with an explicit keyword:
 *  "Fixes #12", "closes owner/name#12". A number mentioned in passing ("see #4", "Ann for #10") doesn't count, and
 *  neither do other repositories' issues. */
export function deliveredIssues(text, repo, { commits = false } = {}) {
  const out = new Map();
  const own = repo.toLowerCase();
  let group = '';
  const add = (n, kind) => { if (n > 0 && out.get(n) !== 'fixed') out.set(n, kind); };
  for (const raw of String(text || '').split(/\r?\n/)) {
    if (/^#{2,4}\s/.test(raw)) { group = raw; continue; }
    const kind = /fix/i.test(group) ? 'fixed' : 'added';
    // This repository's references only: "#12", "owner/name#12", an issues/12 link.
    const ownNums = (s) => {
      const nums = [];
      s.replace(/https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/(?:issues|pull)\/(\d+)|\b([\w.-]+\/[\w.-]+)#(\d+)|(?:^|[^\w&/])#(\d+)\b/gi, (m, r1, n1, r2, n2, n3) => {
        const r = (r1 ?? r2)?.toLowerCase();
        if (n3 !== undefined) nums.push(Number(n3)); else if (r === own) nums.push(Number(n1 ?? n2));
        return m;
      });
      return nums;
    };
    // "(#12)" or "(#12, #13)" on an entry line (not a Thanks line): only a list of references, not "(see #12)".
    // Release notes only: a commit subject's "(#12)" is GitHub's pull request number, not a delivery.
    const REF = String.raw`(?:[\w.-]+\/[\w.-]+)?#\d+|https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(?:issues|pull)\/\d+`;
    if (!commits && !/thank/i.test(group)) for (const m of raw.matchAll(new RegExp(String.raw`\(\s*((?:${REF})(?:\s*,\s*(?:${REF}))*)\s*\)`, 'g'))) for (const n of ownNums(m[1])) add(n, kind);
    // "Fixes #12" / "closes owner/name#12" / "resolves …" anywhere (commit messages).
    for (const m of raw.matchAll(/\b(fix(?:e[sd])?|close[sd]?|resolve[sd]?)\b[\s:]+((?:the\s+)?(?:issue\s+)?(?:\S*#\d+|https:\/\/github\.com\/\S+\/(?:issues|pull)\/\d+))/gi)) {
      for (const n of ownNums(m[2])) add(n, /fix/i.test(m[1]) ? 'fixed' : kind);
    }
  }
  return [...out.entries()].sort((a, b) => a[0] - b[0]).map(([n, kind]) => ({ n, kind }));
}
/** Just the numbers (kept for callers that only need those). */
export const fixedIssueNumbers = (text, repo) => deliveredIssues(text, repo).map((x) => x.n);

/** The short comment on a delivered issue: fixed or added in which release, the notes, and a thanks to whoever
 *  reported or asked (not the maintainer or a bot). */
export function fixedComment({ tag, url, reporter, owner, kind = 'fixed' }) {
  const thanks = reporter && reporter !== owner && !/\[bot\]$/.test(reporter) ? ` Thanks @${reporter} for ${kind === 'fixed' ? 'reporting it' : 'asking for it'}!` : '';
  return `${FIXED_MARKER}\n✅ ${kind === 'fixed' ? 'Fixed' : 'Added'} in **${tag}** ([release notes](${url})).${thanks}`;
}

/** release.yml / pages.yml: comment on every issue the release fixes. `notes`: the release's notes; `commits`: the
 *  commit messages since the previous release (or [] to use the notes only). Returns what it did, for the summary. */
export async function runFixedComments({ github, context, tag, url, notes, commits = [], core }) {
  const repo = `${context.repo.owner}/${context.repo.repo}`;
  // The notes with their headings' rules; each commit message alone, with keywords only; merged by issue (a fix wins).
  const merged = new Map();
  for (const x of [...deliveredIssues(notes, repo), ...commits.flatMap((c) => deliveredIssues(c, repo, { commits: true }))]) if (merged.get(x.n) !== 'fixed') merged.set(x.n, x.kind);
  const found = [...merged.entries()].sort((a, b) => a[0] - b[0]).map(([n, kind]) => ({ n, kind }));
  const done = [];
  for (const { n, kind } of found) {
    if (done.length >= 50) {
      core?.warning?.(`Stopped after 50 comments; not looked at: ${found.filter((x) => x.n >= n).map((x) => '#' + x.n).join(', ')}`);
      break;
    }
    try {
      const { data: issue } = await github.rest.issues.get({ ...context.repo, issue_number: n });
      if (issue.pull_request) continue;
      const comments = await github.paginate(github.rest.issues.listComments, { ...context.repo, issue_number: n });
      // Already said: only this bot's own comment counts (anyone can paste the marker).
      if (comments.some((c) => c.user?.login === 'github-actions[bot]' && (c.body || '').startsWith(FIXED_MARKER))) continue;
      await github.rest.issues.createComment({ ...context.repo, issue_number: n, body: fixedComment({ tag, url, reporter: issue.user?.login, owner: context.repo.owner, kind }) });
      done.push(n);
    } catch (e) {
      core?.warning?.(`#${n}: ${e.message}`);
    }
  }
  return done;
}

/** The commit messages between the previous release and this one, from GitHub's compare API ([] when there's none). */
export async function commitsSincePrevious({ github, context, tag, prefix = '', core }) {
  let prev;
  try {
    const releases = await github.paginate(github.rest.repos.listReleases, { ...context.repo, per_page: 50 });
    prev = releases.filter((r) => !r.draft && r.tag_name !== tag && r.tag_name.startsWith(prefix))[0];
    if (!prev) return [];
    // Every page (one page holds at most 100 of them).
    const out = [];
    for (let page = 1; page <= 100; page++) {
      const { data } = await github.rest.repos.compareCommitsWithBasehead({ ...context.repo, basehead: `${prev.tag_name}...${tag}`, per_page: 100, page });
      out.push(...data.commits.map((c) => c.commit.message));
      if (data.commits.length < 100) break;
    }
    return out;
  } catch (e) {
    // The notes still count; only commit-only references are missed: say so.
    core?.warning?.(`Couldn't read the commits${prev ? ` since ${prev.tag_name}` : ''} (${e?.message ?? e}): only the release notes' issue references get a comment.`);
    return [];
  }
}
