# Verification

Date: 2026-10-26. Author verification is recorded below; the review passes are left to the coordinating session.

## Scope and source

The `unrecorded-process` follow-up of [`implement-worker-start-reconciliation`](../archive/2026-10-26-implement-worker-start-reconciliation/design.md) (design D5 and coordinator decision Q2). The implementing subagent stopped at its specification gate and reported the gap; the owner's away delegate chose option A (OpenCode run `20261026T110406Z-opencode-12993`), relayed by the coordinator. The scope is as the design's owner decision states.

- Base revision: `503a0be` on `dev`.
- Reviewed revision (pass 1): `ab9c95e`. Final checks: on the final head of the branch, the commit that adds the pass 1 record (see "Checks and results").
- Out of scope: the fate of leftover record directories (a separate future task), any journal format or AsyncAPI change, macOS.

## Environment

- Linux x86_64, Node v24.22.0 (through `nvm use` and the pinned-node wrapper of `make verify`), Docker 27.3.1 with the Compose services of `make verify`.
- Dependencies: none added.

## Author self-check

- **Identity rule:** `observationIdOf` derives `['unrecorded-process', journalId, containment]`; the processes are not part of it; another journal gives another identity (`worker-journal/test/unrecorded-process.test.ts`).
- **One identity per journal incarnation:** a second derivation while the entry waits journals nothing; a later start over the same journal adds nothing while it is unconfirmed; after confirmation a derivation keeps the identity at a new sequence (`unrecorded-process.test.ts`, `apps/worker/test/unrecorded-process-scan.test.ts`).
- **Scan:** only populated containments are listed, with the members still running; a containment removed since the listing, an exited member, and a missing parent hold nothing; only an unreadable parent fails the scan; a containment whose `cgroup.events` has no populated line is skipped, and a populated one whose `cgroup.procs` holds a line that is not a decimal process ID (`0x2a`, ` 42`, `1e3`) is listed with no processes, while the others are still listed (`worker-supervisor/test/linux-containment-scan.test.ts`).
- **Orchestrator:** a populated containment without a record directory is journaled once, on the first pass; a leftover record is still only logged as `worker.execution.leftover` and is never reported; a failed scan or record listing goes to `onFailure` and journals nothing.
- **Wire mapping:** the published message passes the `UnrecordedProcessObservation` schema check, with its own `observationId` as correlation, no attempt, and a containment cleaned of control characters.
- **macOS:** `containmentScan` returns no port for a darwin platform or without a containment parent.
- **Comment rule:** `npm run verify:comments` passes.
- **OpenSpec:** `npm run openspec -- validate implement-unrecorded-process-scan --strict` passes.
- **Evidence check:** every claim above names the test that shows it; nothing claims a review or a deployment.

## Checks and results

- Author, before review, at `3ad8666`: `make verify` exit 0; 1627 tests, 1612 passed, 0 failed, 15 skipped; coverage 99.13% lines, 91.61% branches, 98.59% functions.
- Coordinating session, on the reviewed revision `ab9c95e`: `make verify` exit 0; 1627 tests, 1612 passed, 0 failed, 15 skipped; coverage 99.13% lines, 91.61% branches, 98.59% functions.
- Author, after the pass 1 fixes, at `644311f`, at `7ad8b0f`, and on the final head (each later commit changes only this file): `make verify` exit 0 each time; 1628 tests, 1613 passed, 0 failed, 15 skipped; coverage 99.14% lines, 98.59% functions, and 91.60% to 91.62% branches across the runs; `Every comment is within the comment length rule.`; `Every active OpenSpec change archives into strictly valid specs.`; `Packed file allowlist and installed CLI verification passed.`
- `npm run openspec -- validate implement-unrecorded-process-scan --strict`: `Change 'implement-unrecorded-process-scan' is valid`.

## Review pass 1

- Reviewer: Claude Code with Fable, assigned by the coordinator.
- Invocation: `claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`.
- Reviewed revision: `ab9c95e`. Run: 2026-10-26, 13:42:24 to 13:47:07 local time.
- Model confirmation: `modelUsage` names `claude-fable-5-1`. Session ID: `54846570-4d4d-44f9-b94b-9687bfd3abdc`.
- Snapshot: before and after `e34b6a9cd6d0c38dac4fd9bbbae501018c51dbc0a4b18cad9c14acbe8ec91b8f` (unchanged).
- Counts: Critical 0, High 0, Medium 1, Low 6.

| Finding | Resolution |
| --- | --- |
| M1 Medium: both contracts said "reported once per journal incarnation", but a derivation after confirmation is published again under the same identity | Both contracts now say the fact has one identity per journal incarnation, and a derivation after confirmation is published again under it and applied without effect; proposal, design D3, and tasks aligned (`644311f`) |
| L1 Low: one malformed containment failed the whole scan | A containment of unknown state is skipped, and a populated one with unreadable members is listed with no processes; only an unreadable parent fails the scan; tests added (`e91cd44`, `ce27fae`) |
| L2 Low: `Number(line)` accepted `0x2a`, `1e3`, and padded forms | A `cgroup.procs` line must match `^\d+$`; test cases added (`e91cd44`, `ce27fae`) |
| L3 Low: members are read only from the containment's own `cgroup.procs` | Recorded in design.md Risks: no recursive read (`644311f`) |
| L4 Low: the scan silently needs `records` | Comment on the `containments` option (`e91cd44`) |
| L5 Low: the worker's own home cgroup is not excluded | Recorded in design.md Risks as a future self-check task; no code change (`644311f`) |
| L6 Low: the final `make verify` must run on the final head and name it | "Checks and results" names each run and its revision |

The pass 1 fixes are Low or Medium; a further pass is the coordinator's decision under the review process.

## Limitations

- The scan runs only in a worker with `TASKELITH_WORKER_COMMAND`, where the launch host is built (start reconciliation, review pass 2, M-B).
- After confirmation a later start derives the same fact again under its identity; the control plane records it without effect. No journal table stops that repeat, by the decision's exclusion of format changes (design D3).
- The scan was exercised against a fake cgroup tree and `/proc`, and once against this process's real `/proc` entry; not against a real delegated cgroup v2 parent (`make verify-linux-cgroup` was not run).

## Remaining gates

- Independent review, at most three passes.
- Integration and archive by the coordinator.
