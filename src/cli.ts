// `ncdev` (Nucleus Co-op dev tools): command-line tools for Nucleus Co-op handlers, for people, CI and AI agents.
// Also a standalone .exe (#18, scripts/sea.mjs). `nucleus` is its old name and still works; `nucleus-lint <paths>`
// is kept as a shortcut for `ncdev lint <paths>`.
import { sendAiVote } from './aivote';
import { installHandler } from './install';
import { AFTER_START, debugLogOn, debugLogPath, nucleusStatus, setDebugLog, stopNucleus, testInNucleus } from './nucleusrun';
import { lintPluginsFor } from './plugins';
import { checkPackage } from './core/pkgcheck';
import { packageFilesFor } from './pkgfiles';
import { publishedFor } from './published';
import fs from 'node:fs';
import path from 'node:path';
import { lint, lineOf, lineStart, RULES, RuleId, Severity, LintOptions, looksLikeHandler } from './core/lint';
import { fixAll, matchLeftAfterFix } from './core/fix';
import { formatHandler } from './core/format';
import { lookup, search, formatEntry, formatObject, markdownReference } from './core/lookup';
import { handlerPageUrl, HubHandler } from './core/hub';
import { hubHandlers, hubPackage } from './hubcache';
import { renderHandler, toHandlerFileName, validateHandlerInfo, FEATURES, Feature } from './core/templates';
import { buildPackage, extractEntries, findSkillDir, installAgentKit } from './core/pkg';
import { pluginsFor, simulateIsolated } from './sandbox';
import { parseBreakpoint, runDebug } from './debugrun';
import { ruleDocText } from './core/airules';
import { ruleUrl } from './core/ruledocs';
import { explainLine } from './core/features';
import { serveDap } from './dap';
import { setupNotepadPP } from './setup-npp';
import { runElevated, runMenu, startedFromExplorer } from './winhelp';
import { builtIn, installPath, installRelease, installSelf, isStandalone, latestRelease, newer, TOOL, VERSION } from './standalone';
import os from 'node:os';
import { EVERY_KEYBOARD } from './core/sim';
import { formatSimulation } from './simformat';
import { serve } from './mcp';
import { helpText } from './clihelp';
import { WORKBENCH_URL } from './core/sharelink';
import { readGameBinaries } from './gamefolder-node';
import { analyse, exePath, findExes, importsReport } from './core/importhooks';
import type { PeFile } from './core/pe';
import { serve as serveLsp } from './lsp';
import { buildReport, DISCORD_THREAD, findDuplicates, handlerHelp, handlerOrigin, simSummary, type ReportInput } from './core/report';
import { spawn } from 'node:child_process';

const HELP = helpText(VERSION);

class Usage extends Error {}

interface Args {
  positional: string[];
  flags: Map<string, string[]>;
}
const BOOL_FLAGS = new Set(['--no-controllers', '--no-kbm', '--list', '--open', '--no-code', '--text', '--elevated', '--version', '-v', '--from-notepad++', '--step', '--json', '--stdio', '--all', '--quiet', '--verbose', '--force', '--search', '--markdown', '--fix', '--fix-dry-run', '--hub', '--write', '--check', '--remove', '--list-features', '--popular', '--restart', '--status', '-h', '--help']);
function parseArgs(argv: string[]): Args {
  const a: Args = { positional: [], flags: new Map() };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('-')) {
      const [k, inline] = t.split(/=(.*)/s, 2);
      const v = BOOL_FLAGS.has(k) ? 'true' : inline ?? argv[++i];
      if (v === undefined) throw new Usage(`Missing value for ${k}`);
      a.flags.set(k, [...(a.flags.get(k) ?? []), v]);
    } else a.positional.push(t);
  }
  return a;
}
const flag = (a: Args, k: string) => a.flags.get(k)?.at(-1);
const has = (a: Args, k: string) => a.flags.has(k);
const print = (json: boolean, value: unknown, text: () => string) => console.log(json ? JSON.stringify(value, null, 2) : text());

