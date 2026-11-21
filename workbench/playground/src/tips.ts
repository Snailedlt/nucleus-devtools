// Tips: a loading-screen-style tip bar under the code, plus Clippy-style tips that react to what
// is being edited (each shown once). Every claim here is verified (see the root AGENTS.md's
// AGENTS.md "Facts the code relies on" and the testbench probes). Can be turned off.
// General tips come in five topics: best practices and pitfalls (writing handlers: Nucleus and Jint
// behaviour), and shortcuts, settings and features (using this workbench). Add one with every new
// workbench feature.

export interface TipContext {
  text: string;
  lineText: string; // the line the cursor is on
  inCallback: boolean;
}
export interface Tip {
  id: string;
  text: string; // plain text; `code` in backticks
  /** General tips: about writing handlers, or about using the workbench. */
  kind?: 'handler' | 'gui';
  /** What kind of tip it is, shown as its label. */
  topic?: 'Best practice' | 'Pitfall' | 'Shortcut' | 'Setting' | 'Feature';
  /** Clippy-style: shown once, when this is true. */
  when?: (c: TipContext) => boolean;
  /** Who it's for: newcomers (Guided) or experienced authors (Advanced mode). Unset: both. */
  for?: 'newcomer' | 'developer';
  /** Optional action button. */
  action?: { label: string; run: 'lines' | 'new' | 'examples' | 'tryit' | 'share' | 'tutorial' };
}

const has = (c: TipContext, s: string) => c.text.includes(s);

