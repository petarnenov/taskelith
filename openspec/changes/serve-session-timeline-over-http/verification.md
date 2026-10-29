# Verification: serve-session-timeline-over-http

## Scope and source

G3 item 13 (`docs/g3-plan.md`, row 13), sub-change 13b, developed by a briefed subagent for the coordinator Niki from `dev` `19c15d69`, with the coordinator's answers to Q1 to Q9 of 2026-10-29 (`design.md`, "Coordinator's answers"): the HTTP operations of control-plane wire contracts section 9 except `readAgentSessionOutput`, with their role checks, scope, and wire reasons; `refused` on the wire (`control-plane.openapi.json` 0.4.0); turn IDs of `t` and 32 hexadecimal digits with `parseTurnId`; the view position `0` through `ViewPositions` until item 14; the native request source with its item and audit tables (migration `1792933100000`); the session input digest key created at installation initialization when missing; and the service wiring into the control-plane composition. Out of scope, as follow-ups only: 13c (the worker messages, and the run's revealed credentials in the session output redactor, answer Q9) and 13d `redact-session-output-across-chunks` (output redaction across chunks and the `readAgentSessionOutput` route, answer Q1). No new third-party dependency.

## Revision

- Base: `dev` `19c15d69`; the change was opened in `afffc347`.
- `01365335` `docs: name the reviewed commit in the architect check of the archived session timeline record`: the brief's extra obligation. The architect-check line of the archived 13a record named `79fcf2c3`, but the reviewed commit is `c6ff25b1`; the note that should have said so was believed to be in the 13a archive commit, but it was never staged, so this commit changes only that line, to "c6ff25b1 (misreported as 79fcf2c3 at the archive)".
- `26677cac` `chore: carry refused turns on the control-plane wire` (the document, version 0.4.0, wire contracts sections 1, 9, and 11, the contract test, and `breaking-changes.json`).
- `c51d6c3c` `chore: serve agent sessions and their native request items over the control-plane API` (routes, handlers, wire mapping, reasons, `parseTurnId`, `SessionScopes`, `ViewPositions`, the native request source, its ports, adapters, and migration, the key at initialization, the composition, and the tests).
- `fb020ec2` `test: tell served agent session 404 answers from an unknown route` (the fail-before runs showed that two 404 assertions also held without the routes; each now checks the served message).
- `3409a9b9` `docs: record the coordinator's answers and trim the serve session timeline change to 13b` (design, proposal, deltas, tasks, `docs/g3-plan.md` row 13, and the installation contract row of the key).
- `b11ec645` merges `origin/dev` `dc2ae98b` (#412, `apply-account-pool-cooldown-and-affinity`). The only conflict was `docs/g3-plan.md`, resolved with dev's row 12 and this change's row 13. The merge changes none of this change's requirements, contracts, or implementation.
- `62f08d83` routed the change. The first `make verify` then failed at `npm run verify:comments` (two three-line comments in files that were untracked when the check ran before the commit), fixed in `d9d38c46`. Since the fix changed the diff after routing, `66551df7` removed `route.json` and `8dca7e3a` routed again (`route.json` unedited, the same tier and reviewers).
- `5c818565`: `make record` and this record, the head that review pass 1 read.
- The pass 1 fixes ("Independent review", pass 1): `353dad7e`, `657afa2e`, `e270cb23`, `36cff478`, `3aab9759` (which also shortens a three-line comment of `session-scopes-conformance.ts` that `e270cb23` added), `c617684a` (a four-line test comment of `3aab9759` shortened), `559af55a`, `d5770c42`, `c5828235`, `7cced138`, and the records `66c1e841` (deltas, design, and tasks) and `71b5122a` (`passes.jsonl` and `findings.jsonl`). None changes a contract document.
- `30663d59`: `make record` and this record's pass 1 sections, the head that review pass 2 read.
- The pass 2 fixes ("Independent review", pass 2): `778649a0`, `b52c1057` (also the installation contract row of the key), `a1d596ec`, `0f2b0fcb`, `0e8db953` (the migration `1792933100000`, not yet integrated, changed in place), `73a934e3` (this record), and `cb8f4fc0` (`passes.jsonl` and `findings.jsonl`). None changes a requirement or the wire contract document.
- The commit after `cb8f4fc0`: `make record` and this record's pass 2 sections.

## Environment

Native Ubuntu host `hpz600`, Linux 6.8.0-147-generic x86_64; Node.js of the `Makefile` pin for `make verify`, the worktree's `nvm` Node.js for the focused runs; PostgreSQL and NATS of the integration services (`make services-up` for the focused runs, `make verify`'s own project for the checks).

