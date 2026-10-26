# Verification

Date: 2026-10-26. Author verification is recorded below; the review passes are left to the coordinating session.

## Scope and source

The `unrecorded-process` follow-up of [`implement-worker-start-reconciliation`](../archive/2026-10-26-implement-worker-start-reconciliation/design.md) (design D5 and coordinator decision Q2). The implementing subagent stopped at its specification gate and reported the gap; the owner's away delegate chose option A (OpenCode run `20261026T110406Z-opencode-12993`), relayed by the coordinator. The scope is as the design's owner decision states.

- Base revision: `503a0be` on `dev`.
- Head at the checks: `3ad8666` (the tree `make verify` ran on; this record is added after it).
- Out of scope: the fate of leftover record directories (a separate future task), any journal format or AsyncAPI change, macOS.

## Environment

- Linux x86_64, Node v24.22.0 (through `nvm use` and the pinned-node wrapper of `make verify`), Docker 27.3.1 with the Compose services of `make verify`.
- Dependencies: none added.

## Author self-check

- **Identity rule:** `observationIdOf` derives `['unrecorded-process', journalId, containment]`; the processes are not part of it; another journal gives another identity (`worker-journal/test/unrecorded-process.test.ts`).
- **Once per journal incarnation:** a second derivation while the entry waits journals nothing; a later start over the same journal adds nothing; after confirmation a derivation keeps the identity at a new sequence (`unrecorded-process.test.ts`, `apps/worker/test/unrecorded-process-scan.test.ts`).
- **Scan:** only populated containments are listed, with the members still running; a containment removed since the listing, an exited member, and a missing parent hold nothing; an unreadable parent, a `cgroup.events` without a populated line, and a malformed `cgroup.procs` fail the scan (`worker-supervisor/test/linux-containment-scan.test.ts`).
- **Orchestrator:** a populated containment without a record directory is journaled once, on the first pass; a leftover record is still only logged as `worker.execution.leftover` and is never reported; a failed scan or record listing goes to `onFailure` and journals nothing.
- **Wire mapping:** the published message passes the `UnrecordedProcessObservation` schema check, with its own `observationId` as correlation, no attempt, and a containment cleaned of control characters.
- **macOS:** `containmentScan` returns no port for a darwin platform or without a containment parent.
- **Comment rule:** `npm run verify:comments` passes.
- **OpenSpec:** `npm run openspec -- validate implement-unrecorded-process-scan --strict` passes.
- **Evidence check:** every claim above names the test that shows it; nothing claims a review or a deployment.

## Checks and results

- `make verify` at `3ad8666`: exit 0. 1627 tests, 1612 passed, 0 failed, 15 skipped; coverage 99.13% lines, 91.61% branches, 98.59% functions; `Every active OpenSpec change archives into strictly valid specs.`; `Packed file allowlist and installed CLI verification passed.`
- `npm run openspec -- validate implement-unrecorded-process-scan --strict`: `Change 'implement-unrecorded-process-scan' is valid`.

## Review pass 1

TODO (coordinator): reviewer, invocation, model confirmation, session ID, snapshot result, findings, resolutions.

## Limitations

- The scan runs only in a worker with `TASKELITH_WORKER_COMMAND`, where the launch host is built (start reconciliation, review pass 2, M-B).
- After confirmation a later start derives the same fact again under its identity; the control plane records it without effect. No journal table stops that repeat, by the decision's exclusion of format changes (design D3).
- The scan was exercised against a fake cgroup tree and `/proc`, and once against this process's real `/proc` entry; not against a real delegated cgroup v2 parent (`make verify-linux-cgroup` was not run).

## Remaining gates

- Independent review, at most three passes.
- Integration and archive by the coordinator.
