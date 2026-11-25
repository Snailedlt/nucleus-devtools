// `ncdev verify`: what happened in a real Nucleus Co-op session, compared with Try it's prediction (issue #1).
// Pure: the Windows side (src/verifywin.ts) reads the files and the windows; this reads them and compares.
//
// Where it comes from (splitscreenme-nucleus):
// - debug-log.txt, in Nucleus' folder, only while Settings.ini has DebugLog on. Every line is
//   "[yyyy-MM-dd HH:mm:ss]SOURCE: message" (GenericGameHandler.Log: HANDLER; Core_Interface.Log: MAIN;
//   ProcessUtil: PROCESSUTIL; also STARTGAME, INJECT, ...). A session starts with
//   "********** Setting up player 1 **********" (GenericGameHandler, one per player), says "Launching exe <path>"
//   per instance, "PIDs stored 123 456 " once they're known, and "ERROR - ..." when something went wrong.
// - A handler that throws while it's set up (Game.Play, OnFinishedSetup, a missing file) goes through
//   LogManager.LogExceptionFile: "ERROR - <message> | Stacktrace: ..." in app.log and a file of its own,
//   %APPDATA%\Nucleus Coop\<ddMMyyyy_HHmmss>.log, with [Header], [Message] and [Stacktrace] sections; Nucleus
//   shows "Something went wrong :(" and ends the session.
import type { SimResult } from './sim';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LogLine {
  /** "2026-11-25 14:03:12" as written, or undefined for a continuation line */
  time?: string;
  source?: string;
  text: string;
  /** 1-based line in the file */
  line: number;
}

export interface SessionLog {
  /** Lines of the newest session only (from its last "Setting up player 1"), or every line when there's none. */
  lines: LogLine[];
  /** Whether a session start was found at all. */
  started: boolean;
  /** Players Nucleus set up, by number (1-based), in the order it did. */
  playersSetUp: number[];
  /** "Launching exe" lines: the programs started, in order. */
  launched: string[];
  /** The process ids Nucleus stored for the players, when it logged them. */
  pids: number[];
  errors: { text: string; line: number }[];
  /** The monitor's resolution per player, as Nucleus logged it ("Player monitor's resolution: 1920 x 1080"). */
  monitors: { width: number; height: number }[];
  /** When the session's first line was written. */
  startedAt?: string;
}

const LINE_RE = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]([A-Za-z][\w ]*?): ?(.*)$/;
const SETUP_RE = /\*{3,} Setting up player (\d+) \*{3,}/;

export function parseLogLines(text: string): LogLine[] {
  const out: LogLine[] = [];
  text.replace(/^﻿/, '').split(/\r?\n/).forEach((raw, i) => {
    const m = LINE_RE.exec(raw);
    if (m) out.push({ time: m[1], source: m[2], text: m[3], line: i + 1 });
    else if (raw.trim()) out.push({ text: raw, line: i + 1 });
  });
  return out;
}

/** The newest session in debug-log.txt (the log is appended to, session after session). */
export function parseDebugLog(text: string): SessionLog {
  const all = parseLogLines(text);
  let from = -1;
  for (let i = all.length - 1; i >= 0; i--) {
    const m = SETUP_RE.exec(all[i].text);
    if (m && m[1] === '1') {
      from = i;
      break;
    }
  }
  const lines = from >= 0 ? all.slice(from) : all;
  const log: SessionLog = { lines, started: from >= 0, playersSetUp: [], launched: [], pids: [], errors: [], monitors: [], startedAt: from >= 0 ? all[from].time : undefined };
  for (const l of lines) {
    const setup = SETUP_RE.exec(l.text);
    if (setup) log.playersSetUp.push(Number(setup[1]));
    const launch = /^Launching (?:exe(?: again)?|game via command prompt with the following line:|game using ForceBindIP command line argument:) (.+)$/.exec(l.text);
    if (launch) log.launched.push(launch[1].trim());
    const pids = /^PIDs stored ((?:\d+\s*)+)$/.exec(l.text);
    if (pids) log.pids = pids[1].trim().split(/\s+/).map(Number);
    const mon = /^Player monitor's resolution: (\d+) x (\d+)/.exec(l.text);
    if (mon) log.monitors.push({ width: Number(mon[1]), height: Number(mon[2]) });
    if (/^ERROR\b/.test(l.text) || /\bException\b.*:/.test(l.text)) log.errors.push({ text: l.text.replace(/^ERROR\s*-\s*/, ''), line: l.line });
  }
  return log;
}

export interface CrashLog {
  message: string;
  /** "Line 12" in Jint's message, when it gives one. */
  handlerLine?: number;
  stack?: string;
  version?: string;
}

