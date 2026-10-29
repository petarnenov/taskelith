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

The route was generated under rule version 2, before governance v9 (owner decision, 2026-10-29), which set pass 2 to role B, claude `claude-fable-5-1` at variant medium. Pass 2 ran with that reviewer, `claude claude-fable-5-1#medium`, so the route's pass 2 recommendation `claude-opus-5-5#xhigh` was superseded; `route.json` is unedited. Pass 3 is `codex gpt-6.1-sol#medium`, because pass 2 reported a Medium finding.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `eedce09049ce9e1acd0cd1e21e765ffb601a5120`; tests 4026, pass 3979, fail 0, skipped 47; all files 99.35% lines, 92.68% branches, 98.82% functions.
- `npm run openspec -- validate redact-session-output-across-chunks --strict`: passed, `Change 'redact-session-output-across-chunks' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 92 file(s); every pass summary file is valid: 72 file(s); every route file is valid: 27 file(s).`.
- Spec diff against the merge base `2250f3f7f140` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a18605-e9aa-7ed3-a7fc-7bfad5397e36` | 0 | 3 | 2 | 3 |
| 2 | B | `claude claude-fable-5-1#medium` | `6228fa04-9305-4f73-865b-2b98a44e9e7c` | 0 | 0 | 1 | 2 |
| 3 | A | `codex gpt-6.1-sol#medium` | `01a1863d-e42e-7ec3-9ba0-5c524705441c` | 0 | 1 | 1 | 2 |
<!-- make record: end -->

## Review pass 1 fixes

Pass 1 (reviewer A, codex gpt-6-astra, variant medium, session `01a18605-e9aa-7ed3-a7fc-7bfad5397e36`) reported 0 Critical, 3 High, 2 Medium, and 3 Low findings (`findings.jsonl`).

