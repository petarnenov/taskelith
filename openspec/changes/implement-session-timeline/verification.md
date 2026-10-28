# Verification: implement-session-timeline

## Scope and source

G3 item 13 (`docs/g3-plan.md`, row 13), sub-change 13a, developed by a briefed subagent for the coordinator Niki: the session turn model's domain gaps (`refused`, `recordTurnAcceptanceUnknown`, `recordTurnRefused`, the hold of `nextDeliverableTurn`), the `SessionTimelineStore` port with its in-memory and PostgreSQL adapters and a shared conformance suite, the session timeline service with HMAC-SHA-256 idempotency digests of the unredacted input and session text redaction, the digest key file of answer Q4, the `SessionTimelineCommit` crash points, and their race and crash tests, with the coordinator's answers to Q1 to Q10 of 2026-10-29 (`design.md`, "Coordinator's answers"). Out of scope, as follow-ups only: 13b (the HTTP operations of control-plane wire contracts section 9, output redaction across chunks, the native request source, and `refused` on the wire) and 13c (the worker messages of 9d). No new third-party dependency; `control-plane.openapi.json` is unchanged. `docs/contracts/installation-and-enrollment.md` section 3 lists the key file.

## Revision

- Base: `dev` `62217e7a`; the change was opened in `b80ccbf3`. `origin/dev` had not moved when the change was routed, so nothing was merged.
- `64ea6d1d` `chore: implement the session timeline store, service, and PostgreSQL adapter` (domain, ports, in-memory store, service, PostgreSQL adapter and migration, digest and redaction adapters, key file, service start, tests, the contract row of the key file, and the design, proposal, deltas, and tasks with the coordinator's answers).
- `6814dcab` `docs: route the implement session timeline change` (`route.json`, unedited).
- The commit after it: `make record` and this record.

## Environment

Native Ubuntu host `hpz600`, Linux 6.8.0-147-generic x86_64; Node.js 24.22.1 of the `Makefile` pin for `make verify`, 24.22.0 for the focused runs; PostgreSQL 18.6 of the integration services (`make services-up` for the focused runs, `make verify`'s own project for the checks).

## Author self-check

- Scope: every answer is applied as the coordinator gave it. Q8 as changed: `control-plane.openapi.json` and the wire `TurnState` are untouched; `board-session-contracts.test.ts` compares the wire enumeration with `WIRE_TURN_STATES`, the domain's `TURN_STATES` without `refused`, and nothing maps a domain `refused` turn onto the wire. Q5: the service answers `SessionView`, a session without its output window, and has no output read; output is read only through the store in tests.
- Idempotency (checklist `contract-drift`): a turn's digest covers the whole request identity, the author (a principal, or the host with its delegation request key) and the unredacted text; a response's digest covers the answer and the responder. Tests show that the same key from another author with the same text, and two texts that redact alike, fail with `conflict` and the detail `reason` `idempotency-key-reused`, in memory and on PostgreSQL after a new pool.
- Q4: `SessionInputDigestKeyFile.create` writes `control-plane/session-input-digest.key` through `ControlPlaneNamespace.create` with mode `0600` (tested); no code logs it or puts it in a record; `HmacInputDigest.fromKey` and `startSessionTimelineService` refuse a missing or wrong-size key with a reason that names only the file or the size, tested with sentinel key bytes. No command creates the key yet; 13b wires the service and the key's creation at `init`.
- Races (checklist `concurrency-race`) run on PostgreSQL 18.6 with two real transactions that both read before either writes, held by a `Barrier` inside the work, never by a sleep; the in-memory store runs one transaction at a time.
- Requirement texts of both deltas are under 500 characters; the longest is "Session timeline tables", 417. The change validates strictly, and an archive of it in a scratch copy of `openspec/` added 8 requirements, after which `openspec validate --specs --strict` passed 71 of 71 items.
- Comments: `npm run verify:comments` passes. No AI attribution in commits.
- Evidence check: the counts below are copied from the runs named with them.

## Fail-before

Each new behavioral test was written before its code and run failing:

| Tests | How they failed before the change |
| --- | --- |
| `session-turn-reports.test.ts` (18) and the updated "the turn states are those of the contract" of `session-turns.test.ts` | Run against stub `recordTurnAcceptanceUnknown` and `recordTurnRefused` that return `internal` and `TURN_STATES` without `refused`: 19 of 42 failed by assertion, the 23 older tests passed |
| `session-timeline-service.test.ts` (20) and the 9 in-memory cases of `SESSION_TIMELINE_STORE_CONFORMANCE` in `repository-conformance.test.ts` | Run against a stub `SessionTimelineService` whose every method returns `internal` and an in-memory store whose transaction returns `internal`: 29 of 38 failed, the 9 older conformance cases passed |
| `session-input-digest-key.test.ts` (3), `hmac-input-digest.test.ts` (3), `session-timeline-start.test.ts` (3) | Run against stubs of the key file, `HmacInputDigest.fromKey`, and `startSessionTimelineService` that return `internal`, a digest of `''`, and a redactor that returns its input: 9 of 9 failed |
| `session-timeline.integration.test.ts` (9 conformance cases on PostgreSQL and 9 service tests) | Run before the migration file existed: 18 of 18 failed with `relation "agent_sessions" does not exist` |
| The same file and `session-timeline-service.test.ts`, mutant A: the service resolves no stored key | 9 failed: on PostgreSQL the races of one key and input, one key and two inputs, and one key and one answer, and another author after a new pool; in memory the retried duplicate, another author, texts that redact alike, the repeated response key, and the reused response key |
| `session-timeline.integration.test.ts`, mutant B: the adapter writes no attempt row and trims no output | 3 failed: the attempt and output-window conformance cases and the concurrent binding of one attempt |
| `session-timeline-crash.integration.test.ts` (10) | Run against the adapter without the `SessionTimelineCommit` commit point (the pre-change `commitPoints`): 10 of 10 failed, every child exiting without `SIGKILL` |
| `migrations.integration.test.ts` "the session timeline down migration removes the session timeline tables" | Run with the migration file moved away, after the commit: failed with `ENOENT` on the migration file |

The stubs and mutants were restored from the real files before the commit. After the change, `session-timeline.integration.test.ts` passed 18 of 18 in eight consecutive runs and `session-timeline-crash.integration.test.ts` 10 of 10.

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `make verify` | `6814dcab`, tree `9cacd94c` (log `13-verify-1.log` in the session scratchpad) | Passed, profile full, stamp written: tests 3703, suites 47, pass 3656, fail 0, cancelled 0, skipped 47; all files 99.36 % lines, 92.76 % branches, 98.77 % functions |
| `make findings ARGS="route --change implement-session-timeline"` | `64ea6d1d` | "route: elevated (lines, files, security, contracts, size), rule version 2"; pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-opus-5-5#xhigh`, pass 3 reviewer A `codex gpt-6.1-sol#high` only after a pass 2 with a Medium or worse finding; shadow `jev-1.14.0` agrees; recommendation only, committed unedited as `6814dcab`. The brief names pass 1 `codex gpt-6-astra#medium`, pass 2 `claude claude-opus-5-5#medium`, and pass 3 `codex gpt-6.1-sol#medium` |

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `9cacd94c07451e86569b6d8661618d71e7d72998`; tests 3703, pass 3656, fail 0, skipped 47; all files 99.36% lines, 92.76% branches, 98.77% functions.
- `npm run openspec -- validate implement-session-timeline --strict`: passed, `Change 'implement-session-timeline' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 86 file(s); every pass summary file is valid: 66 file(s); every route file is valid: 22 file(s).`.
- Spec diff against the merge base `62217e7a1f56` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

Not started.

## Limitations

- Output is redacted per chunk only; a secret split across two chunks is stored unredacted. The service exposes no output read until 13b adds redaction across chunks with a held tail (answer Q5).
- Every change loads the whole session, its output window of up to 10 MiB included, and `listByTask` loads each session of the task; loading the window only for output operations is left for later (answer Q2).
- No command creates the digest key file, and nothing starts the service in the control plane; 13b wires both.
- The in-memory store runs one transaction at a time, so its races show no interleaving; the races are tested on PostgreSQL only.
- A restart in the crash tests is a new process with a new pool over the same database (answer Q6); the attempt-end trigger of the reconciliation is wired in 13c.

## Remaining gates

- Review passes 1 to 3 as the brief names them, recorded in `passes.jsonl`, `findings.jsonl`, and this record
- Merge of `origin/dev` before the archive, with Pepi's 12a migration `1792932900000` (answer Q7)
- Archive of the change in the last commit of the branch
- Integration into dev by the coordinator (single pull request)
- Follow-ups 13b (the HTTP operations of control-plane section 9, output redaction across chunks, the native request source, `refused` on the wire, the digest key at `init`) and 13c (the worker messages of 9d)