## Author self-check

- Scope: every answer is applied as the coordinator gave it. Q1: no output code, `readAgentSessionOutput` has no route and answers 404 as every unrouted operation, 13a's requirement "No output read before cross-chunk redaction" stays, and 13d is named in the proposal, the design, and plan row 13. Q2: `BEFORE_ANY_EVENT` answers `0`, documented as replaced by item 14. Q3: the scopes join `agent_sessions` with `task_lineage`. Q4: the amendment is in the wire contract document (sections 1, 9, 11). Q5: `parseTurnId` refuses a UUID, `mintTurnId` mints the section 6 form, and the design says no data migration is needed since nothing was published. Q6: 13d. Q7: `ensure` creates only when missing, never overwrites, also on a rerun; a wrong-size key is kept and still refuses the start (13a's `session-timeline-start.test.ts`). Q8: migration `1792933100000`. Q9: the design states the limit and the obligation of 12c and 13c.
- Access (checklist `contract-drift`): the six routes use the role rules that `access-requirements.ts` already mapped; the server checks the path project's role before the body, and every handler checks the session's or card's scope before any timeline read. Tests cover every operation for no credential, a non-member, a role on another project, a viewer's commands, an owner without a project role, and a cookie command without CSRF.
- Races (checklist `concurrency-race`) run on PostgreSQL with two real transactions held by a `Barrier` inside the work, never by a sleep; `session-inbox.integration.test.ts` passed 9 of 9 in five consecutive runs before the commit. Review pass 1 (finding 6) showed that the acknowledgement race held its barrier at the read before the writing transactions, so that test proved no overlap; since `3aab9759` it waits inside both writing transactions and asserts the loser's retry, and every barrier wait is bounded and fails by assertion.
- Requirement texts are under 500 characters; the longest is "Agent session operations served", 350. The change validates strictly; the scratch-copy archive is in "Checks".
- Comments: `npm run verify:comments` passes. No AI attribution in commits.
- Evidence check: the counts below are copied from the runs named with them.

## Fail-before

Each new behavioral test ran failing against a stub or mutant of the code it protects (script `mut/mutate.py` and logs in the session scratchpad); the mutants were restored with `git checkout` and the packages rebuilt after each run.

