# Changelog

What changed in each release of the SplitScreen.Me / Nucleus Co-op handler tools for VS Code (and the `nucleus` command-line tool and MCP server that ship with it). Newest first.

<!--
How to write it (people and AI agents read this; the release workflow publishes each section as the release notes and refuses to release without one):
- Add each user-visible change under "## Unreleased", in one of these groups, biggest change first:
  ### ✨ New · ### 🛠️ Improved · ### 🐛 Fixed · ### ⚡ Faster · ### ⚠️ Changed (what users must do differently) · ### 🙏 Thanks
- 🙏 Thanks: one line per person who tested, reported a bug or contributed to this release, e.g. "- **Horah** for reporting …". When it came through GitHub (an issue, a pull request, a review), link their profile: "- **[name](https://github.com/name)** for …". Credit them inline too ("Reported by Horah.").
- One line per change: a **short summary** in bold (the update note and the Discord post show only that), then one or two plain sentences.
- A screenshot (or other media) for big, visible changes, folded away in a `<details><summary>Screenshot</summary>` block indented under its line, with a blank line before and after the image and the closing `  </details>`; the image line: `  ![What it shows](https://raw.githubusercontent.com/Snailedlt/splitscreenme-vscode/main/docs/images/changelog/<version>-<name>.png)` (≈1000 px wide, docs/images/changelog/).
- At release: rename "## Unreleased" to "## <version> · <yyyy-mm-dd>". A `---` line separates releases.
- A bug fixed or a request done from an issue in this repository: end that change's own line with "(#12)" (several: "(#12, #14)"), or say "Fixes #12" in the commit. On release the issue gets a short comment, "Fixed in vX.Y.Z" (under 🐛 Fixed) or "Added in vX.Y.Z" (elsewhere), with a link to the release notes and a thanks to whoever reported or asked (scripts/issue-bots.mjs in splitscreenme-vscode). Only "(#12)" counts: a number mentioned in passing ("see #12") or on a Thanks line doesn't.
-->

## 0.9.0 · 2026-11-18

### ✨ New

