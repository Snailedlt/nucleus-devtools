// Learn (learn/): chapters of short lessons, one new thing at a time. Every lesson is curated: its starting code is
// written here (often the last lesson's solution, but always the author's choice, never the learner's attempt).
// A code lesson shows what to add in a code block, has a task, and a check that reads the real problems (core lint)
// and what Try it says each player gets (core sim): done when check() returns null; otherwise it says what's missing.
// Pure: no DOM (learn.ts draws it); tools/workbench-units.test.mjs checks every lesson both ways.
//
// The first chapter builds the verified Hub handler for Boring Man - Online Tactical Stickman Combat (free on Steam;
// Im_awesome04's) line by line. The finished handler does exactly what that one does; only its name differs, so it
// never replaces the Hub one for someone who has both.
import { lint, type Diagnostic } from '@core/lint';
import { inProblemList } from '../checklist';
import { simulate, type SimResult } from '@core/sim';

export type NoteKind = 'pitfall' | 'why' | 'alt' | 'odd' | 'check' | 'try';
/** `answer`: for a 'try' note, what happens and why, folded away until the learner opens it. */
export interface Note { kind: NoteKind; text: string; answer?: string; unverified?: boolean }
/** A tip or a fix in a step's *Not working?* list. `unverified`: nobody has checked it on a real PC yet (it comes from
 *  the docs or experience elsewhere): it gets a small "Different for you? Tell us" that opens a report. */
export type Tip = string | { text: string; unverified?: boolean };
export const tipText = (t: Tip) => (typeof t === 'string' ? t : t.text);
export const isUnverified = (t: Tip) => typeof t !== 'string' && !!t.unverified;
/** A step done on the learner's PC: what to do, what they should see then, and a few fixes (folded) if they don't.
 *  `optional`: who it's for ("With controllers"), shown as a tag; the steps after it work without it. */
export type Step = string | { text: string; see?: string; trouble?: Tip[]; optional?: string };
/** One part of a lesson's task, counted in the task line ("Task: 1 of 2 lines"). */
export interface Goal { label: string; ok(text: string): boolean }

export interface Lesson {
  /** Part of the lesson's link (learn/#<chapter>/<id>): never change it once published. */
  id: string;
  title: string;
  /** The part of the chapter it belongs to (the lesson list's middle level). */
  section: string;
  /** code: a task in the editor. intro: the interactive scene (the whole page). setup: steps, the whole page.
   *  test: steps in Nucleus Co-op, with the handler beside them. */
  kind: 'code' | 'intro' | 'setup' | 'test';
  /**
   * Short paragraphs; `code`, **bold** and [links](https://…) are shown as such. A paragraph that starts with ```js
   * is a code block: lines that start with "+ " are the ones to add (highlighted), "…" stands for code left out.
   */
  text: string[];
  /** Pitfalls, odd results, other ways, why this way: only where they help. Nucleus-specific, not general JS. */
  notes?: Note[];
  /** What to do, in one sentence (code lessons). */
  task?: string;
  /** The code the lesson starts from (and Reset goes back to). */
  start: string;
  /** The Show me button fills this in; the next lesson usually starts from it. */
  solution: string;
  check?(text: string): string | null;
  /** The one result pane this lesson shows under the code. */
  pane?: 'check' | 'tryit';
  /** About how long it takes, in minutes (the chapter overview lists it). */
  minutes: number;
  /** A setup lesson that is the chapter's overview: what you'll build, the steps you need first, the lessons. */
  overview?: boolean;
  /** The parts of the task, for the task line in Check and Try it; check() still decides when it's done. */
  goals?: Goal[];
  /** What a goal counts: "lines", "mistakes"… */
  unit?: string;
  /** The Hint button's text, where the one made from check()'s message and the lesson's empty section isn't good.
   *  `false`: no Hint button, `true`: one even though the lesson shows its code (hasHint decides otherwise). */
  hint?: string | boolean;
  /** test and setup lessons: the steps, and what to download. */
  steps?: Step[];
  /** A small print line under the steps. */
  footnote?: string;
  download?: 'js' | 'zip';
  /** Checks (rule ids) Check leaves out in this lesson: about lines a lesson soon adds. */
  allow?: string[];
  /** Once the task is done: "Try it in Nucleus Co-op now" (folded), with the code so far to download, what to do
   *  and what you should see. Working code early, as often as a handler allows. */
  checkpoint?: { download: 'js' | 'zip'; steps: string[]; see: string };
  /** More paragraphs (like `text`) after the steps and the download. */
  after?: string[];
  /** test lessons: "what did you see?" and where each answer leads. */
  ask?: { question: string; answers: { label: string; reply: string }[] };
  /**
   * A lesson the chapter works without (marked optional in the lesson list and the overview, its minutes apart).
   * `skip`: the button that goes past it in one click; `invite`: one line asking those it's for to do it. The next
   * lesson's starting code must load and pass Check whether or not the learner did it (tests check that).
   */
  optional?: { skip: string; invite: string };
}

export interface Chapter {
  /** The chapter's part of every link (learn/#<id>/<lesson>). Defined here only: everything else reads it from
   *  CHAPTERS. To rename it, change it here and put the old one in `formerIds`, so published links keep working. */
  id: string;
  /** Ids this chapter had before: links with them still open it. */
  formerIds?: string[];
  title: string;
  blurb: string;
  /** What you'll build: the overview lesson's first paragraph. */
  build: string;
  /** The handler's file name in this chapter (its GameName): downloads and the code bar. */
  fileName: string;
  /** The card at the end of the chapter's last lesson. */
  end: { title: string; text: string };
  lessons: Lesson[];
}

// ---------------------------------------------------------------------------------------------------------------
// Checks

const noComments = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'\\])\/\/[^\n]*/g, '$1');
const pathRe = (path: string) => path.replace(/\./g, '\\s*\\.\\s*');
/** The raw value text of `path = value;` at the top level, or undefined. */
function valueOf(t: string, path: string): string | undefined {
  const m = new RegExp(`^\\s*${pathRe(path)}\\s*=\\s*([\\s\\S]*?);?\\s*$`, 'm').exec(noComments(t));
  return m ? m[1].trim() : undefined;
}
const isTrue = (t: string, path: string) => valueOf(t, path) === 'true';
const isFalse = (t: string, path: string) => valueOf(t, path) === 'false';
const str = (t: string, path: string) => /^"((?:[^"\\]|\\.)*)"$/.exec(valueOf(t, path) ?? '')?.[1];
const num = (t: string, path: string) => { const v = valueOf(t, path); return v && /^\d+$/.test(v) ? Number(v) : undefined; };
/** The strings in a `path = [ … ];` list (it may span lines). */
function listOf(t: string, path: string): string[] | undefined {
  const m = new RegExp(`^\\s*${pathRe(path)}\\s*=\\s*\\[([\\s\\S]*?)\\]`, 'm').exec(noComments(t));
  return m ? [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]) : undefined;
}
/** The problems Check shows in a lesson: errors and warnings, minus the ones about lines a lesson soon adds. */
export const problems = (text: string, l?: Lesson): Diagnostic[] => lint(text).filter((d) => (d.severity === 'error' || d.severity === 'warning') && !(l?.allow ?? []).includes(d.rule));
/** What Check lists: the workbench's list (checklist.ts), so infos too (`"true"` where `true` belongs). Only errors and
 *  warnings (problems) stand in the way of finishing a lesson. */
export const listed = (text: string, l?: Lesson): Diagnostic[] => lint(text).filter((d) => inProblemList(d) && !(l?.allow ?? []).includes(d.rule));
export const errors = (text: string) => lint(text).filter((d) => d.severity === 'error');
const firstProblem = (t: string, l?: Lesson) => { const e = problems(t, l)[0]; return e ? `Check shows a problem on line ${t.slice(0, e.start).split('\n').length}: ${e.message}` : null; };
type Want = [string, string | number | string[]];
const wantOk = (t: string, [p, v]: Want) => (Array.isArray(v) ? v.every((x) => (listOf(t, p) ?? []).map((f) => f.toLowerCase()).includes(x.toLowerCase())) : v === 'true' ? isTrue(t, p) : v === 'false' ? isFalse(t, p) : typeof v === 'number' ? num(t, p) === v : str(t, p) === v);
const show = ([p, v]: Want) => `${p} = ${Array.isArray(v) ? JSON.stringify(v).replace(/,/g, ', ') : typeof v === 'string' && v !== 'true' && v !== 'false' ? `"${v}"` : v};`;
/** Several `path = value` checks ('true'/'false' are the booleans): null when all hold, else what's still to do. */
function wants(t: string, list: Want[]): string | null {
  const ok = (w: Want) => wantOk(t, w);
  const miss = list.filter((w) => !ok(w));
  if (!miss.length) return firstProblem(t);
  // A line that's there with another value ("20" in quotes, a typo) says what to change, not that it's missing.
  const there = (p: string) => new RegExp(`^\\s*${pathRe(p)}\\s*=`, 'm').test(noComments(t));
  const add = miss.filter(([p]) => !there(p)), change = miss.filter(([p]) => there(p));
  return [add.length ? `Still to add: ${add.map(show).join(' ')}` : '', change.length ? `Not quite yet: make it ${change.map(show).join(' ')}` : ''].filter(Boolean).join(' ');
}
/** A lesson's check and goals from `path = value` lines: one goal per line. */
const want = (list: Want[]): Pick<Lesson, 'check' | 'goals' | 'unit'> => ({
  check: (t) => wants(t, list),
  goals: list.map((w) => ({ label: show(w), ok: (t: string) => wantOk(t, w) })),
  unit: list.length === 1 ? 'line' : 'lines',
});
/** Where the task is: how many goals are met, or null for a lesson without goals. */
export function progress(l: Lesson, text: string): { done: number; total: number; unit: string } | null {
  if (!l.goals?.length) return null;
  return { done: l.goals.filter((g) => g.ok(text)).length, total: l.goals.length, unit: l.unit ?? 'steps' };
}
/** Where a lesson's new lines go: the comment that heads the empty part of its starting code (`// The game` with
 *  nothing under it yet), else its last comment; with the line it's on now. */
function whereOf(l: Lesson, text: string): string {
  const comments = [...l.start.matchAll(/^\/\/[^\n]*$/gm)].map((m) => ({ c: m[0], empty: /^\n?(\n|$)/.test(l.start.slice(m.index! + m[0].length + 1)) }));
  const pick = comments.find((x) => x.empty) ?? comments.filter((x) => !/^\/\/ .*Tutorial:/.test(x.c)).pop();
  if (!pick) return '';
  const line = text.split('\n').findIndex((x) => x.trim() === pick.c) + 1;
  return `Where: under \`${pick.c}\`${line ? ` (line ${line})` : ''}.`;
}
/** The lines a lesson's text gives to copy: its ```js blocks' lines to add ("+ "), or a whole block without any (as
 *  learn.ts para() copies them); a diff with lines left out ("- ") has nothing to copy. */