async function main(argv: string[]): Promise<number> {
  // Double-clicked in Explorer: a short menu that waits for a key (its window closes when ncdev exits). From a
  // terminal, no arguments still print the help and exit; only the no-arguments case takes the moment to tell.
  if (!argv.length && isStandalone() && startedFromExplorer()) {
    const rl = (await import('node:readline')).createInterface({ input: process.stdin, output: process.stdout });
    try {
      return await runMenu(
        { ask: (q) => new Promise((res) => rl.question(q, res)), say: (t) => console.log(t) },
        { setup: () => cmdSetup(parseArgs(['notepad++']), false), update: () => cmdUpdate(parseArgs([]), false), help: () => console.log(HELP) },
        VERSION,
      );
    } finally {
      rl.close();
    }
  }
  const commands = ['report', 'lint', 'format', 'simulate', 'api', 'docs', 'hub', 'new', 'install', 'test', 'package', 'imports', 'init-agent', 'rules', 'mcp', 'lsp', 'dap', 'setup', 'workbench', 'debug', 'explain', 'update', 'version'];
  let cmd = argv[0] && commands.includes(argv[0]) ? argv.shift()! : undefined;
  if (!cmd && (argv[0] === '--version' || argv[0] === '-v')) cmd = 'version';
  if (path.basename(process.argv[1] ?? '').startsWith('nucleus-lint')) cmd ??= 'lint';
  if (argv.includes('--list-rules')) cmd = 'rules';
  // `report --check <rule>`: here --check takes a value (elsewhere it's a switch).
  if (cmd === 'report') {
    const i = argv.indexOf('--check');
    if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('-')) argv.splice(i, 2, '--check-rule', argv[i + 1]);
    else if (i >= 0) throw new Usage('report --check: give the check (its rule id, e.g. --check unknown-member)');
  }
  const args = parseArgs(argv);
  if (!cmd) {
    if (has(args, '-h') || has(args, '--help') || !args.positional.length) {
      console.log(HELP);
      return args.positional.length || has(args, '-h') || has(args, '--help') ? 0 : 2;
    }
    cmd = 'lint';
  } else if (has(args, '-h') || has(args, '--help')) {
    console.log(commandHelp(cmd));
    return 0;
  }
  const json = has(args, '--json');
  switch (cmd) {
    case 'lint':
      return cmdLint(args, json);
    case 'rules':
      if (args.positional[0]) {
        const t = ruleDocText(args.positional[0], 'ncdev');
        if (!t) throw new Usage(`rules: no check called "${args.positional[0]}" (ncdev rules lists them)`);
        print(json, { id: args.positional[0], ...(RULES as any)[args.positional[0]], docs: ruleUrl(args.positional[0], 'ncdev') }, () => t);
        return 0;
      }
      print(json, RULES, () => Object.entries(RULES).map(([id, r]) => `${id.padEnd(22)} ${r.severity.padEnd(8)} ${r.description}`).join('\n'));
      return 0;
    case 'format':
      return cmdFormat(args, json);
    case 'simulate':
      return cmdSimulate(args, json);
    case 'debug':
      return cmdDebug(args, json);
    case 'explain':
      return cmdExplain(args, json);
    case 'api':
      return cmdApi(args, json);
    case 'docs':
      return cmdDocs(args, json);
    case 'hub':
      return cmdHub(args, json);
    case 'new':
      return cmdNew(args, json);
    case 'install':
      return cmdInstall(args, json);
    case 'test':
      return cmdTest(args, json);
    case 'package':
      return cmdPackage(args, json);
    case 'imports':
      return cmdImports(args, json);
    case 'init-agent':
      return cmdInitAgent(args, json);
    case 'mcp':
      return serve();
    case 'lsp':
      // Exit when the client says so, even with a Hub lookup or a lint timer still pending.
      return serveLsp().then((code) => process.exit(code));
    case 'setup':
      return cmdSetup(args, json);
    case 'version':
      return cmdVersion(json);
    case 'update':
      return cmdUpdate(args, json);
    case 'dap':
      // A Debug Adapter on stdio, for editors with DAP support (nvim-dap, Helix, Zed, JetBrains, Emacs dape).
      return serveDap().then((code) => process.exit(code));
    case 'workbench':
      return cmdWorkbench(args, json);
    case 'report':
      return cmdReport(args, json);
  }
  return 2;
}

// ---------------------------------------------------------------------------

async function cmdLint(args: Args, json: boolean): Promise<number> {
  const options: LintOptions = { rules: {} };
  for (const r of args.flags.get('--rule') ?? []) {
    const [id, sev] = r.split('=');
    if (!(id in RULES) || !['error', 'warning', 'info', 'hint', 'off'].includes(sev)) throw new Usage(`Invalid --rule ${r}`);
    options.rules![id as RuleId] = sev as Severity | 'off';
  }
  const files = args.positional;
  if (!files.length) throw new Usage('lint: give at least one file or directory');
  const all = has(args, '--all');
  const quiet = has(args, '--quiet');
  const verbose = has(args, '--verbose');
  const fixMode = has(args, '--fix-dry-run') ? 'dry' : has(args, '--fix') ? 'write' : null;
  let fixedCount = 0;

  const targets: string[] = [];
  const collect = (p: string, explicit: boolean) => {
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      for (const e of fs.readdirSync(p)) if (e !== 'node_modules' && !e.startsWith('.')) collect(path.join(p, e), false);
    } else if (explicit || p.endsWith('.js')) targets.push(p);
  };
  for (const f of files) collect(f, true);

  let errors = 0;
  let warnings = 0;
  let linted = 0;
  const out: unknown[] = [];
  for (const file of targets) {
    const original = fs.readFileSync(file, 'utf8');
    let text = original.replace(/^﻿/, '');
    if (!all && !files.includes(file) && !looksLikeHandler(text)) continue;
    linted++;
    let fixed: { rule: string; title: string; line: number }[] = [];
    let fixedText: string | undefined;
    const fileOptions = { ...options, plugins: lintPluginsFor(file), published: has(args, '--hub') ? await publishedFor(text) : undefined };
    if (fixMode) {
      const r = fixAll(text, fileOptions);
      fixed = r.applied;
      fixedText = r.code;
      if (r.code !== text && fixMode === 'write') {
        fs.writeFileSync(file, (original.startsWith('﻿') ? '﻿' : '') + r.code);
        text = r.code;
      }
    }
    // A dry run leaves the file as it is: what's left is shown at the file's own lines (core/fix.ts matchLeftAfterFix).
    let found = lint(text, fileOptions);
    let extra: ((typeof found)[number] & { line: number; column: number })[] = [];
    if (fixMode === 'dry' && fixedText !== undefined && fixed.length) {
      const r = matchLeftAfterFix(text, found, fixed, lint(fixedText, fileOptions));
      found = r.kept;
      extra = r.extra.map((l) => ({ ...l, line: lineOf(fixedText!, l.start) + 1, column: l.start - lineStart(fixedText!, l.start) + 1 }));
    }
    const diags = found.filter((d) => (quiet ? d.severity === 'error' : verbose || d.severity !== 'hint'));
    for (const d of diags) {
      if (d.severity === 'error') errors++;
      else if (d.severity === 'warning') warnings++;
    }
    const withPos = diags.map((d) => ({ ...d, line: lineOf(text, d.start) + 1, column: d.start - lineStart(text, d.start) + 1 }));
    for (const d of extra.filter((d) => (quiet ? d.severity === 'error' : verbose || d.severity !== 'hint'))) {
      if (d.severity === 'error') errors++;
      else if (d.severity === 'warning') warnings++;
      withPos.push(d);
    }
    // The handler's folder (<Name>/ next to <Name>.js), as it goes into the .nc: core/pkgcheck.ts.
    const pkgFiles = packageFilesFor(file, 0);
    const pkg = (pkgFiles ? checkPackage(text, pkgFiles) : []).filter((p) => (quiet ? p.severity === 'error' : true));
    for (const p of pkg) {
      if (p.severity === 'error') errors++;
      else if (p.severity === 'warning') warnings++;
    }
    const pkgOut = pkg.map((p) => ({ file: p.file ?? null, line: p.line ?? (p.start !== undefined ? lineOf(text, p.start) + 1 : null), severity: p.severity, message: `${p.title}. ${p.why}`, rule: 'package' }));
    fixedCount += fixed.length;
    if (json) {
      out.push({ file, ...(fixMode ? { fixed } : {}), diagnostics: withPos, ...(pkgOut.length ? { package: pkgOut } : {}) });
      continue;
    }
    if (!withPos.length && !fixed.length && !pkgOut.length) continue;
    console.log(file);
    for (const f of fixed) console.log(`  ${`${f.line}`.padEnd(9)} ${(fixMode === 'dry' ? 'would fix' : 'fixed').padEnd(8)} ${f.title}  [${f.rule}]`);
    for (const d of withPos) {
      console.log(`  ${`${d.line}:${d.column}`.padEnd(9)} ${d.severity.padEnd(8)} ${d.message}  [${d.rule}]`);
      for (const f of d.fixes ?? []) console.log(`  ${''.padEnd(9)} ${''.padEnd(8)} fix: ${f.title}`);
    }
    for (const p of pkgOut) console.log(`  ${(p.file ? `${p.file}${p.line ? `:${p.line}` : ''}` : `${p.line ?? ''}`).padEnd(9)} ${p.severity.padEnd(8)} ${p.message}  [package]`);
    console.log();
  }
  if (json) console.log(JSON.stringify({ files: out, errors, warnings, ...(fixMode ? { fixed: fixedCount } : {}) }, null, 2));
  else console.log(`${linted} handler(s): ${fixMode ? `${fixedCount} problem(s) ${fixMode === 'dry' ? 'would be fixed' : 'fixed'}, ` : ''}${errors} error(s)${fixMode ? ' left' : ''}, ${warnings} warning(s)${fixMode ? ' left' : ''}`);
  return errors ? 1 : 0;
}