| Tests | How they failed before |
| --- | --- |
| `board-session-contracts.test.ts`, the wire `TurnState` against `TURN_STATES` | Against the 0.3.0 document: 1 of 19 failed by assertion, `TurnState` lacking `refused` (`13b-fb-wire.log`) |
| `native-request-source.test.ts` (12) and "a second response under another key fails with conflict already-answered" of `session-timeline-service.test.ts` | Mutant `exec`: `parseTurnId` accepts any text, `itemChanges` returns none, the service adds no reason, `openItems`, `answer`, and `readSessions` return `internal`, the in-memory scopes answer none: 13 of 42 failed, the 29 older tests passed (`13b-fb-exec.log`) |
| The 2 item cases of `SESSION_TIMELINE_STORE_CONFORMANCE`, in memory and on PostgreSQL | Mutant `items`: both adapters' `add` and `settle` write nothing: the 4 cases failed by assertion; 5 older PostgreSQL tests also failed, since the service then finds no item to settle (`13b-fb-items.log`) |
| `session-inbox.integration.test.ts` (9) and the item assertions of 4 tests of `session-timeline-crash.integration.test.ts` | Mutant `pg`: no item changes, no reasons, and the PostgreSQL scopes answer none: 8 of 9 failed (4 by assertion, 4 by the 30 s test timeout, as their barrier waits for an item read that never comes), and the 4 crash tests failed by assertion; the 6 older crash tests passed (`13b-fb-postgres.log`). The ninth, "a change that leaves the requests as they were leaves their item rows unwritten", failed under mutant `reopen`, which reopens an unchanged open request, with `conflict` (`13b-fb-reopen.log`) |
| "the session inbox down migration removes its tables and keeps the session timeline tables" of `migrations.integration.test.ts` | Mutant `down`: the three `DROP` statements removed from the down migration: it failed by assertion; 13a's down test also failed, `agent_sessions` being still referenced (`13b-fb-down.log`) |
| `agent-session-routes.test.ts` (14), the access test of `access-requirements.test.ts`, and the agent session test of `control-plane-api.integration.test.ts` | Mutant `routes`: the six routes removed: 13 of 14 route tests failed (after `fb020ec2`, which made "an expired request answers 404" check its message), the access test failed, and the integration test failed (`13b-fb-routes.log`) |
| "a session of another project answers a member the same 404 as an unknown one" | Mutant `scope`: the handler checks only that a scope exists: it failed, the 13 others passed (`13b-fb-scope.log`) |
| "submitTurn records a turn under a minted identifier" | Mutant `mint`: `mintTurnId` returns a UUID: it failed by assertion, the 13 others passed (`13b-fb-mint.log`) |
| The 2 `ensure` tests of `session-input-digest-key.test.ts` and the key assertions of `administration.integration.test.ts` | Mutant `key` (`ensure` creates nothing): the creation test and both administration tests failed (`13b-fb-key.log`). Mutant `overwrite` (`ensure` writes a new key first): both `ensure` tests failed, and the administration test failed with "a rerun keeps the key" (`13b-fb-overwrite.log`) |

### Fail-before of the pass 1 fixes

Logs `13b-p1fb-*.log` in the session scratchpad; the mutants are `mut2/mutate.py` there, run by `mut2/run.sh` on a clean tree, which restores the mutated sources and rebuilds after each run. Each run below failed by assertion, none by a timeout.

| Tests | How they failed before |
| --- | --- |
| "an uncertain delivery of a delegation result opens a delivery-acknowledgement item" (finding 1) | Against the sources of `5c818565`: it failed, 13 of 14 passed (`13b-p1fb-delegation.log`) |
| "a reported uncertain delivery of a person's answer opens a delivery-acknowledgement item" (finding 1) | It also passed against `5c818565`, whose code already opened the item; under a mutant that opens no acknowledgement it failed with 3 older tests (`13b-p1fb-acknowledgement.log`) |
| "an inbox answer of an item that a standing rule closed fails with item-closed" and "one key used by a response and then an inbox answer, or the reverse" (findings 2 and 3) | Against the execution sources of `353dad7e`: both failed, 14 passed (`13b-p1fb-item-answer.log`) |
| The PostgreSQL "one key used by a response and then an inbox answer" and "a standing rule racing an inbox answer" (findings 2 and 3) | Against the execution sources of `353dad7e`: both failed by assertion, 9 passed (`13b-p1fb-item-answer-pg.log`) |
| The 3 cases of `SESSION_SCOPES_CONFORMANCE` (finding 5) | Mutant: the in-memory `isCard` derived from sessions, as before: the card case failed on `run-alpha`, `run-empty`, and in a transaction (`13b-p1fb-scopes.log`) |
| "a card's page is one state" (finding 4) | Mutant: `readCardSessions` lists in a transaction of its own: it failed, showing the existing session with 2 turns instead of 1 (`13b-p1fb-card-page.log`) |
| "two acknowledgements of one item under two keys" (finding 6) | Mutant `recheck`: no state check inside the writing transaction and a settle without `state = 'open'`: both acknowledgements succeeded and it failed (`13b-p1fb-recheck.log`) |
| `session-inbox.integration.test.ts` and `session-timeline-crash.integration.test.ts` under the no-items mutant `pg` (the open point of the four timeouts) | 15 of 22 failed, all by assertion and none by the test timeout: the barrier waits are bounded, and `openItemId` and `uncertainDelivery` assert that their item exists (`13b-p1fb-postgres.log`, 0 timeouts; the earlier `13b-fb-postgres.log` had 4) |
| The 2 acknowledgement crash tests and the item assertions of the 2 recording crash tests (finding 7) | Mutant `pg`: all 4 failed by assertion (`13b-p1fb-crash-items.log`). Mutant `audit-apart` (audit event in a transaction of its own): "killed after its commit" failed (`13b-p1fb-audit-apart.log`); mutant `items-apart`: the 3 after-commit tests with items failed (`13b-p1fb-items-apart.log`). The before-commit tests passed under both, since the separate transaction is killed at its own commit point first |
| `agent-session-routes.test.ts` (finding 8) | The file of `5c818565` with the read test moved last: the read test failed; this change's file moved the same way: 14 of 14 passed (`13b-p1fb-routes-order.log`, `13b-p1-routes-order-after.log`) |

