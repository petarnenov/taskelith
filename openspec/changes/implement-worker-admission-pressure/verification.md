# Verification

Date: 2026-10-26. Author verification is recorded below; the independent review follows.

## Scope and source

[G2 work plan](../../../docs/g2-plan.md) item 20, split by the coordinator; this is 20e (Non-Goals of the archived `implement-worker-start-reconciliation` design). It was developed by an implementation subagent that the worker session briefed and checks.

- Base revision: `8a9abb6` on `dev`.
- Scope: the worker-side admission pressure, the disk floor, and the backlog limit, as the design states.
- Out of scope: 20d2 (`implement-worker-contact-and-offline`), the `unrecorded-process` follow-up, 20e2 (the daemon overhead causes and the retry of a write refused for lack of space), and any contract change.

### Dependency gate

20e needs nothing from 20d2. A pressure change is a journal fact published by the existing outbox publisher (`apps/worker/src/worker-start.ts`, `runObservationPublisher`), and the heartbeat carries no pressure ([execution wire contracts](../../../docs/contracts/execution-wire-contracts.md) section 6).

## Evidence

- Revision: `f5807d7` for the author check; `4ba367d` after the pass 1 fixes.
- Environment: macOS 26.6.2 x86_64, Node v24.22.1, Docker with the Compose services of `make verify`.
- Dependencies: no package added.
- Contracts: no change to `docs/contracts`, `execution.asyncapi.json`, or the OpenAPI document; journal format 3 unchanged.

## Author self-check

- **Causes:** the disk floor is `max(5 GiB, 10%)`, the backlog limit 10,000 entries or 256 MiB, an unreadable value counts as `unmeasurable-limit`, and the causes keep the contract order (`admission-pressure.test.ts`).
- **Reporting:** the first refresh of each process journals the causes, empty ones included, and later ones only a change; a failed commit is retried by the next refresh; the watch reports a change while nothing else asks and logs a failed refresh (`admission-pressure.test.ts`, `worker-start.test.ts`).
- **Refusal:** under pressure an offer within the other limits is refused as retryable with its causes and is acknowledged; the other limits are checked first; a refresh that fails leaves the offer unacknowledged (`command-intake.test.ts`); the wire messages are valid (`execution-observations.test.ts`).
- **Launches:** under pressure no W2 is journaled and no request sent until it clears; pressure between requests holds the retry of the same operation; a refresh that fails holds the launch and is reported (`launch-orchestrator.test.ts`).
- **Disk floor:** below the floor the start reports `disk-floor` and empties the nested log files; links are not followed, a missing log directory truncates nothing, an unreadable one fails (`worker-start.test.ts`, `disk-space.test.ts`).
- **Journal:** the pressure refusal keeps its causes, each pressure change has its own identity, and the backlog counts entries and bytes and falls with a confirmation (`worker-journal.test.ts`).
- **Comment rule:** `npm run verify:comments` passes.
- **OpenSpec:** `npm run openspec -- validate implement-worker-admission-pressure --strict` passes; every requirement is under 450 characters, and an archive in a scratch copy validates with `--all --strict`.
- **make verify:** passed at `f5807d7` (1638 tests, 0 failures; coverage 99.27% lines, 91.75% branches, 98.80% functions).

## Review pass 1

Codex, `gpt-6.1-sol` (`medium`, model and effort confirmed from the session header), read-only, session `01a177e6-12ae-7630-b606-a011ca5b7859`, invoked as `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`. It reviewed `9722117..e10272f`; the snapshots before and after the pass matched. `origin/dev` was then merged at `ac77fb7`. Findings: 0 Critical, 2 High, 1 Medium, 1 Low.

- **High 1 (fixed, `b3070e0`):** log truncation followed a link given as the root, and an entry swapped for a link between the listing and the truncation could empty a file outside `worker/logs/`. The root and each directory are now checked with `lstat`, and each file is opened with `O_NOFOLLOW`, checked through its descriptor, and truncated through that descriptor. Tests: a linked root and a linked file keep the target's content.
- **High 2 (fixed, `b3070e0`):** a hard link in `worker/logs/` to the journal or a record passed the regular-file check, and truncation emptied the shared content. A file whose descriptor shows more than one link is left alone. Test: a hard link to the journal file.
- **Medium (fixed, `533841f`):** a cancellation that ended the wait for pressure still led to W2, a seal, and W6. A new execution now ends before W2 with no operation and no seal; an execution journaled before is sealed and reported `not-started`, as any cancelled launch is. Test: a cancellation during the wait leaves no execution, request, or supervisor, and its evidence is recorded.
- **Low (fixed, `d6b81da`):** the retry test used a new instance. It now uses one instance whose journal fails once: the second refresh records the change, and a third records nothing.
- **Coordinator decisions (`4ba367d`):** design D2 accepted (one pressure observation after every start, possibly empty, no journal format 4, which would change worker journal contract section 10); 20e2 (item 20, G2) recorded under the design's Non-Goals.
- **make verify:** passed at `4ba367d` (1641 tests, 0 failures; coverage 99.25% lines, 91.74% branches, 98.81% functions).

## Review pass 2

Pending.

## Limitations and remaining gates

- The daemon overhead causes (`daemon-memory`, `event-loop-lag`) and the retry of a write refused for lack of space belong to 20e2.
- The worker journals one pressure observation after every start, also when nothing changed (design D2).
