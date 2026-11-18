#!/usr/bin/env node
// Which game engine each Hub handler's game runs on (data/hub-engines.json), so the docs can say where handlers for
// one engine use a name differently from all handlers ("By engine: Unreal Engine games 61% of 235 handlers").
//
// The engine comes from Wikidata when it knows the game, found by an id, never by its name: the handler's
// `Game.SteamID` (Wikidata's Steam application ID, P1733), else the IGDB game the Hub page links to (the Hub index's
// `gameUrl`, Wikidata's IGDB game ID, P5794); then the game's software engine (P408). Handlers carry no GOG, Epic or
// other store ids, so those aren't asked. Else the engine comes from the handler's own code (paths and launch arguments only one engine family uses: Unreal's
// `Binaries\Win64` and `-Win64-Shipping.exe`, Unity's `-screen-width` and `_Data\`, Source's `-novid` and `hl2.exe`,
// ...). Versions are grouped into families (Unreal Engine 1-5 → Unreal, Unity 5/2018 → Unity); Source is kept apart
// from GoldSrc and from the id Tech / Quake family (Quake engine, id Tech 2-7, IW), although they share `+exec` and
// `.cfg` files. Only the family and where it came from leave this script, never handler code.
//
//   node scripts/hub-engines.mjs --hub <dir with hub/<id>.js, hub/packages.json and hub-index.json> [--refresh] [--check]
//
// --refresh asks Wikidata again for every Steam ID and IGDB game (query.wikidata.org, batches of 150, a pause between them) and
// rewrites the cache, data/wikidata-engines.json; without it the cache is used and nothing goes over the network.
// --check prints where the code rules and Wikidata disagree (to tune the rules).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// (No import.meta.url when a test bundles this file as CommonJS: the data files are only read when it runs as a script.)
const root = import.meta.url ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') : process.cwd();
export const CACHE_FILE = path.join(root, 'data', 'wikidata-engines.json');
export const OUT_FILE = path.join(root, 'data', 'hub-engines.json');

/** Engine families with at least this many Hub handlers get their own "By engine" counts in the docs; smaller ones
 *  say too little (a handful of handlers by one author). */
export const ENGINE_MIN_HANDLERS = 30;

/** The names the docs use for each family. */
export const ENGINE_NAMES = {
  Unreal: 'Unreal Engine',
  Unity: 'Unity',
  Source: 'Source',
  GoldSrc: 'GoldSrc',
  'id Tech': 'id Tech / Quake family',
};

// Middleware Wikidata lists as a game's "software engine" next to (or instead of) the engine itself: not an engine.
const MIDDLEWARE = /^(Havok|PhysX|Umbra( \d+)?|SpeedTree|Bink|Wwise|FMOD|Scaleform|Euphoria|Simplygon|Enlighten|Bullet)$/i;

/** A Wikidata engine label → its family ('' for middleware). Unknown engines keep their name without a version. */
export function engineFamily(label) {
  const l = label.trim();
  if (MIDDLEWARE.test(l)) return '';
  if (/^Unreal Engine\b/i.test(l)) return 'Unreal';
  if (/^Unity\b/i.test(l)) return 'Unity';
  if (/^Source( 2)?$/i.test(l)) return 'Source';
  if (/^GoldSrc$/i.test(l)) return 'GoldSrc';
  if (/^(id Tech\b|Quake engine$|IW( engine)?\b)/i.test(l)) return 'id Tech';
  if (/^(Microsoft XNA|MonoGame)$/i.test(l)) return 'XNA / MonoGame';
  return l.replace(/\s+\d+(\.\d+)*$/, '');
}

