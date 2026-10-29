# Verification: redact-session-output-across-chunks

## Scope and source

G3 item 13 (`docs/g3-plan.md`, row 13), sub-change 13d, developed by a briefed subagent for the coordinator Niki from `dev` `3009329f`: output redacted across chunks with a held tail, its bound, its release, entry splitting, the output read and the `readAgentSessionOutput` route, migration `1792933400000`, and the wire contracts section 7 amendment. Out of scope: credentials revealed to a run (13c), 13c's worker messages, and item 14.

## Revision

- Base: `dev` `3009329f`; the change was opened in `55c36403`.
- `b98dd05d` `docs: record the coordinator answers of the redact session output across chunks change` (the answers Q1 to Q4 verbatim in `design.md`, the proposal at size M-L, the deltas, the tasks, wire contracts section 7, and the installation contract row of `session-output-tail.key`).
- `f92cec63` `chore: redact session output across chunks with a sealed held tail and serve its read` (the redactor, the tail cipher and key file, the tail store port and adapters, migration, service, route, composition, and tests).
- `2e0c6e58` merges `origin/dev` `115c16c4` (#414, `deliver-slot-credential-per-run`, migration `1792933300000_slot-credential-deliveries.sql`). The only conflict was `packages/adapters/postgres/test/migrations.integration.test.ts`, resolved as the union of both sides' migration lists and tables.
- `7b91f27c` `chore: renumber the session output tail migration after the slot credential deliveries`: the architect decision of Niki (2026-10-29, `design.md`, "Migration renumber") moves the migration from `1792933200000` to `1792933400000`, so the migrations stay ascending in merge order. No reference to `1792933200000` remains outside the archived 13b record, which states the earlier plan, and the renumber note of `design.md`. `git fetch origin && git merge origin/dev` after it: "Already up to date".
- `af46ab57` routed the change on the merged and renumbered head (`route.json` unedited).
- The commit after `af46ab57`: `make record` and this record, the head that review pass 1 reads.

## Environment

Native Ubuntu host `hpz600`, Linux 6.8.0-147-generic x86_64; Node.js of the `Makefile` pin for `make verify`, the worktree's `nvm` Node.js for the focused runs; PostgreSQL and NATS of the integration services (`make services-up` for the focused runs, `make verify`'s own project for the checks).

## Author self-check

- Scope: the answers are applied as given. Q1: a held part past the bound becomes one `[redacted]` and its continuation is dropped through the durable `word` or `block` flag, so nothing of a cut secret is released; section 7 is amended. Q2: the tail is stored only as AES-256-GCM ciphertext under `session-output-tail.key` (12a cipher, authenticated data of the session, turn, and tail version); `init` creates the key only when missing, at `0600`; a missing or wrong-size key refuses the start with a reason without key bytes. Q3: the tail is per turn and released before the turn's outcome or its generation's end, recovery included. Q4: 13d only.
- Access (checklist `contract-drift`): `readAgentSessionOutput` uses the 13b role rule of the session reads (`SESSION_READ`) and the same 404 for an unknown session and one of another project; the OpenAPI document already held the operation, so it is unchanged and `make contract-compatibility` was not needed.
- Races (checklist `concurrency-race`) run on PostgreSQL with two real transactions held by a `Barrier` inside the work: two appends that only hold commit as one serial order after the loser retries.
- Secrets: no test or fixture holds a whole PEM key with its begin marker on one line (`npm run verify:private-keys` passes); the stored tail holds no plaintext byte of the held text (asserted in memory and on PostgreSQL).
- Requirement texts are under 500 characters; the change validates strictly.
- Comments: `npm run verify:comments` passes. No AI attribution in commits.

## Fail-before

Each new behavioral test ran failing against a mutant of the code it protects (script `mutants.py` and log `mutants.log` in the session scratchpad); each mutant was restored and the packages rebuilt after its run. Mutants that first failed to build were corrected and rerun; only the runs that built count.