### Fail-before of the pass 2 fixes

Logs `13b-p2fb-*.log` in the session scratchpad; the mutants were applied by `mut3/run.sh` there on a clean tree, which restores the source and rebuilds after each run. Each run failed by assertion, none by a timeout.

| Tests | How they failed before |
| --- | --- |
| "a missing digest key refuses the service start and names init, which creates it" (finding 5) | Against the sources of `778649a0`: it failed with "session-input-digest.key is missing", 7 passed (`13b-p2fb-init-hint.log`) |
| "readAgentSession shows the retained output from its earliest position to its last" (finding 7) | Mutant: the wire mapping drops `earliestRetained`: it failed, 15 passed (`13b-p2fb-output-bounds.log`) |
| "respondToNativeRequest refuses an input answer over its character or byte bound" (finding 7) | Mutant: the service's UTF-8 byte bound of an input answer accepts any length: it failed, 15 passed (`13b-p2fb-answer-bound.log`); the character bound is the wire schema's `maxLength` |
| The 4 ordered race tests of `session-inbox.integration.test.ts` (finding 6) | Mutant `open-unchecked` (no open item check in `answerItem`): the rule-first test failed (`13b-p2fb-open-unchecked.log`). Mutant `settle-closed` (every settled item closed): the inbox-first and the answer-first tests failed with 2 older tests (`13b-p2fb-settle-closed.log`). Mutant `no-acknowledgement`: the answer-first test failed with 2 older tests (`13b-p2fb-no-acknowledgement.log`). Mutant `settle-answered-only` (only an answer settles an item): the end-first test failed (`13b-p2fb-settle-answered-only.log`). The file then passed 14 of 14 in five consecutive runs (`13b-p2-inbox-5runs.log`) |
| "the open session inbox items index serves their listing in code-unit order without a sort" (finding 8) | Against the migration of `a1d596ec`: the plan sorted by `item_id COLLATE "C"`, and it failed; the two down migration tests passed (`13b-p2fb-index-collation.log`) |

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `make verify` | `8dca7e3a`, tree `f3fcf597` (log `13b-verify-1.log` in the session scratchpad) | Passed, profile full, stamp written: tests 3843, suites 49, pass 3796, fail 0, cancelled 0, skipped 47; all files 99.35 % lines, 92.62 % branches, 98.79 % functions; "Contract documents have no undeclared breaking change." The first run, on `62f08d83`, failed at `npm run verify:comments` (see "Revision") |
| `make contract-compatibility` | `26677cac` and within `make verify` | Before the declaration it reported the added `refused` of four responses (`listAgentSessionTurns` 200, `streamProjectEvents` 200, `submitTurn` 200 and 201) as breaking; with the 0.4.0 declaration in `breaking-changes.json`: "Contract documents have no undeclared breaking change." |
| `openspec validate serve-session-timeline-over-http --strict` | `3409a9b9`; again at `0e8db953`, after the delta changes of `66c1e841` (log `13b-p2-validate.log`) | Valid |
| Archive in a scratch copy of `openspec/` | `8dca7e3a`; again at `0e8db953`, after the delta changes of `66c1e841` (log `13b-p2-archive.log`) | Both runs: 8 requirements added (control-plane-api 5, control-plane-wire-contracts 1, postgres-state 1, session-turn-model 1); `openspec validate --specs --strict` then passed 71 of 71 items |
| `make verify` after pass 1 | `71b5122a`, tree `30d7b5f4` (log `13b-verify-2.log`) | Passed, profile full, stamp written: tests 3854, suites 49, pass 3807, fail 0, cancelled 0, skipped 47; all files 99.35 % lines, 92.64 % branches, 98.78 % functions; "Contract documents have no undeclared breaking change." Two earlier runs on the same tree failed only at timing-bound tests outside this change: the first at `test/g2-cancellation-races.test.ts` "h. an unauthorized start cancels only that execution" (the authorized start not met within 20 s) and `test/installation-script.test.ts` "a bound with a leading zero is read in base 10" (ended after 9.08 s, before 10), the second at the same scenario h (`13b-verify-2-attempt1.log`, `13b-verify-2-attempt2.log`), with a host load average of 5 to 7 and another worktree's service stack running; scenario h then passed twice alone in about 10 s at the same head |
| `make verify` after pass 2 | `cb8f4fc0`, tree `3f1777fd` (log `13b-verify-3.log`) | Passed at the first run, profile full, stamp written: tests 3859, suites 49, pass 3812, fail 0, cancelled 0, skipped 47; all files 99.35 % lines, 92.63 % branches, 98.78 % functions; "Contract documents have no undeclared breaking change." No timing flake occurred |
| Focused runs | `c51d6c3c` | `apps/control-plane`, `execution`, `control-plane-store`, and `contracts` tests: 917, pass 888, fail 0; `administration.integration.test.ts` 8 of 8; `session-inbox.integration.test.ts` 9 of 9 in five consecutive runs |

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `3f1777fd0dfb4e48614e5a19f5abb2ea1dd96cf6`; tests 3859, pass 3812, fail 0, skipped 47; all files 99.35% lines, 92.63% branches, 98.78% functions.
- `npm run openspec -- validate serve-session-timeline-over-http --strict`: passed, `Change 'serve-session-timeline-over-http' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 89 file(s); every pass summary file is valid: 69 file(s); every route file is valid: 25 file(s).`.
- Spec diff against the merge base `dc2ae98b379d` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a18567-6319-7b40-99eb-6c3869e945bc` | 0 | 0 | 8 | 5 |
| 2 | B | `claude claude-opus-5-5#medium` | `0de0fcc9-aba0-41a9-b3f7-8dbb4c10c750` | 0 | 0 | 0 | 8 |
<!-- make record: end -->