export function copyLines(l: Lesson): string[] {
  const out: string[] = [];
  for (const p of l.text) {
    const m = /^```\w*\n([\s\S]*?)\n?```$/.exec(p.trim());
    if (!m) continue;
    const raw = m[1].split('\n');
    if (raw.some((x) => x.startsWith('- '))) continue;
    const adds = raw.filter((x) => x.startsWith('+ ')).map((x) => x.slice(2));
    out.push(...(adds.length ? adds : raw).map((x) => x.trim()).filter((x) => x && x !== '…'));
  }
  return out;
}
/** Whether a code lesson has a Hint. Not where the text already shows the code to add as a block to copy (every line
 *  the solution adds is in it): there the lesson is the hint, and Show me is still there. Only where the learner has
 *  to work something out (fix-its, tasks in words). `hint: false` / `true` overrides it. */
export function hasHint(l: Lesson): boolean {
  if (l.kind !== 'code') return false;
  if (typeof l.hint === 'boolean') return l.hint;
  const start = new Set(l.start.split('\n').map((x) => x.trim()));
  const added = l.solution.split('\n').map((x) => x.trim()).filter((x) => x && !start.has(x));
  if (!added.length) return true;
  const copy = new Set(copyLines(l));
  return !added.every((x) => copy.has(x));
}
/** The Hint button: what the lesson's check says is still missing or wrong, and where to look. Empty once done. */
export function hintFor(l: Lesson, text: string): string {
  const miss = l.check?.(text) ?? null;
  if (miss === null) return '';
  // A problem in the code comes first, whatever the lesson's own hint says.
  if (/^Check shows a problem on line/.test(miss)) return `${miss.replace(/([^.!?;])$/, '$1.')} Hover the marked code for what's wrong, and Ctrl+. for a fix.`;
  if (typeof l.hint === 'string') return l.hint;
  return [miss.replace(/([^.!?;])$/, '$1.'), whereOf(l, text)].filter(Boolean).join(' ');
}
/** Try it: `players` players, the first on the keyboard (or none). */
export const run = (text: string, players = 2, keyboard = true): SimResult => simulate(text, { players, width: 1920, height: 1080, keyboardPlayer: keyboard ? 0 : -1 });
/** The INI keys a player's Game.Play writes with ModifySaveFile, as `file: [Section] Key = value`. */
export function iniWrites(r: SimResult, player: number): string[] {
  const out: string[] = [];
  for (const c of r.players[player]?.calls ?? []) {
    const f = /^Context\.ModifySaveFile\("((?:[^"\\]|\\.)*)"/.exec(c);
    if (!f) continue;
    const file = f[1].split(/\\\\|\//).pop();
    for (const m of c.matchAll(/IniSaveInfo\("([^"]*)", "([^"]*)", "((?:[^"\\]|\\.)*)"\)/g)) out.push(`${file}: [${m[1]}] ${m[2]} = ${m[3].replace(/\\"/g, '"')}`);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Chapter 1: Making your first handler (Boring Man)

/** A code block for the lesson text: `before` as context, `added` marked as the lines to add, `after` below. */
const block = (added: string, before = '', after = '') => '```js\n' + [before && before.replace(/\n$/, ''), added.replace(/^\n|\n$/g, '').split('\n').map((l) => `+ ${l}`).join('\n'), after && after.replace(/\n$/, '')].filter(Boolean).join('\n') + '\n```';
const lastLine = (s: string) => s.replace(/\n$/, '').split('\n').pop()!;

const TOP = '// Boring Man Tutorial: a handler for Boring Man - Online Tactical Stickman Combat (free on Steam)\n';
const NAME_L = 'Game.GUID = "Boring Man Tutorial";\nGame.GameName = "Boring Man Tutorial";\n';
const DESCRIPTION_L = 'Game.Description = "Host a game in one instance and join in the others via direct connect. Press CTRL+T twice if an instance is behind the windows taskbar.";\n';
const DESCRIPTION = '\n// What players read before they start\n' + DESCRIPTION_L;
const GAME_L = 'Game.ExecutableName = "BoringManGame.exe";\nGame.MaxPlayers = 20;\n';
const GAME = '\n// The game\n' + GAME_L;
const FOLDERS_L = 'Game.SymlinkGame = true;\n';
const COPY_L = 'Game.FileSymlinkCopyInstead = ["options.ini"];\n';
const FOLDERS = '\n// A folder for each player\n' + FOLDERS_L + COPY_L;
const ENV_L = 'Game.UseNucleusEnvironment = true;\nGame.UserProfileConfigPath = "AppData\\\\Local\\\\BoringManRewrite";\n';
const ENV = '\n// Each player\'s own settings folder\n' + ENV_L;
const STEAM_L = 'Game.UseGoldberg = true;\nGame.SteamID = "346120";\n';
const STEAM = '\n// Steam\n' + STEAM_L;
const WINDOWS_L = 'Game.Hook.ForceFocusWindowName = "Boring Man";\nGame.ResetWindows = true;\nGame.SetWindowHook = true;\nGame.RefreshWindowAfterStart = true;\n';
const WINDOWS = '\n// The windows\n' + WINDOWS_L;
const FOCUS_L = 'Game.HookFocus = true;\n';
const FOCUS = '\n// Every window in focus\n' + FOCUS_L;
const TIMING_L = 'Game.PauseBetweenStarts = 25;\nGame.HandlerInterval = 100;\n';
const TIMING = '\n// Timing\n' + TIMING_L;
const INPUT_L = 'Game.SupportsKeyboard = true;\nGame.Hook.XInputEnabled = true;\nGame.Hook.CustomDllEnabled = false;\n';
const INPUT = '\n// Controllers and keyboard\n' + INPUT_L;
const ONE_PAD_L = 'Game.XInputPlusDll = ["xinput1_3.dll"];\nGame.UseDInputBlocker = true;\n';
const EXCLUDE_L = 'Game.FileSymlinkExclusions = ["steam_api.dll", "steam_appid.txt", "dinput8.dll", "xinput1_3.dll"];\n';
const EXCLUDE = '\n// Files Nucleus puts in each copy itself\n' + EXCLUDE_L;
const PLAY_PATH = '  var VideoConfig = Context.EnvironmentPlayer + Context.UserProfileConfigPath + "\\\\bm_settings.ini";\n';
const PLAY_MODIFY = '  Context.ModifySaveFile(VideoConfig, VideoConfig, Nucleus.SaveType.INI, [\n    new Nucleus.IniSaveInfo("Video", "Fullscreen", \'"0"\')\n  ]);\n';
const PLAY_START = '\n// Each player\'s settings\nGame.Play = function () {\n' + PLAY_PATH;
const PLAY = PLAY_START + PLAY_MODIFY + '};\n';

/** The handler after each lesson, in order. */
const S: Record<string, string> = {};
S.name = TOP + NAME_L;
S.game = S.name + GAME;
S.folders = S.game + FOLDERS;
S.environment = S.folders + ENV;
S.steam = S.environment + STEAM;
S.windows = S.steam + WINDOWS;
S.focus = S.windows + FOCUS;
S.timing = S.focus + TIMING;
S.input = S.timing + INPUT;
S.pads = S.input + ONE_PAD_L;
S.exclusions = S.pads + EXCLUDE;
S.description = TOP + NAME_L + DESCRIPTION + S.exclusions.slice((TOP + NAME_L).length);
/** The finished handler: what the verified Hub handler does, without the lines that change nothing. */
export const FINAL = S.description + PLAY;
S.play = S.description + PLAY_START + '};\n';
/** What the first full test runs: everything but Game.Play (the windows are full screen: the next lesson's bug). */
const FIRST_TEST = S.description;

/** The verified Hub handler as it was uploaded (its Hub.* lines left out), for the diff at the end. */
const HUB_HANDLER = "Game.ExecutableContext = [\"maps\"];\nGame.FileSymlinkExclusions = [\"steam_api.dll\", \"steam_appid.txt\", \"dinput8.dll\", \"xinput1_3.dll\"];\nGame.FileSymlinkCopyInstead = [\"options.ini\"];\nGame.UseNucleusEnvironment = true;\nGame.UseGoldberg = true;\nGame.HandlerInterval = 100;\nGame.SymlinkExe = false;\nGame.SymlinkGame = true;\nGame.SupportsKeyboard = true;\nGame.ExecutableName = \"BoringManGame.exe\";\nGame.SteamID = \"346120\";\nGame.GUID = \"Boring Man\";\nGame.GameName = \"Boring Man - Online Tactical Stickman Combat\";\nGame.MaxPlayers = 20;\nGame.MaxPlayersOneMonitor = 20;\nGame.LauncherTitle = \"\";\nGame.HideTaskbar = false;\nGame.StartArguments = \"\";\nGame.Hook.ForceFocusWindowName = \"Boring Man\";\nGame.HookFocus = true;\nGame.SetWindowHook = true;\nGame.RefreshWindowAfterStart = true;\nGame.ResetWindows = true;\nGame.Hook.DInputEnabled = false;\nGame.UseDInputBlocker = true;\nGame.Hook.XInputEnabled = true;\nGame.Hook.XInputReroute = false;\nGame.Hook.CustomDllEnabled = false;\nGame.XInputPlusDll = [\"xinput1_3.dll\"];\nGame.Description = \"Host a game in one instance and join in the others via direct connect. Press CTRL+T twice if an instance is behind the windows taskbar.\";\nGame.UserProfileConfigPath = \"AppData\\\\Local\\\\BoringManRewrite\";\nGame.KeepSymLinkOnExit = false;\nGame.PauseBetweenStarts = 25;\n\nGame.Play = function() {\n  var VideoConfig = Context.EnvironmentPlayer + Context.UserProfileConfigPath + \"\\\\bm_settings.ini\";\n  Context.ModifySaveFile(VideoConfig, VideoConfig, Nucleus.SaveType.INI, [\n    new Nucleus.IniSaveInfo(\"Video\", \"Fullscreen\", '\"0\"')\n    //new Nucleus.IniSaveInfo(\"Resolution\", \"Fullscreen\", '\"11\"'),\n  ]);\n};\n";
/** Why each line the tutorial leaves out can go (from the Nucleus source). */
const DROPPED: [RegExp, string][] = [
  [/ExecutableContext/, 'only tells games with the same .exe name apart, and no other handler uses `BoringManGame.exe`'],
  [/MaxPlayersOneMonitor/, 'Nucleus never reads it'],
  [/LauncherTitle|StartArguments/, 'empty is what Nucleus does anyway'],
  [/SymlinkExe|KeepSymLinkOnExit|HideTaskbar|XInputReroute|DInputEnabled/, 'false is the default'],
  [/^\s*\/\//, 'a comment'],
];
const norm = (l: string) => l.replace(/\s+/g, '').replace(/;$/, '');
/** The Hub handler against the tutorial's: "- " lines it drops, "+ " lines it adds, the rest folded into "…". */
function hubDiff(): string {
  const mine = new Set(FINAL.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//')).map(norm));
  const out: string[] = [];
  let same = 0;
  const flush = () => { if (same) out.push('…'); same = 0; };
  for (const l of HUB_HANDLER.replace(/\n$/, '').split('\n')) {
    if (!l.trim()) continue;
    if (mine.has(norm(l)) || /^(Game\.Play\s*=\s*function|\s*\}\s*;?\s*$|\s*\]\);?$|\s*Context\.ModifySaveFile|\s*new Nucleus\.IniSaveInfo|\s*var VideoConfig)/.test(l)) { same++; continue; }
    flush();
    out.push(`- ${l}`);
    if (/^Game\.(GUID|GameName)\s*=/.test(l)) out.push(`+ ${FINAL.split('\n').find((x) => x.startsWith(l.split('=')[0].trim() + ' ='))}`);
  }
  flush();
  return '```js\n' + out.join('\n') + '\n```';
}
/** The left-out lines, grouped by why: "`SymlinkExe`, `HideTaskbar`…: false is the default". */
function droppedNotes(): string[] {
  const by = new Map<string, string[]>();
  for (const l of HUB_HANDLER.split('\n')) {
    const hit = l.trim() && DROPPED.find(([re]) => re.test(l));
    if (!hit) continue;
    const name = /^\s*\/\//.test(l) ? 'a commented-out line' : `\`${(/Game\.([\w.]+)/.exec(l) ?? ['', l.trim()])[1]}\``;
    by.set(hit[1], [...(by.get(hit[1]) ?? []), name]);
  }
  return [...by].map(([why, names]) => `${names.join(', ')}: ${why}`);
}