// Signs in a handler's code that only one engine family's games show. Each rule is [regex, weight]; weight 2 is
// enough by itself, 1 needs a second sign. Weight 3 is a file layout only that engine's packaged games have (Unreal's
// `<Project>\Binaries\Win64\<Project>-Win64-Shipping.exe`, Unity's `UnityPlayer.dll` and `<Game>_Data\Managed`):
// it also wins over Wikidata, which has a few games' engines wrong (PixARK, DESOLATE: Unity there, Unreal 4 games).
// Checked against Wikidata's answers with --check.
const RULES = {
  Unreal: [
    [/-Win(64|32)-Shipping\.exe/i, 3], // UE4/UE5's packaged executable
    [/Binaries[\\/]+Win(64|32)\b/i, 3], // UE3-UE5's binaries folder
    [/WindowsNoEditor/i, 2], // UE4's saved config folder
    [/Saved[\\/]+Config/i, 1],
    [/\b(UE[345]|Unreal ?Engine|UDK)\b/i, 1],
    [/-ResX=/i, 1],
    [/\bGameUserSettings\.ini\b/i, 1],
  ],
  Unity: [
    [/-screen-(width|height|fullscreen)\b/i, 2],
    [/\bUnityPlayer\.dll\b/i, 3],
    [/-popupwindow\b/i, 2],
    [/_Data[\\/]+(Managed|Plugins|StreamingAssets)\b/i, 3],
    [/\bUnity\b/, 1],
    [/-force-d3d1[12]\b/i, 1],
    [/-single-instance\b/i, 1],
  ],
  Source: [
    [/\bhl2\.exe\b/i, 2],
    [/-novid\b/i, 2],
    [/\bgameinfo\.txt\b/i, 2],
    [/-insecure\b/i, 1],
    [/\bSource (engine|SDK)\b/i, 1],
    [/\bvalve\.rc\b/i, 1],
  ],
  GoldSrc: [
    [/\bhl\.exe\b/i, 2],
    [/\bGoldSrc\b/i, 2],
  ],
  'id Tech': [
    [/\b(q3config|q2config|config_mp)\.cfg\b/i, 2],
    [/\+set\s+(fs_game|fs_basepath|fs_homepath|r_mode|net_port)\b/i, 2],
    [/\b(ioquake3|quake3|iw\d?mp|CoDMP|CoD\d?MP)\b/i, 1],
    [/\bid ?Tech\b/i, 1],
  ],
  GameMaker: [
    [/\bdata\.win\b/i, 2],
    [/\bGameMaker\b/i, 1],
  ],
  'RPG Maker': [
    [/\bGame\.rgss\w*\b/i, 2],
    [/\bRPG ?Maker\b/i, 1],
  ],
};

/** The family a handler's code points to, or '' (no sign, or signs of two families). `{ definite: true }` asks for
 *  the family only when a weight-3 file layout shows it. */
export function classifyCode(src, { definite = false } = {}) {
  src = withoutComments(src);
  const scores = Object.entries(RULES)
    .map(([family, rules]) => [family, rules.reduce((s, [re, w]) => s + (re.test(src) ? w : 0), 0), rules.some(([re, w]) => w === 3 && re.test(src))])
    .filter(([, s, d]) => (definite ? d : s >= 2))
    .sort((a, b) => b[1] - a[1]);
  // Signs of two families (a Unity flag and a Source executable): no family, whichever scores higher.
  if (scores.length !== 1) return '';
  return scores[0][0];
}

/** The family Wikidata gives a Steam app ('' when it has none or names two families). */
export function classifyWikidata(engines) {
  const families = [...new Set((engines ?? []).filter((e) => e.engine !== false).map((e) => engineFamily(e.label)).filter(Boolean))];
  return families.length === 1 ? families[0] : '';
}

/** The code without its comments (a commented-out line or a note about another engine is no evidence). Strings and
 *  regular expressions stay whole: a "//" or "/*" inside quotes (a URL, a launch argument) or in `/[/*]/` is text,
 *  not a comment. A block comment keeps its line breaks, so what follows it stays on its own line. */