| Mutant | Tests that failed |
| --- | --- |
| M1: per-chunk redaction (the hold point at the text end, as 13a) | 38 of 70: every shape split across two and three chunks, the forced-cut JWT, the PostgreSQL restart and crash tests, and the route's JWT-at-every-offset test |
| M2: no forced cut at the bound | 3: one unit past the bound, the JWT across the forced cut, and the begin word before a block |
| M3: no release at the turn's end | 4: `recordTurnOutcome`, `endGeneration`, `endBoundAttempt`, and the recovery release on PostgreSQL |
| M4: the tail stored in plaintext | 10, among them "stored only sealed", the restart test that reads every stored byte, and the race |
| M5: authenticated data without the turn | 1: the tampered turn |
| M6: released text cut instead of split into entries | 2: the surrogate split and the redaction that lengthens a release |
| M7: `readOutput` ignores its limit | 4: the service paging test and three route tests |
| M8: `readAgentSessionOutput` unrouted | 9: the role, 404, and 401 tests over every operation and the four output route tests |
| M9: the PostgreSQL tail put keeps an existing row | 1: the race |
| M10: the start without the tail key | 2: the missing and the wrong-size key |
| M11: in-memory tails shared across transactions | 1: the rollback conformance case |
| M12: `init` without the tail key | 2 administration integration tests |
| M13: the tail cipher without its size check | 1 |
| M14: the tail key file named as the digest key | 1 |
| M15: the down migration keeps the tail table | 2: its own down test and 13a's |

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `make verify` | `af46ab57`, tree `de12ea7f` (log `13d-verify-1.log` in the session scratchpad) | Passed, profile full, stamp written: tests 3982, suites 49, pass 3935, fail 0, cancelled 0, skipped 47; all files 99.35 % lines, 92.63 % branches, 98.78 % functions; "Contract documents have no undeclared breaking change." The first run on the same tree (log `13d-verify-1-flake.log`) failed only at the timing-bound test "a bound with a leading zero is read in base 10" of `test/installation-script.test.ts`, outside this change ("ended after 9.061s, before 10") |
| `openspec validate redact-session-output-across-chunks --strict` | `af46ab57` | Valid |
| Archive in a scratch copy of `openspec/` | `af46ab57` | Totals + 10, ~ 3, - 1 (session-turn-model + 7, ~ 1, - 1; control-plane-api + 1, ~ 1; control-plane-wire-contracts + 1, ~ 1; postgres-state + 1); `openspec validate --specs --strict` then passed 71 of 71 items |
| Focused runs | `7b91f27c` | `migrations.integration.test.ts`, `session-output-tail.integration.test.ts`, and `session-timeline-crash.integration.test.ts`: 55 of 55; earlier on `f92cec63`: execution 92, the secrets redactor 32, PostgreSQL 82 and 4 |

### Route

Route (`route.json`, rule version 2): elevated (lines, files, capabilities, security, contracts); pass 1 reviewer A codex gpt-6-astra#high, pass 2 reviewer B claude claude-opus-5-5#xhigh, pass 3 reviewer A codex gpt-6.1-sol#high only after a pass 2 with a Medium or worse finding; the shadow model agrees. The route's efforts above standard are a recommendation that needs governance authorization.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `de12ea7f94d443ef1ab33a5358c5587142da34dd`; tests 3982, pass 3935, fail 0, skipped 47; all files 99.35% lines, 92.63% branches, 98.78% functions.
- `npm run openspec -- validate redact-session-output-across-chunks --strict`: passed, `Change 'redact-session-output-across-chunks' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 91 file(s); every pass summary file is valid: 71 file(s); every route file is valid: 27 file(s).`.
- Spec diff against the merge base `115c16c41016` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

Not started.

## Limitations

- A block whose end marker never comes stays dropped up to its turn's end, so text after an unterminated key is over-redacted (answer Q1 accepts losing text over leaking).
- `recordTurnAcceptanceUnknown` releases nothing, since its turn keeps running; its tail is released by the turn's later outcome or its generation's end.
- The output route tests are in `agent-session-routes.test.ts`, which holds the role fixtures, not in a new file (design, "Test plan").
- The restart test reads the output and every stored byte; it does not read `readCardSessions` separately, which holds no output text.
- The in-memory store runs one transaction at a time, so the race is tested on PostgreSQL only.
- Output is redacted against the known secret shapes only; the run's revealed credentials come with 13c.

## Remaining gates

- Independent review passes 1 to 3 as the route and governance rule ask
- Merge `origin/dev` right before the archive, and the archive
- Integration into dev by the coordinator (single pull request)
