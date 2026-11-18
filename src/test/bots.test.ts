// The issue bots (scripts/issue-bots.mjs, run by .github/workflows/doc-review.yml and report-details.yml): they read
// text they don't own (the form's headings, the workbench's details block), so a renamed field would make them go quiet
// without an error. These tests use real issue bodies, rebuild bodies from the forms the way GitHub does, and check that
// the links filling the forms use fields that exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as bots from '../../scripts/issue-bots.mjs';
import { docReviewUrl } from '../core/api';
import * as report from '../core/report';

const root = path.resolve(__dirname, '..');
const TEMPLATES = path.join(root, '.github/ISSUE_TEMPLATE');

interface FormField { type: string; id?: string; label?: string; render?: string; options: string[] }
/** Just enough of the issue form YAML: each body entry's type, id, label, render and dropdown options. */
function readForm(file: string): FormField[] {
  const out: FormField[] = [];
  let cur: FormField | null = null;
  let inOptions = false;
  for (const line of fs.readFileSync(path.join(TEMPLATES, file), 'utf8').split('\n')) {
    const type = line.match(/^  - type: (\w+)/);
    if (type) { cur = { type: type[1], options: [] }; out.push(cur); inOptions = false; continue; }
    if (!cur) continue;
    const kv = line.match(/^\s+(id|label|render): (.+)$/);
    if (kv) { (cur as any)[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, ''); inOptions = false; continue; }
    if (/^\s+options:\s*$/.test(line)) { inOptions = true; continue; }
    const opt = inOptions && line.match(/^\s+- (.+)$/);
    if (opt) cur.options.push(opt[1].trim().replace(/^["']|["']$/g, ''));
    else if (inOptions && line.trim() && !/^\s+- /.test(line)) inOptions = false;
  }
  return out;
}

/** An issue body as GitHub writes it from a form: `### <label>`, a blank line, the answer (fenced when `render` is set). */
function body(file: string, answers: Record<string, string>): string {
  return readForm(file)
    .filter((f) => f.type !== 'markdown' && f.label)
    .map((f) => {
      const v = answers[f.id!];
      const text = !v ? '_No response_' : f.render ? `\`\`\`${f.render}\n${v}\n\`\`\`` : v;
      return `### ${f.label}\n\n${text}`;
    })
    .join('\n\n');
}

// A real details block, as the workbench filled it in (splitscreenme-vscode#7). The workbench's own test checks its
// checksum() gives the same value for these lines, so the two copies of the function can't drift apart.
const REAL_BLOCK = `Workbench: build 9589434, core 70b4a54
Page: https://snailedlt.github.io/nucleuscoop-handler-testbench/
Browser: Chrome 156 on Android, touch
Screen: 360x705 (pixel ratio 3)
Settings: look www, dark, layout rail, advanced, code view, check compact
Open handler: Untitled handler (own code, not included)
Tester: coding dev, Nucleus some
Doc: Context.Arch
Check: 49f16946`;

// splitscreenme-vscode#7, opened from the workbench's "Tell us what's wrong", exactly as GitHub stored it.
// (Opened before the field was renamed "Details from the tool": the bot still reads the old label.)
const ISSUE_7 = "### Which name\n\nContext.Arch\n\n### What's the problem\n\nIt's missing something important\n\n### What Nucleus really does\n\nTest\n\n### How you know\n\n_No response_\n\n### Details from the workbench\n\n```text\n" + REAL_BLOCK + '\n```';

test('bots: the checksum matches the workbench on a real block', () => {
  const lines = REAL_BLOCK.split('\n');
  assert.equal(bots.checksum(lines.slice(0, -1)), '49f16946');
  assert.equal(bots.checkDetails(REAL_BLOCK).status, 'ok');
});

test('bots: a real doc review issue (#7) gets both comments', () => {
  assert.equal(bots.docReviewMember(ISSUE_7), 'Context.Arch');
  const details = bots.detailsComment(ISSUE_7)!;
  assert.ok(details.startsWith(bots.DETAILS_MARKER));
  assert.match(details, /✅ Checksum matches/);
  assert.ok(details.includes('Doc: Context.Arch'));
  const doc = bots.docReviewComment('Context.Arch', { doc: 'Architecture of the game executable.', basis: 'Nucleus GenericContext.cs' }, 'abc1234');
  assert.ok(doc.startsWith(bots.DOC_MARKER));
  assert.match(doc, /\*\*The AI-written doc\*\* for `Context\.Arch`/);
  assert.match(doc, /\[GenericContext\.cs\]\(https:\/\/github\.com\/search\?q=/);
});

test('bots: CRLF bodies, edited and hand-typed blocks', () => {
  assert.equal(bots.docReviewMember(ISSUE_7.replace(/\n/g, '\r\n')), 'Context.Arch');
  const edited = ISSUE_7.replace('Chrome 156', 'Chrome 157');
  assert.match(bots.detailsComment(edited)!, /⚠️ Changed before sending/);
  const typed = ISSUE_7.replace('\nCheck: 49f16946', '');
  assert.match(bots.detailsComment(typed)!, /⚠️ No checksum/);
  const moved = ISSUE_7.replace('Check: 49f16946', 'Check: 49f16946\nExtra: line');
  assert.match(bots.detailsComment(moved)!, /⚠️ Changed before sending/);
  // Code fences in the block can't break out of the comment's fence.
  assert.ok(!bots.detailsComment(ISSUE_7.replace('Doc: Context.Arch', 'Doc: ```x'))!.slice(10).includes('```x'));
});

test('bots: a blank issue (or the GitHub app, which has no forms) is skipped', () => {
  assert.equal(bots.detailsComment('Test'), null);
  assert.equal(bots.docReviewMember('Test'), '');
  assert.equal(bots.detailsComment(ISSUE_7.replace(/```text[\s\S]*```/, '_No response_')), null);
  assert.match(bots.docReviewComment('', undefined, 'abc1234'), /couldn't find an AI-written doc for `\(no name given\)`/);
});

test('bots: every field a bot reads is in its form, and bodies built from the forms parse', () => {
  for (const [file, labels] of Object.entries(bots.BOT_FIELDS)) {
    const form = readForm(file);
    for (const label of labels) assert.ok(form.some((f) => f.label === label), `${file} has a field labelled "${label}" (a bot reads it)`);
    const ctx = form.find((f) => f.label === bots.DETAILS)!;
    const answers: Record<string, string> = { [ctx.id!]: REAL_BLOCK };
    const member = form.find((f) => f.label === 'Which name');
    if (member) answers[member.id!] = '`Game.AddOption`';
    const b = body(file, answers);
    assert.match(bots.detailsComment(b)!, /✅/, `${file}: the details survive GitHub's layout`);
    if (member) assert.equal(bots.docReviewMember(b), 'Game.AddOption');
  }
});

test('bots: the doc review link opens the form and fills fields that exist', () => {
  const u = new URL(docReviewUrl('Context.Arch'));
  const template = u.searchParams.get('template')!;
  assert.ok(fs.existsSync(path.join(TEMPLATES, template)), `${template} exists`);
  const ids = new Set(readForm(template).map((f) => f.id).filter(Boolean));
  for (const key of u.searchParams.keys()) {
    if (['template', 'title', 'labels', 'assignees'].includes(key)) continue;
    assert.ok(ids.has(key), `${template} has a field with id "${key}" (the link fills it)`);
  }
  // The workbench adds its details to this link as ?context=… (withContext in playground/src/report.ts).
  assert.ok(ids.has('context'));
});

test('bots: the workflows use the tested module', () => {
  for (const [wf, fn] of [['doc-review.yml', 'runDocReview'], ['report-details.yml', 'runReportDetails']]) {
    const y = fs.readFileSync(path.join(root, '.github/workflows', wf), 'utf8');
    assert.ok(y.includes('scripts/issue-bots.mjs') && y.includes(`bots.${fn}(`), `${wf} calls ${fn} from scripts/issue-bots.mjs`);
    // The job only starts when the body has a heading a form writes.
    for (const h of y.matchAll(/'### ([^']+)'/g)) assert.ok([...Object.values(bots.BOT_FIELDS).flat(), bots.DETAILS_OLD].includes(h[1]), `${wf}: "### ${h[1]}" is a field a form writes`);
  }
});

test('bots: every report link fills fields its form has, and the copied text uses the form\'s labels', () => {
  const block = report.withChecksum(['VS Code extension: 0.8.0']);
  assert.equal(bots.checksum(['VS Code extension: 0.8.0']), report.checksum(['VS Code extension: 0.8.0']), 'core/report.ts and the bot agree');
  assert.equal(bots.checkDetails(block).status, 'ok');
  const kinds: report.ReportInput[] = [
    { kind: 'check', tool: 'vscode', rule: 'unknown-member', message: 'x', code: 'Game.Foo = 1;', line: 3, handler: { kind: 'hub', hubId: 'abc', hubVersion: '2' }, version: 'VS Code extension 0.8.0' },
    { kind: 'tryit', tool: 'vscode', sim: 'Try it: 2 players', what: 'It crashed' },
    { kind: 'problem', tool: 'notepad++' },
    { kind: 'problem', tool: 'ncdev' },
    { kind: 'feature', tool: 'lsp', editor: 'Neovim' },
    { kind: 'docs', tool: 'workbench', query: 'save folder' },
  ];
  for (const k of kinds) {
    const r = report.buildReport(k);
    assert.equal(r.repo, report.TOOLS_REPO, `${k.kind} from ${k.tool} goes to the tools' repository`);
    const u = new URL(r.url);
    const template = u.searchParams.get('template')!;
    const form = readForm(template);
    const ids = new Set(form.map((f) => f.id).filter(Boolean));
    for (const key of u.searchParams.keys()) if (!['template', 'title'].includes(key)) assert.ok(ids.has(key), `${template} has a field "${key}" (${k.kind} fills it)`);
    const area = u.searchParams.get('area');
    if (area) assert.ok(form.find((f) => f.id === 'area')!.options.includes(area), `${template}'s Where list has "${area}"`);
    // The labels the copied text uses are the form's own.
    const key = Object.keys(report.FORMS).find((x) => x === template)!;
    for (const [id, label] of Object.entries(report.FORMS[key].labels)) assert.equal(form.find((f) => f.id === id)?.label, label, `${template}: ${id} is labelled "${label}"`);
    // GitHub's bot reads the block back.
    const b = body(template, Object.fromEntries(form.filter((f) => f.id).map((f) => [f.id!, r.fields[f.id!] ?? ''])));
    assert.match(bots.detailsComment(b)!, /✅/, `${template}: the details survive GitHub's layout`);
    assert.ok(r.url.length < 8000);
  }
  // check-wrong's verdicts are the form's.
  assert.deepEqual(readForm('check-wrong.yml').find((f) => f.id === 'verdict')!.options, [...report.CHECK_VERDICTS]);
});

test('bots: the release comments only on this repository\'s fixed issues, once', async () => {
  const notes = '### ✨ New\n- **A thing.** What it does. (#3)\n- **Another.** Related to the old idea in #4.\n### 🐛 Fixed\n- **Bug.** Gone. (#9, Other/repo#7)\n- **Another bug.** #11 in passing\n### 🙏 Thanks\n- **Ann** for reporting it (#10)';
  assert.deepEqual(bots.deliveredIssues(notes, 'Snailedlt/splitscreenme-vscode'), [{ n: 3, kind: 'added' }, { n: 9, kind: 'fixed' }]);
  assert.deepEqual(bots.fixedIssueNumbers(notes, 'Snailedlt/splitscreenme-vscode'), [3, 9]);
  assert.match(bots.fixedComment({ tag: 'v1.2.0', url: 'U', reporter: 'ann', owner: 'Snailedlt', kind: 'added' }), /✅ Added in \*\*v1\.2\.0\*\* \(\[release notes\]\(U\)\)\. Thanks @ann for asking for it!/);
  assert.match(bots.fixedComment({ tag: 'v1.2.0', url: 'U', reporter: 'ann', owner: 'Snailedlt' }), /✅ Fixed in .* Thanks @ann for reporting it!/);
  assert.deepEqual(bots.fixedIssueNumbers('Fixes #12\ncloses Snailedlt/splitscreenme-vscode#13 and Snailedlt/nucleuscoop-handler-testbench#14', 'Snailedlt/splitscreenme-vscode'), [12, 13]);
  const made: number[] = [];
  const github = {
    // #9: the bot's own comment; #3: the same text from someone else (doesn't count: only the author differs).
    paginate: async (_fn: unknown, o: { issue_number: number }) => (o.issue_number === 9 ? [{ body: bots.FIXED_MARKER + '\n✅', user: { login: 'github-actions[bot]' } }] : o.issue_number === 3 ? [{ body: bots.FIXED_MARKER + '\n✅', user: { login: 'someone' } }] : []),
    rest: {
      issues: {
        listComments: {},
        get: async ({ issue_number }: { issue_number: number }) => {
          if (issue_number === 404) throw new Error('Not Found');
          return { data: { number: issue_number, user: { login: 'ann' }, pull_request: issue_number === 5 ? {} : undefined } };
        },
        createComment: async ({ issue_number, body }: { issue_number: number; body: string }) => { made.push(issue_number); assert.match(body, /Thanks @ann/); },
      },
    },
  };
  const done = await bots.runFixedComments({ github, context: { repo: { owner: 'Snailedlt', repo: 'splitscreenme-vscode' } }, tag: 'v1.0.0', url: 'u', notes: 'Fixes #3, fixes #5, fixes #9, fixes #404, fixes #500' });
  assert.deepEqual(done, [3, 500]); // #5 is a pull request, #9 already has the comment, #404 fails alone and #500 still gets its
  assert.deepEqual(made, [3, 500]);
  // A reference in passing in parentheses isn't a delivery; a commit subject's "(#12)" (a PR number) isn't either.
  assert.deepEqual(bots.deliveredIssues('### 🛠️ Improved\n- **X.** Better (see #12). (#13, #14)', 'Snailedlt/splitscreenme-vscode').map((x) => x.n), [13, 14]);
  assert.deepEqual(bots.deliveredIssues('Tidy the docs (#15)\n\nFixes #16', 'Snailedlt/splitscreenme-vscode', { commits: true }).map((x) => x.n), [16]);
  assert.doesNotMatch(bots.fixedComment({ tag: 'v1', url: 'u', reporter: 'Snailedlt', owner: 'Snailedlt' }), /Thanks/);
});

test('issue forms: no plain YAML value holds ": " (GitHub would refuse to load the whole form)', () => {
  for (const file of fs.readdirSync(TEMPLATES).filter((f) => f.endsWith('.yml'))) {
    fs.readFileSync(path.join(TEMPLATES, file), 'utf8').split('\n').forEach((line, i) => {
      const kv = line.match(/^\s*(?:- )?[\w-]+: (.+)$/);
      if (!kv || /^["'|>[{]/.test(kv[1])) return;
      assert.ok(!/: |:$|\s#/.test(kv[1].replace(/https?:\/\//g, '')), `${file}:${i + 1}: quote the value`);
    });
  }
});
