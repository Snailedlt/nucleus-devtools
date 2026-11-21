## Nucleus Co-op handlers

This folder contains Nucleus Co-op (SplitScreen.Me) game handlers: JavaScript files that Nucleus loads to run several instances of a game for split-screen play.

Before writing or changing a handler, read `.claude/skills/nucleus-handler/SKILL.md`. It has the rules, the workflow and links to the reference material. Then use the bundled tool:

```bash
node .claude/skills/nucleus-handler/scripts/nucleus.js lint --fix <handler.js>  # apply the safe automatic fixes
node .claude/skills/nucleus-handler/scripts/nucleus.js lint <handler.js>        # run after every edit
node .claude/skills/nucleus-handler/scripts/nucleus.js simulate <handler.js>    # what each player gets: window, launch args, file changes
node .claude/skills/nucleus-handler/scripts/nucleus.js api <Game.Option>        # check an option exists and its type
node .claude/skills/nucleus-handler/scripts/nucleus.js api --search <words>     # find the right option
node .claude/skills/nucleus-handler/scripts/nucleus.js hub search <game>        # find similar handlers to learn from
```

Non-negotiable:
{{HARD_RULES}}
- Nucleus can't run here. Finish with a concrete test plan, and ask the user for `debug-log.txt` from the Nucleus folder.
- Put the credit lines at the top of every handler you create or change (made by which AI agent, what `lint` and `simulate` showed, not run in Nucleus): the format is in SKILL.md, "Credit lines". Facts only; keep lines others wrote.