export const CONTEXT_TIPS: Tip[] = [
  {
    id: 'start',
    text: 'A template or a Hub handler for a similar game gets you most of the way when you start from scratch.',
    when: (c) => c.text.trim().length < 120,
    action: { label: 'New handler…', run: 'new' },
  },
  {
    id: 'protocontroller',
    text: 'Each instance takes at most 4 controllers: `ProtoController1` to `ProtoController4`. Lines for 5 and up do nothing.',
    when: (c) => /ProtoController\d/.test(c.lineText),
  },
  {
    id: 'es5',
    text: 'Nucleus only reads ES5 JavaScript: no arrow functions (`=>`) or template literals (`` ` ``). Use `function () {}` and `"a" + b`.',
    when: (c) => /=>|`/.test(c.lineText),
  },
  {
    id: 'hub-scan',
    text: 'When a handler is installed from the Hub, Nucleus finds `Game.GameName` and `Game.ExecutableName` by reading lines that start with them. Keep each on one line, with the value in double quotes.',
    when: (c) => /^\s*Game\.(GameName|ExecutableName)\b/.test(c.lineText),
  },
  {
    id: 'dpi',
    text: '`Game.DPIHandling = true` means Scaled, not True. Write `Nucleus.DPIHandling.True` to get True.',
    when: (c) => /DPIHandling/.test(c.lineText),
  },
  {
    id: 'multi-kbm',
    text: 'For several keyboards and mice, the docs mark the old `Game.Hook*` input options deprecated. New handlers use Proto Input (`Game.ProtoInput.*`).',
    when: (c) => /SupportsMultipleKeyboardsAndMice\s*=\s*true/.test(c.text) && !has(c, 'Game.ProtoInput.'),
  },
  {
    id: 'onstop',
    text: '`Game.OnStop` and `Game.OnFinishedSetup` see the last player’s `Context`, not every player’s. Loop over `PlayerList` to reach the others.',
    when: (c) => /OnStop|OnFinishedSetup/.test(c.lineText),
  },
  {
    id: 'hub-lines',
    text: '`Hub.*` lines are written by the Hub when you upload. You don’t need to add or change them.',
    when: (c) => /^\s*Hub\./.test(c.lineText),
  },
  {
    id: 'mutex',
    text: 'Hub handlers for games on the same engine often kill the same mutex. If you don\'t know which one this game needs, search the examples.',
    when: (c) => /KillMutex\b/.test(c.lineText),
    action: { label: 'Examples', run: 'examples' },
  },
  {
    id: 'guid',
    text: 'Choose `Game.GUID` once and keep it: Nucleus files each player’s game, profiles and covers under it, so changing it in an update drops the game from their list.',
    when: (c) => /^\s*Game\.GUID\b/.test(c.lineText),
  },
  {
    id: 'addoption',
    text: 'Option values come back as text once players save a profile: use `["Yes", "No"]` and compare with `"Yes"`.',
    when: (c) => /Game\.AddOption\s*\(/.test(c.lineText),
  },
  {
    id: 'hotkeys',
    text: 'Each `Game.CustomHotkeys` entry needs a `Game.OnCustomHotKey_1`, `_2`, … function: a hotkey without one crashes Nucleus when pressed.',
    when: (c) => /CustomHotkeys/.test(c.lineText),
  },
  // Line-specific heads-ups above win; this one is for when nothing else applies.
  {
    id: 'in-play',
    text: "You're in `Game.Play`. It runs once per player, just before that player's game starts. `Context` is that player's: `Context.Width`, `Context.Height`, `Context.PlayerID`.",
    when: (c) => c.inCallback && /Game\.Play\b/.test(c.text),
  },
];

// General tips, by topic. The bar shows the topic as its label, and Next goes round the topics.
type Topic = NonNullable<Tip['topic']>;
const T = (topic: Topic, list: Omit<Tip, 'topic' | 'kind'>[]): Tip[] => list.map((t) => ({ ...t, topic, kind: topic === 'Pitfall' || topic === 'Best practice' ? 'handler' : 'gui' }));

const BEST = T('Best practice', [
  { id: 'b-start-similar', text: 'Start from a Hub handler for a game on the same engine: it already has the mutexes, symlink rules and input setup that engine needs.', action: { label: 'Examples', run: 'examples' } },
  { id: 'b-context-size', text: 'In `Game.Play`, size things from `Context.Width` and `Context.Height`: they are this player’s window, so the handler works for any player count and monitor.' },
  { id: 'b-path-combine', text: 'Build paths with `System.IO.Path.Combine(Game.Folder, "file.ini")`: it puts the `\\` between the parts for you.' },
  { id: 'b-modify-save', text: 'Change a game’s settings file per player with `Context.ModifySaveFile` and `Nucleus.IniSaveInfo` instead of copying whole files.' },
  { id: 'b-guid-stable', text: 'Never change `Game.GUID` in an update: Nucleus files each player’s game, profiles and covers under it, so a new GUID makes the game vanish from their list.' },
  { id: 'b-option-text', text: 'Give `Game.AddOption` text values (`["Yes", "No"]`), not `true`/`false` or numbers: a saved profile gives every option back as text, so `== true` stops matching.' },
  { id: 'b-max-players', text: 'Set `Game.MaxPlayers` to the most players you have actually tested. Try it’s Test all combinations checks every count up to it in one go.', action: { label: 'Try it', run: 'tryit' } },
  { id: 'b-file-copy', text: '`System.IO.File.Copy(from, to, true)`: the third argument overwrites. Without it, a second run throws and ends the session.' },
  { id: 'b-utf8', text: 'Save handlers as UTF-8: Nucleus reads them that way, so accented letters in an ANSI file arrive broken.' },
  { id: 'b-gamename', text: 'Keep `Game.GameName` unique and free of `\\`: the Hub install names the handler’s file and folder after it, so two handlers with the same name overwrite each other.' },
  { id: 'b-plugins', text: 'A handler can bring .NET plugins: list them in `pluginsInfo.txt` in its folder (`#Name#MyLib.dll#MyLib.MyClass`) and Nucleus adds `Name` as a global.' },
  { id: 'b-test-before-upload', text: 'Before uploading: Check with no errors, Test all combinations in Try it, then one real run in Nucleus with two players. Windows, focus and input only show there.' },
]);

