import { test } from 'node:test';
import assert from 'node:assert/strict';
import raw from '../../data/claude-docs.json';
import sources from '../../data/sources.json';
import { aiBasisItems, aiBasisItemText, aiBasisMarkdown, aiBasisWords, api, claudeNote, memberMarkdown, type AiBasis } from '../core/api';
import { basisWords } from '../../scripts/basis.mjs';
import { aiTip } from '../core/aimark';
import practiceRaw from '../../data/claude-practice.json';
import { markdownReference } from '../core/lookup';
import { codeOf } from '../core/importhooks';

const docs = (raw as unknown as { docs: Record<string, { doc: string; basis: AiBasis; override?: boolean }> }).docs;
const OBJ: Record<string, string> = { Hub: 'Hub', 'Hub.Handler': 'HubHandler', 'Hub.Maintainer': 'HubMaintainer', Game: 'Game', 'Game.Hook': 'GameHook', 'Game.ProtoInput': 'GameProtoInput', Context: 'Context', Player: 'PlayerInfo', ProtoInput: 'ProtoInputRuntime', 'ProtoInput.Values': 'ProtoInputValues' };

test('Claude-written docs: each says what it is based on, and the tools label it', () => {
  for (const [key, d] of Object.entries(docs)) {
    assert.ok(d.doc.trim() && d.basis, `${key}: doc and basis`);
    assert.ok(!/—/.test(d.doc), `${key}: no em dashes`);
    const i = key.lastIndexOf('.');
    const obj = api.objects[OBJ[key.slice(0, i)]];
    assert.ok(obj, `${key}: known object`);
    const m = obj.members[key.slice(i + 1)];
    assert.ok(m, `${key}: a real member`);
    assert.equal(m.docBy, 'claude', `${key}: used and marked (a human doc exists? then drop it here)`);
    assert.equal(m.doc, d.doc);
  }
  const [owner, name] = ['Game', 'Play'];
  const md = memberMarkdown(owner, name, api.objects.Game.members.Play);
  // Markdown has no frames: a ✨ before the AI-written text, where it comes from on its own small line.
  assert.match(md, /^✨ /m);
  assert.match(md, /^_Based on Nucleus \[`/m);
  assert.doesNotMatch(md, /AI-written/, 'the ✨ says it');
  // With slots (the Docs panel, the docs pages) the caller frames it: no ✨ or basis line in the text.
  const framed = memberMarkdown(owner, name, api.objects.Game.members.Play, true);
  assert.match(framed, /@@slot:ai-doc@@[\s\S]*@@slot:ai-close@@/);
  assert.doesNotMatch(framed, /✨|_Based on /);
  assert.match(markdownReference(), /_✎ AI-written/);
  // Human docs carry no label.
  const human = Object.values(api.objects.Game.members).find((m) => m.doc && !m.docBy)!;
  assert.equal(claudeNote(human), '');
});

test('claude-param-docs.json: every entry is a real method, every parameter one of its own, all used', () => {
  const file = JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'data', 'claude-param-docs.json'), 'utf8'));
  const owners: Record<string, string> = { Context: 'Context', Game: 'Game', ProtoInput: 'ProtoInputRuntime' };
  const model = JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'data', 'nucleus-api.json'), 'utf8'));
  for (const [key, entry] of Object.entries<any>(file.params)) {
    const [owner, name] = key.split('.');
    const m = model.objects[owners[owner]]?.members[name];
    assert.equal(m?.kind, 'method', key);
    assert.ok(entry.basis, `${key}: basis`);
    const names = new Set(m.overloads.flatMap((o: any) => o.params.map((p: any) => p.name)));
    for (const p of Object.keys(entry.params)) assert.ok(names.has(p), `${key}(${p})`);
    for (const p of names) assert.ok(m.overloads.some((o: any) => o.params.some((x: any) => x.name === p && x.doc)), `${key}: ${String(p)} has its doc in the model (npm run generate)`);
  }
});

test('generator: each doc belongs to its own option (no comment or table text from a neighbour)', () => {
  const pi = api.objects.GameProtoInput.members;
  const g = api.objects.Game.members;
  // protoinput.md: a comment after a blank line describes the next option, not the one above it.
  assert.doesNotMatch(pi.InjectRuntime_EasyHookStealthMethod.doc, /locks input/i);
  assert.doesNotMatch(pi.SendKeyboardButtonMessages.doc, /input lock\/unlock/i);
  assert.doesNotMatch(pi.EnableFocusMessageLoop.doc, /^Game\./);
  assert.doesNotMatch(pi.MultipleProtoControllers.doc, /controller icons dragged/);
  assert.doesNotMatch(pi.FreezeExternalInputWhenInputNotLocked.doc, /virtual keycode/);
  // A table row's description mentions BlockedMessages; it describes BlockRawInputHook.
  assert.doesNotMatch(pi.BlockedMessages.doc, /GetRegisteredRawInputDevices/);
  assert.match(pi.BlockRawInputHook.doc, /GetRegisteredRawInputDevices/);
  // handler-api.mdx: a `Game.X = value; // doc` line outside a code block is X's doc, not the next block's.
  for (const k of ['IgnoreDeleteFilesPrompt', 'DeleteFiles', 'CopyFoldersTo', 'CMDStartArgsInside']) assert.doesNotMatch(g[k].doc, /^Game\./, k);
  assert.match(g.CMDBatchClose.doc, /exiting Nucleus/);
  // No doc is a line of code or "(undocumented)".
  for (const [o, obj] of Object.entries(api.objects)) for (const [k, m] of Object.entries(obj.members)) {
    if (m.docBy) continue;
    assert.doesNotMatch(m.doc, /^\s*(Game|Context)\.\w+(\.\w+)*\s*(=|\[)|^\(undocumented\)$/, `${o}.${k}`);
  }
});

test('"In practice" parts: real members, labelled, with what they are based on; examples are ES5 and lint-clean', () => {
  const file = JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'data', 'claude-practice.json'), 'utf8')).practice as Record<string, { text: string; basis: string; example?: string }>;
  const { lint } = require('../core/lint');
  for (const [key, p] of Object.entries(file)) {
    assert.ok(p.text.trim() && p.basis, `${key}: text and basis`);
    assert.ok(!/—/.test(p.text), `${key}: no em dashes`);
    const i = key.lastIndexOf('.');
    const m = api.objects[OBJ[key.slice(0, i)]]?.members[key.slice(i + 1)];
    assert.ok(m, `${key}: a real member`);
    assert.equal(m.practice, p.text, `${key}: in the model (npm run generate)`);
    assert.match(memberMarkdown(key.slice(0, i) === 'Player' ? 'PlayerInfo' : OBJ[key.slice(0, i)], key.slice(i + 1), m), /\*\*✨ In practice\*\*[\s\S]*_Based on /);
  }
  // Every example in the model: ES5 that parses, and no errors from the checks once it sits where it belongs.
  for (const [o, obj] of Object.entries(api.objects)) for (const [k, m] of Object.entries(obj.members)) {
    if (!m.example || !m.exampleBy) continue;
    const where = m.exampleIn ?? 'top';
    // (Proto Input examples in a handler that starts Proto Input, as they would be.)
    // (Only when the example doesn't set an injection mode itself, in code, not a comment: a second one would be another handler.)
    const pi = /ProtoInput/.test(m.example + where) && !/\bGame\.ProtoInput\.(InjectStartup|InjectRuntime_\w+)\s*=/.test(codeOf(m.example).code) ? 'Game.ProtoInput.InjectStartup = true;\n' : '';
    const handler = 'Game.GUID = "x";\nGame.GameName = "x";\nGame.ExecutableName = "x.exe";\n' + pi + (where === 'top' ? `${m.example}\n` : `${where} = function () {\n${m.example}\n};\n`);
    // Callbacks get no arguments: an example defines what it uses. Nothing flagged at all (info included).
    // (needs-option: an example shows one option; the one it depends on is in its doc.)
    const errors = lint(handler).filter((d: any) => d.rule !== 'needs-option');
    assert.deepEqual(errors.map((d: any) => d.message), [], `${o}.${k}: ${m.example}`);
  }
});