## Independent review

### Pass 1

- Reviewer A: Codex CLI, model `gpt-6-astra`, reasoning effort `medium`, sandbox read-only, session `01a18567-6319-7b40-99eb-6c3869e945bc`, on `5c818565` (diff `dc2ae98b379d..5c818565`). The worktree snapshot before and after the review was `a40f6de3597d71f7862f0af7c88aacc7b20c56f4821531e66206bcfea0ad6bbf`, equal.
- Invocation (from `make review`): `codex exec -m gpt-6-astra -c model_reasoning_effort="medium" -s read-only -C /home/petar/taskelith-worktrees/serve-session-timeline-over-http -`, environment `PATH HOME USER LANG TERM`, started 2026-10-29T02:05:07.537Z. Model confirmation: `model: gpt-6-astra`, `effort: medium`, `sandbox: read-only`, as reported by the Codex log and printed by `make review`. The brief names pass 1 reviewer A `codex gpt-6-astra#medium`; `make review` printed "route: recommends effort high; the authorized medium applies (policy version 8)".
- Result: Critical 0, High 0, Medium 8, Low 5, matching the pass 1 line of `passes.jsonl`; all thirteen fixed and recorded in `findings.jsonl`. The reviewer ran the execution tests (42 of 42), neither PostgreSQL nor `make verify`; its `make record-check` failed in its sandbox for want of the local stamp.
  1. Medium, contract-drift (`session-item-changes.ts:37`): a delegation request skipped every item change, so its uncertain delivery opened no `delivery-acknowledgement` item (section 8.1). Fixed in `353dad7e`: only the request's own item is skipped.
  2. Medium, contract-drift (`native-request-source.ts:94`): an inbox answer to an item that a standing rule closed got `already-answered` instead of `item-closed`. Fixed in `657afa2e`: the service's `answerItem` reads the item's state in the consuming transaction after the key check.
  3. Medium, contract-drift (`native-request-source.ts:95`): the inbox key was checked in the request's response scope, so one key in both channels repeated or reported a reused key. Fixed in `657afa2e`: the inbox key is held in the item's scope (section 8).
  4. Medium, concurrency-race (`agent-session-api.ts:50`): the card's listing and its reads were two transactions. Fixed in `36cff478`: `readCardSessions` does both in one, through `SessionTimelineTransaction.scopes`.
  5. Medium, contract-drift (`in-memory-session-timeline-store.ts:78`): the in-memory card came from sessions only. Fixed in `e270cb23`: `InMemoryTaskLineage` and `SESSION_SCOPES_CONFORMANCE` on both adapters.
  6. Medium, test-flakiness (`session-inbox.integration.test.ts:94`): the acknowledgement barrier held the pre-read, not the writes. Fixed in `3aab9759` (barrier after the reads of the writing transactions, retry asserted, bounded waits) and `c617684a` (its comment).
  7. Medium, missing-fail-before-test (`session-timeline-crash.integration.test.ts:124`): no crash test of the acknowledgement, no item checks in the recording crash tests. Fixed in `559af55a`.
  8. Medium, test-flakiness (`agent-session-routes.test.ts:244`): the route tests shared `s-alpha`. Fixed in `d5770c42`: each changing test has its own session.
  9. Low, spec-wording (`specs/session-turn-model/spec.md:4`, `specs/postgres-state/spec.md:4`): the deltas left no transaction for an acknowledgement. Fixed in `66c1e841`, with scenarios of the new behaviors.
  10. Low, naming (`session-input-digest-key.test.ts:56`): the test name claimed the digest's refusal. Fixed in `7cced138`: named after what it checks; 13a's `session-timeline-start.test.ts` covers the refusal.
  11. Low, evidence-mismatch (`tasks.md:17`): task 3.1 unticked. Fixed in `66c1e841`.
  12. Low, docs (this record, "Remaining gates", and `tasks.md:21`): passes 1 and 2 presented as always required. Fixed in `66c1e841`: stated conditionally under policy version 8.
  13. Low, stale-citation (`session-timeline-service.ts:250`): a comment gave the held tail to 13b. Fixed in `c5828235`: 13d.