/** A %APPDATA%\Nucleus Coop\<date>.log written by LogManager.LogExceptionFile. */
export function parseCrashLog(text: string): CrashLog | undefined {
  const sections = new Map<string, string[]>();
  let cur: string[] | undefined;
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const h = /^\[(\w+)\]\s*$/.exec(raw);
    if (h) {
      cur = [];
      sections.set(h[1], cur);
    } else cur?.push(raw);
  }
  const message = (sections.get('Message') ?? []).join('\n').trim();
  if (!message) return undefined;
  const header = sections.get('Header') ?? [];
  const line = /\bLine (\d+)\b/i.exec(message);
  return {
    message,
    handlerLine: line ? Number(line[1]) : undefined,
    stack: (sections.get('Stacktrace') ?? []).join('\n').trim() || undefined,
    version: header.map((l) => /^Nucleus Co-op v(.+)$/.exec(l.trim())?.[1]).find(Boolean),
  };
}

/** A game window as Windows reports it (src/verifywin.ts). */
export interface ObservedWindow {
  pid: number;
  title: string;
  rect: Rect;
  /** The monitor it's mostly on, as its bounds. */
  monitor?: Rect;
  visible?: boolean;
  minimized?: boolean;
}
export interface ObservedProcess {
  pid: number;
  name: string;
  /** When it started, ISO 8601. */
  started?: string;
}
export interface Observation {
  /** The game's program name the windows were looked for by (Game.ExecutableName, or the launcher's). */
  exe: string;
  processes: ObservedProcess[];
  windows: ObservedWindow[];
  /** Whether NucleusCoop.exe is still running. */
  nucleusRunning?: boolean;
}

export type FindingKind = 'log-error' | 'crash' | 'not-started' | 'players' | 'processes' | 'windows' | 'window-size' | 'window-place' | 'exited' | 'try-it';
export interface Finding {
  severity: 'error' | 'warning' | 'info';
  kind: FindingKind;
  /** 1-based player, when it's about one */
  player?: number;
  message: string;
  /** What to look at or change, in a sentence. */
  hint?: string;
  /** The handler line it points at, when one is known. */
  handlerLine?: number;
}

export interface VerifyInput {
  sim: SimResult;
  log?: SessionLog;
  crash?: CrashLog;
  seen?: Observation;
  /** How far a window may be off and still count as where Try it put it (borders, title bars). Default 24 px. */
  tolerance?: number;
}

export interface PlayerCheck {
  player: number;
  expected?: Rect;
  window?: ObservedWindow;
  ok: boolean;
}