test('votes: people and AIs apart; "Verified by people" needs 10 human votes, 90% up; AI votes never count', async () => {
  const { setDocVotes, partVotes, verifiedByPeople, verifiedLabel, votesLine, snapshotFromReport } = require('../core/docvotes');
  const snap = snapshotFromReport({ takenAt: '2026-11-17T08:00:00Z', docs: [{ id: 'Game.Play', up: 9, down: 1 }], practice: [{ id: 'Game.KillMutex', up: 9, down: 0 }], aiDocs: [{ id: 'Game.Play', up: 40, down: 0 }], aiPractice: [{ id: 'Game.KillMutex', up: 50, down: 0 }] });
  setDocVotes(snap);
  try {
    const doc = partVotes('Game.Play', 'doc');
    assert.deepEqual(doc, { up: 9, down: 1, aiUp: 40, aiDown: 0 });
    assert.ok(verifiedByPeople(doc), '10 votes, 90% up');
    assert.equal(verifiedLabel(doc), 'Verified by people (10 votes)');
    const pr = partVotes('Game.KillMutex', 'practice');
    assert.ok(!verifiedByPeople(pr), '9 votes from people is not enough, however many AIs agree');
    assert.equal(votesLine(pr), 'People: 9 👍 0 👎 · AIs: 50 👍 0 👎');
    assert.ok(!verifiedByPeople({ up: 17, down: 3, aiUp: 0, aiDown: 0 }), '85% is not enough');
    // Shown where docs show: the hover's Markdown and the CLI.
    const md = memberMarkdown('Game', 'Play', api.objects.Game.members.Play);
    assert.match(md, /✓ Verified by people \(10 votes\)/);
    assert.match(md, /AIs: 40 👍 0 👎/);
  } finally {
    setDocVotes(require('../../data/doc-votes.json'));
  }
});