function cmdFormat(args: Args, json: boolean): number {
  const files: string[] = [];
  const collect = (p: string, explicit: boolean) => {
    const st = fs.statSync(p);
    if (st.isDirectory()) for (const f of fs.readdirSync(p)) collect(path.join(p, f), false);
    else if (explicit || (p.endsWith('.js') && looksLikeHandler(fs.readFileSync(p, 'utf8')))) files.push(p);
  };
  if (!args.positional.length) throw new Usage('format: give at least one file or directory');
  for (const p of args.positional) collect(p, true);
  const write = has(args, '--write');
  const checkOnly = has(args, '--check');
  const results: { file: string; ok: boolean; changed?: boolean; reason?: string }[] = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const quotes = flag(args, '--quotes');
    const semicolons = flag(args, '--semicolons');
    if (quotes && !['double', 'single', 'keep'].includes(quotes)) throw new Usage('--quotes: double, single or keep');
    if (semicolons && !['add', 'keep'].includes(semicolons)) throw new Usage('--semicolons: add or keep');
    const r = formatHandler(text, { quotes: quotes as 'double' | 'single' | 'keep' | undefined, semicolons: semicolons as 'add' | 'keep' | undefined });
    if (!r.ok) {
      results.push({ file, ok: false, reason: r.reason });
      continue;
    }
    results.push({ file, ok: true, changed: r.changed });
    if (write && r.changed) fs.writeFileSync(file, r.code);
    else if (!write && !checkOnly && !json && files.length === 1) process.stdout.write(r.code);
  }
  const bad = results.filter((r) => !r.ok);
  const unformatted = results.filter((r) => r.ok && r.changed);
  if (json) console.log(JSON.stringify(results, null, 2));
  else if (write || checkOnly || files.length > 1) {
    for (const r of bad) console.log(`${r.file}: not formatted: ${r.reason}`);
    for (const r of unformatted) console.log(`${r.file}${write ? ': formatted' : checkOnly ? ': not formatted' : ''}`);
    console.log(`${files.length} file(s): ${unformatted.length} ${write ? 'formatted' : 'to format'}${bad.length ? `, ${bad.length} skipped` : ''}`);
  } else if (bad.length) console.error(bad[0].reason);
  return bad.length || (checkOnly && unformatted.length) ? 1 : 0;
}

function simArgs(args: Args, cmd: string) {
  const file = args.positional[0];
  if (!file || args.positional.length > 1) throw new Usage(`${cmd}: give one handler file`);
  const players = Number(flag(args, '--players') ?? 2);
  if (!Number.isInteger(players) || players < 1 || players > 16) throw new Usage('--players must be 1 to 16');
  const res = (flag(args, '--resolution') ?? '1920x1080').match(/^(\d+)x(\d+)$/);
  if (!res) throw new Usage('--resolution must look like 1920x1080');
  const kbArg = flag(args, '--keyboard') ?? '1';
  // all: every player has their own keyboard and mouse (Nucleus' multiple keyboards and mice mode)
  const keyboardPlayer = kbArg === 'none' ? -1 : kbArg === 'all' ? EVERY_KEYBOARD : Number(kbArg) - 1;
  if (kbArg !== 'none' && kbArg !== 'all' && (!Number.isInteger(keyboardPlayer) || keyboardPlayer < 0 || keyboardPlayer >= players)) throw new Usage(`--keyboard must be a player number (1-${players}), "all" (each player their own) or "none"`);
  const src = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  return { file, src, keyboardPlayer, opts: { players, width: Number(res[1]), height: Number(res[2]), keyboardPlayer, plugins: pluginsFor(file) } };
}

function cmdSimulate(args: Args, json: boolean): number {
  const { file, src, keyboardPlayer, opts } = simArgs(args, 'simulate');
  const r = simulateIsolated(src, opts);
  const failed = !r.loaded || r.players.some((p) => p.error) || r.callbacks.some((c) => c.error);
  print(json, { file, ...r }, () => formatSimulation(r, keyboardPlayer));
  return failed ? 1 : 0;
}

