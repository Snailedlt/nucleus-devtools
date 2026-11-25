// The `ncdev --help` text: the CLI prints it, and the site's docs (docs/tools/ncdev/) list the commands from it.
import { FEATURES } from './core/templates';
import { DISCORD, REDDIT } from './core/report';

export const helpText = (VERSION: string) => `ncdev ${VERSION}: Nucleus Co-op dev tools (\`nucleus\` is the old name and still works)

Usage: ncdev <command> [options]

Commands:
  lint <file|dir>...          Check handlers for problems (default command)
  format <file|dir>... [--write | --check] [--quotes double|single|keep] [--semicolons add|keep]
                              Indentation, spacing, double quotes and semicolons (no line moves;
                              the program parses the same, or nothing changes). Prints the result
                              for one file; --write saves, --check lists the files that aren't
                              formatted and exits 1
  api <name>                  Show the type and docs of an API member, e.g. "Game.KillMutex",
                              "Context.ModifySaveFile", "KillMutex", "Nucleus.Folder"
  api --search <words>        Search API names and docs, e.g. "api --search mutex"
  api --markdown              Print the full API reference as Markdown
  docs vote <name> <doc|practice> <up|down>
                              For AI agents: vote on a doc you checked against Nucleus' source (counted
                              apart from people's votes; part "practice" is the AI-written "In practice")
  simulate <handler.js> [--players N] [--resolution 1920x1080] [--keyboard 1|all|none]
        [--option <key>=<answer>]... [--exists <path>]... [--exists-all]
                              "Try it": load the handler and run Game.Play for each player the
                              way Nucleus would (emulating its Jint engine), without Nucleus or
                              the game. Shows each player's window, launch arguments and file
                              changes. File, registry and process calls are recorded, never
                              performed, and the handler has no access to this computer.
                              --option answers one of the handler's Game.AddOption options (else
                              its first choice). --exists names a file or folder that is there
                              (the end of its path, * allowed), --exists-all says they all are:
                              without them nothing exists, so "if (File.Exists(…))" never runs
  debug <handler.js> [--break <line>[ if <condition>]]... [--watch <expr>]... [--step]
        [--players N] [--resolution 1920x1080] [--keyboard 1|all|none]
        [--option <key>=<answer>]... [--exists <path>]... [--exists-all]
                              Run the handler as simulate does and print where it stops: at each
                              breakpoint (e.g. --break "14 if Context.PlayerID == 1"), and where an
                              error ends a phase, with the variables, the call stack and the
                              --watch values. --step prints every line it runs instead
  hub search <words>          Search handlers on hub.splitscreen.me (--popular: the most downloaded)
  hub fetch <id> [--out dir]  Download a Hub handler package and extract it (default ./hub-handlers/<title>)
  new --name <game> --exe <file.exe> [--steam-id N] [--max-players N]
      [--features ${FEATURES.map((f) => f.id).join(',')}] [--out file.js] [--force]
                              Create a handler from a template (--list-features: the features)
  test <handler.js> --nucleus <folder> [--restart] [--debug-log on|off] [--force] [--status]
                              Test in Nucleus Co-op (Windows): install the handler, then start
                              Nucleus with its game selected. --restart closes a running Nucleus
                              first (it reads handlers when it starts); --debug-log sets Nucleus'
                              debug log; --status only says whether it's running and the log's on
  install <handler.js> --nucleus <folder> [--force]
                              Copy the handler (and its <Name>/ folder) into Nucleus Co-op's
                              handlers folder. --force replaces an installed one and installs
                              despite errors
  package <handler.js> [--out file.nc] [--force]
                              Build a Hub package (handler.js + the <Name>/ asset folder)
  init-agent [dir]            Install AI agent instructions and this tool into a handler folder
                              (AGENTS.md, CLAUDE.md, .claude/skills/nucleus-handler/)
  imports <game folder|file>... [--exe <name.exe>] [--no-controllers] [--no-kbm] [--list]
                              What the game's .exe and DLLs use (controllers, cursor, keys, focus,
                              windows) and the Proto Input hooks and Nucleus options that match,
                              with the lines to add. Follows a launcher to the game it starts.
                              --list prints every import and export too. Reads only the files' tables
  rules [<id>]                List lint rules; with an id, that check explained (why, fix, examples)
  explain <handler.js> --line N
                              What line N does, in plain words: its names' docs and its problems
  workbench [--out file.html] [--force]
                              Save the browser workbench as one offline HTML file (from the newest
                              release), to open locally or host yourself
  mcp                         Run as an MCP server (stdio) for AI agents: Claude Desktop, Cursor,
                              VS Code Copilot, ... Its tools check, fix, format, simulate, debug
                              and explain handlers, and look things up in the API and on the Hub
  lsp [--stdio]               Run as a Language Server (stdio) for other editors: Neovim, Helix,
                              Zed, Sublime Text, Emacs, JetBrains (LSP4IJ), Kate, ... (PORTING.md)
  setup notepad++ [--path <folder>] [--check] [--remove]
                              Set up Notepad++ for handlers: the Nucleus plugin (problems in the
                              code, docs on hover, suggestions, fixes, Try it) with the standalone
                              ncdev, else the names and call tips in its own list; and a Run menu
                              entry that checks the open handler. --remove undoes it. Asks Windows
                              for permission when Notepad++ is in Program Files. (Double-clicking
                              ncdev.exe shows a menu with this.)
  update [--check]            Update ncdev to the newest release (the standalone ncdev replaces
                              itself, checked against the release's SHA-256 sums). --check only
                              says whether there is one (exit code 10 if so)
  --version                   Show the version
  report [problem|feature|tryit] [handler.js] [--open] [--text]
  report --check <rule> <handler.js> [--line N] [--no-code] [--open] [--text]
                              Report a problem, ask for a feature ("I want to do…"), say Try it
                              differs from Nucleus, or that a check is wrong: prints the prefilled
                              GitHub form's link (versions, the check, where the handler is from;
                              only the flagged lines of code, unless --no-code) and open reports
                              that may be the same. --open opens it in the browser; --text prints
                              the report to paste in the testers' Discord thread (no GitHub account)
  dap                         Run as a Debug Adapter (stdio) for editors with DAP support: nvim-dap,
                              Helix, Zed, JetBrains, Emacs (dape) (PORTING.md, "Debugging")

Common options:
  --json                      Machine-readable output
  -h, --help                  Show this help

Lint options:
  --rule <id>=<severity>      Override a rule: error, warning, info, hint or off
  --all                       Lint every .js file, not only ones that look like handlers
  --quiet                     Only report errors
  --verbose                   Also report hints (e.g. deprecated options)
  --fix                       Apply every safe automatic fix and save the files (deterministic, no AI)
  --fix-dry-run               Show what --fix would change, without saving
  --hub                       Compare Game.GUID with the version on the Hub (handlers with a Hub.Handler.Id; cached)

Exit code: 1 when lint finds errors, a simulated handler fails to load or run, or a command
fails; 2 on bad usage.

Questions? Ask other handler authors: ${DISCORD} (Discord) or
${REDDIT}`;