export function withoutComments(src) {
  const t = String(src);
  let out = '';
  let prev = ''; // the last character that isn't space: a "/" after one of these starts a regular expression
  for (let i = 0; i < t.length; i++) {
    const c = t[i], n = t[i + 1];
    if (c === '/' && n === '/') {
      const e = t.indexOf('\n', i);
      i = (e < 0 ? t.length : e) - 1;
      continue;
    }
    if (c === '/' && n === '*') {
      const e = t.indexOf('*/', i + 2);
      const end = e < 0 ? t.length : e + 2;
      out += ' ' + t.slice(i, end).replace(/[^\n]/g, '');
      i = end - 1;
      continue;
    }
    if (c === '"' || c === "'" || (c === '/' && (!prev || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev)))) {
      let k = i + 1, cls = false;
      for (; k < t.length && t[k] !== '\n'; k++) {
        const x = t[k];
        if (x === '\\') { k++; continue; }
        if (c === '/' && x === '[') cls = true;
        else if (c === '/' && x === ']') cls = false;
        else if (x === c && !cls) break;
      }
      if (t[k] === '\n') k--;
      out += t.slice(i, k + 1);
      i = k;
      prev = c;
      continue;
    }
    out += c;
    if (!/\s/.test(c)) prev = c;
  }
  return out;
}
export const steamIdOf = (src) => /^\s*Game\.SteamID\s*=\s*["']?(\d+)/im.exec(withoutComments(src))?.[1] ?? '';
/** The IGDB slug of a Hub index entry's `gameUrl` ("https://www.igdb.com/games/left-4-dead-2" → "left-4-dead-2"). */
export const igdbSlugOf = (url) => /^https:\/\/www\.igdb\.com\/games\/([a-z0-9-]+)\/?$/.exec(url ?? '')?.[1] ?? '';

/** One handler: its family and where it came from (Wikidata by Steam ID, then by IGDB game; else the code). */
export function classify(src, cache, igdbSlug = '') {
  const id = steamIdOf(src);
  // A Steam ID whose game's IGDB id isn't the Hub page's game (or the start of it: "far-cry-2" for an edition,
  // "far-cry-2-fortunes-edition") was probably copied from another game's handler (the "GTA IV" handler has
  // Insurgency's): not used.
  const known = cache?.steamIgdb?.[id];
  const copied = igdbSlug && known?.length && !known.some((k) => igdbSlug === k || igdbSlug.startsWith(`${k}-`));
  const bySteam = id && !copied ? classifyWikidata(cache?.steam?.[id]) : '';
  const byIgdb = !bySteam && igdbSlug ? classifyWikidata(cache?.igdb?.[igdbSlug]) : '';
  const wd = bySteam || byIgdb;
  const definite = classifyCode(src, { definite: true });
  if (definite && definite !== wd) return { engine: definite, source: 'code' };
  if (wd) return { engine: wd, source: 'wikidata', via: bySteam ? 'steam' : 'igdb' };
  const code = classifyCode(src);
  return code ? { engine: code, source: 'code' } : { engine: '', source: '' };
}

/** An engine family's handlers use a name notably more (or less) than all handlers: at least twice (or at most half)
 *  the share of all handlers, and at least this many percentage points apart. */
export const ENGINE_MIN_FACTOR = 2;
export const ENGINE_MIN_POINTS = 15;

/** The engine families whose handlers use a name notably more or less than all handlers do. `use`: handlers of each
 *  family that use it; `n`: all handlers that use it; `totals`: handlers per family; `handlers`: all handlers.
 *  Families below ENGINE_MIN_HANDLERS are left out. */
export function notableEngines(use, n, totals, handlers) {
  const all = n / handlers;
  return Object.entries(totals)
    .filter(([, total]) => total >= ENGINE_MIN_HANDLERS)
    .map(([family, total]) => ({ family, used: use?.[family] ?? 0, total, share: (use?.[family] ?? 0) / total }))
    .filter(({ share }) => Math.abs(share - all) * 100 >= ENGINE_MIN_POINTS && (share >= ENGINE_MIN_FACTOR * all || all >= ENGINE_MIN_FACTOR * share))
    .sort((a, b) => Math.abs(b.share - all) - Math.abs(a.share - all) || a.family.localeCompare(b.family));
}

const pct = (x) => `${Math.round(x * 100)}%`;
/** The docs' line for a name ('' when no engine differs notably):
 *  "By engine: Unreal Engine games 61% of 223 handlers (all Hub handlers 18%). Counted from Hub handlers; engines
 *  from Wikidata and the handlers' code." */
export function engineLine(use, n, totals, handlers) {
  const notable = notableEngines(use, n, totals, handlers);
  if (!notable.length) return '';
  const parts = notable.map(({ family, total, share }) => `${ENGINE_NAMES[family] ?? family} games ${pct(share)} of ${total} handlers`);
  return `By engine: ${parts.join(', ')} (all Hub handlers ${pct(n / handlers)}). Counted from Hub handlers; engines from Wikidata and the handlers' code.`;
}

const UA = 'ncdev-hub-engines/1.0 (Nucleus Co-op handler tools; https://github.com/Snailedlt/splitscreenme-vscode)';
/** Per id (a Steam app id for P1733, an IGDB slug for P5794), the engines Wikidata lists for the game, and in
 *  `igdbOf` the game's IGDB ids (to catch a Steam ID copied from another game's handler). */
async function queryWikidata(prop, ids, igdbOf = null) {
  const apps = {};
  for (let i = 0; i < ids.length; i += 150) {
    const batch = ids.slice(i, i + 150);
    const query = `SELECT ?app ?engine ?engineLabel ?isEngine ?igdb WHERE { VALUES ?app { ${batch.map((x) => `"${x}"`).join(' ')} } ?game wdt:${prop} ?app; wdt:P408 ?engine. ${igdbOf ? 'OPTIONAL { ?game wdt:P5794 ?igdb. } ' : ''}BIND(EXISTS { ?engine wdt:P31/wdt:P279* wd:Q193564 } AS ?isEngine) SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". } }`;
    const res = await fetch('https://query.wikidata.org/sparql', { method: 'POST', headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ query }) });
    if (!res.ok) throw new Error(`Wikidata: HTTP ${res.status}`);
    const data = await res.json();
    for (const b of data.results.bindings) {
      const list = (apps[b.app.value] ??= []);
      const qid = b.engine.value.replace(/^.*\//, '');
      if (!list.some((e) => e.id === qid)) list.push({ id: qid, label: b.engineLabel?.value ?? qid, engine: b.isEngine?.value === 'true' });
      if (igdbOf && b.igdb && !(igdbOf[b.app.value] ??= []).includes(b.igdb.value)) igdbOf[b.app.value].push(b.igdb.value);
    }
    if (i + 150 < ids.length) await new Promise((r) => setTimeout(r, 2000));
  }
  return apps;
}

