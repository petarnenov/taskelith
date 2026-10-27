## Context

`sanitizeFailureText` redacts the whole text and cuts it only afterwards, so a secret cut by a length limit leaves no part of itself. Its input is unbounded: a thrown error's message or a server's message, reason, or schema violation. The rule `/[^\s/?#@:'"]+:[^\s/?#@'"]+@/g` redacts `user:password@` without a scheme. V8's backtracking engine tries it at every position; from each position the greedy classes reach the end of the run before failing to find `@`, which is quadratic in the run length. Review pass 1 and a measurement of every rule found the `[url]` and JWT rules quadratic the same way, on `a.` and `eyJ` repeated: each tries every possible start of a run and scans to its end.

## Goals / Non-Goals

- Goal: every rule in `failure-cause.ts` runs in time linear in the text, and redacts exactly the same matches (widened by coordinator Niki on 2026-10-27 after review pass 1).
- Non-goal: the logger's `redactText`, or moving the rules into `@taskelith/observability`.

## Decisions

1. **Anchor each match at the start of a run.** A run is a maximal span of characters outside `\s/?#'"@`; no match of the old rule spans two runs, and every match ends at the run's `@`. The lookbehind `(?<![^\s/?#@'"])` lets a match start only at a run's start, so the engine tries each run once. From there each quantifier stops at a distinct character (`:` for the user, `@` for the password), so a failed attempt backtracks at most once over the run: linear overall.
2. **Keep leading colons through a group.** The old rule's user part excludes `:`, so in a run beginning with colons its match started after them; and if a run's first colon-free span does not match, no later span of the run can, because it has the same or no next colon. `(:*)` consumes those colons and `$1` writes them back, so the replacement is the same. A randomized comparison of 800,000 strings over the separators, `:`, `@`, and letters found no difference.
3. **The URL rule: start at the run's first scheme start.** A scheme run is a maximal span of `[a-z0-9+.-]` (any case); a match's scheme ends at the run's end, because `:` is outside the class, so if the old rule fails from one start in a run it fails from every start in it. The old rule can start at a letter after a non-word character: at the run's start unless `_` precedes it, or after `+`, `.`, or `-` inside the run. The lookbehind `(?<![a-z0-9+.-])` starts a match only at a run's start; a lazy optional group first tries the run's start itself, then consumes letters and digits, and `+`, `.`, or `-` not followed by a letter, up to the first such character that is, and `$1` writes that prefix back. Each character matches one branch, so a run is scanned a constant number of times.
4. **The JWT rule: start at the run's first `eyJ`.** The same argument holds for runs of `[A-Za-z0-9_-]`: the first segment ends at the run's end, so only the run's first `eyJ` matters. `(?<![A-Za-z0-9_-])((?:(?!eyJ)[A-Za-z0-9_-])*)eyJ` reaches it and `$1` writes the prefix back.
5. **Proven equal.** Every string of up to seven characters over `a`, `B`, `1`, `.`, `+`, `-`, `_`, `:`, `/`, and a space, and over `e`, `y`, `J`, `a`, `.`, `-`, `_`, `+`, and a space, and 1,000,000 random strings of up to 40 characters and 200,000 of up to 300 over a mixed alphabet with line breaks, quotes, `@`, `://`, `eyJ`, and secret keys, give the same output for the old and new URL and JWT rules and for the whole rule sequence.
6. **No length bound.** Bounding the scanned input or the quantifiers (for example `{1,256}`) would stop redacting longer user information, or a secret a cut crosses; the requirement demands redaction wherever a length limit cuts the text, so the formulation stays unbounded and linear instead.

## Risks / Trade-offs

- A lookbehind and a prefix group are less familiar than a plain class; a short comment beside each rule states why they are there.
- The time bound in the test is wall-clock. It is generous: 200 ms against a few milliseconds measured after the fix and seconds before it.