- **Which hooks does my game need? Ask its files.** Link the handler to the game's folder (*Nucleus: Game Folder: Link…*, or `gameFolders` in other editors) and the tools read the game's `.exe` and DLLs in the background: what it uses for controllers, the cursor, keys, focus and windows. Quiet hints then suggest the Proto Input hooks and Nucleus options that match and the handler doesn't have yet, each with a fix that adds the line. `ncdev imports <game folder>` (and the MCP tool `nucleus_game_imports`) print the whole picture. It follows a launcher to the game it starts (Warcraft III's), spots SDL built into a game, and was checked against 35 games' Hub handlers and Proto Input's and Nucleus' source. Idea from messenils (#39).

  <details><summary>Screenshot</summary>

  ![VS Code with a game folder linked: on Game.ExecutableName, quick fixes offer Game.ProtoInput.XinputHook, ClipCursorHook and MessageFilterHook](https://raw.githubusercontent.com/Snailedlt/splitscreenme-vscode/main/docs/images/changelog/0.9.0-game-files.png)

  </details>

- **Vote on docs in VS Code too.** The Docs panel has 👍/👎 for each part of a doc (the doc, and the AI-written "In practice"), counted with the workbench's, anonymously and only while VS Code telemetry is on. Click again to take a vote back.
- **Report from where you are.** *Nucleus: Report a Problem…* and *Request a Feature…* (Command Palette, the language status's *Feedback*, Notepad++'s plugin menu, `ncdev report`) open the right GitHub form, filled in with the versions and where the handler came from, never its code. You never pick a repository, and you see everything before it's sent. (#14)
- **"This check is wrong" on every check's problem.** Ctrl+. in VS Code, Alt+Enter in Notepad++, the code actions of other editors and `ncdev report --check <rule>` open a report with the check, the message and the line; the flagged lines' code only if you choose to include it.
- **"Nucleus did something different" in Try it.** The Try it panel's report button sends what Try it showed (each player's window, arguments, file changes) next to what really happened.
- **Possible duplicates first, and no account needed.** Before a new report, the tools show open reports that may be the same, to 👍 instead. No GitHub account? *Copy the report* and paste it in the testers' Discord thread. A problem with one Hub handler goes to its Hub page, Discord or Reddit instead of our forms.
- **Releases tell the issues they fix.** A release comments "This is in vX.Y.Z" on each issue it fixes and thanks whoever reported it.
- **"In practice" in the docs.** For the 86 most used options and calls, the docs now have a second part, written by AI from Nucleus Co-op's source and the Hub handlers: what the option really does (`Game.Hook.ForceFocus` only matters with the custom XInput DLL; Nucleus replaces `Game.LockInputToggleKey` with your own lock key) and how Hub handlers use it. It's labelled AI-written in hovers, suggestions, the Docs panel, `ncdev api` and the `.d.ts`, apart from the doc above it.
- **A hint when keyboard and mouse players would get nothing.** In a handler for several keyboards and mice, Proto Input's cursor and key hooks (`GetCursorPosHook`, `GetKeyStateHook`, …) without `Game.ProtoInput.RegisterRawInputHook` now get a quiet hint: those hooks answer from keyboards and mice that only the raw input hook reads, so players would see no key presses and a frozen cursor. The fix adds the hook. "In practice" for these hooks and for `Game.Hook.SDL2Enabled` (which only works for games with a separate `SDL2.dll`) explains it, from Proto Input's and Nucleus' source.
- **"In practice" says where game engines differ.** For 59 options and calls, the docs add a counted line where handlers for Unreal Engine, Unity or Source games use them notably more or less than all Hub handlers ("By engine: Unity games 74% of 203 handlers (all Hub handlers 20%)"), and "In practice" names a few engine habits (Unity's `Screenmanager` registry values, Source's `hl2_singleton_mutex`). Engines come from Wikidata (by the game's Steam ID or IGDB page) and the handlers' own code.
- **An example for most options.** Docs show an example for 611 of the 750 options and calls: the official docs' own, else the value most Hub handlers use, an AI-written one, or one made from the type, each saying where it comes from.
- **Vote on docs, people and AIs apart.** 👍/👎 on both parts of a doc (the doc and "In practice"). AI agents can vote too (`ncdev docs vote`, the MCP tool `nucleus_vote_doc`), counted apart; an AI-written part with at least 10 votes from people, 90% 👍, is labelled *Verified by people*. The docs show the counts.
- **One Run button above a handler.** The editor title's Run button (▷) now holds *Test in Nucleus Co-op* (Windows), *Try It* and the new *Debug Handler*, as the Python extension does, instead of two separate ▷ icons. Debug steps through the handler, simulated, and pauses on its first line when it has no breakpoint.
- **The handler's status beside its language.** Hover **{} Nucleus Co-op handler** in the status bar for its checks (the problem count, or OK) and its game folder, with *Link…* or *Unlink*, as TypeScript and Python show theirs. Nothing new sits on screen.
- **A Nucleus output channel.** *View › Output › Nucleus* logs what the extension did (packaged, installed, linked, tested) and every error, with *Show Log* on error messages.
- **Handlers have their own file icon.** Handler files show Nucleus Co-op's logo with a JS tag in the Explorer, tabs and breadcrumbs, so you can tell them from other JavaScript at a glance (and see when one wasn't detected). It shows with VS Code's default file icons; icon themes that pick icons by file extension, such as Material Icon Theme, keep their JavaScript icon.
  <details><summary>Screenshot</summary>

  ![The VS Code Explorer in light and dark: Demo.js, a handler, has the Nucleus Co-op logo with a JS tag as its icon, helpers.js keeps the JavaScript icon](https://raw.githubusercontent.com/Snailedlt/splitscreenme-vscode/main/docs/images/changelog/0.9.0-file-icon.png)

  </details>

### 🛠️ Improved

- **No error for code that never runs.** A name that doesn't exist inside a function nothing in the handler calls is now a warning that says so, instead of an error: it can't break anything until something calls that function.
- **Settings in titled groups.** Settings has the extension's settings in titled groups (General, Checks, Format, Nucleus Co-op) with readable choices (*JavaScript*, not `javascript`). Searching Settings for "nucleus" still finds them. Command ids, setting keys and keybindings stay the same, so nothing you set up breaks.
- **Fewer pop-ups.** "Nothing to fix", "Fixed 3 problems", "Checked 12 handlers" and a handler that can't be formatted yet (with format on save, a syntax error used to warn on every save) now show briefly in the status bar and go to the output channel, not a notification.
- **Game facts aren't problems.** With a game folder linked, facts such as *Your game: Unreal Engine* are hints (no squiggle, still in the hover and the language status); real mismatches stay problems.
- **Try it, tidier and keyboard friendly.** Its explanation is folded into *How this works ⓘ*; Players, Keyboard & mouse and Monitor are real toggle buttons (screen readers hear which is pressed), and the focus stays on the button you clicked. *Try It: Test All Combinations* is in the Command Palette now.
- **New Handler as one guided flow.** Five steps in one box, with a step count and a Back button that keeps your answers; the last step picks the folder, and it saves `<Name>.js` together with its `<Name>/` folder.
- **The Docs hold the web links.** The Docs panel's main page lists the guides, Proto Input, FAQ, the Hub and where to ask for help, so *Docs: Open* and *Docs: Search…* are all you need (*Docs: Web Links…* leaves the palette; its id still works). Searching the docs ranks `Game.*` options first.
- **Clearer parameter hints.** A parameter that takes text shows `string`, not `string | number | boolean` (and an enum parameter its enum), in hints, hovers and the reference.
- **The debugger opens on Locals.** Its first scope is now *Locals* (was *Variables › Variables*), expanded where it pauses.
- **What's New opens at your version**, without the notes for the next one.
- **A better walkthrough.** New steps for the Docs, the debugger (F5) and Fix all; *Test in Nucleus Co-op* shows only on Windows; no more raw code marks in the step text, and the first step no longer shows an unrelated picture.
- **Nucleus commands only where they work.** The command palette shows Try It, Fix All, Explain This Line, Package, Install, Test in Nucleus Co-op and the game folder commands while a handler is open, and the Explorer's right-click menu offers Package and Install on handlers only, not on every `.js` file.
- **Clearer command names that sort together.** In the palette, related commands now sit side by side: *Docs: Open* and *Docs: Search…* (*Open Documentation…*, renamed *Docs: Web Links…*, is no longer in the palette); *Game Folder: Link…* and *Game Folder: Unlink* (shown only when a folder is linked). *Lint All Handlers in Workspace* is now *Check All Handlers in the Workspace*, and *Fix All Auto-fixable Problems* is *Fix All Problems That Can Be Fixed*. *Format Handler* leaves the palette, since Format Document (Shift+Alt+F) does the same in a handler; its keybinding stays. Keybindings to the old commands keep working.
- **Fix all leaves harmless lines for you to choose.** `fixAll` in the shared checks can skip cleanups (lines that do nothing, such as `Player.ProtoController5`); the workbench uses it and offers them afterwards.

### 🐛 Fixed

- **Docs examples keep their nesting.** Examples such as `Game.ProtoInput.OnInputLocked` showed a loop's body and a call's arguments flat, and *Insert into handler* pasted them that way.
- **Game-file hints: launchers and wording.** A handler with `Game.LauncherExe` and `Game.ProtoInput.InjectStartup` gets a warning: startup injection goes into the launcher, so the hooks never reach the game; the fix switches it to runtime injection. A hint no longer shows empty brackets when nothing in the files triggered it.
- **Try it lists the Proto Input and Hook options you set.** *Options set* left out every `Game.ProtoInput.*` and `Game.Hook.*` value; VS Code, Notepad++ and `ncdev simulate` now show them.
- **Game Folder: Link…, Install and Test in Nucleus Co-op in browser-based VS Code.** code-server and Codespaces hid them from the command palette, though they work there.
- **"Move the code into Game.Play" keeps your indentation.** It used two spaces even in a handler indented with four or with tabs.
- **Clearer `ncdev` messages.** `ncdev <command> --help` shows that command's help; `imports` says when a folder doesn't exist or `--exe` names no program there, and `--json` respects `--no-controllers` and `--no-kbm`; `report` says when a word isn't a kind of report, or when the check doesn't flag the line you gave; `lint --fix-dry-run` shows what's left at the file's own line numbers.
- **Reports and votes.** A copied report's heading no longer repeats itself, VS Code's *Request a Feature* is titled as such, and a Docs vote no longer waits on a slow connection.
- **Notepad++: the right version and shorter status messages.** About showed plugin 1.0.0; it now shows the release's version. The status bar messages after copying a report or linking a game folder fit.
- **Faster suggestions in other editors.** `ncdev lsp` sends only the suggestions that fit what you've typed (after `Game.Xin`, a few instead of all of Game's), so Notepad++ and others get much smaller replies.
- **Docs attached to the wrong option.** Some Proto Input docs came from the line next to them in the official docs (`InjectRuntime_EasyHookStealthMethod` said "Automatically locks input once the instances are set up", `BlockedMessages` had Block Raw Input's text), and a few options had the next option's line of code as their doc (`IgnoreDeleteFilesPrompt`, `DeleteFiles`, `CopyFoldersTo`, `CMDStartArgsInside`). Each doc now belongs to its own option, and `HexEditFileAddress`, `RenameAndOrMoveFiles`, `CopyEnvFoldersToNucleusAccounts` and `CMDBatchClose` got theirs.
- **Linking a game's folder no longer writes your PC's path into the project.** *Game Folder: Link…* (was *Link the Game's Folder…*) keeps the link in VS Code's own storage on this PC instead of `.vscode/settings.json`, so it can't end up in a shared repository; links made before still work. *Unlink* now says what it did, and with nothing linked it no longer creates an empty settings file.
- **No wrong "quote the case" fix for option lists changed later.** `option-compare` no longer offers `case "2":` when the option's list is changed by a method call, also one written with brackets (`answers["push"]`), since a fresh pick could then be a number. Found by CodeRabbit.

- **Game-file hints are safer and more exact.** A folder name with quotes or line breaks stays inside `Game.SDLPaths`' string, a named pipe or special file is never read, and a damaged or hostile program file has one work and size budget, so it can't stall the editor. `--exe`/`exe` matches a path before a bare name (and says when nothing matches), hints follow a launcher from the game too, ignore DLLs of the other bitness and commented-out hooks, and a fix never lands inside a callback or a comment. `Game.SDLPaths` is relative to the root of Nucleus' copy (the `.exe`'s folder, or above it by `Game.BinariesFolder`), a `Game.ExecutableName` two programs share gives no hints instead of a guess, and the last `InjectRuntime_…` assignment counts.
- **Reports never send your code before you choose.** In other editors (`ncdev lsp`), *This check is wrong* opens the form without the flagged lines, the check's message or the handler's name; they're one choice away. Reports from a check that moved since are left without code, a form whose browser didn't open says so with the link, and `ncdev report --line` takes only real line numbers.
- **Votes and the Docs panel.** A vote that couldn't be sent isn't saved as counted, two quick votes no longer overwrite each other, and voting doesn't reopen a closed Docs panel. AI votes wait at most 8 s and are sent once per part, even when asked twice at once.
- **Smaller fixes.** Unlinking a game folder keeps another handler's setting; Try it reports the handler on screen and keeps the focus through a long Test all; New Handler never replaces a file without asking, nor writes the script when its folder can't be made; F5 pauses on the first line as the Run menu does; What's New never shows a newer version's notes; Format Handler says when it can't format; `protoinput-needs-raw-input` uses the last assignment and ignores comments; the Notepad++ plugin checks the clipboard before opening Discord; the feature-request form loads again.

### 🙏 Thanks

- **messenils** for the idea of reading the game's own program files to suggest hooks (#39 started from it).

---

## 0.8.0 · 2026-11-17

### ⚠️ Changed

- **Handlers open as "Nucleus Co-op handler", without VS Code's JavaScript suggestions.** VS Code's own JavaScript suggestions and type lines no longer mix in with the handler's: no browser globals, and no newer methods that Nucleus' engine doesn't have. Colours, brackets and folding stay those of JavaScript. Click the language in the status bar to switch a file back, or set `splitscreenme.languageMode` to `javascript` to keep all handlers as JavaScript; **Set Up Type Definitions** does that for its folder.
  <details><summary>Screenshot</summary>

  ![A handler in VS Code: the status bar says Nucleus Co-op handler, and Game.Hook. suggests only Nucleus options with their docs](https://raw.githubusercontent.com/Snailedlt/splitscreenme-vscode/main/docs/images/changelog/0.8.0-language-mode.png)

  </details>
- **Handlers are coloured like any JavaScript file.** Nucleus names now use JavaScript's own categories, so your theme colours them as it colours everything else: `Game` and `Context` as variables, what's on them as properties, what you call as methods. Option groups (`Game.ProtoInput`, `Nucleus.Folder`), fixed choices (`Nucleus.Folder.InstancedGameFolder`) and callbacks (`Game.Play`) keep a colour of their own in VS Code, through your theme's namespace, enum value and function colours. `Game` is no longer shown in the type colour. Other editors can style these three with the new `group`, `choice` and `callback` modifiers (PORTING.md).

### ✨ New

- **Options compared as numbers or booleans.** When the player starts from a saved profile, Nucleus gives every `Game.AddOption` value back as text, so `Context.Options["players"] === 4`, `== true` or `case 4:` never match, and a `false` option is the text "False", which an `if` counts as true. The new check, `option-compare`, finds these, also through the handler's own variables (`var p = Context.Options["players"]; if (p === 4)`), and offers `==` or `case "4":` as the fix. Loose `== 4` works and stays quiet.

### 🐛 Fixed

- **No "has no effect" warning on `File.Exists((Context.filePath = ...))`.** An unknown `Context` property assigned inside a call or a condition passes its value on, like the `var x = (Context.X = ...)` idiom, so it's now the same quiet hint instead of a warning that said the line does nothing.

---

## 0.7.0 · 2026-11-15

### ✨ New

- **`var Game = {}` is now an error.** Declaring `Game` or `Context` yourself (a variable, a parameter, a function name) puts a new object where Nucleus's was, so Nucleus never sees what you set on it: with `var Game = {}` it finds no Game.Play, and a `var Context` in Game.Play loses StartArguments. The new check, `replaces-nucleus-object`, says so, and the other checks keep looking at those lines.
- **A quick fix for a misspelled file in the handler's folder.** When the handler uses `Game.Folder + "\\Confg.json"` and the package has `Config.json`, Ctrl+. changes the name (VS Code and other editors through `ncdev lsp`).

### 🛠️ Improved

- **Setting up Notepad++ needs no administrator terminal.** Double-click `ncdev.exe` for a short menu and choose *Set up Notepad++*; when Notepad++ is in Program Files, ncdev asks Windows for permission itself (from a terminal too). From a terminal with no arguments, ncdev still just prints its help.
- **`ncdev api Game` lists what's on Game.** Looking up an object Nucleus provides (`Game`, `Context`, `Player`, `Game.Hook`, `Nucleus`…) says what it is and lists its members by category, instead of "not part of the API". The MCP tool `nucleus_api` answers the same way.
- **Nucleus's callbacks are coloured as functions.** `Game.Play`, `Game.OnStop`, `Game.OnFinishedSetup` and the other callbacks Nucleus calls now get your theme's function colour, like `Context` methods, so they stand out from the settings.

### 🐛 Fixed

- **No "not defined" errors on top of an arrow function or destructuring.** Names that an arrow function, destructuring, a default or rest parameter, or a class declares counted as undefined, with a wrong "Did you mean" fix. Now there's just the one error about the ES5-only syntax.
- **Explain quotes a template string as it's written.** It showed `` `-w ${Context.Width}` `` in single quotes; it keeps the backticks now.

---

## 0.6.0 · 2026-11-13

### ✨ New

- **Nucleus names in your theme's colours.** `Game` and `Context` show as objects, with their properties, methods and enum values (`Nucleus.Folder.InstancedGameFolder`) each in their own colour, so a name Nucleus doesn't know stands out in plain text next to its underline. In VS Code and the LSP editors that colour by meaning (semantic highlighting).
- **Explain this line.** Not sure what a line does? **Ctrl+Alt+E** (or right-click › *Explain This Line*) says it in plain words: what it sets or calls, the docs of the names in it, and what Check says about it. In Notepad++: *Plugins › Nucleus Co-op handlers › Explain this line*. Other editors get it as a code action (`nucleus.explainLine`).
- **A page for every check.** Each problem links to its own page: what it means, why Nucleus cares, a wrong and a right example, the fix, and how to turn it off. [All checks](https://snailedlt.github.io/nucleuscoop-handler-testbench/rules/), one page each, so you can link one in Discord too.
- **Test in Nucleus Co-op, one click.** The ▷ button above a handler (and *Plugins › Nucleus Co-op handlers* in Notepad++) installs it and starts Nucleus Co-op with its game selected: pick the players and press Play. An open Nucleus is restarted with your OK (it reads handlers when it starts), its debug log can be turned on with one answer, and *Open Nucleus Co-op's Debug Log* shows what happened. Also `ncdev test` for other editors.
- **Docs one click from your code.** API names in hovers, parameter hints and suggestion docs are links. In VS Code they open **Nucleus Docs** beside the editor (offline): the name's page, a path back to its group and the main page (*Docs / Context / ModifySaveFile*), *Search…*, and *Open in the workbench*. Other editors (Neovim, Helix, Zed…) link to the same page in the browser workbench. Also *Nucleus: Docs* and *Nucleus: Search the Docs…* in the Command Palette.
- **A Notepad++ plugin.** Problems are underlined as you type, hovering a name shows its docs, suggestions know where you are (the members that exist there, an option's values, the game's own files), and `(` shows the parameters. Alt+Enter offers the fixes for the line; *Plugins › Nucleus Co-op handlers* has Fix all, Format, Try it, a Problems panel and Link the game's folder. `ncdev setup notepad++` installs it.
- **`ncdev`, one download, nothing else to install.** The command-line tools are now `ncdev` (Nucleus Co-op dev tools), and `ncdev.exe` on the release page runs on Windows without Node.js. `ncdev update` gets the newest version, checked against the release's checksums. `nucleus` still works.
- **A getting-started guide in VS Code.** *Help › Welcome › Make a Nucleus Co-op handler* walks from an empty file to the Hub in six steps (start, check, Try it, the game's folder, testing in Nucleus, sharing), each with its button.
- **Notepad++: Browse the Hub, Package and Settings.** *Plugins › Nucleus Co-op handlers* can now browse and search the Hub and download a handler with its files, package a handler as `.nc` for upload, and set how strict each check is and the format style in a Settings dialog.
- **Package, Install and New handler in every editor.** Editors that use `ncdev lsp` (Neovim, Helix, Zed, Sublime Text…) get *Package as .nc* and *Install to Nucleus Co-op* in their source actions, and a `nucleus.newHandler` command. In an empty file, typing `handler` offers the whole New Handler template (VS Code and Notepad++ too).
- **One house style, your call.** Format Document now also writes double quotes (what the Hub install reads `Game.GameName` between) and ends statements with semicolons, and only if the program provably stays the same. Both can be changed or turned off (`splitscreenme.format.quotes`, `splitscreenme.format.semicolons`; `--quotes`, `--semicolons` for `ncdev format`). Format Selection and format-as-you-type work too.
- **What to pass, for every parameter.** Parameter hints and hovers now say what each parameter of the most used Nucleus methods takes (e.g. `ReplaceLinesInTextFile`'s `"N|text"` lines, counting from 1), written from the Nucleus source and marked AI-written, and JavaScript's own methods get theirs too.
- **Snippets for what most handlers do.** Type the start of `iniset`, `replacelines`, `regkey`, `startargs`, `ifoption`, `firstplayer`, `eachplayer` or `option` at the start of a line and pick it: ready-made code the way Hub handlers write it, to fill in.
- **Your own functions, understood.** `myFunction().` suggests what its result has when its `return`s (or an `@returns {type}`) say what it gives back, and `@param` lines in the comment above it show in its parameter hints.
- **Smarter suggestions after a dot.** A string literal, a joined string (`path + "\\x.ini"`), what a method gives back (`.replace(…).`, `.split(",")` and its items) and numbers now get their own methods, hovers and parameter hints. `Context.Options["…"]` with a key no `Game.AddOption` adds is flagged (a typo in the key), with a fix to the right one; hovering `Context.Options` lists the handler's keys.
- **Suggestions know your own code.** `Context.Options["` suggests the keys your `Game.AddOption` lines add, `== "` their choices, and hovering a key shows the option (all editors). In Notepad++ and other editors, your own functions and variables are suggested and explained too (with the comment above them), with parameter hints, and *Rename…* changes one everywhere.
- **New handler, Install and Outline in Notepad++.** *Plugins › Nucleus Co-op handlers* can now create a handler (name, exe, Proto Input, Goldberg…), install it into Nucleus Co-op, and show an outline panel of its options and functions to jump around in. `ncdev install` does the same from a terminal.
- **Go to definition.** On a function or variable of the handler, F12 (VS Code, other editors) or Alt+F12 (Notepad++) jumps to where it's declared; on `Game.Play` or any option to where it's set; on `Context.Options["key"]` to its `Game.AddOption`. Find references lists every use (Language Server, Notepad++).
- **Open a handler in the browser workbench.** *Nucleus: Open in the Browser Workbench* (VS Code) and *Plugins › Nucleus Co-op handlers › Open in the browser workbench* (Notepad++) open the handler you're editing there, for its visual editor, Lines and Test all.
- **Common JavaScript mistakes caught.** The checks now include ESLint's rules for real bugs: `=` where `==` was meant, a backslash that disappears from a Windows path (`"C:\Games"`), the same key twice, code that never runs, a line that does nothing, and more, each explained in plain words. On the Hub's 896 handlers they found only real bugs.
- **AI agents sign their handlers.** With the agent kit, Claude Code and other AI agents add a few comment lines at the top of a handler they write or change: which agent, what `ncdev lint` and `ncdev simulate` showed, and that it wasn't run in Nucleus. Helpers see at a glance how a handler was made.
- **Notepad++, 32-bit too.** `ncdev setup notepad++` installs the plugin for 32-bit Notepad++ as well as 64-bit.

### 🛠️ Improved

- **AI agents get the newer tools.** The MCP server adds `nucleus_debug` (breakpoints with conditions, watches), `nucleus_explain` (what a line does) and check explanations (`nucleus_rules` with a rule id); every problem carries its docs link, a path also checks the handler's folder, and the server hands every agent the hard rules. The CLI has `ncdev rules <id>` and `ncdev explain`, and the skill lists them all.
- **Where to ask for help.** Nucleus: Open Documentation lists the SplitScreen.Me Discord and r/nucleuscoop, and `ncdev --help` ends with both.
- **The feedback form fits what you report.** It's for checks and the editor tools, with up-to-date choices under *Where*, and links fill that in from where they are. Workbench and site feedback has its own form in the workbench's repository.
- **The Notepad++ plugin says its version.** `NcDev.dll` now carries its version and name (Properties › Details in Windows, and what Notepad++'s Plugins Admin reads), ready for a listing there.
- **Try it never freezes the editor.** It runs in a background thread: a handler stuck in an endless loop is stopped, a new edit cancels the old run, and Test all shows progress and can be cancelled. The same goes for `ncdev lsp`, `ncdev mcp` and the debugger.
- **Notepad++ stays responsive while ncdev works.** Hub search and download, Install, Package, Test, Update and the API reference run in the background with a timer in the status bar, and a tool that hangs is stopped.
- **Lighter on hub.splitscreen.me, and it knows who asks.** Requests at the same time are shared, at most two downloads run at once, retries back off on errors, and when the Hub is down the last list is used for a while. Every request names these devtools, which tool sent it and why (e.g. `vscode-extension hub-browse`), and nothing about you.
- **`ncdev lsp` watches only handlers and their folders.** Changes in `node_modules` and `.git` no longer wake it up.
- **Zip packages read more file names correctly.** Names stored without the UTF-8 flag are read as UTF-8 when they are valid UTF-8.
- **Missing required options, explained and filled in.** A missing `Game.GUID`, `Game.GameName` or `Game.ExecutableName` now says what each one is for, and the fix fills in what the handler already tells it (the GUID from the game's name, or the other way round), so *Fix all* can add it; only real unknowns get a placeholder to fill in. A missing `Game.ExecutableName` is reported once, not twice.
- **Every use of a name, highlighted.** In editors that use `ncdev lsp`, the cursor on a variable or function highlights its other uses, as VS Code does.
- **The Hub's most downloaded.** `ncdev hub search --popular` lists the Hub's most downloaded handlers.
- **Set it up in your own editor.** The README has a new section for experienced developers: how to point Neovim, Helix, Sublime Text, Emacs, Kate, JetBrains IDEs or Zed at `ncdev lsp`, how much setup each takes, and which ones we've tested.
- **Neater code in hovers and docs.** Examples and long signatures are laid out the way prettier would: one parameter, list item or argument per line when they don't fit, a last list hugged by its call, long `+` chains broken after `=`. Short code stays on one line, and what the code does never changes.
- **JavaScript's own methods in suggestions.** After a string (`Context.StartArguments.`), a list, `Math.` or `JSON.`, suggestions, hover and parameter hints cover JavaScript's built-in methods, only the ones Nucleus's engine has (`replace`, `split`, `indexOf`, `Math.floor`…), with a link to their docs. A misspelled `Math` method is flagged.
- **Names Nucleus itself gets wrong.** Nucleus misspells two Proto Input options (`WindowActvateAppFilter`, `TranslateXAccelration`), and its readme and Handlers Tool give a few names that don't exist (`Usex360ce`, `IgnoreWindowBordercheck`…). Writing the correct spelling, or the readme's, now explains why it does nothing and offers the name that works.
- **A fix for an exe that isn't there.** With the game's folder linked, a wrong `Game.ExecutableName` now offers the one exe it most likely means (e.g. Unreal's `…-Shipping.exe`), not only for near spellings.


### 🐛 Fixed

- **"Fix all" is back in the Ctrl+. menu.** VS Code dropped it from the quick fixes; it now shows next to the single fix whenever more than one problem can be fixed.
- **Every problem links to its docs.** Package and game-folder problems in VS Code now link to the checks pages, as the others do.
- **Search finds the obvious name first.** "mutex" lists `Game.KillMutex` before `Game.KillLastInstanceMutex`.
- **New Handler checks every value.** In the CLI, the MCP server and the language server, a max player count that isn't 1 to 16, a Steam id that isn't digits, an exe that isn't a file name, or an unknown feature is refused with a plain reason, instead of ending up in the handler's code.
- **Clear answers to wrong input.** The MCP tools say what's wrong (a folder instead of a file, a missing name, players out of range) instead of showing a raw error or quietly changing the value, and `ncdev` names a missing file plainly.
- **Breakpoints past the end are flagged.** The debugger marks a breakpoint beyond the last line as not set, and `ncdev debug` says it can't be hit.
- **Long files lint quickly.** Checking a handler with thousands of lines no longer slows down with every problem found.
- **`ncdev setup` suggests the right spelling.** A typo such as `ncdev setup nodepad++` now says *Did you mean: ncdev setup notepad++*.
- **The extension works in folders VS Code doesn't trust yet (Restricted Mode).** Before, it was switched off there, so a downloaded handler showed no checks and no suggestions. Install, Test in Nucleus Co-op and Set up AI agents ask you to trust the folder first, since Nucleus Co-op runs the handler's code.
- **Docs links open the name's own page on the site** (`docs/Context.ModifySaveFile/`): from hovers and suggestions in Notepad++, Neovim and the other LSP editors, and from **Open on the web** in VS Code's Nucleus Docs panel. Each page has the 👍/👎 and the report link.
- **Notepad++ in dark mode: the problem and outline lists' column headers and scroll bars are dark too**, with Windows' own dark themes (the ones Notepad++ uses).
- **A misspelled Context property in `var x = (Context.X = …)`** is now a warning with the fix (the idiom itself stays a quiet hint). **`PauseBetweenStarts`** is documented in seconds, which is what Nucleus waits (the official docs say milliseconds), and **`Hook.CustomDllEnabled`** says it's on by default. Context's file, registry and process functions are in their own docs categories instead of "Path variables".
- **Long handlers no longer freeze the editor.** With thousands of assignments, moving the cursor near the end re-read the whole handler once per line above it (finding values to pick from a list); it's read once now.
- **`ncdev lint` no longer stops on a wrong value type.** A value of the wrong type (`Game.MaxPlayers = "4"`) made the command line crash, and VS Code showed it as an error instead of a warning.
- **Browse the Hub can't copy over your workspace.** A Hub handler whose game name was `.` or `..` could make *Copy into Workspace* write over the workspace folder (or the one above it).
- **Try it runs can't affect each other.** A handler that changed JavaScript's own functions could change what later Try it runs showed, until VS Code restarted.
- **Package and Install follow your rule settings.** A rule you turned down or off no longer blocks them.
- **Examples in the docs mean what they say.** Laying out an example could drop parentheses it needed (`(a + b) * c`); such examples now stay as written.
- **The rule link in each problem works.** It pointed at an empty repository.
- **No suggestions inside comments and strings.** Typing `Game.` in a comment or a string no longer opens the API list; option keys and choices inside `Context.Options["…"]` still come up.
- **The Hub install name, the same everywhere.** Check, Try it (`Game.Folder`) and the package checks read `Game.GameName` exactly as Nucleus' Hub install does: no indentation, the second of two matching lines wins, a BOM is ignored.
- **Format keeps unusual line breaks.** Files with an old Mac line break (`\r`) or U+2028/U+2029 are formatted with each break left where it was.
- **Files saved with a BOM.** Problems, fixes and Add `Game.GUID` land in the right place, and a BOM no longer causes a false Hub install error.
- **Quick fixes keep Windows line endings.** In a CRLF handler, quick fixes and Fix all insert CRLF, so lines no longer end up mixed.
- **New Handler checks the game name.** A name with a double quote, backslash, line break or control character is refused with the reason (it would break the Hub install). Accented names give a readable GUID ("Pokémon" → "Pokemon").
---

## 0.5.0 (beta) · 2026-11-08

### ✨ New

- **Debug a handler with VS Code's own debugger.** Press F5 in a handler (or add a "Nucleus handler" launch configuration): set breakpoints in the margin, conditional ones too, step with F10 / F11 / Shift+F11, even step back, and see the variables, `Context`, `Player`, the options set so far and what Nucleus would have done, with hover values and the Debug Console. It runs the way Nucleus does (simulated); `players`, `keyboard` and `resolution` in launch.json pick the setup.
- **Notepad++ support.** `nucleus setup notepad++` adds every handler API name and the `System.IO` members handlers use to Notepad++'s suggestions, with parameters as call tips, and a Run menu entry that checks the open handler. Notepad++'s own words stay, and `--remove` puts everything back. It needs Node.js for now (a standalone download is planned).
- **Check a handler against the game on your PC.** *Nucleus: Link the Game's Folder…* points a handler at the game's install folder; then `ExecutableName`, `BinariesFolder`, the symlink and copy lists and more are checked against the real files, with fixes ("did you mean ShooterGame-Win64-Shipping.exe?"), and those lists suggest the game's own files as you type. Only names and sizes are read. Suggested by messenils.
- **Checks for the files next to your handler.** The files in `<Name>/` beside `<Name>.js` are checked as they'd go into the .nc: names Windows can't install, two files that overwrite each other, broken INI or JSON, very large files, and a file the handler uses through `Game.Folder` that's probably misspelled ("did you mean Config.json?"). In the Problems panel, `nucleus lint` and `nucleus lsp`; `splitscreenme.lint.packageChecks` turns them off.
- **Hub handlers with all their files.** *Browse Handlers on the Hub › Open handler source* now lays the package out the way Nucleus installs it (`<GameName>.js` and `<GameName>/`), says how many other files it has, and offers **Open as Folder** and **Copy into Workspace**.
- **An outline of your handler.** The Outline view, breadcrumbs and *Go to Symbol* (Ctrl+Shift+O) list the handler's settings grouped by object (Game, Game.ProtoInput, Game.Hook…) with their values, the callbacks with what they set inside, and your own functions and variables. In other editors through `nucleus lsp` too.
- **Every Hub handler.** *Browse Handlers on the Hub* and `nucleus hub search` now see all of them (about 900), not only the 600 with the most stars.
- **Other editors: debugging and game-folder checks.** `nucleus dap` brings the debugger to editors with DAP support (Neovim, Helix, Zed, JetBrains, Emacs), and `nucleus lsp` now checks a handler against the game's install folder (the `gameFolders` setting) and shows package problems on the files themselves. PORTING.md has the setup.
- **Other editors see every handler.** `nucleus lsp` now checks all handlers in the folder you open, not only the open files, and checks again when a file changes on disk. Tried in Neovim.

### 🙏 Thanks

- **messenils** for the idea of checking a handler against the game's own files.

---

## 0.4.0 (beta) · 2026-11-07

**The biggest update yet.** Checks that catch settings which quietly do nothing, docs for 150 more API members (and a way to help check them), the same tools in any editor with LSP support, and a first look at stepping through a handler line by line. The workbench got its biggest update too: see its What's new.

### ✨ New

- **Settings that silently do nothing.** Four new checks, each from Nucleus' and Proto Input's source: Proto Input options with no way to start it (`protoinput-inactive`); `BlockedMessages` and the message filters without `Game.ProtoInput.MessageFilterHook` (`protoinput-needs-hook`); a blocked number Proto Input can't block as written (`blocked-message`); and options only read when another is on, like `FakeFocusInterval` without `FakeFocus` (`needs-option`). On the Hub they find 15 handlers with settings that never take effect. Each comes with a fix.
- **Docs for 150 more API members, and you can check them.** Hovers, suggestions and the reference now explain the Proto Input functions and hook IDs, the `Player` members and the most used undocumented options, written from the Nucleus and Proto Input source. Each one is marked as AI-written and says what it's based on, since the official docs don't cover them. Hovers have **Is it wrong? Tell us**, which opens a short GitHub form with the doc attached; once a person confirms one, it says who checked it.
- **Other editors: a Language Server.** `nucleus lsp` brings the checks with their quick fixes, hover docs, suggestions, signature help, Format Document, window-message names and Try it to Neovim, Helix, Zed, Sublime Text, Emacs, JetBrains IDEs, Kate and any other editor with LSP support. [PORTING.md](PORTING.md) has the setup for each one.
- **Step through a handler: `nucleus debug`.** Stop at a line (also only for one player: `--break "14 if Context.PlayerID == 1"`) or where an error ends the run, and see where it is (top of the file, `Game.Play` for player 2 of 4, `Game.OnStop`), the variables, the call stack, `--watch` values and what the handler did so far. The engine behind the coming debugger in VS Code and the workbench.
- **Window messages by name.** In `Game.ProtoInput.BlockedMessages = [0x0008, 0x02a3, 0x02a1]`, each number shows its name after it (`WM_KILLFOCUS`, `WM_MOUSELEAVE`, `WM_MOUSEHOVER`), hovering says what it does and how many Hub handlers block it, and typing inside the brackets suggests the common ones. The names come from Proto Input's own list. Suggested by messenils.

### 🛠️ Improved

- **A typo no longer hides every other problem.** While a line doesn't parse yet (say you're halfway through `player.`), the rest of the handler is still checked, and the error sits on the unfinished code with a plain message ("a name is missing after `player.`") instead of on the next line.
- **Focus loop settings that do nothing.** `Game.ProtoInput.FocusLoop_…` and `FocusLoopIntervalMilliseconds` only work with `Game.ProtoInput.EnableFocusMessageLoop = true`; the `needs-option` check now says so (14 Hub handlers).
- **More suggestions after `=`.** `Game.Play = ` (and the other callbacks) inserts `function () { }` with the cursor inside, and `Game.ProtoInput.BlockedMessages = ` offers the set most Hub handlers block.
- **Set twice: keep either value.** The quick fixes for `duplicate-assignment` now offer both: remove the overwritten line, or keep it and remove the later one.
- **`Hub.*` lines explained.** Hover and `nucleus api` now say what `Hub.Handler.Id`, `Hub.Handler.Version` and `Hub.Maintainer.*` are for (the Hub writes them on upload; Nucleus uses the ID and version to link the handler to its Hub page). They still aren't suggested, since authors don't write them.

### 🐛 Fixed

- **Format Document no longer splits `=>`.** In code that isn't ES5 yet, formatting turned `() => 1` into `() = > 1` (also `**` and `??`); these now stay in one piece.

### 🙏 Thanks

- **messenils** for the idea of naming the window messages.

---

## 0.3.1 (beta) · 2026-11-06

### 🛠️ Improved

- **`Game.SetupSse` no longer suggested.** Nucleus never calls it, so completion and the Lines list leave it out; setting it still gets the warning that it never runs. Reported by messenils.

### 🙏 Thanks

- **messenils** for spotting that `Game.SetupSse` is never called.

---

## 0.3.0 (beta) · 2026-11-05

### ✨ New

- **Format Document for handlers.** Shift+Alt+F re-indents and spaces a handler. It never moves a line (Nucleus runs handlers line by line) and checks that every token and comment is unchanged, so the handler does exactly the same. Also `nucleus format` (`--write`, `--check`) and the MCP tool `nucleus_format`.
  <details><summary>Screenshot</summary>

  ![A messy handler before and after Shift+Alt+F: indentation and spacing fixed, every line in its place](https://raw.githubusercontent.com/Snailedlt/splitscreenme-vscode/main/docs/images/changelog/0.3.0-format.png)

  </details>
- **A changed Game.GUID before it reaches players.** For a handler with a `Hub.Handler.Id` line, VS Code compares `Game.GUID` with the version on the Hub (once per version, cached). Nucleus keys each player's game and profiles by GUID, so a changed one drops the game from their list. Also `nucleus lint --hub`; setting `splitscreenme.lint.compareWithHub`.
- **Option values a saved profile turns into text.** `Game.AddOption(..., [true, false])` gets a warning: a profile gives the value back as `"True"`, so `Context.Options["x"] == true` stops matching. Use text values.
- **Files that aren't UTF-8, and a backslash in GameName.** A file saved as ANSI (accented letters arrive broken in Nucleus) gets a warning, and a `\` in `Game.GameName` is an error: the Hub install names the file after it and fails.
- **Names that don't exist.** A stray word or a typo of a variable (`"system.cfg", sdfsdf`) is now an error: Nucleus throws "sdfsdf is not defined", and at the top level the handler doesn't load. Names from the handler's plugins (`pluginsInfo.txt` in its folder) count as defined.
  <details><summary>Screenshot</summary>

  ![The Problems panel with the new checks: a name that doesn't exist, Game.ForceFinishOnPlay, and option values a saved profile turns into text](https://raw.githubusercontent.com/Snailedlt/splitscreenme-vscode/main/docs/images/changelog/0.3.0-checks.png)

  </details>
- **The .NET calls handlers use are known.** `System.IO.File` (Copy, Exists, Delete, ReadAllText…), `System.IO.Directory`, `System.IO.Path.Combine`, `System.Environment.UserName` and `System.Threading.Thread.Sleep` now have completion, hover docs and argument checks, and a typo like `System.IO.File.Exsts` is flagged. Other .NET names are still allowed. Suggested by messenils.
- **Warns about options set too late.** A new `too-late` rule flags `Game.GUID`, `Game.GameName`, `Game.MaxPlayers`, `Game.SupportsKeyboard`, `Game.Description` or `Game.AddOption` inside `Game.Play` or another callback: Nucleus reads them when it loads the handler or on the setup screen, so there they do nothing. Other `Game` options, such as Proto Input or FakeFocus, still work inside `Game.Play`.
- **Checks for options with a fixed format.** A new `value-format` rule catches a `Game.CustomHotkeys` entry that isn't `"true|Toggle HUD|Ctrl|H"` (Nucleus then registers none of them), folder lists without `folder|destination`, a `Game.SteamlessPatch` Nucleus can't read, and a `Game.BinariesFolder` with slashes in the wrong place. Each one would otherwise fail the setup or silently do nothing.
- **Test all combinations in Try it.** One link runs every player count (up to the handler's maximum), input setup and monitor size, and shows which combinations fail and why. Pick a cell to see that run. The same check as the browser workbench's.
- **Try it with a keyboard and mouse for every player.** Choose "each player their own" (or `nucleus simulate --keyboard all`): every player gets their own keyboard and mouse, as in Nucleus' multiple keyboards and mice mode. Try it says so when the handler doesn't set `Game.SupportsMultipleKeyboardsAndMice = true`.

### 🛠️ Improved

- **Screenshots in your theme.** The README's screenshots show VS Code light or dark, matching your theme on GitHub.
- **Calling a name that doesn't exist is an error.** `System.IO.File.Exsts(p)` or a misspelled `Context` function used to be a warning that said the line does nothing; calling it actually throws, so Nucleus stops there. Reading or setting a misspelled name is still a warning.
- **Game.ForceFinishOnPlay is flagged as historical.** It comes from the original Nucleus Coop, where it closed running copies of the game before each player; today's Nucleus doesn't read it and always closes leftover copies when a session starts. The linter now says so in a warning, instead of "probably a typo", with a fix that removes the line.
- **AI agents report their own time.** The agent skill tells AI agents that use WakaTime to register as agents (category `ai coding`, `ai_line_changes`), not as the person.

### 🐛 Fixed

- **Try it's Game.Folder is where the Hub installs the handler.** `handlers\<GameName>` instead of `handlers\MyHandler`, as the Hub install names the folder after the game name.
- **Try it without Game.Play.** Game.OnFinishedSetup now runs, and Game.OnStop sees the last player's Context, as in Nucleus (it reported "Context is not defined" before).
- **Context paths in Try it.** Context.UserProfileConfigPath, UserProfileSavePath and the Documents paths now get the values Nucleus gives them, including moving a "Documents\\" path to DocumentsConfigPath. The docs no longer claim that ten Context values, such as Context.Options, are copied from Game.
- **Try it follows Jint for System calls.** A misspelled System.IO name fails, a call with the wrong number of values fails, and System.Environment.UserName is text, checked against the real engine.

### 🙏 Thanks

- **messenils** for asking for the `System.IO` lines.

---

## 0.2.0 (beta) · 2026-11-05

### ✨ New

- **Value suggestions as you type.** After `=`, completion offers the option's values: `Game.DPIHandling = ` offers `Nucleus.DPIHandling.True`, `.Scaled` and `.InvScaled` with the default first; on/off options offer `true` and `false`.
  <details><summary>Screenshot</summary>

  ![Completion after Game.DPIHandling = lists the three DPIHandling values, the default first](https://raw.githubusercontent.com/Snailedlt/splitscreenme-vscode/main/docs/images/changelog/0.2.0-value-suggestions.png)

  </details>
- **AI agents can use the tools directly.** `nucleus mcp` is an MCP server for Claude Desktop, Cursor, VS Code Copilot and others: check, fix, Try it, API lookup, templates and Hub search. VS Code's agents get it automatically (VS Code 1.101+), and each release includes a single-file `nucleus.js` for other clients.
- **What's new, right here.** After an update, one note shows the highlights, with a button to read them all. **Nucleus: What's New** opens this list any time; `splitscreenme.showWhatsNew` turns the note off.
  <details><summary>Screenshot</summary>

  ![The update note: Nucleus handler tools updated to 0.2.0, with What's new and Don't show again buttons](https://raw.githubusercontent.com/Snailedlt/splitscreenme-vscode/main/docs/images/changelog/0.2.0-whats-new.png)

  </details>
- **The workbench as one offline file.** Each release includes `workbench.html`, and `nucleus workbench` saves it: open it locally or host it yourself.

### 🛠️ Improved

- **Easier on the Hub.** Searching Hub handlers (command-line tool, MCP server, Browse the Hub) reads our daily copy of the Hub's list instead of the Hub, checked at most once an hour; each handler version is downloaded once, and requests say which tool sent them. Agents are told to fetch one or two handlers, never in bulk.
- **Options and docs stay current.** A daily check notices when Nucleus Co-op or the splitscreen.me docs change and proposes the updated options for review.

---

## 0.1.1 (beta) · 2026-11-05

### 🐛 Fixed

- **No more false Proto Input warning (11 Hub handlers).** `protoinput-legacy-hooks` warned that `HookReRegisterRawInputMouse`/`Keyboard` default to true, but Nucleus only reads them when `HookReRegisterRawInput` (default false) is on.
- **No more false error on `let x` followed by `var x`.** Nucleus' script engine treats `let` and `const` like `var`, so it loads such handlers fine (probe 112; found in a verified Hub handler).

---

## 0.1.0 (beta) · 2026-11-02

### ✨ New

- **Completion, hover and signature help for the whole handler API.** `Game`, `Game.Hook`, `Game.ProtoInput`, `Context`, `Player`, `PlayerList`, `ProtoInput`, `Nucleus.*`, generated from the Nucleus Co-op source and docs.
- **A checker with quick fixes.** 16 rules for what makes handlers fail in Nucleus: ES5-only syntax, misspelled options, `Context` outside `Game.Play`, Hub install pitfalls, wrong value types, ES2015+ functions Nucleus lacks (`.includes()`, `Map`, …). Every rule is checked against Nucleus' real script engine (Jint 2.11.58).
- **Fix all.** Safe automatic fixes, as a command, on save, or `nucleus lint --fix`.
- **Try it.** What Nucleus would set up for each player (window, launch arguments, file changes), beside the editor and as `nucleus simulate`. It follows Nucleus' session and runs the handler isolated from your files.
- **Commands.** New Handler, Package for the Hub (.nc), Install into Nucleus Co-op, Browse the Hub, Set Up Type Definitions, Lint All Handlers, Open Documentation; snippets for common handler tasks; `nucleus.d.ts` type definitions.