function cmdExplain(args: Args, json: boolean): number {
  const file = args.positional[0];
  const n = Number(flag(args, '--line'));
  if (!file || args.positional.length > 1 || !Number.isInteger(n) || n < 1) throw new Usage('explain: give one handler file and --line N');
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split('\n');
  if (n > lines.length) throw new Usage(`explain: ${file} has ${lines.length} lines`);
  const offset = lines.slice(0, n - 1).reduce((o, l) => o + l.length + 1, 0) + (lines[n - 1].length - lines[n - 1].trimStart().length);
  const e = explainLine(text, offset);
  print(json, { file, line: n, text: e?.text ?? '', markdown: e?.markdown ?? '' }, () => e?.markdown ?? `Line ${n} is empty.`);
  return 0;
}

function cmdDebug(args: Args, json: boolean): number {
  const { file, src, opts } = simArgs(args, 'debug');
  const breakpoints = (args.flags.get('--break') ?? []).map((b) => {
    const bp = parseBreakpoint(b);
    if (!bp) throw new Usage(`--break must be a line number, optionally with a condition: --break "14 if Context.PlayerID == 1" (got "${b}")`);
    return bp;
  });
  const r = runDebug(src, opts, { breakpoints, watches: args.flags.get('--watch') ?? [], step: has(args, '--step') });
  print(json, { file, ...r.data }, () => r.text);
  return r.failed ? 1 : 0;
}

/** `ncdev docs vote <name> <doc|practice> <up|down>`: an AI agent's vote on a doc it checked (src/aivote.ts). */
async function cmdDocs(args: Args, json: boolean): Promise<number> {
  const [sub, name, part, vote] = args.positional;
  if (sub !== 'vote' || !name || !part || !vote) throw new Usage('docs: "ncdev docs vote <name> <doc|practice> <up|down>", e.g. "ncdev docs vote Game.KillMutex practice up" (for AI agents that checked it)');
  const r = await sendAiVote(name, part, vote, VERSION);
  print(json, r, () => r.message);
  return r.ok ? 0 : 1;
}

function cmdApi(args: Args, json: boolean): number {
  if (has(args, '--markdown')) {
    console.log(markdownReference());
    return 0;
  }
  const q = args.positional.join(' ');
  if (!q) throw new Usage('api: give a name, e.g. "ncdev api Game.KillMutex", or --search <words>');
  const doSearch = (words: string) => {
    const hits = search(words, Number(flag(args, '--limit') ?? 20));
    print(json, hits.map((e) => ({ path: e.path, ...e.member })), () =>
      hits.length ? hits.map((e) => formatEntry(e, false) + (e.member.doc ? `\n  ${e.member.doc.split('\n')[0].slice(0, 160)}` : '')).join('\n') : `No API members match "${words}".`,
    );
    return hits.length ? 0 : 1;
  };
  if (has(args, '--search')) return doSearch(q);
  const r = lookup(q, { objects: true });
  switch (r.kind) {
    case 'entries':
      print(json, r.entries.map((e) => ({ path: e.path, ...e.member })), () => r.entries.map((e) => formatEntry(e)).join('\n\n'));
      return 0;
    case 'enum':
      print(json, r, () => `enum Nucleus.${r.name}${r.doc ? ` - ${r.doc}` : ''}\n` + Object.entries(r.values).map(([k, v]) => `  Nucleus.${r.name}.${k} = ${v}`).join('\n'));
      return 0;
    case 'class':
      print(json, r, () => `new Nucleus.${r.name}(${r.params.join(', ')})\n  ${r.doc}`);
      return 0;
    case 'object':
      print(json, { path: r.path, doc: r.doc, members: r.members.map((e) => ({ path: e.path, ...e.member })), children: r.children }, () => formatObject(r));
      return 0;
    case 'none':
      if (!json) console.log(`"${q}" is not part of the Nucleus handler API.${r.didYouMean ? ` Did you mean ${r.didYouMean}?` : ''} Searching docs instead:\n`);
      doSearch(q);
      return 1;
  }
}

