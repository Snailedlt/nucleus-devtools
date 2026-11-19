// core/report.ts and core/reporticons.ts: where a report goes, what it carries, and the shared icons.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as report from '../core/report';
import { reportButton, reportIcon, REPORT_ACTIONS } from '../core/reporticons';

test('report: a Hub handler is found from its Hub lines; own code says it is not included', () => {
  const o = report.handlerOrigin('Hub.Handler.Id = "Abc123";\nHub.Handler.Version = 7;\nGame.GameName = "Halo";');
  assert.deepEqual(o, { kind: 'hub', hubId: 'Abc123', hubVersion: '7', name: 'Halo' });
  assert.match(report.originText(o), /Halo, Hub Abc123 v7 \(https:\/\/hub\.splitscreen\.me\/handler\/Abc123\)/);
  assert.equal(report.originText(report.handlerOrigin('Game.GameName = "X";')), 'X, own code (not included)');
  assert.equal(report.handlerOrigin('', { kind: 'example', name: 'Ex' }).kind, 'example');
});

test('report: each entry point opens its own repository and form', () => {
  const to = (i: report.ReportInput) => { const r = report.buildReport(i); return `${r.repo} ${r.template}`; };
  // One repository for every tool: the workbench and Learn use the same forms, with their own Where.
  assert.equal(report.WORKBENCH_REPO, report.TOOLS_REPO);
  assert.equal(to({ kind: 'problem', tool: 'workbench' }), `${report.TOOLS_REPO} tester-feedback.yml`);
  assert.equal(to({ kind: 'problem', tool: 'learn' }), `${report.TOOLS_REPO} tester-feedback.yml`);
  assert.equal(to({ kind: 'error', tool: 'workbench', error: { message: 'x' } }), `${report.TOOLS_REPO} tester-feedback.yml`);
  assert.equal(to({ kind: 'feature', tool: 'workbench' }), `${report.TOOLS_REPO} feature-request.yml`);
  assert.equal(to({ kind: 'stuck', tool: 'learn', lesson: { id: 'l1', title: 'One' } }), `${report.TOOLS_REPO} feature-request.yml`);
  assert.equal(report.buildReport({ kind: 'problem', tool: 'workbench' }).fields.area, 'Workbench (browser)');
  assert.equal(report.buildReport({ kind: 'stuck', tool: 'learn', lesson: { id: 'l1', title: 'One' } }).fields.area, 'Learn');
  // Checks, Try it and the docs are the core's, wherever they're used.
  assert.equal(to({ kind: 'check', tool: 'workbench', rule: 'x' }), `${report.TOOLS_REPO} check-wrong.yml`);
  assert.equal(to({ kind: 'tryit', tool: 'workbench' }), `${report.TOOLS_REPO} tester-feedback.yml`);
  assert.equal(to({ kind: 'docs', tool: 'workbench', query: 'q' }), `${report.TOOLS_REPO} feature-request.yml`);
  assert.equal(to({ kind: 'problem', tool: 'vscode' }), `${report.TOOLS_REPO} tester-feedback.yml`);
  assert.equal(to({ kind: 'feature', tool: 'notepad++' }), `${report.TOOLS_REPO} feature-request.yml`);
});

