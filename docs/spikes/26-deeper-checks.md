# Spike #26: deeper checks on the author's own code

Can a small, local analysis follow values through a handler's own variables and functions, and which of the
mistakes in issue #26 happen in published handlers? A prototype of each check ran over every verified Hub handler
(897 of the 898 in the testbench's `hub/`, 2026-11-15) and every hit was read by hand.

## The analysis

`src/core/scopes.ts` (about 150 lines, no new dependency) gives each name its declaration (ES5 function scopes; Jint
treats `let`/`const` like `var`) and lists where it is read and written. On top of it the prototype inferred a type
from literals, `+`, `?:`, `parseInt`/`String`, Nucleus members' own types, a variable's assignments (all of them must
agree) and the `return`s of the handler's own functions. That is enough for the four checks. Coverage on the Hub:

- 86% of non-literal values assigned to a typed Nucleus member (1,557 of 1,817) get a type.
- 44% of non-literal arguments to Nucleus methods (19,627 of 44,501) get a type. Most of the rest are callback
  parameters such as `player.ProtoInputInstanceHandle`.

## Results per check

| Check | Hub hits | True | False | Decision |
| --- | --- | --- | --- | --- |
| 1. A helper's value of the wrong type for a Nucleus member or argument | 0 | 0 | 0 | No-go for now |
| 2. A variable read before anything sets it | 0 (2 skipped) | 0 | 0 | Go later, not built |
| 3. An option value compared as a number or boolean | 0 (22 loose `==`, all fine) | 0 | 0 | **Go, built** (`option-compare`) |
| 4. A nested assignment to an unknown member | already checked; 1 wrong message | 1 | 0 | **Fixed** (`unknown-member`) |

**1. Helper types: no-go for now.** No handler passes a string-returning helper (or variable) where Nucleus wants
a number or a boolean. Of the 1,817 typed assignments with a computed value, 1,757 target text options (paths,
arguments), 58 enums and 2 numbers. Jint also converts `"1920"` to 1920 by itself, so this mistake rarely breaks anything. The inference
works and could later widen `type-mismatch`, if real drafts show the mistake.

**2. Read before set: go later.** With the guards a correct handler needs, nothing is left: the read must be in the
same function as every write (a write in a callback, or a read in `Game.Play` of a variable set later at the top
level, can happen in any order), not in a loop that also writes it, and not a deliberate test (`typeof x`, `!x`,
`x || …`, `if (x)`, `x == null`). The guards skipped 2 reads, both correct (a `const` array at the end of the file,
read in `Game.Play`). Zero false alarms, but no sign the mistake happens either. Ready to build if it turns up.

**3. Option compared as a number: go, built.** A saved profile gives every option back as text
(`GameProfile.LoadGameProfile`: `Jopt.Value.ToString()`, so `true` becomes "True"). On the Hub, 754 of the 772 option
lists that can be read are text already, 6 are numbers, 9 are empty (a text box), 3 are objects and none are
booleans. Authors compare options with text, or
with numbers through loose `==` (22 places, e.g. `if (id == 3)`), which works because `"3" == 3`. Nobody writes
`=== 4`, `== true`, `case 4:` or tests a `false` option with `if`. When it happens it is always a bug, the check is
exact, and it follows the value through the handler's variables, so it ships as `option-compare` (warning) with a
fix (`===` to `==`; `case "4":` when the option's values are text). One handler adds a number to a text-box option
(`0 + Context.Options["Terro"]`, giving "099"); harmless there, so `+` is not flagged.

The issue's own example, `Context.Options["players"] == 4`, works: loose `==` compares by value.

**4. Nested assignment: already checked; one message fixed.** The linter has checked these from the start:
`var x = (Context.X = …)` is a hint, because the value still reaches the variable (309 Hub handlers, 447 lines; 251
`Context.filePath`, 196 `Context.Args`), and a typo of a real member there is a warning with the fix. The gap: inside
a call or a condition (`File.Exists((Context.filePath = …))`, 1 Hub handler) it was a warning saying the line has no
effect, which is wrong, since the call gets the value. It is now the same hint, worded for the call or condition.

## TypeScript's checker instead?

No. `tsc --allowJs --checkJs` with `types/nucleus.d.ts`, each file alone, on 30 handlers (the 15 most downloaded and
15 at random): 48 errors in 15 files. 39 repeat what `unknown-member` already reports, 1 repeats `type-mismatch`
(as an error, though `"False"` for a boolean works), and 8 are false alarms (TS2403: a `var` declared twice with
different types, which Jint accepts). It found none of the four mistakes above: `Context.Options` is `any` to it, and
it doesn't flag a JavaScript variable read before it is set. It also knows none of Jint's rules (first letter
case-insensitive, ES5 only, callback-only globals) and would add TypeScript (8.7 MB) to the extension, at about
0.8 s per handler from the command line. The small analysis is cheaper and says more.

## Cost

`option-compare` runs the scope pass only when the file mentions `Options`; linting all 898 handlers takes about
6% longer (about 0.5 ms per handler). Linting the Hub after the change: 0 `option-compare` hits, no new errors, and
one warning became a hint (check 4).
