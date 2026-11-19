# Contributing

Thanks for helping. Handler authors know Nucleus Co-op better than any linter, so most of the useful help needs no code at all.

This repository has the VS Code extension, the `ncdev` command line, the Notepad++ plugin, the language server for other editors and the agent kit for AI agents, and in `workbench/` the browser workbench, Learn, the docs and check pages, the start and tools pages, and the Jint testbench that pins down how Nucleus' script engine behaves.

## Without code

- **Tell us what's wrong, from where you saw it.** Every tool has a report built in, filled in with what it knows (README: [Reporting problems and asking for features](README.md#reporting-problems-and-asking-for-features)): *This check is wrong* on any problem (a warning on code that works), *Nucleus did something different* in Try it, *Report a problem* for anything else. The workbench and Learn also have *Request a feature* (menu and command palette), *Ask for this to be documented* when Docs finds nothing, *I'm stuck here* in Learn and *Report it* when the workbench itself hits an error; they show open reports that may be the same first: a 👍 there helps as much as a new one. Without a tool at hand: [the feedback form](https://github.com/Snailedlt/nucleus-devtools/issues/new?template=tester-feedback.yml) or [this check is wrong](https://github.com/Snailedlt/nucleus-devtools/issues/new?template=check-wrong.yml). No GitHub account? The tools' *Copy the report* goes in the [testers' Discord thread](https://discord.com/channels/142649962839277568/1568403337613680650/1568777762221588531). A problem with one Hub handler belongs with its author (its Hub page, the Discord, r/nucleuscoop), not here.
- **Ask for what you need.** [I want to do…](https://github.com/Snailedlt/nucleus-devtools/issues/new?template=feature-request.yml) starts from the problem: what you're trying to do, and what's in the way.
- **Check the AI-written docs.** Many options had no docs, so an AI wrote them from the Nucleus source; each says so. If you know how one really works, mark it right or wrong (👍/👎 on its docs page) or [send a correction](https://github.com/Snailedlt/nucleus-devtools/issues/new?template=doc-review.yml). A checked doc gets your name on it.
- **Suggest a check.** A mistake you keep seeing in handlers is a check waiting to be written: describe it in *I want to do…*, with a handler that has it.
- **Vote on the docs.** Every docs page has 👍/👎: it tells us which docs need work. The workbench's *Help check AI-written docs* lists the ones no person has checked yet.
- **Improve Learn.** If a lesson confused you, *I'm stuck here* (under a task's hint, or in the lesson list) sends which one; say where it lost you. That's the most useful feedback the lessons get.
- **Test a beta.** The testing guide is [TESTING.md](TESTING.md).

## With code

You need Git and Node.js 22 or newer.

```bash
npm ci
npm run build       # the extension, the CLI, the skill's API reference
npm test            # build + the tests
npm run typecheck
```

The workbench (it uses the core at the root, so `npm ci` there first):

```bash
cd workbench/playground && npm ci
node build.mjs --preview   # the site in dist/pages
npm test                   # unit tests and every published link
npx playwright install chromium   # once: the browser smoke.mjs uses
node smoke.mjs             # the site in a real browser, light and dark, with accessibility checks
```

- [AGENTS.md](AGENTS.md) describes the layout, the conventions and the facts about Nucleus the checks rely on. It's written for AI agents, and it's the best map for people too.
- **New checks:** add them to `RULES` in `src/core/lint.ts` with a test that they fire and one that they don't (`src/test/lint.test.ts`), then run them over real Hub handlers: published, working handlers must get no errors. Each check needs its page in `src/core/ruledocs.ts` (what, why, an example, the fix).
- **Editor features** go into `src/core/features.ts` first, then into each editor (`src/extension.ts`, `src/lsp.ts`).
- **Don't edit generated files** (`data/nucleus-api.json`, `types/nucleus.d.ts`, the skill's `reference/api.md`): fix the generator or the source.
- **Jint probes** (`workbench/probes/*.js`) each pin down one behaviour of Nucleus' engine (Jint 2.11.58), and `workbench/probes/expected.txt` holds the reviewed results. Running them needs Mono: `workbench/setup.sh`, then `workbench/test-probes.sh`. A new probe is welcome whenever a check or Try it relies on how Jint behaves.
- **Links live for ever:** an address we've published keeps working after a redesign (see AGENTS.md).
- Every change people will notice gets a line under `## Unreleased`: in `CHANGELOG.md` for the extension, ncdev, the Notepad++ plugin and the skill, in `workbench/CHANGELOG.md` for the workbench and the site.

Open a pull request against `main`. Small and focused is easiest to review; say what you checked it against (a Hub handler, a probe, Nucleus' source).