const PITFALLS = T('Pitfall', [
  { id: 'p-case', text: 'Only the first letter of a name ignores case: `Game.killMutex` works, `Game.KillMUTEX` is silently ignored.' },
  { id: 'p-typos', text: 'A misspelled option doesn’t raise an error: Nucleus just ignores the line. Check lists them, and Lines marks the names Nucleus really reads with ✓.' },
  { id: 'p-context-top', text: '`Context`, `Player` and `PlayerList` only exist inside callbacks such as `Game.Play`. At the top of the file they stop Nucleus from loading the handler.' },
  { id: 'p-play-error', text: 'An error inside `Game.Play` ends the whole session, for every player. Try it shows the line that would fail.', action: { label: 'Try it', run: 'tryit' } },
  { id: 'p-es5', text: 'Nucleus understands ES5 only: no `=>`, no template literals, no `includes()` or `find()`. Use `function () {}`, `"a" + b` and `indexOf`.' },
  { id: 'p-letconst', text: '`let` and `const` load, but behave like `var`: they belong to the whole function, not the block, and `const` can be reassigned.' },
  { id: 'p-backslash', text: 'A string can’t continue on the next line with `\\`: Nucleus reads the file line by line. Join the parts with `+`.' },
  { id: 'p-args', text: 'Call functions with every argument, even ones that look optional in the docs: Nucleus’ engine doesn’t fill in C# defaults, and the call fails.' },
  { id: 'p-protocontroller', text: 'Each instance takes at most four controllers: `ProtoController1` to `ProtoController4`. Lines for 5 and up do nothing.' },
  { id: 'p-dpi', text: '`Game.DPIHandling = true` means Scaled, not True. Write `Nucleus.DPIHandling.True` for True.' },
  { id: 'p-hub-lines', text: 'The Hub install looks for lines that start with `Game.GameName` and `Game.ExecutableName`, comments included, and reads the value between the first and last `"`. Keep them simple and unindented.' },
  { id: 'p-exe-name', text: 'Set `Game.ExecutableName` even with `Game.ExecutableNames`: Nucleus’ Search disks reads it without checking, and stops with an error when it’s missing.' },
  { id: 'p-play-flags', text: '`Game.GamePlayBeforeGameSetup` and `Game.GamePlayAfterLaunch` both `true` means `Game.Play` never runs.' },
  { id: 'p-startargs-late', text: 'With `Game.GamePlayAfterLaunch`, setting `Context.StartArguments` in `Game.Play` does nothing: the game has already started.' },
  { id: 'p-hotkeys', text: 'Each `Game.CustomHotkeys` entry needs its `Game.OnCustomHotKey_N` function: pressing a hotkey without one crashes Nucleus.' },
  { id: 'p-last-context', text: '`Game.OnStop` and `Game.OnFinishedSetup` see the last player’s `Context`. Loop over `PlayerList` to reach the others.' },
  { id: 'p-sse', text: 'Nucleus never calls `Game.SetupSse`. Put that code in `Game.Play`.' },
  { id: 'p-forcefinish', text: '`Game.ForceFinishOnPlay` is from the original Nucleus Coop and does nothing now: Nucleus closes leftover copies of the game itself when a session starts.' },
]);