async function cmdHub(args: Args, json: boolean): Promise<number> {
  const [sub, ...rest] = args.positional;
  const feature = sub === 'fetch' ? 'hub-fetch' : sub === 'search' ? (has(args, '--popular') && !rest.length ? 'hub-popular' : 'hub-search') : 'hub-list';
  const list = await hubHandlers({ feature });
  if (sub === 'search') {
    const words = rest.join(' ').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length && !has(args, '--popular')) throw new Usage('hub search: give some words, e.g. "hub search halo" (or --popular for the most downloaded)');
    // Rank by how many words match (title/game name count double), then popularity.
    const hits = list
      .map((h) => {
        const title = `${h.title} ${h.gameName}`.toLowerCase();
        const rest = `${h.ownerName} ${h.description ?? ''}`.toLowerCase();
        const score = words.length ? words.reduce((n, w) => n + (title.includes(w) ? 2 : rest.includes(w) ? 1 : 0), 0) : 1;
        return { h, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || (b.h.downloadCount ?? 0) - (a.h.downloadCount ?? 0))
      .map((x) => x.h)
      .slice(0, Number(flag(args, '--limit') ?? 15));
    print(
      json,
      hits.map((h) => ({ id: h._id, title: h.title, gameName: h.gameName, owner: h.ownerName, downloads: h.downloadCount, verified: h.verified, version: h.currentVersion, maxPlayers: h.maxPlayers, multipleKeyboardsAndMice: h.playableMultiMouseKeyboard, url: handlerPageUrl(h._id) })),
      () =>
        hits.length
          ? hits.map((h) => `${h._id}  ${h.title}${h.verified ? ' (verified)' : ''} - by ${h.ownerName}, ${h.downloadCount ?? 0} downloads${h.playableMultiMouseKeyboard ? ', multi KB/M' : ''}`).join('\n') +
            '\n\nFetch one with: ncdev hub fetch <id>'
          : 'No handlers found.',
    );
    return hits.length ? 0 : 1;
  }
  if (sub === 'fetch') {
    const key = rest.join(' ');
    if (!key) throw new Usage('hub fetch: give a handler id (from "ncdev hub search")');
    const h: HubHandler | undefined = list.find((x) => x._id === key) ?? list.find((x) => x.title.toLowerCase() === key.toLowerCase());
    if (!h) throw new Error(`No handler with id or title "${key}"`);
    const out = flag(args, '--out') ?? path.join('hub-handlers', toHandlerFileName(h.title));
    const files = extractEntries(await hubPackage(h, { feature: 'hub-fetch' }), out);
    print(json, { id: h._id, title: h.title, dir: path.resolve(out), files }, () => `Extracted ${h.title} v${h.currentVersion} to ${path.resolve(out)}:\n` + files.map((f) => `  ${f}`).join('\n'));
    return 0;
  }
  throw new Usage('hub: use "hub search <words>" or "hub fetch <id>"');
}

function cmdNew(args: Args, json: boolean): number {
  if (has(args, '--list-features')) {
    print(json, FEATURES, () => FEATURES.map((f) => `${f.id.padEnd(16)}${f.label}: ${f.detail}`).join('\n'));
    return 0;
  }
  const name = flag(args, '--name');
  const exe = flag(args, '--exe');
  if (!name || !exe) throw new Usage('new: --name and --exe are required');
  const features = (flag(args, '--features') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const problems = validateHandlerInfo({ gameName: name, executableName: exe, steamId: flag(args, '--steam-id'), maxPlayers: flag(args, '--max-players'), features });
  if (problems.length) throw new Usage(`new: ${problems.map((p) => p.replace(/^gameName:/, '--name:').replace(/^executableName:/, '--exe:').replace(/^steamId:/, '--steam-id:').replace(/^maxPlayers:/, '--max-players:').replace(/^features:/, '--features:')).join('\n     ')}`);
  const out = flag(args, '--out') ?? `${toHandlerFileName(name)}.js`;
  if (fs.existsSync(out) && !has(args, '--force')) throw new Error(`${out} already exists (use --force to overwrite)`);
  const maxPlayers = flag(args, '--max-players');
  fs.writeFileSync(out, renderHandler({ gameName: name, executableName: exe, steamId: flag(args, '--steam-id'), maxPlayers: maxPlayers ? Number(maxPlayers) : undefined, features: features as Feature[] }));
  print(json, { file: path.resolve(out) }, () => `Created ${out}`);
  return 0;
}

function cmdInstall(args: Args, json: boolean): number {
  const file = args.positional[0];
  if (!file?.endsWith('.js')) throw new Usage('install: give the handler .js file');
  const nucleus = flag(args, '--nucleus');
  if (!nucleus) throw new Usage('install: --nucleus <folder> is required (the Nucleus Co-op folder, with NucleusCoop.exe and handlers)');
  const errors = lint(fs.readFileSync(file, 'utf8')).filter((d) => d.severity === 'error');
  if (errors.length && !has(args, '--force')) throw new Error(`${file} has ${errors.length} lint error(s), so Nucleus may not load it; fix them or pass --force. Run "ncdev lint ${file}".`);
  const { dest, assets } = installHandler(file, nucleus, { overwrite: has(args, '--force') });
  print(json, { file: dest, assetCount: assets }, () => `Installed ${path.basename(dest)}${assets ? ` and ${assets} asset file(s)` : ''} to ${path.dirname(dest)}. Restart Nucleus Co-op (or re-add the game) to pick it up.`);
  return 0;
}

async function cmdTest(args: Args, json: boolean): Promise<number> {
  const nucleus = flag(args, '--nucleus');
  if (!nucleus) throw new Usage('test: --nucleus <folder> is required (the Nucleus Co-op folder, with NucleusCoop.exe and handlers)');
  const status = nucleusStatus(nucleus);
  if (has(args, '--status')) {
    print(json, status, () => `${status.canStart ? (status.running ? 'Nucleus Co-op is running.' : 'Nucleus Co-op is not running.') : status.why}\nDebug log: ${status.debugLog === undefined ? 'no Settings.ini yet' : status.debugLog ? 'on' : 'off'}`);
    return 0;
  }
  const file = args.positional[0];
  if (!file?.endsWith('.js')) throw new Usage('test: give the handler .js file');
  if (!status.canStart) throw new Error(status.why);
  const errors = lint(fs.readFileSync(file, 'utf8')).filter((d) => d.severity === 'error');
  if (errors.length && !has(args, '--force')) throw new Error(`${file} has ${errors.length} lint error(s), so Nucleus may not load it; fix them or pass --force. Run "ncdev lint ${file}".`);
  if (status.running) {
    if (!has(args, '--restart')) {
      if (json) print(json, { started: false, running: true }, () => '');
      else console.error('Nucleus Co-op is running and only reads handlers when it starts: close it, or pass --restart.');
      return 3;
    }
    await stopNucleus();
  }
  const log = flag(args, '--debug-log');
  if (log === 'on' || log === 'off') setDebugLog(nucleus, log === 'on');
  const r = testInNucleus(file, nucleus);
  print(json, { started: true, file: r.dest, guid: r.guid, debugLog: debugLogOn(nucleus), log: debugLogPath(nucleus) }, () => `${AFTER_START}\nDebug log: ${debugLogOn(nucleus) ? debugLogPath(nucleus) : 'off (--debug-log on turns it on)'}`);
  return 0;
}

// ncdev imports: a game's program files read for the hooks a handler likely needs (core/pe.ts, core/importhooks.ts).
/** `ncdev <command> --help`: that command's lines from HELP (and their continuation lines), or all of HELP. */
function commandHelp(cmd: string): string {
  const lines = HELP.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith(`  ${cmd} `) && lines[i] !== `  ${cmd}`) continue;
    out.push(lines[i]);
    while (i + 1 < lines.length && /^ {6,}\S/.test(lines[i + 1])) out.push(lines[++i]);
  }
  return out.length ? `Usage:\n${out.join('\n')}\n\nRun "ncdev --help" for every command and option.` : HELP;
}

