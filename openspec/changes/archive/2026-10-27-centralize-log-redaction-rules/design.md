## Context

Before this change the logger's `redactText` had three rules (URL user information, bearer tokens, and a libpq-style `key=value` pair); the secrets adapter's `scrub.ts` had a URL user-information rule that also matched empty user information, an issued-secret rule built from `SECRET_PREFIXES`, a `.creds` block rule, an NKey seed rule, and a JWT rule; and `failure-cause.ts` ran its own rules before and after the logger's `redactText`. Each module defined its own `REDACTED`. A measurement of every rule at 20,000, 40,000, and 80,000 characters found the URL user-information rules of both modules quadratic on runs of scheme characters (`a.`, `.a`, `A.`, `a.b`, `a-`, `a+`, `eyJ.`, `proxy-`: up to 2,427 ms at 80,000), the secrets JWT rule quadratic on `eyJ`, `eyJa`, and `eyJ_` (up to 1,603 ms), and the `.creds` rule quadratic on begin markers without an end (2,118 ms at 400,000 characters through `redactSecrets`).

## Goals / Non-Goals

- Goals: one home for the redaction rules in the Observability module; every shared rule linear in time; the logger redacts the secret shapes; the failure-cause pipeline and `redactSecrets`/`redactFailure` keep their exact output.
- Non-goals: merging the key vocabularies, changing a contract or OpenAPI document, or changing the scheduling module's `SlotSecret`.

## Decisions

1. **Home (Q1).** The rules live in `packages/modules/observability/src/domain/redaction-rules.ts`, because architecture section 6 names Observability the owner of redaction. No new package.
2. **Secret prefixes (Q2): option (a), observability depends on access.** Architecture section 6 lets a module import another module through its public export, and `scripts/check-boundaries.ts` (`checkModuleImport`) rejects only internal paths, adapters, plugins, applications, and infrastructure SDKs. Observability already depends on `@taskelith/sdlc`. Access depends only on `@taskelith/kernel` and `@taskelith/sdlc`, and sdlc only on the kernel, so the new edge makes no cycle. `SECRET_PREFIXES` moves into access's `ports/secrets.ts` beside `SecretKind`, not into `domain/`, because `SecretKind` lives in that port and the boundary check forbids a domain file importing its own module's ports; the prefix is part of the port's contract, as an issued secret starts with it. The secrets adapter re-exports it.
3. **A rule is a function (Q4).** `TextRule` is `(text) => string`, `textRule(pattern, replacement)` makes one from a global pattern, and `redactWith(text, rules)` applies a list in order. A function, not a pattern pair, because the linear `.creds` rule needs code (decision 7).
4. **Per-caller profiles (Q4 (a)).** Shared rules compose into each caller's list:
   - logger: `MARKED_SECRET_RULES` (URL user information, bearer tokens, `key=value`) then `SECRET_SHAPE_RULES` (issued secrets, `.creds` blocks, NKey seeds, JWTs);
   - secrets adapter: URL user information even when empty, then `SECRET_SHAPE_RULES`, the former order;
   - failure cause: its local control-character and `[url]` rules, the shared scheme-less user-information, `authorization`, and `key: value` rules, `MARKED_SECRET_RULES`, the shared JWT rule that allows empty parts, and its local run rule.
5. **The logger gains the secret shapes (Q4 (b)).** `redactText`, and so `redactFields` and `redactCorrelation`, applies `SECRET_SHAPE_RULES` after the former rules. A random comparison of 300,000 strings found the new `redactText` equal to the shapes applied to the former output, so the change only adds redaction.
6. **The failure cause keeps the former logger rules.** Applying the new `redactText` inside the pipeline would change its output: a 20-character issued secret (`tkop_` and 20 characters, below the 32-character run rule) becomes `[redacted]`; `xx` glued before an NKey seed survives as `xx[redacted]` where the run rule replaced the whole run; and a `.creds` block becomes one `[redacted]` where its markers stayed. The pipeline therefore composes `MARKED_SECRET_RULES`, the exact former `redactText`, and its output is unchanged. Real issued secrets have 43 characters after the prefix, so the run rule already redacts them; adding the shapes to the failure cause is a follow-up.
7. **Linear time (Q5).**
   - The URL user-information rules start a match only at the start of a run of scheme characters, by a lookbehind, and keep the run's part before its first scheme start through a lazy group written back as `$1`, the technique of the archived change `bound-failure-cause-userinfo-redaction` (its design decision 3). A failed attempt scans the run a constant number of times.
   - The JWT rule starts only at the start of a run of JWT characters and keeps the run before its first `eyJ` as `$1` (that design's decision 4). With non-empty parts the argument holds too: if the first `eyJ` of a run has nothing before the run's end, no later one in that run has.
   - The `.creds` rule applies its pattern only up to the last end marker of the text, so each begin marker's lazy scan stops at an end marker. Every match ends with an end marker, so a match never lies beyond the last one, and a begin marker that fails within the cut fails on the whole text too.
   - The bearer, `key=value`, issued-secret, and NKey rules are already linear: each starts only at a fixed word or letter, and a failed attempt scans at most the run that follows it once, or a bounded span (58 characters for a seed); each measured below 1 ms at 80,000 characters. The scheme-less user-information, `authorization`, and `key: value` rules are the linear rules of the archived change, moved unchanged.
8. **One `REDACTED` (Q6).** It is defined once in observability; the secrets adapter re-exports it and the failure cause imports it. The scheduling module's `SlotSecret` keeps its own constant, unchanged.
9. **Vocabularies co-located, not merged (Q7).** `SECRET_SEGMENTS` (field names), the `key=value` keys, and the wider `key: value` keys sit together in the shared module and keep their behaviour. `SECRET_VARIABLE` stays in the secrets adapter beside `scrubEnvironment`, as Q3 decides. Merging the vocabularies is a follow-up.
10. **The failure cause's local rules (Q8).** Control characters, `[url]`, runs of 32 or more characters, and truncation stay in `failure-cause.ts`, its one-line contract; applications change no line.
11. **One test helper.** `assertLinearOnRuns(transform, units, length = 60_000)` in `@taskelith/testing` repeats each unit to the length and fails above 200 ms, the bound and run length of the archived change's tests. It uses only Node built-ins, as the harness's rules require.
12. **Proven equal.** The former and new `redactSecrets`, `sanitizeFailureText`, `describeFailureCause`, and former `redactText` against `MARKED_SECRET_RULES` gave the same output on every string up to a length over six alphabets and on 1,600,000 random strings (numbers in `verification.md`).

## Risks / Trade-offs

- Two URL user-information rules and two JWT rules remain, differing only in empty user information and empty parts, because each caller's output must stay the same. Merging them is a follow-up with the vocabularies.
- Observability now depends on access, and the secrets adapter on observability; both edges follow the module and adapter rules, and neither makes a cycle.
- The time bound is wall-clock: 200 ms against at most 9 ms measured after the fix and seconds before.

## Follow-ups

- Merge the key vocabularies (`SECRET_SEGMENTS`, the `key=value` keys, the `key: value` keys, and `SECRET_VARIABLE`), and the two URL user-information and JWT rules, once the change in output is accepted.
- Add the secret shapes to the failure-cause pipeline, which changes its output (decision 6).
