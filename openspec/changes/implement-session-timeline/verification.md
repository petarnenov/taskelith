# Verification: implement-session-timeline

## Scope and source

G3 item 13 (`docs/g3-plan.md`, row 13), sub-change 13a, developed by a briefed subagent for the coordinator Niki: the session turn model's domain gaps (`refused`, `recordTurnAcceptanceUnknown`, `recordTurnRefused`, the hold of `nextDeliverableTurn`), the `SessionTimelineStore` port with its in-memory and PostgreSQL adapters and a shared conformance suite, the session timeline service with HMAC-SHA-256 idempotency digests of the unredacted input and session text redaction, the digest key file of answer Q4, the `SessionTimelineCommit` crash points, and their race and crash tests, with the coordinator's answers to Q1 to Q10 of 2026-10-29 (`design.md`, "Coordinator's answers"). Out of scope, as follow-ups only: 13b (the HTTP operations of control-plane wire contracts section 9, output redaction across chunks, the native request source, `refused` on the wire, the digest key's creation, and the service wiring) and 13c (the worker messages of 9d). No new third-party dependency; `control-plane.openapi.json` is unchanged. `docs/contracts/installation-and-enrollment.md` section 3 lists the key file.

## Revision

- Base: `dev` `62217e7a`; the change was opened in `b80ccbf3`. `origin/dev` had not moved when the change was routed, so nothing was merged.
- `64ea6d1d` `chore: implement the session timeline store, service, and PostgreSQL adapter` (domain, ports, in-memory store, service, PostgreSQL adapter and migration, digest and redaction adapters, key file, service start, tests, the contract row of the key file, and the design, proposal, deltas, and tasks with the coordinator's answers).
- `6814dcab` `docs: route the implement session timeline change` (`route.json`, unedited).
- The commit after it, `12c1035c`: `make record` and this record.
- `c87d0653` `chore: compare session request and response repeats by their whole unredacted input` (the fixes of review pass 1, findings 1 to 5, with their tests, the design, and the session-turn-model delta).
- The commits after it: the corrected fail-before evidence of findings 5 and 6, then `make record`, the pass 1 record, and `findings.jsonl` and `passes.jsonl`.
- `fe26c9cd` `chore: fix the low findings of review pass 2 of the implement session timeline change` (findings L1 to L6).
- `e422b1d8` `chore: cut redacted session text to its bound after redaction` (finding M1 as the architect answered, with its tests, design decision 6, and the session-turn-model delta).
- `373982ae` `docs: record review pass 2 findings of the implement session timeline change`, then `make record` and this record.
- `e355e01f` and `87f1e9af` (the Low findings of review pass 3), then the pass 3 records, design decision 6's amendment of answer M1, `make record`, and this record.
- `54ac0c9d` names 13b as the owner of the digest key's creation and the service wiring (the architect check's amendment of `e355e01f`); the commit after it records the check and the finding's resolution.
- `490219df` merges `origin/dev` `f882c0ac` (12a `implement-account-pool-slot-store`, #410, with its migration `1792932900000_account-pool`, answer Q7). The conflicts were in shared lists only, resolved by keeping both sides: the exports of `@taskelith/secrets` and `@taskelith/control-plane-store`, the repositories of `PostgresTransaction`, the tables of `test-database.ts`, the migration lists and tables of `migrations.integration.test.ts` (account pool before session timeline, by number), and `docs/g3-plan.md` rows 12 (dev's) and 13 (this change's). The merge changes none of this change's requirements, contracts, or implementation; `make verify` below runs on the merged tree.

## Environment

Native Ubuntu host `hpz600`, Linux 6.8.0-147-generic x86_64; Node.js 24.22.1 of the `Makefile` pin for `make verify`, 24.22.0 for the focused runs; PostgreSQL 18.6 of the integration services (`make services-up` for the focused runs, `make verify`'s own project for the checks).

## Author self-check

- Scope: every answer is applied as the coordinator gave it. Q8 as changed: `control-plane.openapi.json` and the wire `TurnState` are untouched; `board-session-contracts.test.ts` compares the wire enumeration with `WIRE_TURN_STATES`, the domain's `TURN_STATES` without `refused`, and nothing maps a domain `refused` turn onto the wire. Q5: the service answers `SessionView`, a session without its output window, and has no output read; output is read only through the store in tests.
- Idempotency (checklist `contract-drift`): a turn's digest covers the whole request identity, the author (a principal, or the host with its delegation request key) and the unredacted text; since `c87d0653` a response's digest covers the answer, the responder, and the attempt with its ownership generation, and a native request key holds the digest of its unredacted kind, turn, and text (review pass 1, findings 1 and 2). Tests show that the same turn key from another author with the same text fails with `conflict` and the detail `reason` `idempotency-key-reused` in memory and on PostgreSQL after a new pool. Two turn texts that redact alike were tested only in memory at `64ea6d1d`, which this record overstated (finding 5); `c87d0653` adds that test on PostgreSQL after a new pool with `SecretTextRedactor`, together with request texts that redact alike and response keys reused by another attempt or ownership generation.
- Q4: `SessionInputDigestKeyFile.create` writes `control-plane/session-input-digest.key` through `ControlPlaneNamespace.create` with mode `0600` (tested); no code logs it or puts it in a record; `HmacInputDigest.fromKey` and `startSessionTimelineService` refuse a missing or wrong-size key with a reason that names only the file or the size, tested with sentinel key bytes. No command creates the key yet; the architect check (Niki, 2026-10-29) assigns its creation at installation bootstrap and the service wiring into the control-plane composition to 13b.
- Races (checklist `concurrency-race`) run on PostgreSQL 18.6 with two real transactions that both read before either writes, held by a `Barrier` inside the work, never by a sleep; the in-memory store runs one transaction at a time.
- Requirement texts of both deltas are under 500 characters; the longest is now "Session timeline tables", 417, then "Durable session timeline service", 415 since review pass 2 moved its bound check into a requirement of its own (494 at `c87d0653`). The change validates strictly, and an archive of it in a scratch copy of `openspec/`, repeated at `c87d0653`, added 8 requirements, after which `openspec validate --specs --strict` passed 71 of 71 items; repeated at `373982ae`, after review pass 2 added two requirements, it added 10, and the strict validation passed 71 of 71 again. The new "Redacted text cut to its bound" is 359 characters.
- Comments: `npm run verify:comments` passes. No AI attribution in commits.
- Evidence check: the counts below are copied from the runs named with them.

## Fail-before

Each new behavioral test was written before its code and run failing, except the down migration test, which a later mutation run checks (last row):

| Tests | How they failed before the change |
| --- | --- |
| `session-turn-reports.test.ts` (18) and the updated "the turn states are those of the contract" of `session-turns.test.ts` | Run against stub `recordTurnAcceptanceUnknown` and `recordTurnRefused` that return `internal` and `TURN_STATES` without `refused`: 19 of 42 failed by assertion, the 23 older tests passed |
| `session-timeline-service.test.ts` (20) and the 9 in-memory cases of `SESSION_TIMELINE_STORE_CONFORMANCE` in `repository-conformance.test.ts` | Run against a stub `SessionTimelineService` whose every method returns `internal` and an in-memory store whose transaction returns `internal`: 29 of 38 failed, the 9 older conformance cases passed |
| `session-input-digest-key.test.ts` (3), `hmac-input-digest.test.ts` (3), `session-timeline-start.test.ts` (3) | Run against stubs of the key file, `HmacInputDigest.fromKey`, and `startSessionTimelineService` that return `internal`, a digest of `''`, and a redactor that returns its input: 9 of 9 failed |
| `session-timeline.integration.test.ts` (9 conformance cases on PostgreSQL and 9 service tests) | Run before the migration file existed: 18 of 18 failed with `relation "agent_sessions" does not exist` |
| The same file and `session-timeline-service.test.ts`, mutant A: the service resolves no stored key | 9 failed: on PostgreSQL the races of one key and input, one key and two inputs, and one key and one answer, and another author after a new pool; in memory the retried duplicate, another author, texts that redact alike, the repeated response key, and the reused response key |
| `session-timeline.integration.test.ts`, mutant B: the adapter writes no attempt row and trims no output | 3 failed: the attempt and output-window conformance cases and the concurrent binding of one attempt |
| `session-timeline-crash.integration.test.ts` (10) | Run against the adapter without the `SessionTimelineCommit` commit point (the pre-change `commitPoints`): 10 of 10 failed, every child exiting without `SIGKILL` |
| `session-timeline-service.test.ts`, the 4 tests of review pass 1 (findings 1 to 4) | Run against the service of `64ea6d1d`: 4 of 24 failed by assertion (`expected a failure`): request texts that redact alike, overlong request text, a response key from another attempt or ownership generation, and an overlong output chunk; the 20 older tests passed |
| `session-timeline.integration.test.ts`, the 4 tests of review pass 1 (findings 1, 2, and 5) | Run against the service of `64ea6d1d`: 3 of 22 failed by assertion: request texts that redact alike after a new pool, the race of two such recordings, and a response key from another attempt or ownership generation after a new pool. Two turn texts that redact alike after a new pool passed, because `64ea6d1d` already resolved them; it adds the PostgreSQL evidence of finding 5 |
| `session-timeline.integration.test.ts`, the tests of review pass 2 (findings L5 and L6) | Run against the migration and repository of `df6ab889` with the new tests (log `13-p2-fb-postgres.log`): 7 of 24 failed. "A change of a session with a bound attempt leaves its attempt row unwritten" failed by assertion, the attempt row's `xmin` advanced (L6); the conformance case "a held key recorded without an outcome reads back without one" and five response tests failed with the `NOT NULL` violation of `outcome`, since a response key now records none (L5) |
| `session-timeline-service.test.ts`, the 6 tests of finding M1 | Run against the service of `fe26c9cd` (log `13-p2-fb-m1.log`): 6 of 30 failed, the 24 older tests passed. The turn, request, and output chunk tests and the surrogate-pair cut failed with `invalid` from the domain's second check; the input answer test failed by assertion, the full 65,539-byte redacted text recorded; the byte bound test failed because the answer was accepted. After the fix the module's suites passed 315 of 315 (`13-p2-after-m1.log`) |
| `migrations.integration.test.ts` "the session timeline down migration removes the session timeline tables" | A mutation run after the commit, not before it (finding 6): with the up migration in place and the down migration's four `DROP TABLE` statements removed, it failed by assertion, four tables still present where none were expected; with the statements restored it passed. The earlier run with the migration file moved away failed only with `ENOENT` and proved nothing about the down migration |

The stubs and mutants were restored from the real files before the commit. After the change, `session-timeline.integration.test.ts` passed 18 of 18 in eight consecutive runs and `session-timeline-crash.integration.test.ts` 10 of 10. After `c87d0653` the first passed 22 of 22 in five consecutive runs and the second 10 of 10.

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `make verify` | `6814dcab`, tree `9cacd94c` (log `13-verify-1.log` in the session scratchpad) | Passed, profile full, stamp written: tests 3703, suites 47, pass 3656, fail 0, cancelled 0, skipped 47; all files 99.36 % lines, 92.76 % branches, 98.77 % functions |
| `make verify` | `335102b3`, tree `fc4bd347` (log `13-verify-2.log` in the session scratchpad) | First run failed, 1 of 3711: the G2 scenario "h. an unauthorized start cancels only that execution" of `test/g2-cancellation-races.test.ts`, which this change does not touch, timed out waiting 20000 ms for the authorized start (log kept as `13-verify-2-attempt1.log`). The rerun on the same clean tree passed, profile full, stamp written: tests 3711, suites 47, pass 3664, fail 0, cancelled 0, skipped 47; all files 99.36 % lines, 92.74 % branches, 98.77 % functions |
| `make verify` | `373982ae`, tree `e0a59353` (log `13-verify-3.log` in the session scratchpad) | Passed, profile full, stamp written: tests 3720, suites 47, pass 3673, fail 0, cancelled 0, skipped 47; all files 99.36 % lines, 92.76 % branches, 98.77 % functions. An earlier run on the same tree also passed with 3720 tests but wrote no stamp, because this record was edited while it ran; its log was overwritten by the rerun |
| `make verify` | `c6ff25b1`, tree `4133e5c3` (log `13-verify-4.log` in the session scratchpad) | Passed, profile full, stamp written: tests 3720, suites 47, pass 3673, fail 0, cancelled 0, skipped 47; all files 99.36 % lines, 92.78 % branches, 98.77 % functions |
| `make findings ARGS="route --change implement-session-timeline"` | `64ea6d1d` | "route: elevated (lines, files, security, contracts, size), rule version 2"; pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-opus-5-5#xhigh`, pass 3 reviewer A `codex gpt-6.1-sol#high` only after a pass 2 with a Medium or worse finding; shadow `jev-1.14.0` agrees; recommendation only, committed unedited as `6814dcab`. The brief names pass 1 `codex gpt-6-astra#medium`, pass 2 `claude claude-opus-5-5#medium`, and pass 3 `codex gpt-6.1-sol#medium` |

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `4133e5c3ed64e20ea95e41e5133a2e160d8dd58f`; tests 3720, pass 3673, fail 0, skipped 47; all files 99.36% lines, 92.78% branches, 98.77% functions.
- `npm run openspec -- validate implement-session-timeline --strict`: passed, `Change 'implement-session-timeline' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 86 file(s); every pass summary file is valid: 66 file(s); every route file is valid: 22 file(s).`.
- Spec diff against the merge base `62217e7a1f56` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a184cb-122d-7ea3-b3c0-eb5d81062ea4` | 0 | 0 | 4 | 2 |
| 2 | B | `claude claude-opus-5-5#medium` | `a3bdaf27-9245-42bc-ae80-3af56864035e` | 0 | 0 | 1 | 6 |
| 3 | A | `codex gpt-6.1-sol#medium` | `01a184ff-058d-7232-8cc7-7f260b948982` | 0 | 0 | 0 | 2 |
<!-- make record: end -->

## Independent review

### Pass 1

- Reviewer A: Codex CLI, model `gpt-6-astra`, reasoning effort `medium`, sandbox read-only, session `01a184cb-122d-7ea3-b3c0-eb5d81062ea4`, on `12c1035c` (diff `62217e7a...12c1035c`). The worktree snapshot before and after the review was `341da4d904cc51b1dac317756206c76322f6b6630b26126bd6610be1ecc5cca2`, equal.
- Invocation (from `make review`): `codex exec -m gpt-6-astra -c model_reasoning_effort="medium" -s read-only -C /home/petar/taskelith-worktrees/implement-session-timeline -`, environment `PATH HOME USER LANG TERM`, started 2026-10-28T23:14:23.187Z. Model confirmation: `model: gpt-6-astra`, `effort: medium`, `sandbox: read-only`, as reported by the Codex log header and printed by `make review`. The brief names pass 1 reviewer A `codex gpt-6-astra#medium`; `make review` printed "route: recommends effort high; the authorized medium applies (policy version 8)", since `route.json` recommends `codex gpt-6-astra#high`.
- Result: Critical 0, High 0, Medium 4, Low 2, matching the pass 1 line of `passes.jsonl`; all six fixed and recorded in `findings.jsonl`. The reviewer ran neither PostgreSQL nor `make verify`.
  1. Medium, contract-drift (`session-timeline-service.ts`, `consumeResponse`): the response digest left out the attempt and its ownership generation, so a repeated key with either changed returned the answered request. Fixed in `c87d0653`: the digest covers both (design decision 5, the delta's "Response consumed once under concurrency").
  2. Medium, contract-drift (`recordRequest`): a held native request key was compared on its redacted text, so two texts that differ only in a secret were one request. Fixed in `c87d0653`: the native request ID, scoped to its generation, holds the keyed digest of the unredacted kind, turn, and text in `session_idempotency_keys`, compared before the domain; another digest is `conflict` (decision 5, the delta's "Durable session timeline service" with the scenario "Request texts that redact alike").
  3. Medium, contract-drift (`recordRequest`): request text was bounded only after redaction. Fixed in `c87d0653`: the unredacted text is checked first and fails with `invalid` before any state access (decision 6).
  4. Medium, contract-drift (`appendOutput`): the same for output chunks. Fixed in `c87d0653` likewise; the window and its last position stay unchanged.
  5. Low, evidence-mismatch (this record, "Author self-check"): PostgreSQL evidence of two turn texts that redact alike was claimed but missing. Fixed in `c87d0653` with that test after a new pool and the real `SecretTextRedactor`, and in `335102b3`, which states what each suite tested.
  6. Low, missing-fail-before-test (this record, "Fail-before"): the down migration's evidence was an `ENOENT`. Fixed in `335102b3` with a mutation run that removes the four `DROP TABLE` statements and fails by assertion, named a later mutation run.
- Fail-before of the new tests: see the rows "the 4 tests of review pass 1" and the down migration row in "Fail-before"; logs `13-fb-memory.log`, `13-fb-postgres.log`, and `13-fb-down.log` in the session scratchpad. The service of `64ea6d1d` was restored into the tree, `npm run build`, the tests run, then the fixed file restored and rebuilt.

### Pass 2

- Reviewer B: Claude Code, model `claude-opus-5-5`, effort `medium`, permission mode `plan` with `Edit`, `Write`, and `NotebookEdit` disallowed, session `a3bdaf27-9245-42bc-ae80-3af56864035e`, on `df6ab889` (diff `62217e7a..df6ab889`). The worktree snapshot before and after the review was `46250fc16bba41563184721ea7b8cb50df19028f97305a4602da9bc07927e0e2`, equal.
- Invocation (from `make review`): `claude -p --model claude-opus-5-5 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format stream-json --verbose -- <prompt>`, environment `PATH HOME USER LANG TERM`, started 2026-10-28T23:35:25.776Z. Model confirmation: `model: claude-opus-5-5 (reported)`, printed by `make review` from the session log. The brief names pass 2 reviewer B `claude claude-opus-5-5#medium`; `make review` printed "route: recommends effort xhigh; the authorized medium applies (policy version 8)", since `route.json` recommends `claude claude-opus-5-5#xhigh`.
- Result: Critical 0, High 0, Medium 1, Low 6, matching the pass 2 line of `passes.jsonl`; all seven fixed and recorded in `findings.jsonl`, with `missedBy` pass 1 A on M1, L1, and L3 to L6. The reviewer ran neither PostgreSQL nor `make verify`.
  1. M1, Medium, contract-drift (`session-timeline-service.ts`, `submitTurn`, `recordRequest`, `consumeResponse`, `appendOutput`): redaction can lengthen a text within its bound past the bound (`pwd=x` becomes `pwd=[redacted]`), and the domain's second check then refused it with `invalid`, against contract section 2 rule 5. The coordinator's answer (architect Niki, 2026-10-29, verbatim in `design.md`, "Coordinator's answers"): "(a) accepted. After redaction, truncate to the bound: code points for texts, UTF-8 bytes for an input answer, always on a whole-character boundary (never split a surrogate pair or a UTF-8 sequence), and only the tail is cut, so a redacted secret cannot reappear." Fixed in `e422b1d8`: `domain/bounded-text.ts` cuts the tail of a redacted text to `MAX_HARNESS_TEXT_LENGTH` UTF-16 code units, the unit the domain checks, never inside a surrogate pair, and an input answer to `MAX_INPUT_ANSWER_BYTES` UTF-8 bytes on a whole character; the service also checks an input answer against `MAX_INPUT_ANSWER_BYTES` before redaction, as control-plane `InputAnswerText` states, so that only a lengthening redaction cuts it (design decision 6, the delta's "Redacted text cut to its bound"). Tests: one per path (turn, request, input answer, output chunk), each with a within-bound text that redacts past the bound, one with a surrogate pair at the cut, and one with an input answer over its byte bound; the input answer test also cuts inside a two-byte character.
  2. L1, naming (`session-timeline-crash.integration.test.ts:72`): a helper comment promised a second queued turn. Fixed in `fe26c9cd`.
  3. L2, docs (`proposal.md:14`, `design.md`): "every test written first" ignored the down migration's mutation run. Fixed in `fe26c9cd`, which names the exception.
  4. L3, docs (this record, `docs/g3-plan.md` row 13): the digest key's creation at `init` was placed in 13b, and the plan row lacked 13a to 13c. Fixed in `fe26c9cd`: a remaining gate for the coordinator, and the row names the sub-changes.
  5. L4, spec-wording (`specs/session-turn-model/spec.md`): the bound check before redaction named only two texts and had no scenario, and one heading said a task's sessions. Fixed in `fe26c9cd`: the requirement "Text bounds checked before redaction" with its scenario, and "Attempt unique across all sessions".
  6. L5, naming (`session-timeline-service.ts:181`, `hmac-input-digest.ts`): a native request ID parsed as an idempotency key, a response key's outcome set to its own scope, and the redactor in the digest file. Fixed in `fe26c9cd`: the port's `HeldKey`, an optional outcome (nullable `outcome` in the migration), and `secret-text-redactor.ts` with its own test.
  7. L6, concurrency-race (`session-timeline-repositories.ts:111`): every write upserted all attempt rows. Fixed in `fe26c9cd`: only attempts the stored session did not bind are inserted.
- Fail-before of the new tests: the rows "the tests of review pass 2" and "the 6 tests of finding M1" in "Fail-before"; logs `13-p2-fb-postgres.log` and `13-p2-fb-m1.log` in the session scratchpad. The L1 to L4 fixes change comments and records only.
- Pass 3, reviewer A `codex gpt-6.1-sol#medium` as the brief names it, follows because M1 is Medium; it reviews `fe26c9cd` and `e422b1d8`.

### Pass 3

- Reviewer A: Codex CLI, model `gpt-6.1-sol`, reasoning effort `medium`, sandbox read-only, session `01a184ff-058d-7232-8cc7-7f260b948982`, on `eb1bed49` (diff `62217e7a...eb1bed49`). The worktree snapshot before and after the review was `8f08f1d3818945a737482bca302bbc5e8ebb7727d64a77f4102bb0ce2973a4cc`, equal.
- Invocation (from `make review`): `codex exec -m gpt-6.1-sol -c model_reasoning_effort="medium" -s read-only -C /home/petar/taskelith-worktrees/implement-session-timeline -`, environment `PATH HOME USER LANG TERM`, started 2026-10-29T00:11:07.841Z. Model confirmation: `model: gpt-6.1-sol (reported)`, `effort: medium (reported)`, `sandbox: read-only (reported)`, printed by `make review`. The brief names pass 3 reviewer A `codex gpt-6.1-sol#medium`; `make review` printed "route: recommends effort high; the authorized medium applies (policy version 8)".
- Result: Critical 0, High 0, Medium 0, Low 2, matching the pass 3 line of `passes.jsonl`; both recorded in `findings.jsonl`. The reviewer confirmed the fixes of pass 2, M1 and L1 to L6, ran 70 focused tests, and ran neither PostgreSQL nor `make verify`.
  1. Low, docs (`docs/contracts/installation-and-enrollment.md:49`): the key file's row still placed its creation before item 13b wires the service, which the fix of L3 had left unassigned (`missedBy` pass 2 B). Fixed in `e355e01f`: no command creates it yet, and its creation and the service's wiring wait for the coordinator.
  2. Low, evidence-mismatch (this record, "Author self-check"): the longest requirement was named "Durable session timeline service" at 494 characters, which pass 2 had cut to 415. Fixed in `87f1e9af`: "Session timeline tables", 417, then the service at 415, with 494 as its length at `c87d0653`.
- Pass 3 reported only Low findings, so the review ends: both are fixed without another review, outcome `fixed-unreviewed`, and both fixes are unreviewed; the architect check below covers them. They change records and documentation only, so no new behavioral test.
- The architect amended answer M1 (Niki, 2026-10-29), recorded in design decision 6: UTF-16 code units, matching the domain's bound, and the input answer's byte bound checked before redaction too.
- Architect check (Niki, 2026-10-29): e355e01f (as amended), 87f1e9af, 79fcf2c3 passed
- The amendment: "change the wording to name the owner" of `e355e01f`; the key's creation and the service wiring are assigned to 13b, which `docs/contracts/installation-and-enrollment.md`, `proposal.md`, and `design.md` now say.

## Limitations

- Output is redacted per chunk only; a secret split across two chunks is stored unredacted. The service exposes no output read until 13b adds redaction across chunks with a held tail (answer Q5).
- Every change loads the whole session, its output window of up to 10 MiB included, and `listByTask` loads each session of the task; loading the window only for output operations is left for later (answer Q2).
- No command creates the digest key file, and nothing starts the service in the control plane; both are 13b's (architect check, Niki, 2026-10-29).
- The in-memory store runs one transaction at a time, so its races show no interleaving; the races are tested on PostgreSQL only.
- A restart in the crash tests is a new process with a new pool over the same database (answer Q6); the attempt-end trigger of the reconciliation is wired in 13c.

## Remaining gates

- Archive of the change in the last commit of the branch
- Integration into dev by the coordinator (single pull request)
- Follow-ups 13b (the HTTP operations of control-plane section 9, output redaction across chunks, the native request source, `refused` on the wire, the digest key's creation, and the service wiring) and 13c (the worker messages of 9d)