- Fail-before: "Fail-before of the pass 1 fixes" above. Findings 9 to 13 change records, a test name, and a comment only.
- Pass 2, reviewer B `claude claude-opus-5-5#medium` as the brief names it, followed because pass 1 reported Medium findings; it also checked these fixes.

### Pass 2

- Reviewer B: Claude Code, model `claude-opus-5-5`, effort `medium`, permission mode `plan` with `Edit`, `Write`, and `NotebookEdit` disallowed, session `0de0fcc9-aba0-41a9-b3f7-8dbb4c10c750`, on `30663d59` (diff `dc2ae98b..30663d59`). The worktree snapshot before and after the review was `453dbce204f6384f8da69d4c994fdbb9eafe398ad30e5daa85152dced328217f`, equal.
- Invocation (from `make review`): `claude -p --model claude-opus-5-5 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format stream-json --verbose -- <prompt>`, environment `PATH HOME USER LANG TERM`, started 2026-10-29T02:57:36.665Z. Model confirmation: `model: claude-opus-5-5 (reported)`, printed by `make review` from the reviewer's log. The brief names pass 2 reviewer B `claude claude-opus-5-5#medium`; `make review` printed "route: recommends effort xhigh; the authorized medium applies (policy version 8)", so the route's `#xhigh` stayed a recommendation.
- Result: Critical 0, High 0, Medium 0, Low 8, matching the pass 2 line of `passes.jsonl`. The reviewer found every pass 1 finding fixed without a new behavioral defect. Since the pass has only Low findings, the review ends (governance, policy version 8): all eight are fixed without another review and recorded in `findings.jsonl` as `fixed-unreviewed`. These fixes are unreviewed by a reviewer; the coordinator's architect check passed them ("Architect check"); no pass 3 runs.
  1. Low, evidence-mismatch (this record, "Checks", the scratch archive row): the archive was recorded at `8dca7e3a`, before `66c1e841` changed three deltas. Fixed in `73a934e3`: run again at `0e8db953`, 8 requirements added and 71 of 71 specs valid (`13b-p2-archive.log`).
  2. Low, evidence-mismatch (this record, "Checks", the strict validation row): recorded at `3409a9b9`, before `66c1e841`. Fixed in `73a934e3`: valid at `0e8db953` (`13b-p2-validate.log`).
  3. Low, stale-citation (this record, pass 1 finding 7): it cited `native-request-source.ts:110` as well, while `findings.jsonl` cites only the crash test. Fixed in `73a934e3`.
  4. Low, docs (`design.md:104`): the size table counted seven routes. Fixed in `778649a0`: six.
  5. Low, contract-drift (`session-input-digest-key.ts:33`): the accepted Q7 option has the start name the command, but a missing key was refused with "is missing" only. Fixed in `b52c1057`: the refusal reads "session-input-digest.key is missing; run init", the start test checks the whole message, and the installation contract row says so.
  6. Low, test-flakiness (`session-inbox.integration.test.ts:219` and `:264`): the standing rule against inbox answer race and the answer against generation end race accepted either outcome. Fixed in `0f2b0fcb`: four tests, one per outcome; `trailingBarrierStore` lets the second party read, then wait until the first party's call has settled, so the commit order is fixed.
  7. Low, test-coverage, recorded as missing-fail-before-test, the closest listed category (`agent-session-routes.test.ts`): no check of `output.earliestRetained` or of the 400 of an input answer over its bound. Fixed in `a1d596ec`: two route tests, the bound one over the character and the UTF-8 byte bound.
  8. Low, performance, recorded as contract-drift, the closest listed category (`1792933100000_session-inbox-items.sql:15`): the partial index of open items had the default collation, unlike the `COLLATE "C"` order of `listOpen`. Fixed in `0e8db953`: the index is on `item_id COLLATE "C"`; the down migration test still passes.