function cmdImports(args: Args, json: boolean): number {
  if (!args.positional.length) throw new Usage('imports: give the game folder (or its .exe and DLLs)');
  const missing = args.positional.filter((p) => !fs.existsSync(p));
  if (missing.length) throw new Error(`${missing.join(', ')} doesn't exist`);
  const files = readGameBinaries(args.positional);
  if (!files.length) throw new Error(`No .exe or .dll files in ${args.positional.join(', ')}`);
  const exe = flag(args, '--exe');
  const exeHits = exe ? findExes(files.filter((f) => !f.dll), exe) : [];
  if (exe && !exeHits.length)
    throw new Error(`--exe: no program called ${exe} there (found: ${files.filter((f) => !f.dll).map((f) => f.fileName).join(', ') || 'none'})`);
  if (exeHits.length > 1) throw new Error(`--exe: ${exe} could be ${exeHits.map(exePath).join(' or ')}; give one of those paths`);
  const a = analyse(files, exeHits[0]);
  const opts = { controllers: !has(args, '--no-controllers'), kbm: !has(args, '--no-kbm') };
  const listing = (f: PeFile) => [
    `${f.fileName} (${f.is64 ? '64' : '32'}-bit ${f.dll ? 'DLL' : 'program'}, ${a.roles.get(f)})`,
    ...f.imports.map((im) => `  ${im.dll}${im.delay ? ' (delay-loaded)' : ''}: ${im.fns.map((x) => x.name || '#' + x.ord).join(', ')}`),
    ...(f.exports.length ? [`  exports: ${f.exports.map((e) => e.name || '#' + e.ord).join(', ')}`] : []),
  ].join('\n');
  print(json, {
    game: a.main?.fileName, launchers: a.launchers.map((f) => f.fileName),
    files: files.map((f) => ({ file: f.fileName, role: a.roles.get(f), is64: f.is64, dll: f.dll, imports: has(args, '--list') ? f.imports : f.imports.length, exports: has(args, '--list') ? f.exports : f.exports.length, loads: f.rt.filter((x) => /\.dll$/i.test(x)) })),
    findings: a.found.filter((f) => (opts.controllers || !f.rule.ctl) && (opts.kbm || !f.rule.kbm)).map((f) => ({ id: f.rule.id, area: f.rule.area, title: f.rule.title, why: f.rule.why, group: f.rule.ctl ? 'controllers' : f.rule.kbm ? (f.rule.detail ? 'kbm-detail' : 'kbm') : f.rule.maybe ? 'only-if' : 'game', lines: f.lines, found: f.hits })),
  }, () => importsReport(a, opts) + (has(args, '--list') ? '\n\n' + files.map(listing).join('\n\n') : ''));
  return 0;
}

function cmdPackage(args: Args, json: boolean): number {
  const file = args.positional[0];
  if (!file?.endsWith('.js')) throw new Usage('package: give the handler .js file');
  const errors = lint(fs.readFileSync(file, 'utf8')).filter((d) => d.severity === 'error');
  if (errors.length && !has(args, '--force')) throw new Error(`${file} has ${errors.length} lint error(s); fix them or pass --force. Run "ncdev lint ${file}".`);
  const out = flag(args, '--out') ?? file.replace(/\.js$/, '.nc');
  const { zip, assetCount } = buildPackage(file);
  fs.writeFileSync(out, zip);
  print(json, { file: path.resolve(out), assetCount }, () => `Wrote ${out} (handler.js + ${assetCount} asset file(s)). Upload it at https://hub.splitscreen.me/`);
  return 0;
}

/** Saves the newest release's workbench.html: the whole browser workbench in one offline file. */
/** Opens a link in the default browser: true once the opener started, false when it couldn't (no xdg-open: the
 *  error comes after spawn returns, so this waits for one or the other). */