const STEAM_STORE = 'https://store.steampowered.com/app/346120/';
const INSTALL = 'https://www.splitscreen.me/docs/installation';
const USAGE = 'https://www.splitscreen.me/docs/usage';

const FIRST: Lesson[] = [
  {
    id: 'why',
    section: 'Getting started',
    title: 'Why a handler?',
    kind: 'intro',
    minutes: 2,
    text: [
      'Nucleus Co-op lets several people play a game on one PC, each in their own window, even when the game was made for one player. It does that by starting **one copy of the game per player**.',
    ],
    start: '',
    solution: '',
  },
  {
    id: 'get-ready',
    section: 'Getting started',
    title: 'Overview',
    kind: 'setup',
    minutes: 10,
    overview: true,
    text: [
      'You\'ll test your handler in Nucleus Co-op as you go, so get the app and the game first. You need a Windows PC. (Only reading along? Skip this: everything else runs in your browser.)',
      'The game is **Boring Man - Online Tactical Stickman Combat**: a free 2D shooter on Steam, light enough for any PC, with keyboard or controllers.',
    ],
    steps: [
      { text: 'Get Nucleus Co-op if you don\'t have it yet: follow the [installation guide](' + INSTALL + ').', see: 'Nucleus Co-op opens, with its list of games.', trouble: ['Windows or your antivirus stops it, or deletes a file: the installation guide\'s step for Microsoft Defender\'s exclusions.'] },
      { text: 'Get Boring Man on [its Steam page](' + STEAM_STORE + ') (free: **Play Game**) and let Steam install it.', see: 'Boring Man in your Steam library, ready to play.' },
      { text: 'Start Boring Man once from Steam, then quit. That makes its settings, which Nucleus copies for each player later.', see: 'The game\'s menu. Quit from there.' },
      { text: 'Find its folder for later: in Steam, right-click Boring Man › **Manage** › **Browse local files**.', see: '`BoringManGame.exe` among the files.' },
    ],
    footnote: 'New to Nucleus Co-op? Play a game with it first, with a ready-made handler: [how to use it](' + USAGE + '). Making a handler is much easier once you\'ve seen what Nucleus does.',
    start: '',
    solution: '',
  },
  {
    id: 'name',
    section: 'The game',
    title: 'Give it a name',
    kind: 'code',
    minutes: 3,
    text: [
      'A handler is a small JavaScript file. Each line tells Nucleus one thing about the game, mostly by setting something on `Game`. You\'ll write the whole handler on the right, a few lines at a time.',
      'Start with its name. `Game.GUID` is the name of the folder Nucleus keeps this game\'s copies in, and `Game.GameName` is what you see in Nucleus\' list. Add these two lines under the comment:',
      block(NAME_L, TOP.trim()),
    ],
    task: 'Add the two lines. Type them: suggestions pop up as you go, and Tab or Enter takes one.',
    hint: 'Click the empty line under the comment on line 1 and type the name line from the code block on the left: `Game.GUID = `, the name in double quotes, then `;`. The second line is the same with `Game.GameName`; both names are `"Boring Man Tutorial"`.',
    notes: [
      { kind: 'why', text: 'The GUID becomes a folder: `Nucleus Co-op\\content\\Boring Man Tutorial`. Keep it to letters, numbers and spaces, and don\'t change it later: a new GUID is a new folder, and Nucleus starts over.' },
      { kind: 'pitfall', text: 'Give each handler a GUID of its own. When two handlers have the same GUID, Nucleus keeps only the one it reads last, so the other disappears from its list. The Boring Man handler on the Hub uses `"Boring Man"`, so `"Boring Man Tutorial"` lets you install both side by side.' },
    ],
    start: TOP + '\n',
    solution: S.name,
    allow: ['missing-required'],
    check: (t) => (str(t, 'Game.GUID') && str(t, 'Game.GameName') ? null : 'Both need a name in quotes, like Game.GUID = "Boring Man Tutorial";'),
    goals: [{ label: 'Game.GUID', ok: (t) => !!str(t, 'Game.GUID') }, { label: 'Game.GameName', ok: (t) => !!str(t, 'Game.GameName') }],
    unit: 'lines',
    pane: 'check',
  },
  {
    id: 'game',
    section: 'The game',
    title: 'Point it at the game',
    kind: 'code',
    minutes: 3,
    text: [
      'Nucleus needs the game\'s program. When you add a game, it looks for the file in `Game.ExecutableName`: Boring Man\'s is `BoringManGame.exe`.',
      '`Game.MaxPlayers` is how many players Nucleus lets you add. Boring Man is light enough for lots: the tested handler allows 20.',
      block(GAME_L, lastLine(S.name) + '\n\n// The game'),
    ],
    task: 'Add the two lines under `// The game`.',
    hint: 'Under `// The game`, say which program to start and how many players Nucleus may add. `Game.ExecutableName` takes the file name as text in quotes (`"BoringManGame.exe"`, as in the game\'s folder); `Game.MaxPlayers` takes a plain number without quotes: 20.',
    notes: [
      { kind: 'check', text: 'Check, under the code, lists what Nucleus would refuse. A handler needs `GUID`, `GameName` and `ExecutableName` to load at all, so Check waits until this lesson is done before it asks for them.' },
      {
        kind: 'try',
        text: 'Once the lesson is done, put the number in quotes: `Game.MaxPlayers = "20";`. What does Check say? Then take the quotes away again.',
        answer: 'Check warns that `Game.MaxPlayers` expects a number, not the string `"20"`, and offers to fix it. In quotes, `"20"` is text, even though it looks like a number. Nucleus wants a number here, so write it without quotes. Text goes in quotes (`"BoringManGame.exe"`); numbers and `true`/`false` don\'t.',
      },
      { kind: 'why', text: 'Other handlers often have `Game.ExecutableContext`, `LauncherTitle = ""` or `StartArguments = ""` here. Boring Man doesn\'t need them: the last lesson shows what this handler leaves out, and why.' },
    ],
    start: S.name + '\n// The game\n',
    solution: S.game,
    allow: ['missing-required'],
    ...want([['Game.ExecutableName', 'BoringManGame.exe'], ['Game.MaxPlayers', 20]]),
    pane: 'check',
    checkpoint: {
      download: 'zip',
      steps: [
        'Download your handler (the button below): `Boring Man Tutorial.zip`, zipped the way Nucleus installs it.',
        'Drag the zip onto Nucleus Co-op\'s window. When it asks to add the game, say yes and pick `BoringManGame.exe` in the folder from "Get ready".',
      ],
      see: '**Boring Man Tutorial** in Nucleus\' list, with the game found. Don\'t start it yet: the copies would get in each other\'s way. The next lessons sort that out.',
    },
  },
  {
    id: 'folders',
    section: 'Each player\'s copy',
    title: 'A folder for each player',
    kind: 'code',
    minutes: 3,
    text: [
      'Two copies of a game in one folder get in each other\'s way. So Nucleus gives each player a folder of their own: `content\\Boring Man Tutorial\\Instance0`, `Instance1`, and so on.',
      'Copying the whole game for every player would be slow and fill your disk. `Game.SymlinkGame = true` fills each folder with **links** to the real files instead: they look like the files but take no space. (The .exe itself is a real copy, and the folders go when you close Nucleus.)',
      'A link is still the same file, though: if two players write to it, they write to the same file. `FileSymlinkCopyInstead` lists files each player gets a **real copy** of. Boring Man keeps settings in `options.ini`, next to its .exe.',
      block(FOLDERS_L + COPY_L, lastLine(S.game) + '\n\n// A folder for each player'),
    ],
    task: 'Add the two lines.',
    hint: 'Under `// A folder for each player`, turn on links, then name the one file each player needs a real copy of: Boring Man\'s `options.ini`. `Game.SymlinkGame` takes `true` without quotes; `Game.FileSymlinkCopyInstead` takes a list in square brackets: `["options.ini"]`.',
    notes: [
      { kind: 'alt', text: 'Nucleus deletes the links in `content\\Boring Man Tutorial` when you close it, and makes them again on the next start. `Game.KeepSymLinkOnExit = true` keeps them instead; most handlers leave it at its default, `false`.' },
      { kind: 'why', text: 'How do you know which files need a copy? By testing: start two copies and see what they fight over. A later chapter is about exactly that.' },
      { kind: 'odd', text: 'Nucleus matches these names as **part** of a file name, not the whole name: `"options.ini"` would also catch a `myoptions.ini`. Use names specific enough.' },
    ],
    start: S.game + '\n// A folder for each player\n',
    solution: S.folders,
    ...want([['Game.SymlinkGame', 'true'], ['Game.FileSymlinkCopyInstead', ['options.ini']]]),
    pane: 'check',
  },
  {
    id: 'environment',
    section: 'Each player\'s copy',
    title: 'A settings folder for each player',
    kind: 'code',
    minutes: 3,
    text: [
      'Many games keep their settings in your user folder, not their own: Boring Man uses `AppData\\Local\\BoringManRewrite`. Every copy would share it.',
      '`Game.UseNucleusEnvironment = true` gives each player their own user folders: `C:\\Users\\you\\NucleusCoop\\<player>\\AppData\\…`. `Game.UserProfileConfigPath` says where the game\'s settings are, so Nucleus copies yours into each player\'s, to start from.',
      block(ENV_L, lastLine(S.folders) + '\n\n// Each player\'s own settings folder'),
    ],
    task: 'Add the two lines. The backslashes are doubled: that\'s how a `\\` is written inside quotes.',
    hint: 'Under `// Each player\'s own settings folder`, turn on a user folder per player, then say where Boring Man keeps its settings in it. `Game.UseNucleusEnvironment` takes `true`; `Game.UserProfileConfigPath` takes text that starts at `AppData`, with each backslash written twice: `"AppData\\\\Local\\\\BoringManRewrite"`.',
    notes: [
      { kind: 'odd', text: 'Nucleus copies your settings only the **first** time a player name is used. Changes after that stay in that player\'s folder: to start a player over, delete their folder in `C:\\Users\\you\\NucleusCoop`.' },
    ],
    start: S.folders + '\n// Each player\'s own settings folder\n',
    solution: S.environment,
    ...want([['Game.UseNucleusEnvironment', 'true'], ['Game.UserProfileConfigPath', 'AppData\\\\Local\\\\BoringManRewrite']]),
    pane: 'check',
  },
  {
    id: 'steam',
    section: 'Each player\'s copy',
    title: 'Steam',
    kind: 'code',
    minutes: 2,
    text: [
      'Steam runs one copy of a game per account, and Boring Man\'s copies find each other through Steam. `Game.UseGoldberg = true` puts the **Goldberg Steam emulator** in each copy instead: every copy thinks it has Steam to itself, and they find each other on your network.',
      '`Game.SteamID` tells it which game this is: the number in the game\'s Steam page address (store.steampowered.com/app/**346120**).',
      block(STEAM_L, lastLine(S.environment) + '\n\n// Steam'),
    ],
    task: 'Add the two lines.',
    hint: 'Under `// Steam`, turn on the Goldberg emulator and tell it which game this is: the number in Boring Man\'s store address (store.steampowered.com/app/346120). `Game.UseGoldberg` takes `true`; `Game.SteamID` takes that number as text, in quotes: `"346120"`.',
    notes: [
      { kind: 'why', text: 'Most handlers for Steam games start here, and so does the official guide. It works when the game plays together through Steam itself, not through its own online servers.' },
      { kind: 'pitfall', text: 'Antivirus programs often flag Goldberg by mistake. That\'s why the installation guide has you add Nucleus\' folder to Microsoft Defender\'s exclusions.' },
    ],
    start: S.environment + '\n// Steam\n',
    solution: S.steam,
    ...want([['Game.UseGoldberg', 'true'], ['Game.SteamID', '346120']]),
    pane: 'check',
  },
  {
    id: 'windows',
    section: 'Windows and focus',
    title: 'The windows',
    kind: 'code',
    minutes: 3,
    text: [
      'To move and size each copy\'s window, Nucleus first finds it by its title: `Game.Hook.ForceFocusWindowName`. Boring Man\'s window is called `Boring Man`.',
      '`ResetWindows` puts each window in its place when the next copy starts, and `SetWindowHook` stops the game moving its own window after that. `RefreshWindowAfterStart` minimizes and restores each window once they\'re all open, which wakes some games up.',
      block(WINDOWS_L, lastLine(S.steam) + '\n\n// The windows'),
    ],
    task: 'Add the four lines.',
    hint: 'Under `// The windows`, first give Nucleus the window\'s title, then turn on the three window switches from the code block on the left. `Game.Hook.ForceFocusWindowName` takes the title as text, `"Boring Man"`; `Game.ResetWindows`, `Game.SetWindowHook` and `Game.RefreshWindowAfterStart` each take `true`.',
    notes: [
      { kind: 'odd', text: 'If every window ends up full screen or on top of the others, Nucleus may not have found them: the window name is the first thing to check.' },
    ],
    start: S.steam + '\n// The windows\n',
    solution: S.windows,
    ...want([['Game.Hook.ForceFocusWindowName', 'Boring Man'], ['Game.ResetWindows', 'true'], ['Game.SetWindowHook', 'true'], ['Game.RefreshWindowAfterStart', 'true']]),
    pane: 'check',
  },
  {
    id: 'focus',
    section: 'Windows and focus',
    title: 'Every window in focus',
    kind: 'code',
    minutes: 2,
    text: [
      'Windows sends your keys to one window: the one in focus. Many games stop listening, or pause, when theirs isn\'t. With four copies, three never are.',
      '`Game.HookFocus = true` makes Nucleus trick each copy into thinking it\'s the window in focus.',
      block(FOCUS_L, lastLine(S.windows) + '\n\n// Every window in focus'),
    ],
    task: 'Add the line.',
    hint: 'Under `// Every window in focus`, add the one switch that makes each copy believe its window is the one in focus. It\'s `Game.HookFocus`, set to `true` without quotes.',
    notes: [
      { kind: 'why', text: 'This is a **hook**: Nucleus slips its own code into each copy and answers some of its questions to Windows. That\'s how a handler changes things the game has no setting for.' },
    ],
    start: S.windows + '\n// Every window in focus\n',
    solution: S.focus,
    ...want([['Game.HookFocus', 'true']]),
    pane: 'check',
  },
  {
    id: 'timing',
    section: 'Windows and focus',
    title: 'One copy at a time',
    kind: 'code',
    minutes: 2,
    text: [
      'Nucleus starts the copies one after another. `Game.PauseBetweenStarts` is how long it waits before the next, so each window is up before the next one opens. The tested handler waits 25.',
      '`Game.HandlerInterval` is how often, in milliseconds, Nucleus checks on the windows while you play. Leave it out and it\'s 0: Nucleus never checks, and everything that needs it (like keeping windows in place) stops.',
      block(TIMING_L, lastLine(S.focus) + '\n\n// Timing'),
    ],
    task: 'Add the two lines.',
    hint: 'Under `// Timing`, set how long Nucleus waits before starting the next copy, and how often it checks the windows. Both take plain numbers without quotes: `Game.PauseBetweenStarts` is 25 (seconds), `Game.HandlerInterval` is 100 (milliseconds).',
    notes: [
      { kind: 'odd', text: '`PauseBetweenStarts` is in **seconds**, though its docs say milliseconds: Nucleus waits `TimeSpan.FromSeconds(…)`. On a fast PC a lower number may work: try it.' },
    ],
    start: S.focus + '\n// Timing\n',
    solution: S.timing,
    ...want([['Game.PauseBetweenStarts', 25], ['Game.HandlerInterval', 100]]),
    pane: 'check',
  },
  {
    id: 'input',
    section: 'Controllers and keyboard',
    title: 'Which controllers',
    kind: 'code',
    minutes: 3,
    text: [
      '`Game.SupportsKeyboard = true` lets one player use the keyboard and mouse; everyone else gets a controller.',
      'Controllers come in two kinds: **XInput** (Xbox-style, what most games and controllers use today) and the older **DirectInput**. Boring Man uses XInput, so `Hook.XInputEnabled` is on. `Hook.CustomDllEnabled` is another way of handing out controllers, which this handler doesn\'t use: XInputPlus (next lesson) does that job.',
      block(INPUT_L, lastLine(S.timing) + '\n\n// Controllers and keyboard'),
    ],
    task: 'Add the three lines.',
    hint: 'Under `// Controllers and keyboard`, allow one keyboard player, turn on the XInput hook and turn the custom DLL off. `Game.SupportsKeyboard` and `Game.Hook.XInputEnabled` take `true`; `Game.Hook.CustomDllEnabled` takes `false`, because it\'s on unless a handler says otherwise.',
    notes: [
      { kind: 'pitfall', text: 'One keyboard means one keyboard player: Windows sends every key to the window in focus. Several keyboards and mice need Proto Input, which is a chapter of its own.' },
      { kind: 'odd', text: '`CustomDllEnabled = false` looks like it could go, but it can\'t: it\'s **on** unless a handler turns it off, and then Nucleus would add its own XInput DLL as well as XInputPlus.' },
    ],
    start: S.timing + '\n// Controllers and keyboard\n',
    solution: S.input,
    ...want([['Game.SupportsKeyboard', 'true'], ['Game.Hook.XInputEnabled', 'true'], ['Game.Hook.CustomDllEnabled', 'false']]),
    pane: 'check',
  },
  {
    id: 'controllers',
    section: 'Controllers and keyboard',
    title: 'One controller each',
    kind: 'code',
    minutes: 2,
    text: [
      'Left alone, every copy would listen to every controller. `Game.XInputPlusDll` puts **XInputPlus** in each copy, set up so the game sees only its own player\'s controller.',
      '`Game.UseDInputBlocker = true` blocks DirectInput in each copy, so no controller sneaks in that way.',
      block(ONE_PAD_L, lastLine(S.input)),
    ],
    task: 'Add the two lines at the end of the controller part.',
    hint: 'Add two lines at the very end, under `Game.Hook.CustomDllEnabled`: XInputPlus, so each copy sees one controller, and the DirectInput blocker. `Game.XInputPlusDll` takes a list with the DLL\'s name, `["xinput1_3.dll"]`; `Game.UseDInputBlocker` takes `true`.',
    notes: [
      { kind: 'why', text: 'Nucleus writes each copy\'s `XInputPlus.ini` with `Controller1=` set to that player\'s controller. To the game, it\'s the only controller there is.' },
    ],
    start: S.input,
    solution: S.pads,
    ...want([['Game.XInputPlusDll', ['xinput1_3.dll']], ['Game.UseDInputBlocker', 'true']]),
    pane: 'check',
  },
  {
    id: 'exclusions',
    section: 'Controllers and keyboard',
    title: 'Files Nucleus brings',
    kind: 'code',
    minutes: 2,
    text: [
      'Goldberg brings its own `steam_api.dll` and `steam_appid.txt`; XInputPlus and the DInput blocker bring their own `xinput1_3.dll` and `dinput8.dll`. Links to the game\'s own files under those names would be in the way.',
      '`Game.FileSymlinkExclusions` lists files Nucleus leaves out of the folders, so its own can go there.',
      block(EXCLUDE_L, lastLine(S.pads) + '\n\n// Files Nucleus puts in each copy itself'),
    ],
    task: 'Add the line.',
    hint: 'Under `// Files Nucleus puts in each copy itself`, list the files Goldberg, XInputPlus and the DInput blocker bring, so the game\'s own aren\'t linked in their place. `Game.FileSymlinkExclusions` takes one list in square brackets: `steam_api.dll`, `steam_appid.txt`, `dinput8.dll` and `xinput1_3.dll`, each in quotes, with commas between.',
    notes: [
      { kind: 'odd', text: 'Leave one out and the game may start with its real Steam DLL, or see every controller, even though everything else is right. Like the copy list, these match **part** of a file name.' },
    ],
    start: S.pads + '\n// Files Nucleus puts in each copy itself\n',
    solution: S.exclusions,
    ...want([['Game.FileSymlinkExclusions', ['steam_api.dll', 'steam_appid.txt', 'dinput8.dll', 'xinput1_3.dll']]]),
    pane: 'check',
  },
  {
    id: 'description',
    section: 'Testing',
    title: 'A note for the players',
    kind: 'code',
    minutes: 2,
    text: [
      '`Game.Description` is shown in Nucleus when someone picks the game, before they start. Say what they need to do that the handler can\'t: here, how the copies join each other, and a fix for a window stuck behind the taskbar.',
      block(DESCRIPTION_L, lastLine(S.name) + '\n\n// What players read before they start'),
    ],
    task: 'Add the `Game.Description` line. The Show me button has the tested handler\'s; your own words are fine too.',
    hint: 'Under `// What players read before they start`, near the top, add the note Nucleus shows when someone picks the game: how the copies join each other (direct connect to `localhost`) and the Ctrl+T fix. It\'s `Game.Description = "…";`: one line, your text in double quotes.',
    notes: [
      { kind: 'why', text: 'Every copy runs on the same PC, so "direct connect" means joining `localhost`: "this computer".' },
    ],
    start: S.exclusions.replace(NAME_L, NAME_L + '\n// What players read before they start\n'),
    solution: S.description,
    check: (t) => ((str(t, 'Game.Description') ?? '').trim().length > 10 ? firstProblem(t) : 'Add Game.Description = "…"; with a sentence or two, in quotes.'),
    goals: [{ label: 'Game.Description', ok: (t) => (str(t, 'Game.Description') ?? '').trim().length > 10 }],
    unit: 'line',
    pane: 'check',
  },
  {
    id: 'test',
    section: 'Testing',
    title: 'Test it in Nucleus Co-op',
    kind: 'test',
    minutes: 10,
    text: [
      'Your handler can now run copies of Boring Man, each with its own folder, Steam, window and controller. Time to try it for real.',
    ],
    steps: [
      { text: 'Download the zip (the button below) and drag it onto Nucleus Co-op: it replaces your last version.', see: '**Boring Man Tutorial** in Nucleus\' list.', trouble: ['Nucleus asks where the game is: pick `BoringManGame.exe` in the folder from the overview.'] },
      { text: 'Pick **Boring Man Tutorial** and read your note under its cover. Drag the keyboard icon onto the screen, and a controller if you have one (hold a button: it lights up).', see: 'Two players on the screen.' },
      { text: 'Press `>`, then **PLAY**, and wait for both windows (25 seconds between them).', see: 'Two Boring Man windows, the second 25 seconds after the first.', trouble: ['Only one window after a minute: the second copy didn\'t start. Look at the Steam lesson\'s lines, and your antivirus (it may have removed Goldberg).', 'An error from Nucleus: it names the line or file. Check, on the right, should show nothing.'] },
      'Look at the windows.',
    ],
    notes: [
      { kind: 'alt', text: 'You can drag the `.js` straight onto Nucleus too. It **moves** the file into its handlers folder, so it\'s gone from where it was: keep a copy.' },
    ],
    start: FIRST_TEST,
    solution: FIRST_TEST,
    download: 'zip',
    ask: {
      question: 'How do the windows look?',
      answers: [
        { label: 'Full screen, on top of each other', reply: 'That\'s the bug the next lesson is about.' },
        { label: 'Side by side, each in its half', reply: 'Your Boring Man was already set to a window. Other people\'s won\'t be: the next lesson makes sure.' },
        { label: 'Something else', reply: 'Look at the list on the last page: it starts from what you see.' },
      ],
    },
  },
  {
    id: 'fullscreen',
    section: 'Each player\'s settings',
    title: 'Why the windows were full screen',
    kind: 'code',
    minutes: 3,
    text: [
      'Boring Man starts full screen unless its settings say otherwise, and a full-screen window can\'t be put in half the screen. The setting is in `bm_settings.ini`, in each player\'s settings folder, so the handler has to change that file for each player.',
      '`Game.Play` is a function Nucleus runs **once for each player**, just before their copy starts. Inside it, `Context` is about that player: `Context.EnvironmentPlayer` is their user folder, and `Context.UserProfileConfigPath` the settings path you set earlier. Together they make the path to this player\'s file:',
      block(PLAY_START + '};', lastLine(S.description)),
      '**Try it**, under the code, runs `Game.Play` for each player in your browser and shows each player\'s window. Nothing changes yet: the next lesson changes the file. Nothing on your PC is touched.',
    ],
    task: 'Add `Game.Play` at the end, then look at the players in Try it.',
    hint: 'Go to the very end, after the `Game.FileSymlinkExclusions` line, and start the function Nucleus runs for each player: `Game.Play = function () {`, closed with `};`. Inside it, `var VideoConfig = …;` joins `Context.EnvironmentPlayer`, `Context.UserProfileConfigPath` and `"\\\\bm_settings.ini"` with `+`.',
    notes: [
      { kind: 'alt', text: 'Many games can be told on their command line instead: `Game.StartArguments = "-windowed";` starts every copy with `-windowed` (which argument works depends on the game). Boring Man keeps its window mode in its settings file, so this handler changes the file.' },
    ],
    start: S.description,
    solution: S.play,
    check: (t) => {
      const e = firstProblem(t);
      if (e) return e;
      const r = run(t);
      if (!r.loaded) return `The handler doesn't load: ${r.loadError ?? 'see Check'}`;
      if (!r.hasPlay) return 'Add the Game.Play function at the end.';
      return /Context\s*\.\s*EnvironmentPlayer\s*\+\s*Context\s*\.\s*UserProfileConfigPath\s*\+\s*"\\\\bm_settings\.ini"/.test(noComments(t)) ? null : 'Inside Game.Play: var VideoConfig = Context.EnvironmentPlayer + Context.UserProfileConfigPath + "\\\\bm_settings.ini";';
    },
    goals: [
      { label: 'Game.Play', ok: (t) => /^\s*Game\s*\.\s*Play\s*=\s*function/m.test(t) },
      { label: 'the path', ok: (t) => /Context\s*\.\s*EnvironmentPlayer\s*\+\s*Context\s*\.\s*UserProfileConfigPath/.test(noComments(t)) },
    ],
    unit: 'parts',
    pane: 'tryit',
  },
  {
    id: 'settings-file',
    section: 'Each player\'s settings',
    title: 'Change a setting in the file',
    kind: 'code',
    minutes: 4,
    text: [
      'The setting is `Fullscreen`, in the `[Video]` part of `bm_settings.ini`. `Context.ModifySaveFile` changes keys in a file: the file to read, the file to write (the same one here), its kind (`Nucleus.SaveType.INI`), and a list of keys to set. Each `new Nucleus.IniSaveInfo(part, key, value)` is one key.',
      block(PLAY_MODIFY, PLAY_START.trim(), '};'),
      'Try it now shows what each player\'s copy changes before it starts. It catches mistakes like a wrong key in a second; a test in Nucleus Co-op takes minutes.',
    ],
    task: 'Add the `ModifySaveFile` call, then look at what each player gets in Try it.',
    hint: 'Inside `Game.Play`, under the `var VideoConfig` line, call `Context.ModifySaveFile` to set `Fullscreen` in the `[Video]` part of `bm_settings.ini`. It takes `VideoConfig` twice (read, then write), `Nucleus.SaveType.INI`, and a list `[ … ]` with one `new Nucleus.IniSaveInfo("Video", "Fullscreen", \'"0"\')`: the double quotes inside the single ones are part of the value.',
    notes: [
      { kind: 'odd', text: 'The value is `\'"0"\'`: the quotes are part of it. Boring Man writes `Fullscreen="0"` in its file, so the handler does too.' },
      { kind: 'pitfall', text: 'The file is only in a player\'s folder if Nucleus could copy yours: start Boring Man once on its own first (step 3 of the overview).' },
    ],
    start: S.play,
    solution: FINAL,
    check: (t) => {
      const e = firstProblem(t);
      if (e) return e;
      const r = run(t);
      if (!r.loaded) return `The handler doesn't load: ${r.loadError ?? 'see Check'}`;
      if (!r.hasPlay) return 'Add the Game.Play function at the end.';
      return r.players.every((_, i) => iniWrites(r, i).some((w) => /^bm_settings\.ini: \[Video\] Fullscreen = "0"$/.test(w))) ? null : 'In Try it, each player should change bm_settings.ini: [Video] Fullscreen = "0".';
    },
    goals: [{ label: 'Fullscreen = "0"', ok: (t) => { const r = run(t); return r.loaded && r.players.every((_, i) => iniWrites(r, i).some((w) => /^bm_settings\.ini: \[Video\] Fullscreen = "0"$/.test(w))); } }],
    unit: 'setting',
    pane: 'tryit',
  },
  {
    id: 'test-again',
    section: 'Each player\'s settings',
    title: 'Test it again',
    kind: 'test',
    minutes: 10,
    text: [
      'Here\'s the finished handler, zipped the way Nucleus installs it. Drag it onto Nucleus Co-op: it replaces the first version.',
    ],
    steps: [
      { text: 'Download the zip (the button below) and drag it onto Nucleus Co-op.', see: 'Nucleus says it replaced Boring Man Tutorial.' },
      { text: 'Start Boring Man Tutorial with 2 players, as before.', see: 'Two windows side by side, each in its half of the screen.', trouble: ['Still full screen: start Boring Man once on its own, or delete the players\' folders in `C:\\Users\\you\\NucleusCoop` so Nucleus copies your settings again.', 'A window behind the taskbar: Ctrl+T twice, as your note says.', 'The game won\'t start a second copy: the Steam lesson.'] },
      { text: 'Host a game in one window. In the other, join it with **direct connect** to `localhost`. Click a window to use the keyboard there.', see: 'Both players in the same game, each with their own controls.', trouble: ['Both windows react to one controller: the controller lessons (XInputPlus and the files Nucleus brings).'] },
    ],
    notes: [
      { kind: 'why', text: 'It does what the tested Boring Man handler on the Hub does, in fewer lines. Its own name aside, it leaves out lines that change nothing (in red above): ' + droppedNotes().join('; ') + '. Writing a default out does no harm, and many handlers do; this one leaves them out so that every line does something.' },
    ],
    start: FINAL,
    solution: FINAL,
    download: 'zip',
    after: ['**The Hub handler next to yours.** Red lines are in the Hub one and not in yours; green ones are yours instead.', hubDiff()],
  },
];