- Fail-before: "Fail-before of the pass 2 fixes" below. Findings 1 to 4 change records only.

### Architect check

Architect check (Niki, 2026-10-29): 778649a0, b52c1057, a1d596ec, 0f2b0fcb, 0e8db953, 73a934e3 passed (cb8f4fc0/b8408961 records); category mapping test-coverage to missing-fail-before-test and performance to contract-drift accepted

### Route

Route (`route.json`, rule version 2): elevated; pass 1 reviewer A codex gpt-6-astra#high, pass 2 reviewer B claude claude-opus-5-5#xhigh, pass 3 reviewer A codex gpt-6.1-sol#high. The brief names the reviewers at `#medium` (A codex gpt-6-astra, B claude claude-opus-5-5, pass 3 A codex gpt-6.1-sol); the route's higher efforts are a recommendation that needs governance authorization. Passes 1 and 2 ran at the authorized `medium`, below the route's `high` and `xhigh`; pass 3 does not run.

## Limitations

- Output stays redacted per chunk only, and `readAgentSessionOutput` stays unrouted (404) until 13d (answer Q1).
- Output is redacted against the known secret shapes only, not against the credentials revealed to the run; 13c wires those from 12c's per-run delivery record into the session output redactor (answer Q9).
- The view position is `0` on every read until item 14's event stream replaces `BEFORE_ANY_EVENT` (answer Q2).
- The native request source is built in the composition but registered with no inbox; item 15 aggregates it and checks the inbox answer's key before it.
- A session whose task has no lineage row answers as unknown; the lineage is written for every submitted task.
- The in-memory store runs one transaction at a time, so its races show no interleaving; the races are tested on PostgreSQL only.
- Four of the first PostgreSQL fail-before runs failed by the test timeout rather than by assertion, as recorded in "Fail-before"; the rerun after pass 1 failed by assertion only ("Fail-before of the pass 1 fixes").

## Remaining gates

- Archive of the change in the last commit of the branch
- Integration into dev by the coordinator (single pull request)
- Follow-ups 13c (the worker messages, and the run's revealed credentials in the session output redactor, answer Q9) and 13d `redact-session-output-across-chunks` (output redaction across chunks with a held tail and the `readAgentSessionOutput` route, migration `1792933200000`)