async function main() {
  const arg = (n) => process.argv.includes(n);
  const at = process.argv.indexOf('--hub');
  const hubDir = at > 0 ? path.resolve(process.argv[at + 1], 'hub') : null;
  if (!hubDir || !fs.existsSync(path.join(hubDir, 'packages.json'))) {
    console.error('usage: node scripts/hub-engines.mjs --hub <dir with hub/packages.json> [--refresh] [--check]');
    process.exit(2);
  }
  const packages = JSON.parse(fs.readFileSync(path.join(hubDir, 'packages.json'), 'utf8'));
  const indexFile = path.join(hubDir, '..', 'hub-index.json');
  const fromIndex = Object.fromEntries((fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')).handlers : []).map((h) => [h._id, igdbSlugOf(h.gameUrl)]).filter(([, g]) => g));
  const sources = Object.keys(packages)
    .sort()
    .map((id) => [id, path.join(hubDir, `${id}.js`)])
    .filter(([, f]) => fs.existsSync(f))
    .map(([id, f]) => [id, fs.readFileSync(f, 'utf8')]);
  let cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : { steam: {}, igdb: {} };
  // Each handler's IGDB game: the Hub index's, else the one the cache recorded (an index without gameUrl).
  const igdb = { ...cache.hubIgdb, ...fromIndex };
  if (arg('--refresh')) {
    const steamIds = [...new Set(sources.map(([, s]) => steamIdOf(s)).filter(Boolean))].sort((a, b) => a - b);
    const slugs = [...new Set(sources.map(([id]) => igdb[id]).filter(Boolean))].sort();
    const steamIgdb = {};
    const steam = await queryWikidata('P1733', steamIds, steamIgdb);
    const byIgdb = await queryWikidata('P5794', slugs);
    const sorted = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true })));
    cache = {
      $comment: 'Generated by scripts/hub-engines.mjs --refresh: the software engines (P408) Wikidata lists for the games of Hub handlers, per Steam application ID (steam, P1733) and per IGDB game (igdb, P5794, from the Hub page\'s IGDB link); steamIgdb: the IGDB ids of the games found by Steam ID; hubIgdb: each Hub handler\'s IGDB game when asked; engine: whether Wikidata says it is a game engine. Only ids Wikidata has an engine for.',
      takenAt: new Date().toISOString().slice(0, 10),
      asked: { steam: steamIds.length, igdb: slugs.length },
      steam: sorted(steam),
      igdb: sorted(byIgdb),
      steamIgdb: sorted(steamIgdb),
      hubIgdb: sorted(igdb),
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 0).replace(/,"(?=[\w-]+":\[\{)/g, ',\n"') + '\n');
    console.log(`hub-engines: Wikidata has an engine for ${Object.keys(steam).length} of ${steamIds.length} Steam IDs and ${Object.keys(byIgdb).length} of ${slugs.length} IGDB games.`);
  }
  const handlers = {};
  const counts = {};
  const bySource = { wikidata: 0, code: 0, unknown: 0 };
  const via = { steam: 0, igdb: 0 };
  const disagree = [];
  for (const [id, src] of sources) {
    const c = classify(src, cache, igdb[id]);
    if (c.via) via[c.via]++;
    if (arg('--check')) {
      const code = classifyCode(src);
      const wd = c.source === 'wikidata' ? c.engine : classifyWikidata(cache.steam?.[steamIdOf(src)]) || classifyWikidata(cache.igdb?.[igdb[id]]);
      if (code && wd && code !== wd) disagree.push(`${id} (Steam ${steamIdOf(src) || '-'}, IGDB ${igdb[id] || '-'}): Wikidata ${wd}, code ${code}${c.engine === code ? ' (code wins: a definite file layout)' : ''}`);
    }
    bySource[c.source || 'unknown']++;
    if (!c.engine) continue;
    handlers[id] = [c.engine, c.source];
    counts[c.engine] = (counts[c.engine] ?? 0) + 1;
  }
  const out = {
    $comment: 'Generated by scripts/hub-engines.mjs from every Hub handler (the testbench data branch hub/ mirror and hub-index.json): per handler id, [engine family, "wikidata" | "code"]. Wikidata by the game\'s Steam ID, else its IGDB game (data/wikidata-engines.json), wins; else the handler\'s own code. Handlers without an answer are left out.',
    takenAt: new Date().toISOString().slice(0, 10),
    total: sources.length,
    bySource,
    wikidataBy: via,
    counts: Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    handlers,
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 0).replace(/,"(?=\w{17}":\[)/g, ',\n"') + '\n');
  console.log(`hub-engines: ${sources.length} handlers; ${bySource.wikidata} from Wikidata (${via.steam} by Steam ID, ${via.igdb} more by IGDB game), ${bySource.code} from their code, ${bySource.unknown} unknown. ${Object.entries(out.counts).slice(0, 6).map(([k, v]) => `${k} ${v}`).join(', ')}.`);
  if (disagree.length) console.log(`Code rules disagree with Wikidata on ${disagree.length}:\n  ${disagree.join('\n  ')}`);
}

if (process.argv[1] && import.meta.url && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