test('report: a check report carries the rule, line, origin and code, with a checksum the bot accepts', () => {
  const r = report.buildReport({ kind: 'check', tool: 'ncdev', rule: 'unknown-member', message: 'Unknown `Game.Foo`', line: 12, code: 'Game.Foo = 1;', handler: { kind: 'hub', hubId: 'h1', hubVersion: '3' }, version: 'ncdev 0.8.0', details: ['ncdev: 0.8.0', 'OS: linux'] });
  assert.equal(r.title, 'Check is wrong: unknown-member');
  assert.equal(r.fields.rule, 'unknown-member');
  assert.equal(r.fields.code, 'Game.Foo = 1;');
  assert.equal(r.fields.version, 'ncdev 0.8.0');
  const lines = r.details.split('\n');
  assert.ok(lines.includes('Rule: unknown-member') && lines.includes('Line: 12'));
  assert.equal(lines.at(-1), `Check: ${report.checksum(lines.slice(0, -1))}`);
  assert.equal(r.search, '"Check is wrong: unknown-member" in:title');
  // The text to paste has the details and the code, and no empty fields.
  assert.match(r.text, /\*\*Check is wrong: unknown-member\*\*/);
  assert.match(r.text, /```text\nncdev: 0\.8\.0/);
  assert.doesNotMatch(r.text, /What Nucleus really does/);
});

test('report: long code, stacks and simulations are cut to keep the link short enough for GitHub', () => {
  const big = Array.from({ length: 2000 }, (_, i) => `Game.Option${i} = "${'x'.repeat(20)}";`).join('\n');
  const r = report.buildReport({ kind: 'check', tool: 'vscode', rule: 'r', code: big });
  assert.ok(r.url.length <= 7000, `url is ${r.url.length}`);
  assert.match(r.fields.code, /… \(cut: \d+ more characters\)$/);
  const e = report.buildReport({ kind: 'error', tool: 'workbench', error: { message: 'boom', stack: 'at f (x.js:1:1)\n'.repeat(3000) } });
  assert.ok(e.url.length <= 7000);
});

test('report: the same error groups (numbers and addresses aside), a different one does not', () => {
  const a = report.errorId('Cannot read properties of undefined (reading \'x\') at 12', 'TypeError\n    at render (https://a/b.js:10:5)\n    at go (https://a/b.js:20:1)');
  const b = report.errorId('Cannot read properties of undefined (reading \'x\') at 99', 'TypeError\n    at render (https://a/b.js:11:7)\n    at go (https://a/b.js:21:2)');
  const c = report.errorId('Something else', 'at render (x)');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(report.errorId('x', 'render@https://a/b.js:1:1\ngo@https://a/b.js:2:2'), report.errorId('x', 'render@https://a/b.js:9:9\ngo@https://a/b.js:8:8'));
  const r = report.buildReport({ kind: 'error', tool: 'workbench', error: { message: 'Cannot read x', stack: 'at f (a)', count: 3 } });
  assert.equal(r.title, 'Workbench error: Cannot read x');
  assert.match(r.details, /Seen: 3 times in this visit/);
  assert.match(r.search, /^"Error id: [0-9a-f]{8}" in:body$/);
});

test('report: possible duplicates come from GitHub search; failures and pull requests give nothing', async () => {
  const r = report.buildReport({ kind: 'check', tool: 'vscode', rule: 'dup-test-rule' });
  let asked = '';
  const ok = (async (url: string) => { asked = url; return { ok: true, json: async () => ({ items: [{ number: 4, title: 'Check is wrong: dup-test-rule', html_url: 'https://github.com/Snailedlt/nucleus-devtools/issues/4', reactions: { '+1': 2 }, comments: 1 }, { number: 5, title: 'pr', html_url: 'https://github.com/Snailedlt/nucleus-devtools/pull/5', pull_request: {} }] }) }; }) as unknown as typeof fetch;
  const hits = await report.findDuplicates(r, { fetch: ok });
  assert.deepEqual(hits, [{ number: 4, title: 'Check is wrong: dup-test-rule', url: 'https://github.com/Snailedlt/nucleus-devtools/issues/4', thumbs: 2, comments: 1 }]);
  assert.match(decodeURIComponent(asked), /repo:Snailedlt\/nucleus-devtools is:issue is:open "Check is wrong: dup-test-rule" in:title/);
  // Kept: a second look-up doesn't ask again.
  asked = '';
  await report.findDuplicates(r, { fetch: ok });
  assert.equal(asked, '');
  const limited = (async () => ({ ok: false, status: 403, json: async () => ({}) })) as unknown as typeof fetch;
  assert.deepEqual(await report.findDuplicates(report.buildReport({ kind: 'check', tool: 'vscode', rule: 'other' }), { fetch: limited }), []);
  const offline = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
  assert.deepEqual(await report.findDuplicates(report.buildReport({ kind: 'check', tool: 'vscode', rule: 'third' }), { fetch: offline }), []);
  assert.deepEqual(await report.findDuplicates(report.buildReport({ kind: 'problem', tool: 'vscode' }), { fetch: offline }), [], 'nothing stable to match');
});

test('report: a handler problem goes to its Hub page and the community', () => {
  const h = report.handlerHelp({ kind: 'hub', hubId: 'xyz' });
  assert.equal(h.links[0].url, 'https://hub.splitscreen.me/handler/xyz');
  assert.ok(h.links.some((l) => l.url === report.DISCORD) && h.links.some((l) => l.url === report.REDDIT));
  assert.equal(report.handlerHelp(undefined).links.length, 2);
});

test('report: Try it in a few lines', () => {
  const s = report.simSummary({ loaded: true, players: [{ index: 0, window: '960×1080 at 0,0', startArguments: '-windowed', effects: Array.from({ length: 9 }, (_, i) => `Copies file ${i}`) }] }, { players: 1, resolution: '1920×1080', keyboard: 'player 1' });
  assert.match(s, /^Try it: 1 player, 1920×1080, keyboard: player 1\nPlayer 1: 960×1080 at 0,0 · args: -windowed/);
  assert.match(s, /…and 3 more changes/);
  assert.match(report.simSummary({ loaded: false, loadError: 'Unexpected token', players: [] }), /doesn't load: Unexpected token/);
});

test('report icons: decorative SVG; the button carries the name and tooltip', () => {
  for (const k of ['report', 'flag', 'idea'] as const) {
    assert.match(reportIcon(k), /^<svg [^>]*aria-hidden="true"[^>]*focusable="false"/);
    const only = reportButton(k);
    assert.match(only, new RegExp(`aria-label="${REPORT_ACTIONS[k].label}"`));
    assert.match(only, /title="[^"]+"/);
    const text = reportButton(k, { text: true });
    assert.doesNotMatch(text, /aria-label/);
    assert.ok(text.includes(`<span>${REPORT_ACTIONS[k].label}</span>`));
  }
  assert.ok(reportButton('flag', { label: 'A "quote"' }).includes('aria-label="A &quot;quote&quot;"'));
});