const SHORTCUTS = T('Shortcut', [
  { id: 's-palette', text: '{key:palette} (or `F1`) opens the command palette, as in VS Code: format, fix, Try it, theme and the rest, each with its shortcut.' },
  { id: 's-open', text: '{key:open} (or Ctrl+K, or Shift twice) opens the examples, templates and Hub handlers. Type `>` there to switch to commands. Double Shift can be turned off in Settings › Keyboard shortcuts.', action: { label: 'Examples', run: 'examples' } },
  { id: 'f-looks-past', text: 'If you miss the old Nucleus Co-op look, Settings ({key:settings}) → Theme has vlxst\'s Mac style and the original alpha 8 look, each in light and dark.' },
  { id: 'f-code-colours', text: 'The code can use your editor\'s colours. Settings ({key:settings}) → Theme → Code colours has GitHub, VS Code, Xcode, One, Monokai and Dracula, and they work with any look.' },
  { id: 'f-custom-theme', text: 'You can make your own look. In Settings ({key:settings}) → Theme, choose "Download this look as a theme file", keep only the colours you want to change, then "Load a theme file…". It appears under Look next to the built-in ones.' },
  { id: 'f-ref-home', text: 'When you don\'t know what an option is called, open Docs with nothing typed. You can browse Game, Context, Player and the rest, or look at the names Hub handlers use most.' },
  { id: 'f-lines-ref', text: 'Open the Docs tab, then point at names in Lines ({key:lines}): each one\'s full docs show in Docs, on a wide screen.', action: { label: 'Lines', run: 'lines' } },
  { id: 's-open-keys', text: 'In the Open list ({key:open}), the arrow keys move between tiles, templates and Hub rows, and `Home` and `End` jump to the first and last. Hover a Hub handler\'s icons to see its players, keyboards and mice, and downloads.', action: { label: 'Examples', run: 'examples' } },
  { id: 's-format', text: '{key:format} formats the code. It fixes indentation and spacing, uses double quotes and adds missing semicolons. Nothing moves to another line, so Nucleus reads it exactly as before.' },
  { id: 's-f8', text: '{key:nextProblem} jumps to the next problem, {key:prevProblem} to the one before. {key:quickFix} shows the fixes for the line you’re on.' },
  { id: 's-tryit', text: '{key:tryIt} runs Try it on the code as it is now (VS Code\'s Run Without Debugging); {key:testAll} (one after the other) tests all combinations.', action: { label: 'Try it', run: 'tryit' } },
  { id: 's-lines', text: '{key:lines} shows or hides Lines (Ctrl+Shift+L too, outside the code: in the code it selects every occurrence, as in VS Code).', action: { label: 'Show Lines', run: 'lines' } },
  { id: 's-docs-insert', text: 'Docs show an example for most names: Insert into handler puts it where it belongs (an option with the others, a call in `Game.Play`), or updates the value when the handler sets it already. Ctrl+Z undoes it.' },
  { id: 's-docs-page', text: 'Every name in Docs has a page of its own to link to: open one and choose Open as a page, or send someone docs/Context.ModifySaveFile/ on the site.' },
  { id: 's-tutorial', text: 'If you\'re new to handlers, Learn walks you through making your first one for a free game, a few lines at a time, checked as you type. At the end you test it in Nucleus Co-op. When you\'re stuck on a step, Hint tells you what\'s missing without giving the answer away.', action: { label: 'Start it', run: 'tutorial' } },
  { id: 's-find-all', text: 'Add the same text after every match: {key:find}, type what to find, {key:findSelectAll} selects every match, then `→` puts a cursor after each (`←` before each) and you type once for all.' },
  { id: 's-edit', text: 'VS Code’s editing keys work: {key:comment} comments a line, Alt+↑/↓ moves it, Shift+Alt+↑/↓ copies it, {key:selectNext} selects the next match.' },
  { id: 's-explain', text: 'To find out what a line does, put the cursor on it and press {key:explainLine}. You get the line in plain words, the docs of its names, and what Check says about it.' },
  { id: 's-goto', text: '{key:goToLine} goes to a line number, handy with a line from a Nucleus error message.' },
  { id: 's-suggest', text: 'Type `.` after `Game`, `Context` or `Nucleus`, or press {key:suggest}, for the names that exist there, with their docs.' },
  { id: 's-save', text: '{key:save} saves the handler as a .zip Nucleus Co-op can install; {key:saveAs} (or the arrow next to Save) picks .js or .nc. {key:settings} opens Settings, and ? lists every shortcut.' },
]);

const SETTINGS = T('Setting', [
  { id: 'c-theme', text: 'Light, dark or your device’s theme: Settings (the gear, or {key:settings}), or type "theme" in the command palette ({key:palette}).' },
  { id: 'c-editor', text: 'Settings has the text size, line wrapping and, on phones, a row of symbol keys (; = " ( ) { } [ ]) above the keyboard.' },
  { id: 'c-advanced', text: 'Advanced mode (top right) adds rule ids, filters, recorded calls in Try it, and the engine probes behind the checks.' },
  { id: 'c-lines', text: 'Lines can show a tree or one list, grouped by object, topic, type or where names work (top level or inside Game.Play). The ⚙ has more, like a wider column.', action: { label: 'Show Lines', run: 'lines' } },
  { id: 'c-review', text: 'Fix all shows a before/after to accept first. Tick Apply without review to skip that.' },
  { id: 'c-tips', text: 'Turn tips off with "Tips: on" at the bottom, or in Settings. "Show heads-ups again" there brings back the ones about specific lines.' },
  { id: 'c-wakatime', text: 'If you use WakaTime, add your API key in Settings. Writing, testing in Try it and reading docs then show up as separate categories. Your code is never sent.' },
]);