function openInBrowser(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const [c, a] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url.replace(/&/g, '^&')]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
      const p = spawn(c, a as string[], { detached: true, stdio: 'ignore', windowsVerbatimArguments: process.platform === 'win32' });
      p.once('spawn', () => { p.unref(); resolve(true); });
      p.once('error', () => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

async function cmdReport(args: Args, json: boolean): Promise<number> {
  const rule = flag(args, '--check-rule');
  const words = ['problem', 'feature', 'tryit', 'check'];
  const first0 = args.positional[0];
  if (!rule && first0 && !words.includes(first0) && !fs.existsSync(first0) && !/\.js$/i.test(first0))
    throw new Usage(`report: "${first0}" is neither a kind of report (${words.join(', ')}) nor a handler file`);
  const kind = (rule ? 'check' : words.includes(args.positional[0]) ? args.positional.shift()! : 'problem') as ReportInput['kind'];
  if (kind === 'check' && !rule) throw new Usage('report --check <rule> <handler.js>: which check is wrong? (ncdev rules lists them)');
  if (rule && !(rule in RULES)) throw new Usage(`report: no check called "${rule}" (ncdev rules lists them)`);
  const file = args.positional[0];
  if (file && !fs.existsSync(file)) throw new Error(`${file} doesn't exist`);
  if (kind === 'check' && !file) throw new Usage('report --check <rule> <handler.js>: give the handler, so the report has the flagged line');
  const text = file ? fs.readFileSync(file, 'utf8') : undefined;
  const input: ReportInput = { kind, tool: 'ncdev', version: `ncdev ${VERSION}`, details: [`ncdev: ${VERSION}${isStandalone() ? ' (standalone)' : ''}`, `OS: ${process.platform} ${process.arch}`], handler: text !== undefined ? handlerOrigin(text) : undefined };
  if (kind === 'check' && text !== undefined) {
    // The flagged line: --line, else the check's first problem in the file.
    const want = flag(args, '--line') ? Number(flag(args, '--line')) : undefined;
    const count = text.split(/\r?\n/).length;
    if (want !== undefined && !(Number.isInteger(want) && want >= 1 && want <= count)) throw new Usage(`report --line: a line number from 1 to ${count}`);
    const d = lint(text).filter((x) => x.rule === rule).find((x) => want === undefined || lineOf(text, x.start) + 1 === want);
    if (!d) process.stderr.write(want ? `Note: ${rule} doesn't flag line ${want} of ${file}. If it should, say so on the form.\n` : `Note: ${rule} doesn't flag anything in ${file}.\n`);
    const lines = text.split(/\r?\n/);
    const first = d ? lineOf(text, d.start) : want ? want - 1 : undefined;
    const last = d ? lineOf(text, Math.max(d.start, d.end - 1)) : first;
    Object.assign(input, { rule, message: d?.message, line: first !== undefined ? first + 1 : undefined, code: first !== undefined && !has(args, '--no-code') ? lines.slice(first, Math.min(last!, first + 19) + 1).join('\n') : undefined });
  }
  if (kind === 'tryit' && text !== undefined) input.sim = simSummary(simulateIsolated(text, { players: 2, width: 1920, height: 1080, keyboardPlayer: 0, plugins: pluginsFor(file!) }), { players: 2, resolution: '1920×1080', keyboard: 'player 1' });
  const r = buildReport(input);
  if (has(args, '--text')) {
    print(json, { text: r.text, thread: DISCORD_THREAD }, () => `${r.text}\n\nPaste it in the testers' Discord thread: ${DISCORD_THREAD}`);
    return 0;
  }
  const hits = process.env.NCDEV_NO_ISSUE_SEARCH ? [] : await findDuplicates(r, { userAgent: `ncdev/${VERSION}`, timeoutMs: 5000 });
  const help = kind === 'problem' && input.handler?.hubId ? handlerHelp(input.handler) : undefined;
  const opened = has(args, '--open') && (await openInBrowser(r.url));
  print(json, { title: r.title, repo: r.repo, template: r.template, url: r.url, duplicates: hits, handlerHelp: help, opened }, () =>
    [
      `${r.title || (kind === 'feature' ? 'A feature request' : 'A report')} (${r.repo}, ${r.template})`,
      ...(hits.length ? ['', 'Is it one of these? Open it and add a 👍 or a comment:', ...hits.map((h) => `  #${h.number} ${h.title}${h.thumbs ? ` (👍 ${h.thumbs})` : ''}\n    ${h.url}`)] : []),
      ...(help ? ['', `Is the problem in this handler, not the tools? ${help.note}`, ...help.links.map((l) => `  ${l.label}: ${l.url}`)] : []),
      '',
      // The browser may still fail to start (no xdg-open): the link is always printed.
      opened ? 'Opening the form in your browser: check it, then submit. If it didn\'t open, use this link:' : 'Open this link to send it (you see everything before it is sent):',
      r.url,
      ...(input.code ? ['', 'It includes the flagged line(s) only. Leave them out with --no-code, or delete them on the form.'] : []),
      '',
      `No GitHub account? ncdev report … --text prints it to paste in the testers' Discord thread: ${DISCORD_THREAD}`,
    ].join('\n'),
  );
  return 0;
}

async function cmdWorkbench(args: Args, json: boolean): Promise<number> {
  const out = flag(args, '--out') ?? 'nucleus-workbench.html';
  if (fs.existsSync(out) && !has(args, '--force')) throw new Error(`${out} already exists (use --force to overwrite)`);
  // The newest release with the file, pre-releases included. If the API is unavailable (rate
  // limits), fall back to the newest full release's download link.
  let rel = { tag_name: 'the latest release', url: 'https://github.com/Snailedlt/nucleus-devtools/releases/latest/download/workbench.html' };
  const res = await fetch('https://api.github.com/repos/Snailedlt/nucleus-devtools/releases?per_page=50', { headers: { accept: 'application/vnd.github+json' } }).catch(() => undefined);
  if (res?.ok) {
    const releases = (await res.json()) as { tag_name: string; draft: boolean; assets: { name: string; browser_download_url: string }[] }[];
    const r = releases.find((x) => !x.draft && x.assets.some((a) => a.name === 'workbench.html'));
    if (!r) throw new Error(`No release has a workbench.html yet. Use ${WORKBENCH_URL} for now.`);
    rel = { tag_name: r.tag_name, url: r.assets.find((a) => a.name === 'workbench.html')!.browser_download_url };
  }
  const page = await fetch(rel.url);
  if (page.status === 404) throw new Error(`No release has a workbench.html yet. Use ${WORKBENCH_URL} for now.`);
  if (!page.ok) throw new Error(`Download failed (${page.status})`);
  const html = await page.text();
  if (!/^<!doctype html>/i.test(html.trimStart())) throw new Error('The download is not an HTML page.');
  fs.writeFileSync(out, html);
  print(json, { file: path.resolve(out), release: rel.tag_name, bytes: html.length }, () => `Saved the workbench from ${rel.tag_name} to ${path.resolve(out)}. Open it in a browser; it works offline.`);
  return 0;
}

/** The standalone ncdev carries the skill's files: unpacked into a temporary folder for `init-agent`. */
function builtInSkill(): string | undefined {
  const raw = builtIn('skill.json');
  if (!raw) return undefined;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ncdev-skill-'));
  for (const [rel, b64] of Object.entries(JSON.parse(raw.toString('utf8')) as Record<string, string>)) {
    const f = path.join(dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, Buffer.from(b64, 'base64'));
  }
  return dir;
}

function cmdSetup(args: Args, json: boolean): number {
  const what = (args.positional[0] ?? '').toLowerCase().replace(/\s+/g, '');
  if (!['notepad++', 'notepadpp', 'npp'].includes(what)) {
    // A typo of it (nodepad++, notepad+) gets the right spelling; anything else, what setup can do.
    const near = what && /^no[a-z]*pad|^npp|pad\+/i.test(what);
    throw new Usage(near ? `setup: there is no "${what}". Did you mean: ncdev setup notepad++` : 'setup: only "notepad++" for now, e.g. ncdev setup notepad++');
  }
  const changing = !has(args, '--check') && !has(args, '--remove');
  // The standalone ncdev copies itself to one known place (%LOCALAPPDATA%\ncdev) and installs the plugin, which runs it.
  const standalone = isStandalone();
  const tool = standalone && changing ? installSelf() : standalone ? installPath() : undefined;
  const plugins = standalone ? { x64: builtIn('NcDev.dll'), x86: builtIn('NcDev-x86.dll') } : undefined;
  const runCommand = tool ? `cmd /k ""${tool}" lint "$(FULL_CURRENT_PATH)""` : `cmd /k ""${process.execPath}" "${path.resolve(process.argv[1])}" lint "$(FULL_CURRENT_PATH)""`;
  let r = setupNotepadPP({ path: flag(args, '--path'), remove: has(args, '--remove'), check: has(args, '--check'), runCommand, plugins, toolPath: tool });
  // Notepad++ in Program Files needs administrator rights: ask Windows for them (its permission prompt) and run this
  // same setup again in an elevated copy, rather than sending people to an administrator terminal. That copy writes
  // what it did to a file (its own window closes), and it never asks again.
  const resultFile = flag(args, '--result-file');
  if (r.denied && process.platform === 'win32' && !has(args, '--elevated')) {
    const self = isStandalone() ? [] : [path.resolve(process.argv[1])];
    // The same setup, from what was asked (the double-click menu has no command line to copy).
    const p = flag(args, '--path');
    const again = runElevated(process.execPath, [...self, 'setup', 'notepad++', ...(p ? ['--path', p] : []), ...(has(args, '--remove') ? ['--remove'] : [])]);
    if (again.ran) r = { ok: !!again.ok, lines: again.lines ?? [] };
    else r.lines.unshift("Windows didn't give ncdev permission to write to Notepad++'s folder (the prompt was declined, or couldn't be shown).");
  }
  if (tool && changing && r.ok && !has(args, '--elevated')) r.lines.unshift(`ncdev is in ${path.dirname(tool)} (ncdev update keeps it current).`);
  if (resultFile) fs.writeFileSync(resultFile, JSON.stringify(r));
  print(json, r, () => r.lines.join('\n'));
  return r.ok ? 0 : 1;
}

async function cmdVersion(json: boolean): Promise<number> {
  // Only what's already known (a check at most once a day happens in `update --check`), so this stays instant.
  const latest = await latestRelease(false, (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch).catch(() => undefined);
  const update = latest && newer(latest.version, VERSION) ? latest : undefined;
  print(json, { version: VERSION, standalone: isStandalone(), update: update?.tag }, () => `${TOOL} ${VERSION}${update ? `\n${update.tag} is out: run ${TOOL} update` : ''}`);
  return 0;
}

async function cmdUpdate(args: Args, json: boolean): Promise<number> {
  const check = has(args, '--check');
  const quiet = has(args, '--quiet');
  const latest = await latestRelease(!check);
  if (!latest) {
    if (!quiet) print(json, { error: latest === null ? 'none' : 'unreachable' }, () => (latest === null ? `No release has a standalone ${TOOL} yet; ${TOOL} ${VERSION} is what there is.` : 'Couldn\'t reach GitHub to check for a newer version. Try again later.'));
    return check || latest === null ? 0 : 1;
  }
  const isNewer = newer(latest.version, VERSION);
  if (check) {
    if (isNewer || !quiet) print(json, { version: VERSION, latest: latest.tag, update: isNewer }, () => (isNewer ? latest.tag : `${TOOL} ${VERSION} is the newest.`));
    return isNewer ? 10 : 0;
  }
  if (!isNewer) {
    print(json, { version: VERSION, latest: latest.tag, updated: false }, () => `${TOOL} ${VERSION} is the newest (${latest.tag}).`);
    return 0;
  }
  if (!isStandalone()) {
    print(json, { version: VERSION, latest: latest.tag, updated: false }, () =>
      [`${latest.tag} is out (${latest.url}).`, 'This copy runs on Node.js: update it the way you installed it (VS Code updates the extension; or download nucleus.js or ncdev from the release page).'].join('\n'),
    );
    return 0;
  }
  const target = process.execPath;
  await installRelease(latest, target);
  print(json, { version: VERSION, latest: latest.tag, updated: true, path: target }, () =>
    [`Updated ${TOOL} ${VERSION} → ${latest.tag} (${target}).`, has(args, '--from-notepad++') ? 'Notepad++ uses it for the next handler you open.' : '', `What's new: ${latest.url}`].filter(Boolean).join('\n'),
  );
  return 0;
}

function cmdInitAgent(args: Args, json: boolean): number {
  const target = path.resolve(args.positional[0] ?? '.');
  const skillDir = findSkillDir(__dirname) ?? builtInSkill();
  if (!skillDir) throw new Error('Could not find the nucleus-handler skill files next to this tool.');
  if (path.resolve(skillDir).startsWith(path.join(target, '.claude', 'skills'))) throw new Error('Already installed here.');
  const r = installAgentKit(skillDir, target);
  print(json, r, () =>
    [
      `Agent kit installed in ${target}`,
      ...r.created.map((f) => `  created ${f}`),
      ...r.updated.map((f) => `  updated ${f}`),
      '',
      'Agents can now run: node .claude/skills/nucleus-handler/scripts/nucleus.js lint <handler.js>',
    ].join('\n'),
  );
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => (process.exitCode = code),
  (e) => {
    // A file that isn't there, or a folder where a file was expected: say so plainly, not with Node's error codes.
    const fileError = e?.code === 'ENOENT' ? `No such file or folder: ${e.path}` : e?.code === 'EISDIR' ? `${e.path} is a folder: give a file.` : undefined;
    console.error(e instanceof Usage ? `${e.message}\n\nRun "${TOOL} --help" for usage.` : `Error: ${fileError ?? e?.message ?? e}`);
    process.exitCode = e instanceof Usage ? 2 : 1;
  },
);