export interface VerifyResult {
  ok: boolean;
  findings: Finding[];
  players: PlayerCheck[];
  /** What was looked at, so a report says what wasn't. */
  checked: { log: boolean; crash: boolean; windows: boolean };
  /** When the session it read started (the debug log's time), so an old one is noticed. */
  sessionStarted?: string;
}

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const size = (r: Rect) => `${r.width} × ${r.height}`;
const place = (r: Rect) => `at ${r.x}, ${r.y}`;
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/** Pairs each expected window with the nearest observed one (by the top-left corner), each used once. */
function pairWindows(expected: Rect[], windows: ObservedWindow[]): (ObservedWindow | undefined)[] {
  const free = [...windows];
  const out: (ObservedWindow | undefined)[] = [];
  for (const e of expected) {
    let best = -1;
    let bestD = Infinity;
    free.forEach((w, i) => {
      const d = Math.hypot(w.rect.x - e.x, w.rect.y - e.y) + Math.abs(w.rect.width - e.width) + Math.abs(w.rect.height - e.height);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    out.push(best >= 0 ? free.splice(best, 1)[0] : undefined);
  }
  return out;
}

/** Windows' coordinates are of the whole desktop; Try it's are of the player's monitor. */
function onMonitor(w: ObservedWindow): Rect {
  const m = w.monitor;
  return m ? { x: w.rect.x - m.x, y: w.rect.y - m.y, width: w.rect.width, height: w.rect.height } : w.rect;
}

/** The grid the windows tile their screen in (every window the same size, on a cols × rows grid), if they do. */
function gridOf(wins: ObservedWindow[], tol: number): { cols: number; rows: number } | undefined {
  if (!wins.length) return undefined;
  for (let rows = 1; rows <= 4; rows++)
    for (let cols = 1; cols <= 4; cols++) {
      // Each window fills one cell of its screen, and no two share a cell.
      const cells = new Set<string>();
      const fits = wins.every((w) => {
        const m = w.monitor;
        if (!m) return false;
        const r = onMonitor(w);
        const cw = m.width / cols;
        const ch = m.height / rows;
        const cx = Math.round(r.x / cw);
        const cy = Math.round(r.y / ch);
        const cell = `${m.x},${m.y}:${cx},${cy}`;
        if (cells.has(cell)) return false;
        cells.add(cell);
        return near(r.width, cw, tol) && near(r.height, ch, tol) && near(r.x, cx * cw, tol) && near(r.y, cy * ch, tol);
      });
      if (fits) return { cols, rows };
    }
  return undefined;
}
const gridWords = (g: { cols: number; rows: number }) => (g.cols === 1 && g.rows === 1 ? 'one window per screen' : g.rows === 1 ? 'side by side' : g.cols === 1 ? 'top and bottom' : `${g.cols} × ${g.rows}`);

export function verifySession(input: VerifyInput): VerifyResult {
  const { sim, log, crash, seen } = input;
  const tol = input.tolerance ?? 24;
  const findings: Finding[] = [];
  const add = (f: Finding) => findings.push(f);

  if (!sim.loaded) add({ severity: 'error', kind: 'try-it', message: `Try it can't load the handler: ${sim.loadError ?? 'it fails to load'}.`, hint: 'Fix that first (ncdev lint, ncdev simulate): Nucleus would fail the same way.' });
  for (const p of sim.players) if (p.error) add({ severity: 'warning', kind: 'try-it', player: p.index + 1, message: `Try it predicts Game.Play fails for player ${p.index + 1}: ${p.error}` });

  if (crash) {
    add({
      severity: 'error',
      kind: 'crash',
      message: `Nucleus stopped the session: ${crash.message.split('\n')[0]}`,
      hint: crash.handlerLine ? `Look at line ${crash.handlerLine} of the handler.` : 'The message is from Nucleus\' error window ("Something went wrong"); the handler code that ran last is the place to start.',
      handlerLine: crash.handlerLine,
    });
  }

  const expected = sim.players.map((p) => p.rect).filter((r): r is Rect => !!r);
  const players: PlayerCheck[] = sim.players.map((p) => ({ player: p.index + 1, expected: p.rect, ok: true }));

  if (log) {
    if (!log.started) add({ severity: 'error', kind: 'not-started', message: 'The debug log has no session in it: Nucleus never set up a player.', hint: 'Pick the players in Nucleus and press Play, then run verify again. If you did, check that the debug log is on (ncdev test --debug-log on).' });
    else {
      const n = new Set(log.playersSetUp).size;
      if (n !== sim.playerCount) add({ severity: 'info', kind: 'players', message: `Nucleus set up ${plural(n, 'player')}; Try it was run for ${sim.playerCount}.`, hint: `Run verify with --players ${n} to compare the same session.` });
      for (const e of log.errors) add({ severity: 'warning', kind: 'log-error', message: `Nucleus logged an error: ${e.text}`, hint: `debug-log.txt line ${e.line}.` });
      if (log.pids.length && log.pids.length < n) add({ severity: 'warning', kind: 'processes', message: `Nucleus stored ${plural(log.pids.length, 'process id')} for ${plural(n, 'player')}.`, hint: 'An instance may not have started, or Nucleus lost it (a launcher that starts the game and exits: see Game.LauncherExe and Game.ForceProcessSearch).' });
    }
  }

  if (seen) {
    const gamePids = new Set(seen.processes.map((p) => p.pid));
    const wins = seen.windows.filter((w) => gamePids.has(w.pid) && w.visible !== false && w.rect.width > 1 && w.rect.height > 1);
    if (!seen.processes.length) add({ severity: 'error', kind: 'processes', message: `No ${seen.exe} is running.`, hint: log?.launched.length ? `Nucleus launched ${log.launched[log.launched.length - 1]}; the game closed or crashed. Check its own log, and Game.ExecutableName.` : 'Start the session in Nucleus first, or check Game.ExecutableName.' });
    else if (seen.processes.length !== sim.players.length) add({ severity: 'warning', kind: 'processes', message: `${plural(seen.processes.length, `${seen.exe} is`, `copies of ${seen.exe} are`)} running for ${plural(sim.players.length, 'player')}.`, hint: seen.processes.length < sim.players.length ? 'An instance closed or never started: the game may allow only one copy (Game.KillMutex) or need its own folder (Game.SymlinkGame / Game.HardcopyGame).' : 'Copies from an earlier session may still be open.' });
    if (seen.processes.length && wins.length < expected.length) add({ severity: 'warning', kind: 'windows', message: `Found ${plural(wins.length, 'game window')} for ${plural(expected.length, 'player')}.`, hint: 'A window may still be loading, or the game draws in a window Windows doesn\'t list for its process.' });
    // Nucleus splits the screen the way the player picked (side by side, top and bottom, one per screen); Try it
    // assumes side by side. Windows that tile their screen in another split are that choice, not a problem.
    const tried = sim.players.length ? { cols: Math.min(2, sim.players.length), rows: Math.ceil(sim.players.length / Math.min(2, sim.players.length)) } : undefined;
    const grid = wins.length === expected.length ? gridOf(wins, tol) : undefined;
    const otherLayout = grid && tried && (grid.cols !== tried.cols || grid.rows !== tried.rows);
    if (otherLayout) add({ severity: 'info', kind: 'players', message: `Nucleus split the screen ${gridWords(grid!)}; Try it assumed ${gridWords(tried!)}. Each window fills its part, so the sizes are what that layout gives.` });
    const pairs = pairWindows(expected, wins);
    pairs.forEach((w, i) => {
      const e = expected[i];
      const pc = players[i];
      pc.window = w;
      if (!w) {
        pc.ok = false;
        return;
      }
      const r = onMonitor(w);
      if (otherLayout && !w.minimized) return;
      if (w.minimized) {
        pc.ok = false;
        add({ severity: 'warning', kind: 'window-size', player: i + 1, message: `Player ${i + 1}'s window is minimized.`, hint: 'The game minimizes itself when it loses focus: see Game.SetForegroundWindowElsewhere and the fake focus options.' });
        return;
      }
      if (!near(r.width, e.width, tol) || !near(r.height, e.height, tol)) {
        pc.ok = false;
        const full = w.monitor && near(r.width, w.monitor.width, tol) && near(r.height, w.monitor.height, tol);
        add({
          severity: 'warning',
          kind: 'window-size',
          player: i + 1,
          message: `Player ${i + 1}'s window is ${size(r)}; Try it expected ${size(e)}.`,
          hint: full ? 'It covers the whole screen: the game may run fullscreen (set windowed in its config, or Game.SetWindowHook / Game.ResetWindows).' : 'The game may resize its own window after Nucleus sets it: try Game.KeepAspectRatio off, Game.SetWindowHook or Game.ResetWindows.',
        });
      } else if (!near(r.x, e.x, tol) || !near(r.y, e.y, tol)) {
        pc.ok = false;
        add({ severity: 'warning', kind: 'window-place', player: i + 1, message: `Player ${i + 1}'s window is ${place(r)}; Try it expected ${place(e)}.`, hint: 'The game may move its window after Nucleus places it: Game.SetWindowHook or Game.ResetWindows keep it in place.' });
      }
    });
    for (let i = pairs.length; i < players.length; i++) players[i].ok = false;
  }

  for (const pc of players) if (!pc.window && seen) pc.ok = false;
  // Nothing to look at is not a match.
  if (!log && !seen && !crash) add({ severity: 'error', kind: 'not-started', message: "There was nothing to compare: no debug log and no game windows.", hint: "Turn the debug log on (ncdev test --debug-log on), start the session, and run verify on the PC it runs on." });
  return { ok: !findings.some((f) => f.severity !== 'info'), findings, players, checked: { log: !!log, crash: !!crash, windows: !!seen }, sessionStarted: log?.startedAt };
}

export function formatVerify(r: VerifyResult): string {
  const out: string[] = [];
  if (r.sessionStarted) out.push(`Session started ${r.sessionStarted} (the newest in the debug log).`);
  out.push(r.ok ? 'The session matches Try it.' : `The session differs from Try it: ${plural(r.findings.filter((f) => f.severity !== 'info').length, 'problem')}.`);
  for (const p of r.players) {
    const got = p.window ? `${size(onMonitor(p.window))} ${place(onMonitor(p.window))}` : r.checked.windows ? 'no window found' : 'not checked';
    out.push(`  Player ${p.player}: ${p.ok ? 'ok' : 'differs'}  expected ${p.expected ? `${size(p.expected)} ${place(p.expected)}` : '?'}, found ${got}`);
  }
  if (r.findings.length) out.push('');
  for (const f of r.findings) {
    out.push(`${f.severity.padEnd(8)} ${f.message}`);
    if (f.hint) out.push(`         ${f.hint}`);
  }
  const skipped = [!r.checked.log && 'the debug log (turn it on: ncdev test --debug-log on)', !r.checked.windows && 'the game windows (only on Windows, with the session running)'].filter(Boolean);
  if (skipped.length) out.push('', `Not checked: ${skipped.join('; ')}.`);
  out.push('', 'Still for a person: whether each window gets its own input, and whether the game plays well.');
  return out.join('\n');
}