const FEATURES_ = T('Feature', [
  { id: 'f-lines', text: 'Lines lists every name a handler can use. Names already in the handler show their value; click one to insert it.', action: { label: 'Show Lines', run: 'lines' } },
  { id: 'f-hover', text: 'Hover any name in the code for its docs. In Lines, the (i) next to a name also says how many Hub handlers use it.' },
  { id: 'f-tryit', text: 'Try it shows what each player gets: window, launch arguments and every file change, without Nucleus or the game.', action: { label: 'Try it', run: 'tryit' } },
  { id: 'f-debug', text: 'Step through your handler: click beside a line number for a breakpoint, then Try it › Step through ({key:debugGo}). Next line (`F10`), Back to undo a step, and drag the timeline through every player’s Game.Play.', action: { label: 'Try it', run: 'tryit' } },
  { id: 'f-testall', text: 'Test all combinations runs every player count, input setup and monitor size, and lists what fails and why.', action: { label: 'Try it', run: 'tryit' } },
  { id: 'f-share', text: 'Share (next to Save) copies a link to the handler, the code, or a Discord-ready code block. Select some lines first to share only those. Too big for a link, or it has files? Share the file: whoever gets the .zip drops it on this page.', action: { label: 'Copy link', run: 'share' } },
  { id: 'f-package', text: 'Open a .zip or .nc, or a Hub handler marked "+ N files" in the Open list, and its other files come along: "+ N files" shows each one, where Nucleus installs it and what’s inside, and saving puts them back. Big Hub files show a Hub badge: get those from the original package.' },
  { id: 'f-reference', text: 'The Docs tab searches every option, Context member and Nucleus enum with its docs: try "window title" or "mutex".' },
  { id: 'f-mascots', text: 'Meet Nucli, the quiet atom who checks your handler: he dozes until there\'s code, cheers when there\'s nothing to fix and runs Test all. Duo, splitscreen.me\'s split-screen ball, turns up when something won\'t load.' },
  { id: 'f-mascot-modes', text: 'Settings › Motion decides how lively Duo and Nucli are, down to nothing moving at all. It has presets and a switch for each kind of motion, including Nucli editing the code during fixes.' },
  { id: 'f-ai-guide', text: 'If you write handlers with ChatGPT, Claude, Codex or another AI, give it our prompt first. The site’s AI page has one for agents and one for chatbots, so the AI follows Nucleus’ rules and checks its work.' },
  { id: 'f-ai-providers', text: 'Fix with AI works with Claude, OpenAI, OpenRouter, Gemini or a free local model (Ollama, LM Studio): pick one in Settings › AI.' },
  { id: 'f-save-nucleus', text: 'Save straight into Nucleus Co-op: {key:saveNucleus} (or Save ▾ › Into Nucleus Co-op) writes the handler into its handlers folder. Pick the folder once; in Firefox and Safari it saves the .zip to drag onto Nucleus.' },
  { id: 'f-value-pick', text: 'To see what a value can be, put the cursor on it (like the false in Game.SymlinkGame = false;) and tap the ▾ after it, or press Alt+↓. You can pick from the values it takes.' },
  { id: 'f-wm-plus', text: 'When you block window messages with Proto Input, each number in Game.ProtoInput.BlockedMessages shows its name, and the + before the ] adds the ones handlers block most.' },
  { id: 'f-eq-values', text: 'Type a space after = (as in Game.SymlinkGame = ) and the editor suggests the values that option takes. For Game.Play it writes the whole function.' },
  { id: 'f-votes', text: 'The 👍 and 👎 next to a tip tell us whether it was useful. They\'re anonymous. The AI-written docs have them too.' },
  { id: 'f-density', text: 'Check can show more or less per problem. Settings › Check has Compact (one line each), Comfortable and Detailed.' },
  { id: 'f-tabs', text: 'You can have more than one handler open. The + next to the tabs opens another, and your changes stay in their own tab. {key:nextHandler} and {key:prevHandler} switch between them, and {key:closeHandler} closes the one you\'re on.' },
  { id: 'f-edge-menu', text: 'Right-click the edge between two panels (or focus it and press the keyboard\'s menu key) for its layout menu: reset its size, move Files or Lines to the other side, or hide it.' },
  { id: 'f-rail', text: 'For more room for code, Settings › Layout › Side rail puts the tools in a strip on the left. The › at its bottom shows their names. Files and Lines can sit on either side of the code.' },
  { id: 'f-gamefolder', text: 'Files › Your game on this PC: link the folder your game is installed in, and Check compares the executable and file lists with the real files, and hints at the Proto Input hooks the game\'s .exe and DLLs call for. Read in your browser only.' },
  { id: 'f-settings-io', text: 'Settings › Updates and backup exports your settings to a file, so you can import them on another computer or browser.' },
  { id: 'f-feedback', text: 'If something looks wrong, use Report a problem (in the menu, or {key:palette}). It opens the right GitHub form, filled in with your browser, your settings and where the handler came from, but never your code. Without a GitHub account you can copy the report for the testers’ Discord thread instead.' },
  { id: 'f-check-wrong', text: 'If Check warns about code that works in Nucleus, open the problem in Check (or hover it) and use the flag, This check is wrong. The check and the line are filled in for you.' },
  { id: 'f-tryit-differs', text: 'If Nucleus did something Try it didn’t show, use the icon in the corner of Try it’s result. It reports what Try it showed next to what really happened.' },
  { id: 'f-a11y', text: 'Settings › Accessibility: colour-blind-friendly colours, another underline for problems, a strong focus ring, larger buttons, an easier-to-read font, and notes that stay until you close them.' },
  { id: 'f-files', text: 'For a handler with extra files (ini, dlls…), Files above the code shows the package as Nucleus installs it. You can open its text files in tabs and drop files on it to add them.' },
  { id: 'f-swipe', text: 'When you\'re done with a note at the bottom right, swipe it off to the right. Hover the stack to read them all.' },
  { id: 'f-gutter', text: 'Click a marker next to a line number for that line’s problems and fixes.' },
  { id: 'f-hub', text: 'The examples include the most-downloaded verified Hub handlers. Check and Try it work on them, so you can see how others solved a problem.', action: { label: 'Examples', run: 'examples' } },
  { id: 'f-vscode', text: 'If you\'d rather use your own editor, the VS Code extension has the same checks, docs on hover and Try it, for the files in your handlers folder.' },
]);

