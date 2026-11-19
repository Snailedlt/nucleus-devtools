// The workbench's feedback links fill issue forms in splitscreenme-vscode, and a bot there checks the details block's
// checksum (scripts/issue-bots.mjs, tested by src/test/bots.test.ts). This checks our side still matches: the checksum
// gives the value the bot expects for a real block, and the links fill fields the forms have.
// Run: node tools/report-links.test.mjs  (the extension at ./core, as in pages.yml, or ../splitscreenme-vscode; CORE_DIR overrides)
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const esbuild = createRequire(path.join(root, 'playground/package.json'))('esbuild');
const load = async (file) => {
  const { code } = esbuild.transformSync(fs.readFileSync(path.join(root, file), 'utf8'), { loader: 'ts', format: 'esm' });
  return import(`data:text/javascript,${encodeURIComponent(code)}`);
};
const core = [process.env.CORE_DIR, path.join(root, 'core'), path.join(root, '../splitscreenme-vscode')].find((d) => d && fs.existsSync(path.join(d, '.github/ISSUE_TEMPLATE')));

// A real block, as the workbench filled it in (splitscreenme-vscode#7). The extension's bot test uses the same one.
const REAL_BLOCK = `Workbench: build 9589434, core 70b4a54
Page: https://snailedlt.github.io/nucleuscoop-handler-testbench/
Browser: Chrome 156 on Android, touch
Screen: 360x705 (pixel ratio 3)
Settings: look www, dark, layout rail, advanced, code view, check compact
Open handler: Untitled handler (own code, not included)
Tester: coding dev, Nucleus some
Doc: Context.Arch`;

test('checksum gives what the issue bot expects', async () => {
  const { checksum } = await load('playground/src/checksum.ts');
  assert.equal(checksum(REAL_BLOCK.split('\n')), '49f16946');
});

/** The issue form's field ids and the "Where" dropdown's options. */
function form(file) {
  // The workbench's own form (feedback.yml) lives in this repository; the checks' forms in splitscreenme-vscode.
  const own = path.join(root, '.github/ISSUE_TEMPLATE', file);
  const y = fs.readFileSync(fs.existsSync(own) ? own : path.join(core, '.github/ISSUE_TEMPLATE', file), 'utf8');
  return { ids: new Set([...y.matchAll(/^\s+id: (\S+)/gm)].map((m) => m[1])), text: y };
}

test('the feedback links fill fields the forms have', { skip: !core && 'no splitscreenme-vscode checkout' }, () => {
  const src = fs.readFileSync(path.join(root, 'playground/src/report.ts'), 'utf8');
  const init = src.match(/new URLSearchParams\(\{([\s\S]*?)\}\);/)[1];
  const template = init.match(/template: '([^']+)'/)[1];
  const keys = [...init.matchAll(/(\w+):/g)].map((m) => m[1]).concat([...src.matchAll(/(?:q|u\.searchParams)\.set\('(\w+)'/g)].map((m) => m[1]));
  const f = form(template);
  for (const k of new Set(keys)) if (!['template', 'title'].includes(k)) assert.ok(f.ids.has(k), `${template} has a field "${k}" (feedbackUrl fills it)`);
  const area = init.match(/area: (?:opts\.area \?\? )?'([^']+)'/)[1];
  assert.ok(f.text.includes(`- ${area}`), `${template}'s Where list has "${area}"`);
  // withContext adds the details to the doc review link too.
  assert.ok(form('doc-review.yml').ids.has('context'), 'doc-review.yml has a field "context"');
});

test('the report dialog\'s links (core/report.ts) open the right repository and fill fields its forms have', { skip: !core && 'no splitscreenme-vscode checkout' }, async () => {
  const report = await load(path.relative(root, path.join(core, 'src/core/report.ts')));
  const { checksum } = await load('playground/src/checksum.ts');
  assert.equal(report.checksum(REAL_BLOCK.split('\n')), checksum(REAL_BLOCK.split('\n')), 'core and the workbench agree on the checksum');
  const cases = [
    [{ kind: 'problem', tool: 'workbench' }, 'Snailedlt/nucleuscoop-handler-testbench'],
    [{ kind: 'problem', tool: 'learn' }, 'Snailedlt/nucleuscoop-handler-testbench'],
    [{ kind: 'error', tool: 'workbench', error: { message: 'x', stack: 'at f (a.js:1:1)' } }, 'Snailedlt/nucleuscoop-handler-testbench'],
    [{ kind: 'feature', tool: 'workbench', what: 'do a thing' }, 'Snailedlt/nucleuscoop-handler-testbench'],
    [{ kind: 'stuck', tool: 'learn', lesson: { id: 'first/l1', title: 'One' }, code: 'Game.GUID = "x";' }, 'Snailedlt/nucleuscoop-handler-testbench'],
    [{ kind: 'check', tool: 'workbench', rule: 'unknown-member', code: 'Game.Foo = 1;' }, 'Snailedlt/splitscreenme-vscode'],
    [{ kind: 'tryit', tool: 'workbench', sim: 'Try it: 2 players' }, 'Snailedlt/splitscreenme-vscode'],
    [{ kind: 'docs', tool: 'workbench', query: 'save folder' }, 'Snailedlt/splitscreenme-vscode'],
  ];
  for (const [input, repo] of cases) {
    const r = report.buildReport({ ...input, details: ['Workbench: build x, core y'] });
    const u = new URL(r.url);
    assert.equal(u.pathname, `/${repo}/issues/new`, `${input.kind} from ${input.tool}`);
    const own = repo.endsWith('testbench');
    const file = path.join(own ? root : core, '.github/ISSUE_TEMPLATE', u.searchParams.get('template'));
    const y = fs.readFileSync(file, 'utf8');
    const ids = new Set([...y.matchAll(/^\s+id: (\S+)/gm)].map((m) => m[1]));
    for (const k of u.searchParams.keys()) if (!['template', 'title'].includes(k)) assert.ok(ids.has(k), `${path.basename(file)} has a field "${k}" (${input.kind})`);
    const area = u.searchParams.get('area');
    if (area) assert.ok(y.includes(`- ${area}\n`), `${path.basename(file)}'s Where list has "${area}"`);
    assert.match(y, /label: Details from the tool/);
  }
});