- `20a5cb3a` `chore: end a cut output block only at its own end marker and redact an interrupted secret at a turn's end` (findings 1, 2, and 5).
- `fbd08669` `docs: apply review pass 1 fixes to the redact session output across chunks design, specs, and contracts` (findings 3 to 8 in the records: the legacy output limit and promotion guard of finding 3, the MODIFIED `Event payloads and session text` delta, the scenario's bound condition, the corrected limit, `checkOutputTurn`, and wire contracts section 7).
- `95cf15ea` merges `origin/dev` `2250f3f7` (#415, governance v9) without conflicts; `route.json` was not regenerated.

| Finding | Fix | Fail-before |
| --- | --- | --- |
| 1 (High) | A cut block keeps the begin markers of its open blocks as a never-released context in the sealed tail, so each later chunk is read after them and the block ends only at the end marker of its own kind; a begin marker cut after a space is kept until it completes | Against the redactor of `c03aafaf` (the fix's source file reverted, packages rebuilt): the `.creds` and PEM foreign end marker tests, the key inside a `.creds` block, both cut begin marker tests, and the restored-JSON test failed in `secret-output-redactor.test.ts`, and both PostgreSQL restart tests "a .creds block / PEM key cut at the bound ends after a restart only at its own end marker" failed |
| 2 (High) | The final release records an open block, and an interrupted JWT, issued secret, NKey seed, or URL user information ending the held run, as one marker | Same revert: 9 of the "turn that ends at any offset" tests (URL, three issued, three seeds, `.creds`, JWT) and the cut-forms test failed; on PostgreSQL the recovery test with the 30-character JWT prefix and both new crash tests failed (the prefix was released verbatim) |
| 3 (High) | Declined by coordinator decision (a): no release holds 13a or 13b output; design "Legacy output" and `docs/g3-plan.md` row 13 hold the promotion guard | No code change |
| 4 (Medium) | MODIFIED delta of `Event payloads and session text`, the boundary at the turn | Archive in a scratch copy: + 10, ~ 4, - 1; `openspec validate --specs --strict` passed 71 of 71 |
| 5 (Medium) | PostgreSQL restart tests of a run's and of both blocks' continuation, and crash tests of a generation end that releases a tail at `SessionTimelineCommit.before` and `.after` | Mutant "continuation lost" (the tail sealed with continuation `none`): the run and both block restart tests failed (3). Mutant "release not atomic" (the tail cleared in its own transaction): the `.after` crash test failed (the tail gone, no release, the generation not ended) |
| 6 to 8 (Low) | Scenario bound condition; the `recordTurnAcceptanceUnknown` limit; `checkOutputTurn` | Records only |

Focused runs on `fbd08669` before the merge: `secret-output-redactor.test.ts` 53 of 53; `session-output-tail.integration.test.ts` and `session-timeline-crash.integration.test.ts` 24 of 24; `agent-session-routes.test.ts`, the execution `session-output-tail.test.ts`, and the secrets tests 118 of 118.

Checks on the merged head `95cf15ea`, tree `af2e8866`: `make verify` passed on its first run, profile full, stamp written (log `13d-verify-2.log` in the session scratchpad): tests 4010, suites 49, pass 3963, fail 0, cancelled 0, skipped 47; all files 99.35 % lines, 92.63 % branches, 98.82 % functions; "Contract documents have no undeclared breaking change." `openspec validate redact-session-output-across-chunks --strict`: valid. `make findings ARGS="validate"`: valid.

## Review pass 2 fixes

Pass 2 (reviewer B, claude claude-fable-5-1, variant medium, governance v9, session `6228fa04-9305-4f73-865b-2b98a44e9e7c`) reported 0 Critical, 0 High, 1 Medium, and 2 Low findings (`findings.jsonl`), recorded in `fe9d5712`.

- `9226c682` `chore: redact a URL user name cut before its at sign at a turn's end` (finding 1).
- `ce591623` `chore: keep the held output tail version monotonic within a turn` (finding 2).
- `3ef33459` `docs: apply review pass 2 fixes to the redact session output across chunks design and verification` (findings 1 and 2 in `design.md` decisions 1 and 3, finding 3 in this record).

| Finding | Fix | Fail-before |
| --- | --- | --- |
| 1 (Medium) | At a turn's end and on recovery, a trailing run after a URL's `://` that holds no `/`, `?`, `#`, or `@` is taken as possible user information and recorded as `scheme://[redacted]`, also without a `:`. A bare host at a turn's end is over-redacted the same way (design, decision 1; "Limitations"). New shape `https://user@example.com/repo` in `SHAPES`; the case `clone https://bot` split at every offset of two chunks and in the cut-forms test. The test that kept `see https://example.com` as `redactSecrets` of it now expects `see https://[redacted]`, because a host and a user name cut before its `@` cannot be told apart at a turn's end; the kept case became `see https://example.com/`, a URL with a path | The new and changed tests on the redactor of `fe9d5712`, before the fix: 4 of 58 failed in `secret-output-redactor.test.ts`, the URL user name shape's turn end at any offset, the cut-forms test, the `clone https://bot` split, and the bare host |
| 2 (Low) | A tail emptied within its turn keeps its row and seals an empty tail under the next version; only the release at the turn's end deletes the row, and a new turn has other authenticated data. The execution unit test and the PostgreSQL crash test that expected no row after a mid-turn release now expect the kept row | Before the fix on PostgreSQL: the new test "a turn that holds, releases, and holds again seals the new tail under a greater version" failed with "version 1 after 1", and the race test, which now asserts the final version 4 of the serial order, failed with no row |
| 3 (Low) | Section "Route" names the reviewer that ran and the superseded route recommendation; "Independent review" records pass 2 and the owed pass 3 | Records only |

Focused runs after the fixes: `secret-output-redactor.test.ts` 58 of 58; `session-output-tail.integration.test.ts` and `session-timeline-crash.integration.test.ts` 25 of 25; together with the execution tests, `agent-session-routes.test.ts`, the PostgreSQL session timeline tests, and the secrets tests, 513 of 513.

Checks on `3ef33459`, tree `8def7253`: `make verify` passed, profile full, stamp written (log `13d-verify-3.log` in the session scratchpad): tests 4016, suites 49, pass 3969, fail 0, cancelled 0, skipped 47; all files 99.35 % lines, 92.63 % branches, 98.82 % functions; "Contract documents have no undeclared breaking change." The first run on the same tree (log `13d-verify-3-flake.log`) failed only at the timing-bound test "e. a crash between W1 and the ack of a cancellation is applied once after redelivery" of `test/g2-cancellation-races.test.ts`, outside this change ("the start not met within 20000 ms"); it passed in the rerun. `make findings ARGS="validate"`: valid.

## Review pass 3 fixes

Pass 3 (reviewer A, codex gpt-6.1-sol, variant medium, session `01a1863d-e42e-7ec3-9ba0-5c524705441c`) reported 0 Critical, 1 High, 1 Medium, and 2 Low findings (`findings.jsonl`), recorded in `5769e27c`. Pass 3 is the last pass under the cap of three, so these fixes are unreviewed: they wait for the coordinator's architect check, and their findings carry the outcome `fixed-unreviewed`.

- `cbf69b2d` `chore: keep a cut key's context in an overflowing .creds block and redact a trailing shape head at a turn's end` (findings 1, 2, and 4).
- `d874c49e` `docs: apply review pass 3 fixes to the redact session output across chunks design, spec, and verification`: `design.md` decisions 1 and 2, the `session-turn-model` delta, and this record (findings 1 to 3).
- `8317bb00` `chore: release a shape head prefix verbatim at a turn's end again`: removes the finding 2 part of `cbf69b2d` after the coordinator declined it (below); the finding 1 and 4 parts are unchanged.

| Finding | Fix | Fail-before |
| --- | --- | --- |
| 1 (High) | When a block's held context and its partial marker pass the bound, `blockContext` no longer drops the partial and forgets it: inside a `.creds` block the partial can only start a key's begin marker with a long type, so the context records a key opened inside the block (`.creds` context, then a key's); inside a key the partial end marker is dropped and the key stays open. Design decision 2 states the invariant this restores; scenario "Key begun in a block past the bound". New tests: the reviewer's four chunks, each under 65,536 code units, with and without a `.creds` end marker after the key's (stored output `[redacted]`, and `[redacted]\nafter\n`, no `LEAK_BODY`); the mirrored case, a `.creds` begin marker cut inside a key whose end marker passes the bound, which counts for nothing (it passed before the fix too, as expected, since a key ignores `.creds` markers); five nested inputs, a key in a `.creds` block, a long-typed key in one, a `.creds` block in a key and in a long-typed key, and a `.creds` block after a key with a long end type, each split at every offset into two chunks and at every pair of offsets into three, enumerated, at a bound of 64, asserting that no body character (`q`, `z`, `j`, `w`), `eyJ`, or `tkop` is stored; and the PostgreSQL test of the four chunks with a restart between chunks 3 and 4 | Mutant `return { text: context, continuation: 'block' }`, the code before the fix (log `13d-p3-mutant-f1.log`): 2 of 67 redactor tests failed, the four-chunk test and the split test of the long-typed key in a `.creds` block; on PostgreSQL (log `13d-p3-pg-mutant-f1.log`) 1 of 26 failed, the new restart test. With the fix: 67 of 67, and 26 of 26 (log `13d-p3-pg-after.log`) |
| 2 (Medium), declined | Declined by the coordinator as architect, 2026-10-29, and reverted in `8317bb00`: the cost is too high, since `done` becoming `don[redacted]` would corrupt the end of ordinary turns; a 1 to 3 character prefix of a shape's head holds no secret material, and the held tail is per turn (answer Q3), so no token continues into the next turn's redactor. The final release is again that of `2a326156`: a cut form starts at a shape's whole head, and a shorter prefix, such as `done`, `ey`, `tko`, or `SO`, is released verbatim. Design decision 1 and the scenario "Turn ends in a shape's head" state that rule. The shapes' texts end in `done` again, and the test that keeps `done`, `SO`, and `tok` is restored. The "ends at any offset" test keeps its exact assertion of every cut, against an oracle whose shapes start at a whole head. The head test and the boundary test are replaced by a test that releases `done`, `ey`, `tko`, and the other short prefixes verbatim, in one and two chunks, and one that records `eyJ`, `tkop`, `tken`, `tkwk`, and a seed's `SOA`, `SAB`, and `SU2` as one marker. The nested-block test of finding 1 still asserts that no body character, `eyJ`, or `tkop` is stored, and passes. The declined fix was: at the final release, at the turn's end and on recovery, the trailing run's longest suffix that is a non-empty prefix of a shape's head, `eyJ`, `tkop`, `tken`, `tkwk`, `SO`, `SA`, or `SU`, becomes one marker too, with the earlier cut forms, from the earliest start. Design decision 1 states the exact rule and its boundary; the requirement "Held tail released at its turn's end" names it, with the scenario "Turn ends in a shape's head"; "Limitations" names the over-redaction. The "ends at any offset" test now asserts the exact stored output of every cut, 1 to 3 characters included, against an oracle written from the shapes' regular expressions, and still asserts no 4-character part. The shapes' texts end in `ok` instead of `done`, which now ends in a head's `e`. The test that kept `SO` and `done` now keeps `ok` and `tok`, and a new test, whose comment says why, records `e` to `SU` and `done` as markers; a boundary test keeps a run one character past every head (`ez` to `SUz`) and records one head character (`e`, `t`, `S`) as a marker | Mutant without the head rule (log `13d-p3-mutant-f2.log`): 16 of 67 redactor tests failed, the exact turn-end test of all 14 shapes, the head test, and the boundary test |
| 3 (Low) | Section "Independent review" gives each pass's `make review` invocation, prompt, log, and the tool's confirmation lines | Records only |
| 4 (Low) | Both comments state 196,606 bytes: `node -e "console.log(Buffer.byteLength('€'.repeat(65_535) + '\n'))"` printed `196606`, and 10 MiB over 196,606 bytes is 53.3, so 54 entries still pass the window | Comments only; no behavior to test |

Logs `13d-p3-*.log` and the scripts `13d-p3/pg-tap.sh` and `13d-pg.sh` are in the session scratchpad, outside the tree; each mutant was applied to `secret-output-redactor.ts`, run after a rebuild, and the fixed source restored and rebuilt. Each run failed by assertion, none by a timeout.

Checks on `d874c49e`, tree `eedce090`: `make verify` passed on its first run, profile full, stamp written (log `13d-verify-4.log` in the session scratchpad, outside the tree): tests 4026, suites 49, pass 3979, fail 0, cancelled 0, skipped 47; all files 99.35 % lines, 92.68 % branches, 98.82 % functions; "Contract documents have no undeclared breaking change." `openspec validate redact-session-output-across-chunks --strict`: valid. `make findings ARGS="validate"`: valid. The findings of pass 3 carry `fixed-unreviewed` until the coordinator's architect check.

The earlier record of 25 of 25 for the two PostgreSQL files holds: run alone at `cbf69b2d`, `session-output-tail.integration.test.ts` passed 10 of 10, one of them the new restart test, and `session-timeline-crash.integration.test.ts` 16 of 16 (log `13d-p3-pg-separate.log`), so before the fix the two held 9 and 16.

## Independent review

- Pass 1: reviewer A, codex gpt-6-astra, variant medium, session `01a18605-e9aa-7ed3-a7fc-7bfad5397e36`: 0 Critical, 3 High, 2 Medium, 3 Low. Findings 1, 2, and 4 to 8 fixed; finding 3 declined by coordinator decision (section "Review pass 1 fixes").
  - Invocation: `env -u JEV_MAF_LAB make review CHANGE=redact-session-output-across-chunks PASS=1 ROLE=A REVIEWER='codex gpt-6-astra#medium' PROMPT=13d-pass1-prompt.md LOG=13d-pass1.log`, prompt, log, and the output of `make review` (`13d-pass1-make.out`) in the session scratchpad, outside the tree. `make review` ran `codex exec -m gpt-6-astra -c model_reasoning_effort="medium" -s read-only -C /home/petar/taskelith-worktrees/redact-session-output-across-chunks -`, environment `PATH HOME USER LANG TERM`, started 2026-10-29T04:58:16.674Z, and printed "route: recommends effort high; the authorized medium applies (policy version 8)".
  - Confirmation, as `make review` printed it from the reviewer's log: `session: 01a18605-e9aa-7ed3-a7fc-7bfad5397e36`, `model: gpt-6-astra (reported)`, `effort: medium (reported)`, `sandbox: read-only (reported)`.
- Pass 2: reviewer B, claude claude-fable-5-1, variant medium (governance v9), session `6228fa04-9305-4f73-865b-2b98a44e9e7c`: 0 Critical, 0 High, 1 Medium, 2 Low, all fixed (section "Review pass 2 fixes").
  - Invocation: `env -u JEV_MAF_LAB make review CHANGE=redact-session-output-across-chunks PASS=2 ROLE=B REVIEWER='claude claude-fable-5-1#medium' PROMPT=13d-pass2-prompt.md LOG=13d-pass2.log`, prompt, log, and `13d-pass2-make.out` in the session scratchpad, outside the tree. `make review` ran `claude -p --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format stream-json --verbose -- <prompt>`, environment `PATH HOME USER LANG TERM`, started 2026-10-29T05:28:31.989Z, and printed "route: recommends claude claude-opus-5-5#xhigh; the brief's claude claude-fable-5-1#medium stays".
  - Confirmation, as `make review` printed it: `session: 6228fa04-9305-4f73-865b-2b98a44e9e7c`, `model: claude-fable-5-1 (reported)`. The Claude Code log reports the model only; the effort `medium` rests on the invocation's `--effort medium`.
- Pass 3: reviewer A, codex gpt-6.1-sol, variant medium, owed because pass 2 reported a Medium finding, session `01a1863d-e42e-7ec3-9ba0-5c524705441c`: 0 Critical, 1 High, 1 Medium, 2 Low. The last pass under the cap of three; its fixes go to the coordinator's architect check (section "Review pass 3 fixes").
  - Invocation: `env -u JEV_MAF_LAB make review CHANGE=redact-session-output-across-chunks PASS=3 ROLE=A REVIEWER='codex gpt-6.1-sol#medium' PROMPT=13d-pass3-prompt.md LOG=13d-pass3.log`, prompt, log, and `13d-pass3-make.out` in the session scratchpad, outside the tree. `make review` ran `codex exec -m gpt-6.1-sol -c model_reasoning_effort="medium" -s read-only -C /home/petar/taskelith-worktrees/redact-session-output-across-chunks -`, environment `PATH HOME USER LANG TERM`, started 2026-10-29T05:59:25.291Z, and printed "route: recommends effort high; the authorized medium applies (policy version 9)".
  - Confirmation, as `make review` printed it from the reviewer's log: `session: 01a1863d-e42e-7ec3-9ba0-5c524705441c`, `model: gpt-6.1-sol (reported)`, `effort: medium (reported)`, `sandbox: read-only (reported)`.

## Limitations

- A block whose end marker never comes stays dropped up to its turn's end, so text after an unterminated key is over-redacted (answer Q1 accepts losing text over leaking).
- A partial key begin marker inside a `.creds` block whose context passes the bound is taken as a key's, so if it never completes to one, the block stays open until a key end marker and then its own end marker, or until its turn's end (review pass 3, finding 1).
- `recordTurnAcceptanceUnknown` releases nothing: it takes only a queued turn, which holds no output and so no tail, and makes it `outcome-unknown`, after which an outcome for it is refused (design, decision 3).
- A turn whose output ends, without whitespace, in a form that may be a cut secret, such as `SUCCESS`, `tkop`, or a URL with a port, has that run recorded as one marker (design, decision 1). So does a URL's bare host at a turn's end, such as `see https://example.com`, stored as `see https://[redacted]`, since it cannot be told from a user name cut before its `@` (review pass 2, finding 1). A run that ends in a prefix shorter than a shape's head, such as `done`, `ey`, `tko`, or `SO`, is released verbatim: it holds no secret material, and the tail is per turn (review pass 3, finding 2, declined by the coordinator). A turn whose output ends in whitespace is not affected.
- Output that 13a and 13b stored redacted per chunk is served as stored; no installation holds it, and a promotion must not carry 13a or 13b without 13d (design, "Legacy output").
- The output route tests are in `agent-session-routes.test.ts`, which holds the role fixtures, not in a new file (design, "Test plan").
- The restart test reads the output and every stored byte; it does not read `readCardSessions` separately, which holds no output text.
- The in-memory store runs one transaction at a time, so the race is tested on PostgreSQL only.
- Output is redacted against the known secret shapes only; the run's revealed credentials come with 13c.

## Remaining gates

- Independent review passes 1 to 3 as the route and governance rule ask
- Merge `origin/dev` right before the archive, and the archive
- Integration into dev by the coordinator (single pull request)