test('AI votes: checked, sent as aivote/<part>/<name>, never as a person\'s vote', async (t) => {
  const { sendAiVote } = require('../aivote');
  const urls: string[] = [];
  const fake = (async (url: string) => { urls.push(url); return { ok: true, status: 200 }; }) as any;
  // A known endpoint, whatever the developer's environment says; restored afterwards.
  const saved = { DO_NOT_TRACK: process.env.DO_NOT_TRACK, NCDEV_NO_FEEDBACK: process.env.NCDEV_NO_FEEDBACK, NCDEV_FEEDBACK_SITE: process.env.NCDEV_FEEDBACK_SITE };
  t.after(() => {
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  });
  delete process.env.DO_NOT_TRACK;
  delete process.env.NCDEV_NO_FEEDBACK;
  process.env.NCDEV_FEEDBACK_SITE = 'nucleus-workbench';
  assert.equal((await sendAiVote('Game.Nope', 'doc', 'up', 't', fake)).ok, false);
  assert.equal((await sendAiVote('Game.GUID', 'practice', 'up', 't', fake)).ok, false, 'no "In practice" part to vote on');
  assert.equal((await sendAiVote('Game.KillMutex', 'practice', 'sideways', 't', fake)).ok, false);
  const r = await sendAiVote('Game.KillMutex', 'practice', 'down', 't', fake);
  assert.ok(r.ok, r.message);
  assert.equal(urls.length, 1);
  assert.match(urls[0], /^https:\/\/nucleus-workbench\.goatcounter\.com\/count\?p=%2Faivote%2Fpractice%2FGame\.KillMutex%2Fdown&e=true/);
  assert.ok((await sendAiVote('Game.KillMutex', 'practice', 'down', 't', fake)).ok);
  assert.equal(urls.length, 1, 'once per part in a session');
  // Two at once for the same part: only one is sent.
  const slow = (async (url: string) => { urls.push(url); await new Promise((r) => setTimeout(r, 20)); return { ok: true, status: 200 }; }) as any;
  await Promise.all([sendAiVote('Game.KillMutex', 'doc', 'up', 't', slow), sendAiVote('Game.KillMutex', 'doc', 'down', 't', slow)]);
  assert.equal(urls.length, 2, 'one more, not two');
  // No answer (a timeout): the vote may have counted, so a different one on that part isn't sent; the same one may be.
  const lost = (async (url: string) => { urls.push(url); const e = new Error('timeout'); e.name = 'TimeoutError'; throw e; }) as any;
  assert.equal((await sendAiVote('Game.Play', 'doc', 'up', 't', lost)).ok, false);
  const n = urls.length;
  assert.equal((await sendAiVote('Game.Play', 'doc', 'down', 't', fake)).ok, false);
  assert.equal(urls.length, n, 'not sent');
  assert.ok((await sendAiVote('Game.Play', 'doc', 'up', 't', fake)).ok, 'the same vote again');
  // A refusal from the counter is an answer: another vote may follow.
  const no = (async (url: string) => { urls.push(url); return { ok: false, status: 500 }; }) as any;
  assert.equal((await sendAiVote('Game.ExecutableName', 'doc', 'up', 't', no)).ok, false);
  assert.ok((await sendAiVote('Game.ExecutableName', 'doc', 'down', 't', fake)).ok);
  process.env.NCDEV_NO_FEEDBACK = '1';
  assert.equal((await sendAiVote('Game.Play', 'doc', 'up', 't', fake)).ok, false, 'off when asked');
  delete process.env.NCDEV_NO_FEEDBACK;
});