// ---------------------------------------------------------------------------------------------------------------
// Chapter 2: Launch options and config files (Codename CURE)
//
// Codename CURE (free on Steam, app 355180) is a Source engine game: its settings come from the command line and
// small .cfg files. The chapter builds a smaller version of birden's verified Hub handler (hub 7KwbL5RAtjKx3hsGu);
// the last lesson says what that one does differently, and why.

/** Each player's Context.WriteTextFile calls: the file name and its lines. */
export function textWrites(r: SimResult, player: number): { file: string; path: string; lines: string[] }[] {
  const out: { file: string; path: string; lines: string[] }[] = [];
  for (const c of r.players[player]?.calls ?? []) {
    const m = /^Context\.WriteTextFile\("((?:[^"\\]|\\.)*)", \[([\s\S]*)\]\)$/.exec(c);
    if (m) out.push({ file: m[1].split(/\\\\|\//).pop()!, path: m[1], lines: [...m[2].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1].replace(/\\(.)/g, '$1')) });
  }
  return out;
}
const autoexecOf = (r: SimResult, i: number) => textWrites(r, i).find((w) => w.file.toLowerCase() === 'autoexec.cfg');
/** What a Try it lesson needs first: no problems, a handler that loads, a Game.Play. */
function playReady(t: string): string | null {
  const e = firstProblem(t);
  if (e) return e;
  const r = run(t);
  if (!r.loaded) return `The handler doesn't load: ${r.loadError ?? 'see Check'}`;
  return r.hasPlay ? null : 'Add the Game.Play function at the end.';
}
const hasPlay = (t: string) => /^\s*Game\s*\.\s*Play\s*=\s*function/m.test(noComments(t));

const CURE_STORE = 'https://store.steampowered.com/app/355180/';
const C_TOP = '// Codename CURE Tutorial: a handler for Codename CURE (free on Steam)\n';
const C_NAME = 'Game.GUID = "Codename CURE Tutorial";\nGame.GameName = "Codename CURE Tutorial";\n';
const C_DESC = 'Game.Description = "The menus have no controller support. Start a local server in the first window; once you\'re in the game, click OK in Nucleus to start the others, then join from each with the server browser\'s LAN tab. Click a window to use the keyboard there.";\n';
const C_KNOWN = '\n// What chapter 1 taught\nGame.ExecutableName = "cure.exe";\nGame.SteamID = "355180";\nGame.MaxPlayers = 5;\nGame.SymlinkGame = true;\nGame.UseGoldberg = true;\nGame.FileSymlinkExclusions = ["steam_appid.txt"];\nGame.UseNucleusEnvironment = true;\nGame.Hook.ForceFocusWindowName = "Codename CURE";\nGame.HookFocus = true;\nGame.PauseBetweenStarts = 10;\nGame.HandlerInterval = 100;\nGame.SupportsKeyboard = true;\nGame.Hook.XInputEnabled = true;\nGame.Hook.CustomDllEnabled = false;\nGame.XInputPlusDll = ["xinput1_4.dll", "xinput9_1_0.dll", "Dinput8.dll"];\n';
const C_NEW = '\n// New: Source games run one copy at a time, and the first one hosts\nGame.KillMutex = ["hl2_singleton_mutex", "ValvePlatformUIMutex", "ValvePlatformWaitMutex"];\nGame.PromptAfterFirstInstance = true;\n';
const C_BASE = C_TOP + C_NAME + C_DESC + C_KNOWN + C_NEW;
const C_ARGS_L = 'Game.StartArguments = "-windowed -noborder -game cure -novid -insecure";\n';
const C_OPT_L = 'Game.AddOption("Frame rate cap", "The most frames per second each window draws.", "fps", ["60", "30", "90", "120", "144"]);\n';
const C_PLAY = '\n// Each player\nGame.Play = function () {\n';
const C_SIZE = '  Context.StartArguments += " -w " + Context.Width + " -h " + Context.Height;\n';
const C_FPS = '  Context.StartArguments += " +fps_max " + Context.Options["fps"];\n';
const C_FILE = '\n  var autoexec = Context.GetFolder(Nucleus.Folder.InstancedGameFolder) + "\\\\cure\\\\cfg\\\\autoexec.cfg";\n  var lines = ["engine_no_focus_sleep 0"];\n';
const C_WRITE = '  Context.WriteTextFile(autoexec, lines);\n';
const C_JOY = '  if (Player.IsKeyboardPlayer) {\n    lines.push("joystick 0");\n  } else {\n    lines.push("joystick 1");\n  }\n';
const C_ARGS = C_BASE + '\n// How every copy starts\n' + C_ARGS_L;
const C_OPT = '\n// A choice for the players\n' + C_OPT_L;
const C_SIZED = C_ARGS + C_PLAY + C_SIZE + '};\n';
const C_OPTION = C_ARGS + C_OPT + C_PLAY + C_SIZE + C_FPS + '};\n';
const C_FILED = C_ARGS + C_OPT + C_PLAY + C_SIZE + C_FPS + C_FILE + C_WRITE + '};\n';
/** Chapter 2's finished handler. */
export const CURE_FINAL = C_ARGS + C_OPT + C_PLAY + C_SIZE + C_FPS + C_FILE + C_JOY + C_WRITE + '};\n';
// The quiz: a friend's change (vsync off at 144) and three mistakes Check finds.
const VSYNC = (v: string) => `  if (Context.Options["fps"] === ${v}) {\n    lines.push("mat_vsync 0");\n  }\n`;
const C_QUIZ_FIXED = CURE_FINAL.replace(C_WRITE, VSYNC('"144"') + C_WRITE);
const C_QUIZ = C_QUIZ_FIXED.replace(VSYNC('"144"'), VSYNC('144'))
  .replace('Game.GameName = "Codename CURE Tutorial";', 'Game.GameName = \'Codename CURE Tutorial\';')
  .replace('Context.StartArguments += " -w "', 'Context.StartArgument += " -w "');

const CURE: Lesson[] = [
  {
    id: 'overview',
    section: 'Getting started',
    title: 'Overview',
    kind: 'setup',
    minutes: 10,
    overview: true,
    text: [
      'Chapter 1\'s lines are written for you here, plus two that Source games need. Everything new happens **per player**, in `Game.Play`: you\'ll see each player\'s result in Try it, in your browser, before you test it for real.',
      'To test it at the end you need a Windows PC with Nucleus Co-op (chapter 1\'s overview) and the game. Only reading along? Skip the steps: everything up to the test runs in your browser.',
      'Controllers are optional: one lesson, and the test\'s last step, are for those who have them. With the keyboard alone you test one window.',
    ],
    steps: [
      { text: 'Get Codename CURE on [its Steam page](' + CURE_STORE + ') (free: **Play Game**) and let Steam install it.', see: 'Codename CURE in your Steam library.' },
      { text: 'Start it once from Steam, then quit from its menu. That makes its settings and its `cfg` folder.', see: 'The game\'s main menu.', trouble: [{ text: 'Steam installs a few things the first time (DirectX, Visual C++): let it finish, then start the game again.', unverified: true }] },
      { text: 'Find its folder: in Steam, right-click Codename CURE › **Manage** › **Browse local files**.', see: '`cure.exe`, and next to it a `cure` folder with the game\'s files (its `cfg` folder is in there).' },
    ],
    start: '',
    solution: '',
  },
  {
    id: 'launch-arguments',
    section: 'Starting each copy',
    title: 'Launch arguments',
    kind: 'code',
    minutes: 3,
    text: [
      'The code on the right starts with what chapter 1 taught. Two lines are new: Source games let only one copy run at a time, so `Game.KillMutex` closes the lock each copy makes, before the next starts. `Game.PromptAfterFirstInstance` makes Nucleus wait after the first copy until you click OK, so it can start hosting first.',
      'Source games take settings from their **launch arguments**: words after the program\'s name, like a Steam game\'s *Launch Options*. `Game.StartArguments` gives every copy the same ones:',
      block(C_ARGS_L, lastLine(C_BASE) + '\n\n// How every copy starts'),
      '`-windowed -noborder`: a window without a frame, which Nucleus can place. `-game cure`: the game\'s folder. `-novid`: no intro video. `-insecure`: no Valve Anti-Cheat, which can\'t work without the real Steam.',
    ],
    task: 'Add the line, then look at what each player starts with in Try it.',
    hint: 'Under `// How every copy starts`, give every copy of `cure.exe` the same launch arguments, in one line. `Game.StartArguments` takes one text in double quotes, the five words separated by spaces: `-windowed`, `-noborder`, `-game cure`, `-novid` and `-insecure`.',
    notes: [
      { kind: 'odd', text: 'Launch Options you set in Steam don\'t reach these copies: Nucleus starts `cure.exe` itself, without Steam.' },
      { kind: 'alt', text: 'A word that starts with `+` runs one of the game\'s console commands at start, after its config files, like `+fps_max 60`. Lesson 4 uses one.' },
    ],
    start: C_BASE + '\n// How every copy starts\n',
    solution: C_ARGS,
    check: (t) => {
      const e = firstProblem(t);
      if (e) return e;
      const v = str(t, 'Game.StartArguments');
      if (v === undefined) return 'Still to add: ' + C_ARGS_L.trim();
      const miss = ARGS.filter((a) => !hasArg(v, a));
      return miss.length ? `Not quite yet: the arguments still need ${miss.join(', ')}` : null;
    },
    goals: ['-windowed', '-noborder', '-game cure', '-novid', '-insecure'].map((a) => ({ label: a, ok: (t: string) => hasArg(str(t, 'Game.StartArguments') ?? '', a) })),
    unit: 'arguments',
    pane: 'tryit',
  },
  {
    id: 'window-size',
    section: 'Starting each copy',
    title: 'Each window\'s size',
    kind: 'code',
    minutes: 4,
    text: [
      'Every copy now starts the same way, but their windows aren\'t the same size: half the screen each for 2 players, a quarter for 3 or 4. A Source game opens at the size in its own settings unless its arguments say otherwise: `-w` (width) and `-h` (height).',
      'What differs per player goes in `Game.Play`, which Nucleus runs once for each player before their copy starts. In it, `Context.StartArguments` starts out as your `Game.StartArguments`: `+=` adds to the end. `Context.Width` and `Context.Height` are this player\'s window size.',
      block(C_PLAY.trim() + '\n' + C_SIZE + '};', lastLine(C_ARGS)),
      'Try 1, 2 and 4 players in Try it: the sizes follow the windows.',
    ],
    task: 'Add `Game.Play`, then try a few player counts.',
    hint: 'At the end, under `// Each player`, add `Game.Play = function () {` and its closing `};`: what goes between runs once for each player. Inside, one `Context.StartArguments += …;` line adds `" -w "` with `Context.Width` and `" -h "` with `Context.Height`, joined with `+`; each text starts with a space.',
    notes: [
      { kind: 'pitfall', text: 'Mind the space at the start of `" -w "`. Without it the words run together (`-insecure-w`), and the game reads neither.' },
      { kind: 'why', text: 'Nucleus reads `Context.StartArguments` right after `Game.Play`, so what you add there is what that copy starts with.' },
    ],
    start: C_ARGS + '\n// Each player\n',
    solution: C_SIZED,
    check: (t) => {
      const e = playReady(t);
      if (e) return e;
      for (const n of [1, 2, 4]) {
        const r = run(t, n);
        for (const p of r.players) {
          const [, w, h] = /(\d+) × (\d+)$/.exec(p.window) ?? [];
          if (!new RegExp(`(^|\\s)-w ${w} -h ${h}(\\s|$)`).test(p.startArguments)) return `With ${n} player${n > 1 ? 's' : ''}, player ${p.index + 1} should start with -w ${w} -h ${h}: it starts with "${p.startArguments.trim()}".`;
        }
      }
      return null;
    },
    goals: [
      { label: 'Game.Play', ok: hasPlay },
      { label: 'the size', ok: (t) => /Context\s*\.\s*StartArguments\s*\+=[^;]*Context\s*\.\s*Width[^;]*Context\s*\.\s*Height/.test(t) },
    ],
    unit: 'parts',
    pane: 'tryit',
  },
  {
    id: 'option',
    section: 'A choice for the players',
    title: 'A choice the players make',
    kind: 'code',
    minutes: 4,
    text: [
      'Five copies on one PC are a lot of work for it, so let the players cap the frame rate. `Game.AddOption` adds a choice Nucleus shows before the game starts: its name, a description, a key, and the values to pick from (the first is picked to start with).',
      'In `Game.Play`, `Context.Options["fps"]` is what they picked. `+fps_max` runs the game\'s `fps_max` command: the most frames per second it draws.',
      block(C_OPT_L, '// A choice for the players'),
      block(C_FPS, C_PLAY.trim() + '\n' + C_SIZE, '};'),
      'The values are **text**, in quotes. Nucleus keeps the players\' choices in their saved profile, and a saved choice always comes back as text: `"60"`, never `60`. Text from the start is the same every time.',
    ],
    task: 'Add the option, use it in `Game.Play`, then see the frame rate in Try it.',
    hint: 'Two parts: the choice itself under `// A choice for the players`, then its use in `Game.Play`, under the `-w` line. `Game.AddOption` takes a name, a description, the key `"fps"` and a list of values as text (`["60", "30", …]`); in `Game.Play`, a second `Context.StartArguments +=` line adds `" +fps_max "` and `Context.Options["fps"]`.',
    notes: [
      { kind: 'try', text: 'Once it works, take the quotes off the values: `[60, 30, 90, 120, 144]`. What does Check say? Then put them back.', answer: 'Check warns that with a saved profile Nucleus gives the option back as text. Adding it to the arguments would still work, as it becomes text there anyway; comparing it (`=== 60`) wouldn\'t. Lesson 7 has that mistake.' },
      { kind: 'why', text: 'The key (`"fps"`) is how the code finds the choice; the name and description are what players read. Keep the key once the handler is out: saved profiles use it.' },
      { kind: 'why', text: 'Why the arguments, and not a config file? A Source game runs its saved settings (`config.cfg`) first, then `valve.rc`, which runs `autoexec.cfg` and after it the `+` commands from the arguments. So `+fps_max` runs last and wins over a value saved in either file.' },
    ],
    start: C_ARGS + C_OPT.replace(C_OPT_L, '') + C_PLAY + C_SIZE + '};\n',
    solution: C_OPTION,
    check: (t) => {
      const e = playReady(t);
      if (e) return e;
      if (!/Game\s*\.\s*AddOption\s*\([^;]*"fps"/.test(noComments(t))) return 'Still to add: ' + C_OPT_L.trim();
      const r = run(t);
      return r.players.every((p) => /\+fps_max 60(\s|$)/.test(p.startArguments)) ? null : 'In Try it, each player should start with +fps_max 60 (the first value).';
    },
    goals: [
      { label: 'the option', ok: (t) => /Game\s*\.\s*AddOption\s*\([^;]*"fps"/.test(noComments(t)) },
      { label: 'its use in Game.Play', ok: (t) => /\+fps_max\s*"\s*\+\s*Context\s*\.\s*Options\s*\[\s*"fps"\s*\]/.test(t) },
    ],
    unit: 'parts',
    pane: 'tryit',
  },
  {
    id: 'config-file',
    section: 'A file for each player',
    title: 'A config file for each player',
    kind: 'code',
    minutes: 4,
    text: [
      'Arguments are fine for a few settings. For more, Source games run `autoexec.cfg` when they start: a text file of console commands, one per line, in `cure\\cfg`.',
      'Each player has their own copy of the game folder (chapter 1\'s `Instance0`, `Instance1`…). `Context.GetFolder(Nucleus.Folder.InstancedGameFolder)` is this player\'s; `Context.WriteTextFile(path, lines)` writes a file with those lines.',
      block(C_FILE + C_WRITE, C_FPS.replace(/\n$/, ''), '};'),
      '`engine_no_focus_sleep 0`: Source slows a window down while it isn\'t in focus, and with Nucleus only one window ever is. This keeps them all at full speed.',
    ],
    task: 'Write `autoexec.cfg` in `Game.Play`, then open each player\'s file in Try it.',
    hint: 'In `Game.Play`, under the `+fps_max` line, make this player\'s path to `cure\\cfg\\autoexec.cfg`, a list of lines, and then write the file. `var autoexec` is `Context.GetFolder(Nucleus.Folder.InstancedGameFolder)` + `"\\\\cure\\\\cfg\\\\autoexec.cfg"`, `var lines` is `["engine_no_focus_sleep 0"]`, and `Context.WriteTextFile` with both goes last, just before `};`.',
    notes: [
      { kind: 'why', text: '`WriteTextFile` deletes the file before it writes. Where the copy has a link to the game\'s own file, it\'s the link that goes, so the real game folder stays as it was.' },
      { kind: 'odd', text: 'The path starts with a backslash (`"\\\\cure…"`): `GetFolder` gives the folder without one at the end.' },
    ],
    start: C_OPTION,
    solution: C_FILED,
    check: (t) => {
      const e = playReady(t);
      if (e) return e;
      const r = run(t);
      return r.players.every((_, i) => {
        // The last write to this player's autoexec.cfg (the one that stays) has the line.
        const w = textWrites(r, i).filter((x) => x.path.toLowerCase().endsWith(`\\\\instance${i}\\\\cure\\\\cfg\\\\autoexec.cfg`)).pop();
        return !!w && w.lines.includes('engine_no_focus_sleep 0');
      }) ? null : 'In Try it, each player should write Instance<n>\\cure\\cfg\\autoexec.cfg with engine_no_focus_sleep 0.';
    },
    goals: [
      { label: 'the path', ok: (t) => /GetFolder\s*\(\s*Nucleus\s*\.\s*Folder\s*\.\s*InstancedGameFolder\s*\)[^;]*autoexec\.cfg/.test(t) },
      { label: 'the lines', ok: (t) => /"engine_no_focus_sleep 0"/.test(t) },
      { label: 'WriteTextFile', ok: (t) => /Context\s*\.\s*WriteTextFile\s*\(/.test(noComments(t)) },
    ],
    unit: 'lines',
    pane: 'tryit',
  },
  {
    id: 'keyboard-or-controller',
    section: 'A file for each player',
    title: 'Keyboard or controller',
    kind: 'code',
    minutes: 3,
    optional: { skip: 'Skip: no controllers', invite: 'Have a controller? Do this one: 3 minutes, and in the test each controller plays its own copy. No controllers, or not today? Skip it: the next lessons work either way.' },
    text: [
      'Source turns controller support on or off with `joystick`. Turn it on for the controller players, and off for the keyboard player, whose copy then reads only the keyboard and mouse.',
      '`Player` is this player\'s own details (`Context` is about their copy): `Player.IsKeyboardPlayer` is `true` for the one on the keyboard and mouse. `lines.push(…)` adds a line to the list.',
      block(C_JOY, C_FILE.trim().split('\n').pop()!, C_WRITE.replace(/\n$/, '')),
      'In Try it, untick *Player 1 on the keyboard*: every file gets `joystick 1`.',
    ],
    task: 'Add the `if`, then compare the players\' files in Try it.',
    hint: 'Between the `var lines = …;` line and `Context.WriteTextFile`, add one line to the list that depends on who plays: `joystick 0` for the keyboard player, `joystick 1` for everyone else. Use `if (Player.IsKeyboardPlayer) { … } else { … }`, with a `lines.push("…");` in each part.',
    notes: [
      { kind: 'alt', text: 'With Nucleus\' several keyboards and mice (a later chapter), those players count too: the Hub handler also checks `Player.IsRawMouse` and `Player.IsRawKeyboard`.' },
      { kind: 'pitfall', text: 'A controller that moves but whose buttons do nothing needs a button layout: the last lesson shows how the Hub handler brings one.' },
    ],
    start: C_FILED,
    solution: CURE_FINAL,
    check: (t) => {
      const e = playReady(t);
      if (e) return e;
      const r = run(t, 2, true);
      const kb = autoexecOf(r, 0), pad = autoexecOf(r, 1);
      if (!kb || !pad) return 'Each player should still write autoexec.cfg.';
      if (!kb.lines.includes('joystick 0') || kb.lines.includes('joystick 1')) return 'In Try it, player 1 (keyboard) should get joystick 0 (and not joystick 1).';
      return pad.lines.includes('joystick 1') && !pad.lines.includes('joystick 0') ? null : 'In Try it, player 2 (controller) should get joystick 1 (and not joystick 0).';
    },
    goals: [
      { label: 'the if', ok: (t) => /if\s*\(\s*Player\s*\.\s*IsKeyboardPlayer\s*\)/.test(t) },
      { label: 'joystick 0', ok: (t) => /lines\s*\.\s*push\s*\(\s*"joystick 0"\s*\)/.test(t) },
      { label: 'joystick 1', ok: (t) => /lines\s*\.\s*push\s*\(\s*"joystick 1"\s*\)/.test(t) },
    ],
    unit: 'parts',
    pane: 'tryit',
  },
  {
    id: 'fix-it',
    section: 'Check and test',
    title: 'Fix the mistakes',
    kind: 'code',
    minutes: 4,
    text: [
      'A friend changed your handler: at 144 frames a second they turn off vsync (`mat_vsync 0`), which would hold the game to the screen\'s rate. But now it won\'t install from the Hub, the windows lose their size and frame rate cap, and vsync stays on.',
      'Check, under the code, runs the same checks as the workbench and the editors. It finds all three: fix them by hand, or with Check\'s fix buttons. **Why?** on each says what would go wrong in Nucleus.',
    ],
    task: 'Fix the three mistakes Check finds.',
    hint: 'Press `F8` to jump to the first mistake Check marks, and open *Why?* on it to see what Nucleus would do. One is `Game.GameName` in single quotes (the Hub install fails on that line), one is a `Context` name missing its last letter, and one compares `Context.Options["fps"]` with `===`, though a saved choice comes back as text.',
    notes: [
      { kind: 'why', text: 'Why `"144"`? A saved choice comes back as text, and `===` compares the value and the type, so text never equals the number `144`. `=== "144"` compares text with text. `== 144` works too: `==` compares only the value, turning `"144"` into `144` first. Where an option\'s values are numbers, a fresh pick is a number and a saved one text: `== 144` (or `== "144"`) matches both.' },
      { kind: 'why', text: 'None of these stops the handler from loading: Nucleus would start every copy, and you\'d only find out by playing (or, for the Hub one, when someone installs it). That\'s what Check is for.' },
    ],
    start: C_QUIZ,
    solution: C_QUIZ_FIXED,
    check: (t) => {
      const miss = QUIZ.filter(([, ok]) => !ok(t));
      if (miss.length) return `Still to fix: ${miss.map(([l]) => l).join(', ')}.`;
      return firstProblem(t);
    },
    goals: [] as Goal[],
    unit: 'mistakes',
    pane: 'check',
  },
  {
    id: 'test',
    section: 'Check and test',
    title: 'Test it in Nucleus Co-op',
    kind: 'test',
    minutes: 15,
    text: [
      'Your handler starts each copy with its own window size and frame rate cap, and writes each its own `autoexec.cfg`. Time to play it. (It\'s the handler before your friend\'s change, with lesson 6\'s `joystick` lines in, so controllers work whether you did that lesson or not.)',
      'No controllers? Test with the keyboard alone: one window, with its size, frame rate cap and `autoexec.cfg`. Each controller adds a player.',
    ],
    steps: [
      { text: 'Download the zip (the button below) and drag it onto Nucleus Co-op. When it asks to add the game, say yes and pick `cure.exe` in the game\'s folder (the overview\'s step 3).', see: '**Codename CURE Tutorial** in Nucleus\' list.', trouble: ['Nucleus can\'t find the game, or picks another .exe: the file is `cure.exe`, next to the `cure` folder.'] },
      { text: 'Pick it, drag the keyboard icon onto the screen, and a controller for each other player if you have them (hold a button: it lights up). Choose a **Frame rate cap** when Nucleus shows it, then **PLAY**.', see: 'One window, sized to its part of the screen, and a message from Nucleus waiting for your OK.', trouble: ['The window is full screen or the wrong size: look at its arguments in Try it (lessons 2 and 3).', 'An error from Nucleus before anything starts: it names the line. Check (lesson 7) should show nothing on your handler.'] },
      { text: 'In that window, start a local server (any map). Once you\'re in the game, click **OK** in Nucleus.', see: 'With controllers, the other windows open one by one, 10 seconds apart, each in its part of the screen.', trouble: ['Only the first window, ever: the next copy refused to start. `Game.KillMutex` must be there exactly as written.', { text: 'Windows asks whether `cure.exe` may use the network: allow it. The copies find each other over your network.', unverified: true }] },
      { optional: 'With controllers', text: 'In each other window, open the server browser\'s **LAN** tab and join the server. Click a window to use the keyboard and mouse there.', see: 'Every player in the same game, each in their own window.', trouble: ['The LAN tab stays empty: wait a few seconds and refresh it.', 'A controller moves its player but the buttons do nothing: the game has no controller layout yet (the last lesson).', 'One controller moves two players: chapter 1\'s controller lessons (XInputPlus).'] },
    ],
    start: CURE_FINAL,
    solution: CURE_FINAL,
    download: 'zip',
    ask: {
      question: 'How did it go?',
      answers: [
        { label: 'Everyone\'s in the same game', reply: 'That\'s a working handler. The last lesson compares it with the one on the Hub.' },
        { label: 'One window, on the keyboard', reply: 'That\'s what a keyboard alone can test: the window\'s size, the frame rate cap and its `autoexec.cfg`. With a controller you add a player, and the LAN game.' },
        { label: 'The other windows never opened', reply: 'Nucleus waits after the first copy on purpose: click OK in its message once you\'re in the game. Still nothing? Step 3\'s *Not working?*.' },
        { label: 'Something else', reply: 'Each step has a *Not working?* list. Still stuck? Ask in the SplitScreen.Me Discord: the link is under the lesson list.' },
      ],
    },
  },
  {
    id: 'recap',
    section: 'Check and test',
    title: 'Recap: next to the Hub handler',
    kind: 'test',
    minutes: 3,
    text: [
      'In this chapter you gave each player their own launch arguments in `Game.Play`, a choice that comes back as text, and a config file of their own. Try it showed each player\'s result before you tested it, and Check found mistakes that would only show up in play.',
      'The verified Codename CURE handler on the Hub, by birden, does the same and a little more:',
      '- **A controller layout.** Its package has a `360controller.cfg` (button bindings) next to `handler.js`. `Game.Play` copies it into each copy\'s `cure\\cfg` with `System.IO.File.Copy(…)`, and its `autoexec.cfg` runs it for controller players (`exec 360controller.cfg`) and undoes it for the keyboard player (`exec undo360controller.cfg`). Packages are a later chapter.\n- **The frame rate in the file.** It writes `fps_max` into `autoexec.cfg` instead of the arguments. That works too, as long as the arguments have no `+fps_max`: those run after `autoexec.cfg`, and would win.\n- **Two more arguments:** `-AlwaysFocus` and `+m_rawinput 1` (the mouse read directly, not through Windows\' pointer).\n- **Goldberg saves:** `GoldbergNoLocalSave = true` and `UserProfileSavePath`, so each player\'s saves are in their own Nucleus folder.\n- **Lines that change nothing here:** `SymlinkExe`, `SymlinkFolders`, `Hook.ForceFocus`, `Hook.DInputEnabled` and `Hook.XInputReroute` set to `false` (the default); `MaxPlayersOneMonitor` (Nucleus never reads it); `DirSymlinkExclusions` (with `SymlinkFolders` off, Nucleus makes every folder anyway: only files are links).',
    ],
    start: CURE_FINAL,
    solution: CURE_FINAL,
    download: 'zip',
  },
];
/** Whole arguments only: `-novideo` isn't `-novid`, and `-game` needs `cure` after it. */
const hasArg = (v: string, a: string) => ` ${v.trim().split(/\s+/).join(' ')} `.includes(` ${a} `);
const ARGS = ['-windowed', '-noborder', '-game cure', '-novid', '-insecure'];
/** The quiz's three mistakes, each fixed when its test holds. */
const QUIZ: [string, (t: string) => boolean][] = [
  ['Game.GameName in double quotes', (t) => str(t, 'Game.GameName') === 'Codename CURE Tutorial' && !lint(t).some((d) => d.rule === 'hub-install-parse')],
  ['Context.StartArguments', (t) => /Context\s*\.\s*StartArguments\s*\+=\s*" -w "/.test(t) && !/StartArgument\b/.test(t)],
  ['the option compared as text', (t) => /Context\s*\.\s*Options\s*\[\s*"fps"\s*\]\s*===?\s*"?144"?/.test(t) && !lint(t).some((d) => d.rule === 'option-compare')],
];
CURE.find((l) => l.id === 'fix-it')!.goals = QUIZ.map(([label, ok]) => ({ label, ok }));

export const CHAPTERS: Chapter[] = [
  {
    id: 'first-handler',
    title: 'Making your first handler',
    blurb: 'Write a handler for “Boring Man”, a free shooter game on Steam, a few lines at a time, and test it in Nucleus Co-op.',
    build: 'A handler for **Boring Man**, a free 2D shooter on Steam, written a few lines at a time: each player gets their own folder, settings, Steam, window and controller. It ends up doing what the tested handler on the Hub does, and you test it in Nucleus Co-op twice on the way.',
    fileName: 'Boring Man Tutorial',
    end: { title: 'You\'ve made a handler 🎉', text: 'Each player gets their own folder, settings, Steam, window and controller. Next: a Source engine game, where each player gets their own launch arguments and config file.' },
    lessons: FIRST,
  },
  {
    id: 'launch-options-and-config-files',
    formerIds: ['launch-options'], // its id until 2026-11-17 (never published, kept so test links still open)
    title: 'Launch options and config files',
    blurb: 'Write a handler for “Codename CURE”, a free co-op shooter on Steam, where each player gets their own launch arguments and config file.',
    build: 'A handler for **Codename CURE**, a free co-op zombie shooter on Steam made with the Source engine (Half-Life 2\'s). Each player gets launch arguments for their window, a frame rate cap the players choose, and a config file of their own. You test it in Nucleus Co-op at the end, and compare it with the Hub\'s.',
    fileName: 'Codename CURE Tutorial',
    end: { title: 'Chapter done 🎉', text: 'Each copy now starts with its own arguments and its own config file, set up in `Game.Play`. More chapters are on the way: finding out what a game needs, packages, Proto Input, and more.' },
    lessons: CURE,
  },
];

/** The lesson a lesson id is (1-based), for the intro's list of what a handler does. */
export const lessonNumber = (id: string, chapter = CHAPTERS[0]) => chapter.lessons.findIndex((l) => l.id === id) + 1;
/** The problems in a lesson's solution (tests: the solution is what people copy, so there must be none). */
export const solutionErrors = (l: Lesson) => (l.kind === 'code' || l.kind === 'test' ? problems(l.solution, l).map((d) => `${d.rule}: ${d.message}`) : []);
/** Where a link points: learn/#<chapter>/<lesson>. */
export function findLesson(hash: string): { chapter: Chapter; index: number } {
  const [c, l] = hash.replace(/^#/, '').split('/');
  const chapter = CHAPTERS.find((x) => x.id === c) ?? CHAPTERS.find((x) => x.formerIds?.includes(c)) ?? CHAPTERS[0];
  const index = Math.max(0, chapter.lessons.findIndex((x) => x.id === l));
  return { chapter, index };
}
/** Is a lesson done on the learner's PC (not in the browser)? */
export const isLocal = (l: Lesson) => (l.kind === 'setup' || l.kind === 'test') && !!l.steps?.length;
/** A chapter's minutes for the overview: the lessons everyone does (`total`, `local` of them on the learner's PC) and
 *  the optional ones apart. */
export function chapterMinutes(ch: Chapter): { total: number; local: number; optional: number } {
  const sum = (ls: Lesson[]) => ls.reduce((n, x) => n + x.minutes, 0);
  const main = ch.lessons.filter((l) => !l.optional);
  return { total: sum(main), local: sum(main.filter(isLocal)), optional: sum(ch.lessons.filter((l) => l.optional)) };
}
/** Where a lesson's Skip button goes: the next lesson that isn't optional (past the end: the chapter's length). */
export function skipTo(ch: Chapter, i: number): number {
  let j = i + 1;
  while (j < ch.lessons.length && ch.lessons[j].optional) j++;
  return j;
}
