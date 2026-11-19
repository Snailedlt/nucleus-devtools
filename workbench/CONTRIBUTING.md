# Contributing

Thanks for helping. Handler authors know Nucleus Co-op better than any tool, so most of the useful help needs no code at all.

This repository has the browser workbench, Learn, the docs and check pages, the start and tools pages, and the Jint testbench that pins down how Nucleus' script engine behaves. The checks themselves, the VS Code extension, `ncdev` and the Notepad++ plugin live in [splitscreenme-vscode](https://github.com/Snailedlt/nucleus-devtools) ([its guide](https://github.com/Snailedlt/nucleus-devtools/blob/main/CONTRIBUTING.md)).

## Without code

- **Tell us what's wrong, from where you saw it.** The workbench and Learn have reports built in, and each opens the right repository's form, filled in (never your code unless you include it): *Report a problem* and *Request a feature* in the menu and the command palette, *This check is wrong* on every problem in Check (and the flag in its hover), the icon in the corner of Try it's result (*Nucleus did something different*), *Ask for this to be documented* when Docs finds nothing, *I'm stuck here* in Learn, and *Report it* when the workbench itself hits an error. They show open reports that may be the same first: a 👍 there helps as much as a new one. No GitHub account? *Copy the report* and paste it in the [testers' Discord thread](https://discord.com/channels/142649962839277568/1568403337613680650/1568777762221588531) (GitHub is easier for us, so use it if you can). Without the workbench: [feedback](https://github.com/Snailedlt/nucleus-devtools/issues/new?template=feedback.yml) or [I want to do…](https://github.com/Snailedlt/nucleus-devtools/issues/new?template=feature-request.yml) here; checks, Try it and the editors in [splitscreenme-vscode](https://github.com/Snailedlt/nucleus-devtools/issues/new/choose). A problem with one Hub handler (a game that doesn't work) is for its author: its Hub page, the Discord or r/nucleuscoop.
- **Vote on the docs.** Every docs page has 👍/👎: it tells us which docs need work. The workbench's *Help check AI-written docs* lists the ones no person has checked yet.
- **Improve Learn.** If a lesson confused you, *I'm stuck here* (under a task's hint, or in the lesson list) sends which one; say where it lost you. That's the most useful feedback the lessons get.

## With code

You need Git and Node.js 22 or newer, and a clone of [splitscreenme-vscode](https://github.com/Snailedlt/nucleus-devtools) next to this one (the workbench uses its checks).

```bash
cd playground && npm ci
node build.mjs --preview   # the site in dist/pages
npm test                   # unit tests and every published link
node smoke.mjs             # the site in a real browser, light and dark, with accessibility checks
```

- [AGENTS.md](AGENTS.md) describes where things are and the conventions. It's written for AI agents, and it's the best map for people too.
- **Jint probes** (`probes/*.js`) each pin down one behaviour of Nucleus' engine (Jint 2.11.58), and `probes/expected.txt` holds the reviewed results. Running them needs Mono: `./setup.sh`, then `./test-probes.sh`. A new probe is welcome whenever a check or Try it relies on how Jint behaves.
- **Links live for ever:** an address we've published keeps working after a redesign (see AGENTS.md).
- Every change people will notice gets a line in `CHANGELOG.md` under `## Unreleased`.

Open a pull request against `main`. Small and focused is easiest to review.