test('AI basis as data: every entry has typed fields, and every renderer builds its text from them', () => {
  const practice = (practiceRaw as unknown as { practice: Record<string, { basis: AiBasis }> }).practice;
  const params = JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'data', 'claude-param-docs.json'), 'utf8')).params as Record<string, { basis: AiBasis }>;
  const all = [...Object.entries(docs), ...Object.entries(practice), ...Object.entries(params)] as [string, { basis: AiBasis }][];
  const KEYS = new Set(['source', 'hub', 'engines', 'note']);
  for (const [key, { basis: b }] of all) {
    assert.equal(typeof b, 'object', `${key}: basis is an object ({ source, hub, engines, note }), not a sentence`);
    for (const k of Object.keys(b)) assert.ok(KEYS.has(k), `${key}: unknown basis field ${k}`);
    assert.ok(b.source?.length || b.note, `${key}: a source or a note`);
    for (const i of b.source ?? []) {
      for (const k of Object.keys(i)) assert.ok(['project', 'file', 'what'].includes(k), `${key}: unknown source field ${k}`);
      assert.ok(i.file || i.what || i.project, `${key}: an empty source`);
      if (i.file) assert.match(i.file, /^[\w ./-]+\.(cs|cpp|h|js|md|txt|json)$/, `${key}: one file per item (${i.file})`);
    }
    if (b.hub) assert.match(b.hub.counted, /^\d{4}-\d\d-\d\d$/, `${key}: hub.counted is a date`);
    if (b.engines !== undefined) assert.ok(b.engines === true || (Array.isArray(b.engines) && b.engines.length), `${key}: engines is true or the families`);
    // The scripts' words (the .d.ts, the doc-review bot) are the tools' words.
    assert.equal(basisWords(b), aiBasisWords(b), key);
    assert.doesNotMatch(aiBasisMarkdown(b), /undefined/, key);
    // Every project is in the table of sources (data/sources.json), so it can be linked.
    for (const i of b.source ?? []) assert.ok(i.project && (sources.projects as Record<string, unknown>)[i.project], `${key}: project ${i.project} is in data/sources.json`);
  }
  const kill: AiBasis = { source: [{ project: 'Nucleus', file: 'GenericGameHandler.cs', what: 'the mutex kill before the next instance', url: 'https://x/G.cs' }, { project: 'Nucleus', file: 'ProcessUtil.cs' }], hub: { counted: '2026-11-17' }, engines: ['Source'] };
  assert.equal(aiBasisMarkdown(kill), 'Based on Nucleus [`GenericGameHandler.cs`](https://x/G.cs) (the mutex kill before the next instance) · `ProcessUtil.cs` · [verified Hub handlers, counted 2026-11-17](https://hub.splitscreen.me/) · [Hub game engines (Source)](https://github.com/Snailedlt/splitscreenme-vscode/blob/main/data/hub-engines.json)');
  assert.equal(aiBasisWords(kill), 'Nucleus GenericGameHandler.cs (the mutex kill before the next instance), ProcessUtil.cs; verified Hub handlers, counted 2026-11-17; Hub game engines (Source)');
  // One item per source, the project named where it changes, the note after the files; a project-only source links as a whole.
  assert.deepEqual(aiBasisItems({ source: [{ project: 'Nucleus', file: 'ProtoInput.cs' }, { project: 'ProtoInputHooks', file: 'A.cpp' }, { project: 'ProtoInputHooks', file: 'B.cpp' }], note: 'x' }).map((i) => aiBasisItemText(i)), ['Nucleus ProtoInput.cs', 'ProtoInputHooks A.cpp', 'B.cpp', 'x']);
  assert.equal(aiBasisItemText({ project: 'Proto Input docs', what: 'Send messages', url: 'u' }, { link: (h, u) => `<${u}>${h}` }), '<u>Proto Input docs: Send messages');
  // The model carries the fields (npm run generate) and a link for every source file found in its repository.
  const m = api.objects.Game.members.KillMutex;
  const strip = (b?: AiBasis) => JSON.parse(JSON.stringify(b, (k, v) => (k === 'url' ? undefined : v)));
  assert.deepEqual(strip(m.practiceBasis), practice['Game.KillMutex'].basis);
  assert.ok(api.objects.Context.members.GetFolder.paramsBasis?.source?.length, 'the parameter docs\' basis in the model');
  for (const [on, o] of Object.entries(api.objects)) for (const [mn, mm] of Object.entries(o.members)) for (const b of [mm.docBasis, mm.practiceBasis, mm.paramsBasis])
    for (const i of b?.source ?? []) assert.match(i.url ?? '', /^https:\/\/(github\.com\/[\w.-]+\/[\w.-]+(\/(blob|tree)\/[\w.-]+\/\S+)?|www\.splitscreen\.me\/docs\/\S+)$/, `${on}.${mn}: ${i.project} ${i.file ?? ''} has a link`);
  // The tooltip: a heading, "Based on" and one item per source, each linked where it can be; no category labels.
  const tip = aiTip(m, 'practice', 't');
  assert.match(tip, /<span class="ai-tip-h"><span aria-hidden="true">✨ <\/span>AI-written/);
  assert.match(tip, /<span class="ai-tip-k">Based on<span class="sr-only">: <\/span><\/span>/);
  assert.match(tip, /<a class="ai-src" href="https:\/\/github\.com\/SplitScreen-Me\/splitscreenme-nucleus\/blob\/master\/[^"]*GenericGameHandler\.cs" target="_blank" rel="noopener noreferrer"><code>GenericGameHandler\.cs<\/code>/);
  assert.match(tip, /<a class="ai-src" href="https:\/\/hub\.splitscreen\.me\/"[^>]*>Verified Hub handlers, counted/);
  assert.match(tip, /href="[^"]*hub-engines\.json"[^>]*>Hub game engines/);
  assert.doesNotMatch(tip, /role="tooltip"|ai-tip-path|>Source<|>Engines</);
});
