import { test } from 'node:test';
import assert from 'node:assert/strict';
import raw from '../../data/claude-docs.json';
import { api, claudeNote, memberMarkdown } from '../core/api';
import { markdownReference } from '../core/lookup';

const docs = (raw as unknown as { docs: Record<string, { doc: string; basis: string; override?: boolean }> }).docs;
const OBJ: Record<string, string> = { Hub: 'Hub', 'Hub.Handler': 'HubHandler', 'Hub.Maintainer': 'HubMaintainer', Game: 'Game', 'Game.Hook': 'GameHook', 'Game.ProtoInput': 'GameProtoInput', Context: 'Context', Player: 'PlayerInfo', ProtoInput: 'ProtoInputRuntime', 'ProtoInput.Values': 'ProtoInputValues' };

test('Claude-written docs: each says what it is based on, and the tools label it', () => {
  for (const [key, d] of Object.entries(docs)) {
    assert.ok(d.doc.trim() && d.basis.trim(), `${key}: doc and basis`);
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
  assert.match(md, /AI-written, based on Nucleus/);
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
    assert.ok(p.text.trim() && p.basis.trim(), `${key}: text and basis`);
    assert.ok(!/—/.test(p.text), `${key}: no em dashes`);
    const i = key.lastIndexOf('.');
    const m = api.objects[OBJ[key.slice(0, i)]]?.members[key.slice(i + 1)];
    assert.ok(m, `${key}: a real member`);
    assert.equal(m.practice, p.text, `${key}: in the model (npm run generate)`);
    assert.match(memberMarkdown(key.slice(0, i) === 'Player' ? 'PlayerInfo' : OBJ[key.slice(0, i)], key.slice(i + 1), m), /\*\*In practice\*\* _\(AI-written\)_[\s\S]*AI-written, based on/);
  }
  // Every example in the model: ES5 that parses, and no errors from the checks once it sits where it belongs.
  for (const [o, obj] of Object.entries(api.objects)) for (const [k, m] of Object.entries(obj.members)) {
    if (!m.example || !m.exampleBy) continue;
    const where = m.exampleIn ?? 'top';
    const handler = 'Game.GUID = "x";\nGame.GameName = "x";\nGame.ExecutableName = "x.exe";\n' + (where === 'top' ? `${m.example}\n` : `${where} = function (player) {\n${m.example}\n};\n`);
    const errors = lint(handler).filter((d: any) => d.severity === 'error');
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

test('AI votes: checked, sent as aivote/<part>/<name>, never as a person\'s vote', async () => {
  const { sendAiVote } = require('../aivote');
  const urls: string[] = [];
  const fake = (async (url: string) => { urls.push(url); return { ok: true, status: 200 }; }) as any;
  delete process.env.DO_NOT_TRACK;
  delete process.env.NCDEV_NO_FEEDBACK;
  assert.equal((await sendAiVote('Game.Nope', 'doc', 'up', 't', fake)).ok, false);
  assert.equal((await sendAiVote('Game.GUID', 'practice', 'up', 't', fake)).ok, false, 'no "In practice" part to vote on');
  assert.equal((await sendAiVote('Game.KillMutex', 'practice', 'sideways', 't', fake)).ok, false);
  const r = await sendAiVote('Game.KillMutex', 'practice', 'down', 't', fake);
  assert.ok(r.ok, r.message);
  assert.equal(urls.length, 1);
  assert.match(urls[0], /^https:\/\/nucleus-workbench\.goatcounter\.com\/count\?p=%2Faivote%2Fpractice%2FGame\.KillMutex%2Fdown&e=true/);
  assert.ok((await sendAiVote('Game.KillMutex', 'practice', 'down', 't', fake)).ok);
  assert.equal(urls.length, 1, 'once per part in a session');
  process.env.NCDEV_NO_FEEDBACK = '1';
  assert.equal((await sendAiVote('Game.Play', 'doc', 'up', 't', fake)).ok, false, 'off when asked');
  delete process.env.NCDEV_NO_FEEDBACK;
});
