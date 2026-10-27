## Context

`sanitizeFailureText` redacts the whole text and cuts it only afterwards, so a secret cut by a length limit leaves no part of itself. Its input is unbounded: a thrown error's message or a server's message, reason, or schema violation. The rule `/[^\s/?#@:'"]+:[^\s/?#@'"]+@/g` redacts `user:password@` without a scheme. V8's backtracking engine tries it at every position; from each position the greedy classes reach the end of the run before failing to find `@`, which is quadratic in the run length.

## Goals / Non-Goals

- Goal: the rule runs in time linear in the text, and redacts exactly the same matches.
- Non-goal: any other redaction rule, or moving the rules into `@taskelith/observability`.

## Decisions

1. **Anchor each match at the start of a run.** A run is a maximal span of characters outside `\s/?#'"@`; no match of the old rule spans two runs, and every match ends at the run's `@`. The lookbehind `(?<![^\s/?#@'"])` lets a match start only at a run's start, so the engine tries each run once. From there each quantifier stops at a distinct character (`:` for the user, `@` for the password), so a failed attempt backtracks at most once over the run: linear overall.
2. **Keep leading colons through a group.** The old rule's user part excludes `:`, so in a run beginning with colons its match started after them; and if a run's first colon-free span does not match, no later span of the run can, because it has the same or no next colon. `(:*)` consumes those colons and `$1` writes them back, so the replacement is the same. A randomized comparison of 800,000 strings over the separators, `:`, `@`, and letters found no difference.
3. **No length bound.** Bounding the scanned input or the quantifiers (for example `{1,256}`) would stop redacting longer user information, or a secret a cut crosses; the requirement demands redaction wherever a length limit cuts the text, so the formulation stays unbounded and linear instead.

## Risks / Trade-offs

- A lookbehind is less familiar than a plain class; a two-line comment states why it is there.
- The time bound in the test is wall-clock. It is generous: 200 ms against a few milliseconds measured after the fix and seconds before it.