// Who each tip is for (Tip.for). Unset: useful to everyone. Guided shows newcomer tips, Advanced mode
// developer tips; both show the rest. Things an experienced author already knows (how to get suggestions,
// VS Code's editing keys, the mascots) are for newcomers; power-user shortcuts and
// workflow settings are for developers.
const NEWCOMER = new Set(['start', 'in-play', 's-tutorial', 's-suggest', 's-edit', 'c-theme', 'c-editor', 'c-advanced', 'f-mascots', 'f-mascot-modes', 'f-swipe', 'f-gutter', 'f-hover', 'f-votes', 'f-eq-values', 'f-value-pick', 'f-reference', 'f-ref-home', 'f-lines']);
const DEVELOPER = new Set(['s-find-all', 's-goto', 's-open-keys', 'f-vscode', 'f-custom-theme', 'f-settings-io', 'c-review', 'c-wakatime', 'f-save-nucleus', 'f-ai-providers']);
for (const t of [...CONTEXT_TIPS, ...PITFALLS, ...SHORTCUTS, ...BEST, ...FEATURES_, ...SETTINGS]) {
  if (NEWCOMER.has(t.id)) t.for = 'newcomer';
  else if (DEVELOPER.has(t.id)) t.for = 'developer';
}
/** Is this tip for someone in this mode? */
export const tipFor = (t: Tip, who: 'newcomer' | 'developer') => !t.for || t.for === who;

/** Which tips show (Settings › Testing): the ones for your mode, or, to test them, all or one audience. */
export type TipShow = 'mode' | 'all' | 'newcomer' | 'developer' | 'everyone';
export const tipShown = (t: Tip, show: TipShow, who: 'newcomer' | 'developer') =>
  show === 'mode' ? tipFor(t, who) : show === 'all' ? true : show === 'everyone' ? !t.for : t.for === show;

const GROUPS = [PITFALLS, SHORTCUTS, BEST, FEATURES_, SETTINGS];
/** Every general tip, the topics taking turns, so Next goes round them. */
export const GENERAL_TIPS: Tip[] = Array.from({ length: Math.max(...GROUPS.map((g) => g.length)) }, (_, i) => GROUPS.map((g) => g[i])).flat().filter(Boolean);
