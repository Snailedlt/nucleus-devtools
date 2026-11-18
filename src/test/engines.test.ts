// Engines of the Hub handlers' games (scripts/hub-engines.mjs → data/hub-engines.json) and the docs' "By engine" line
// (counted by scripts/hub-examples.mjs, put in the model by scripts/generate-api.mjs, shown with "In practice").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as eng from '../../scripts/hub-engines.mjs';
import { api, memberMarkdown } from '../core/api';
import { allEntries, formatEntry, markdownReference } from '../core/lookup';

const lookup = (p: string) => allEntries(true).find((e) => e.path === p);

const root = path.resolve(__dirname, '..');
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));

test('engine families: versions grouped, Source apart from GoldSrc and the id Tech / Quake family, middleware ignored', () => {
  for (const l of ['Unreal Engine 1', 'Unreal Engine 2.5', 'Unreal Engine 4', 'Unreal Engine 5']) assert.equal(eng.engineFamily(l), 'Unreal');
  for (const l of ['Unity', 'Unity 5', 'Unity 2018']) assert.equal(eng.engineFamily(l), 'Unity');
  assert.equal(eng.engineFamily('Source'), 'Source');
  assert.equal(eng.engineFamily('Source 2'), 'Source');
  assert.equal(eng.engineFamily('GoldSrc'), 'GoldSrc');
  for (const l of ['id Tech 3', 'Quake engine', 'IW']) assert.equal(eng.engineFamily(l), 'id Tech');
  assert.equal(eng.engineFamily('Serious Engine 3.5'), 'Serious Engine');
  assert.equal(eng.engineFamily('Havok'), '');
  assert.equal(eng.classifyWikidata([{ id: 'Q1', label: 'Havok', engine: true }, { id: 'Q2', label: 'Unreal Engine 3', engine: true }]), 'Unreal');
  assert.equal(eng.classifyWikidata([{ id: 'Q1', label: 'Unity', engine: true }, { id: 'Q2', label: 'Unreal Engine 4', engine: true }]), '', 'two families: no answer');
  assert.equal(eng.classifyWikidata([{ id: 'Q3', label: 'Sonic Forces', engine: false }]), '', 'not a game engine in Wikidata');
});

test('engines from the handlers\' code: real handlers\' lines, and Source not confused with the Quake family', () => {
  // Left 4 Dead 2 (Hub wFsXDjoAkHpL4XZm8).
  assert.equal(eng.classifyCode('Game.ExecutableName = "left4dead2.exe";\nContext.StartArguments = " -windowed -noborder -nointro -novid -steam +net_graph 0";'), 'Source');
  // PixARK (knYq25yuq4rLrJcq4): a definite Unreal layout.
  const pixark = 'Game.ExecutableName = "PixARK.exe";\nGame.BinariesFolder = "ShooterGame\\\\Binaries\\\\Win64";';
  assert.equal(eng.classifyCode(pixark), 'Unreal');
  assert.equal(eng.classifyCode(pixark, { definite: true }), 'Unreal');
  assert.equal(eng.classifyCode('Game.ExecutableName = "Ice-Win64-Shipping.exe";'), 'Unreal');
  // A Unity game's launch arguments.
  assert.equal(eng.classifyCode('Context.StartArguments = " -screen-fullscreen 0 -screen-width " + Context.Width;'), 'Unity');
  // +exec and .cfg files are shared by Source, GoldSrc and the Quake family: not enough by themselves.
  assert.equal(eng.classifyCode('Context.StartArguments = "+exec autoexec.cfg";'), '');
  assert.equal(eng.classifyCode('Context.StartArguments = "+set fs_game baseq3 +exec autoexec.cfg";'), 'id Tech');
  assert.equal(eng.classifyCode('Game.ExecutableName = "hl.exe";'), 'GoldSrc');
  assert.equal(eng.classifyCode('Game.ExecutableName = "game.exe";'), '');
  // A "/*" inside a regular expression starts no comment; a block comment keeps its line breaks.
  assert.equal(eng.withoutComments('var d = /[/*]/;\nx = "UnityPlayer.dll";'), 'var d = /[/*]/;\nx = "UnityPlayer.dll";');
  assert.equal(eng.steamIdOf('Game.GameName = "X"; /* note\n*/ Game.SteamID = "123";'), '123');
  assert.match(eng.withoutComments('a; /* x\ny */ b'), /^a;  ?\n b$/);
  // Division is no regular expression.
  assert.equal(eng.withoutComments('x = a / b; // c'), 'x = a / b; ');
});

