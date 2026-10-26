# Verification

Date: 2026-10-26. Author verification is recorded below; the independent review follows.

## Scope and source

[G2 work plan](../../../docs/g2-plan.md) item 20, split by the coordinator; this is 20e (Non-Goals of the archived `implement-worker-start-reconciliation` design). It was developed by an implementation subagent that the worker session briefed and checks.

- Base revision: `8a9abb6` on `dev`.
- Scope: the worker-side admission pressure, the disk floor, and the backlog limit, as the design states.
- Out of scope: 20d2 (`implement-worker-contact-and-offline`), the `unrecorded-process` follow-up, the daemon overhead limit, the retry of a write refused for lack of space, and any contract change.

### Dependency gate

20e needs nothing from 20d2. A pressure change is a journal fact published by the existing outbox publisher (`apps/worker/src/worker-start.ts`, `runObservationPublisher`), and the heartbeat carries no pressure ([execution wire contracts](../../../docs/contracts/execution-wire-contracts.md) section 6).

## Evidence

- Revision: `f5807d7` (code, tests, and proposal).
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

## Review

Pending: the worker session runs the independent review.

## Limitations and remaining gates

- The daemon overhead limit (`daemon-memory`, `event-loop-lag`) is not measured; the coordinator decides where it goes.
- The worker journals one pressure observation after every start, also when nothing changed (design D2).
