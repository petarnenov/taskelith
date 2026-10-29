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
- The commit after it: `make record` and this record.

## Environment

Native Ubuntu host `hpz600`, Linux 6.8.0-147-generic x86_64; Node.js of the `Makefile` pin for `make verify`, the worktree's `nvm` Node.js for the focused runs; PostgreSQL and NATS of the integration services (`make services-up` for the focused runs, `make verify`'s own project for the checks).

## Author self-check

- Scope: every answer is applied as the coordinator gave it. Q1: no output code, `readAgentSessionOutput` has no route and answers 404 as every unrouted operation, 13a's requirement "No output read before cross-chunk redaction" stays, and 13d is named in the proposal, the design, and plan row 13. Q2: `BEFORE_ANY_EVENT` answers `0`, documented as replaced by item 14. Q3: the scopes join `agent_sessions` with `task_lineage`. Q4: the amendment is in the wire contract document (sections 1, 9, 11). Q5: `parseTurnId` refuses a UUID, `mintTurnId` mints the section 6 form, and the design says no data migration is needed since nothing was published. Q6: 13d. Q7: `ensure` creates only when missing, never overwrites, also on a rerun; a wrong-size key is kept and still refuses the start (13a's `session-timeline-start.test.ts`). Q8: migration `1792933100000`. Q9: the design states the limit and the obligation of 12c and 13c.
- Access (checklist `contract-drift`): the six routes use the role rules that `access-requirements.ts` already mapped; the server checks the path project's role before the body, and every handler checks the session's or card's scope before any timeline read. Tests cover every operation for no credential, a non-member, a role on another project, a viewer's commands, an owner without a project role, and a cookie command without CSRF.
- Races (checklist `concurrency-race`) run on PostgreSQL with two real transactions held by a `Barrier` inside the work, never by a sleep; `session-inbox.integration.test.ts` passed 9 of 9 in five consecutive runs before the commit.
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

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `make verify` | `8dca7e3a`, tree `f3fcf597` (log `13b-verify-1.log` in the session scratchpad) | Passed, profile full, stamp written: tests 3843, suites 49, pass 3796, fail 0, cancelled 0, skipped 47; all files 99.35 % lines, 92.62 % branches, 98.79 % functions; "Contract documents have no undeclared breaking change." The first run, on `62f08d83`, failed at `npm run verify:comments` (see "Revision") |
| `make contract-compatibility` | `26677cac` and within `make verify` | Before the declaration it reported the added `refused` of four responses (`listAgentSessionTurns` 200, `streamProjectEvents` 200, `submitTurn` 200 and 201) as breaking; with the 0.4.0 declaration in `breaking-changes.json`: "Contract documents have no undeclared breaking change." |
| `openspec validate serve-session-timeline-over-http --strict` | `3409a9b9` | Valid |
| Archive in a scratch copy of `openspec/` | `8dca7e3a` | 8 requirements added (control-plane-api 5, control-plane-wire-contracts 1, postgres-state 1, session-turn-model 1); `openspec validate --specs --strict` then passed 71 of 71 items |
| Focused runs | `c51d6c3c` | `apps/control-plane`, `execution`, `control-plane-store`, and `contracts` tests: 917, pass 888, fail 0; `administration.integration.test.ts` 8 of 8; `session-inbox.integration.test.ts` 9 of 9 in five consecutive runs |

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `f3fcf5972ce51a9db62517421b2d57000ccd78ea`; tests 3843, pass 3796, fail 0, skipped 47; all files 99.35% lines, 92.62% branches, 98.79% functions.
- `npm run openspec -- validate serve-session-timeline-over-http --strict`: passed, `Change 'serve-session-timeline-over-http' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 89 file(s); every pass summary file is valid: 69 file(s); every route file is valid: 25 file(s).`.
- Spec diff against the merge base `dc2ae98b379d` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

No review pass has run. Route (`route.json`, rule version 2): elevated; pass 1 reviewer A codex gpt-6-astra#high, pass 2 reviewer B claude claude-opus-5-5#xhigh, pass 3 reviewer A codex gpt-6.1-sol#high. The brief names the reviewers at `#medium` (A codex gpt-6-astra, B claude claude-opus-5-5, pass 3 A codex gpt-6.1-sol); the route's higher efforts are a recommendation that needs governance authorization.

## Limitations

- Output stays redacted per chunk only, and `readAgentSessionOutput` stays unrouted (404) until 13d (answer Q1).
- Output is redacted against the known secret shapes only, not against the credentials revealed to the run; 13c wires those from 12c's per-run delivery record into the session output redactor (answer Q9).
- The view position is `0` on every read until item 14's event stream replaces `BEFORE_ANY_EVENT` (answer Q2).
- The native request source is built in the composition but registered with no inbox; item 15 aggregates it and checks the inbox answer's key before it.
- A session whose task has no lineage row answers as unknown; the lineage is written for every submitted task.
- The in-memory store runs one transaction at a time, so its races show no interleaving; the races are tested on PostgreSQL only.
- Four of the PostgreSQL fail-before runs failed by the test timeout rather than by assertion, as recorded in "Fail-before".

## Remaining gates

- Review passes 1 and 2, and pass 3 if pass 2 requires it (governance), recorded in `passes.jsonl`, `findings.jsonl`, and this record
- Archive of the change in the last commit of the branch
- Integration into dev by the coordinator (single pull request)
- Follow-ups 13c (the worker messages, and the run's revealed credentials in the session output redactor, answer Q9) and 13d `redact-session-output-across-chunks` (output redaction across chunks with a held tail and the `readAgentSessionOutput` route, migration `1792933200000`)