test('classify: Wikidata by Steam ID, then by IGDB game, a copied Steam ID ignored, a definite code layout wins', () => {
  const cache = {
    steam: { 550: [{ id: 'Q643572', label: 'Source', engine: true }], 593600: [{ id: 'Q63966', label: 'Unity', engine: true }], 222880: [{ id: 'Q643572', label: 'Source', engine: true }] },
    igdb: { 'some-game': [{ id: 'Q63966', label: 'Unity', engine: true }] },
    steamIgdb: { 550: ['left-4-dead-2'], 222880: ['insurgency'] },
  };
  assert.deepEqual(eng.classify('Game.SteamID = "550";', cache, 'left-4-dead-2'), { engine: 'Source', source: 'wikidata', via: 'steam' });
  assert.deepEqual(eng.classify('Game.SteamID = "550";', cache, 'left-4-dead-2-gold-edition').source, 'wikidata', 'an edition of the same game');
  assert.deepEqual(eng.classify('Game.ExecutableName = "x.exe";', cache, 'some-game'), { engine: 'Unity', source: 'wikidata', via: 'igdb' });
  assert.deepEqual(eng.classify('Game.SteamID = "222880";', cache, 'grand-theft-auto-iv'), { engine: '', source: '' }, 'Insurgency\'s Steam ID in another game\'s handler');
  assert.deepEqual(eng.classify('Game.SteamID = "593600";\nGame.BinariesFolder = "ShooterGame\\\\Binaries\\\\Win64";', cache), { engine: 'Unreal', source: 'code' });
  assert.equal(eng.igdbSlugOf('https://www.igdb.com/games/left-4-dead-2'), 'left-4-dead-2');
});

test('data/hub-engines.json: known handlers, its counts add up, and the cache it came from is committed', () => {
  const he = read('data/hub-engines.json');
  assert.deepEqual(he.handlers.wFsXDjoAkHpL4XZm8, ['Source', 'wikidata'], 'Left 4 Dead 2');
  assert.deepEqual(he.handlers.knYq25yuq4rLrJcq4, ['Unreal', 'code'], 'PixARK (Wikidata says Unity)');
  assert.equal(he.handlers.X8agrgjLQphLAWnEd?.[0], 'Unity', 'Bomb Rush Cyberfunk');
  const counts: Record<string, number> = {};
  for (const [e] of Object.values(he.handlers) as [string, string][]) counts[e] = (counts[e] ?? 0) + 1;
  assert.deepEqual(counts, he.counts);
  assert.equal(he.bySource.wikidata + he.bySource.code + he.bySource.unknown, he.total);
  assert.equal(he.wikidataBy.steam + he.wikidataBy.igdb, he.bySource.wikidata);
  const cache = read('data/wikidata-engines.json');
  assert.ok(Object.keys(cache.steam).length > 100 && Object.keys(cache.igdb).length > 100);
});

test('"By engine": the threshold, the rule and the line', () => {
  assert.equal(eng.ENGINE_MIN_HANDLERS, 30);
  const totals = { Unreal: 200, Unity: 200, Tiny: 10 };
  // 18% of all handlers; Unreal 61%: twice the share and 43 points apart.
  assert.equal(eng.engineLine({ Unreal: 122, Unity: 20, Tiny: 10 }, 162, totals, 900), 'By engine: more common in Unreal Engine games.');
  // Too few handlers for the family (Tiny, 100%): left out.
  assert.deepEqual(eng.notableEngines({ Tiny: 10, Unreal: 36, Unity: 36 }, 162, totals, 900), []);
  // Twice the share but only 10 points apart: not notable.
  assert.equal(eng.engineLine({ Unreal: 40 }, 90, totals, 900), '');
  // The reverse: much less than all handlers.
  assert.match(eng.engineLine({ Unreal: 0, Unity: 100 }, 400, totals, 900), /^By engine: rarer in Unreal Engine games\.$/);
});

test('"By engine" in the model is current, and shows wherever "In practice" does', () => {
  const hub = read('data/hub-examples.json');
  assert.deepEqual({ ...api.hubHandlers?.engines }, hub.engines, 'npm run generate');
  for (const f of Object.values(hub.engines) as number[]) assert.ok(f >= eng.ENGINE_MIN_HANDLERS);
  let lines = 0;
  for (const obj of Object.values(api.objects)) for (const m of Object.values(obj.members)) if (m.byEngine) lines++;
  const expected: Record<string, string> = {};
  for (const [k, e] of Object.entries(hub.members) as [string, { n: number; engines?: Record<string, number> }][]) {
    const l = eng.engineLine(e.engines, e.n, hub.engines, hub.handlers);
    if (l) expected[k] = l;
  }
  const kmLine = expected['Game.KillMutex'];
  assert.ok(kmLine, 'Game.KillMutex: Source handlers');
  let shown = 0;
  for (const [k, l] of Object.entries(expected)) {
    const e = lookup(k);
    if (!e || e.member.internal) continue;
    assert.equal(e.member.byEngine, l, `${k}: npm run generate`);
    shown++;
  }
  assert.equal(lines, shown, 'no stale "By engine" lines');
  const km = lookup('Game.KillMutex')!;
  assert.equal(km.member.byEngine, kmLine);
  assert.ok(memberMarkdown(km.owner, km.name, km.member).includes(`_${kmLine}_`), 'hover, completion, Docs');
  assert.ok(formatEntry(km).includes(kmLine), 'ncdev api, MCP');
  assert.ok(markdownReference().includes(kmLine), 'api.md');
  assert.ok(fs.readFileSync(path.join(root, 'types/nucleus.d.ts'), 'utf8').includes(kmLine), '.d.ts');
  // A member with a line but no AI-written "In practice": the line alone, under the heading.
  const alone = Object.keys(expected).map((k) => lookup(k)).find((e) => e && e.member.byEngine && !e.member.practice)!;
  assert.ok(alone, 'some member with only the line');
  assert.match(memberMarkdown(alone.owner, alone.name, alone.member), /\*\*In practice\*\*\n\n_By engine: /);
});
