## Context

`ExecutionWatch.observe` (archived `implement-worker-start-reconciliation`, design D3) reads an execution's record at the poll interval and, every `LIVENESS_POLLS` (ten) polls of a claimed record, asks the recovery table through `#checkLiveness`, so a dead supervisor is adopted or decided. A record without a launch record was never checked. When the supervisor dies at CP5 or CP6 ([supervisor identity contract](/docs/contracts/supervisor-identity.md) section 4), before CP7 claims, nothing writes the launch record, and the watch reads the same empty record until the worker stops; the next start's reconciliation seals it. G2 item 24b found this as defect O1, and the owner's delegate decided in away run `20261026T161148Z-opencode-90873` to fix it in G2 with a bounded check.

## Goals / Non-Goals

**Goals:** a running worker decides a record left unclaimed by a dead supervisor, through the existing liveness check and its outcomes, without sealing a launch that can still spawn in time.

**Non-Goals:**

- Launch authorization and relaunch reauthorization (D1 of 24b, another change).
- The crash-window tests of 24b.
- Any contract, AsyncAPI, OpenAPI, or journal format change.

## Decisions

### D1: the bound is the launch's spawn deadline

The launch orchestrator passes the deadline it handed the supervisor in the `LaunchPlan` to the watch as `WatchTarget.spawnDeadline`, and the watch reads the `DeadlineClock` it now takes in `WatchOptions`. A record with no launch record is checked only on a tenth poll at which the deadline has passed, and then every tenth poll, the cadence of a claimed record.

- **Why the deadline.** The recovery table seals a record without a launch record without probing the supervisor (contract section 6, "No launch record"), so a check before the supervisor could claim would seal a healthy but slow launch. Past the deadline nothing can still start: CP5 seals past the deadline, and a later claim finds the deadline passed before the spawn and records a spawn failure. The seal therefore preempts nothing that could still start.
- **Passed means not proven ahead.** The check uses the orchestrator's rule for handing out a grant, turned around: the deadline is ahead only in the boot of its reading, on a readable clock, below its milliseconds. Another boot or an unreadable clock counts as passed, as for the supervisor, which seals then (`boot-changed`, `deadline-unreadable`).
- **Why the cadence stays.** The check keeps one cadence for both kinds of record and costs at most one liveness interval of delay after the deadline.
- **Recovery rounds.** The round is kept as for a claim: `first`, then `after-retry` after a `retry`, back to `first` after `observe`. Without a launch record the table answers `not-started` after its seal; it answers `retry` or `observe` only when the seal lost to a claim and the table decided again from it.
- **Inherited records.** A reconciled target has no deadline in hand and keeps the reconcile path: its first recovery already seals a record without a launch record, and its watch never checks an unclaimed record.
- **Alternative (review pass 1 replaced it):** a fixed count of thirty polls, three liveness intervals. It was meant to exceed the `25s` deadline at the default `1s` poll, but the poll interval is configurable (the tests use `100ms`), thirty polls are only twenty-nine sleeps, and an installation may set another `ttl`, so the count does not prove the deadline passed and could seal a live slow launch. The deadline is exact and already known to the launch that set it.

### D2: outcomes through the existing paths

`#livenessDue(target, launch, polls)` replaces the claim-only condition in `observe`; `#checkLiveness` and the rest are unchanged. A `not-started` answer logs `worker.supervisor.lost` and keeps observing, the next read sees the seal, and `#commitFacts` commits W6 and returns `not-started`, after which the launch orchestrator launches the intent again under a new execution. `observe` keeps a live supervisor watched, `adopted` is read back, and `uncertain` is reported once with its reason. A seal in the record is decided by `#commitFacts` before any check.

### D3: no contract change

The contract states supervisor liveness and the recovery table without restricting the worker's check to a claimed record, and the table already seals a record without a launch record. Its rule that the worker probes `lock` only during recovery, never while it starts a supervisor, holds: the check is a recovery-table call, made only past the deadline. A supervisor that has not even taken `lock` by then exits when it finds the lock probed, and spawns nothing.

## Risks / Trade-offs

- **An unreadable deadline clock counts as passed.** A slow live supervisor could then be sealed; it would seal itself at CP5 or before the spawn on the same clock, and the seal decides once, so no spawn is lost that could have started.
- **Detection takes the remaining deadline and up to one liveness interval**, about `25s` to `35s` at the default values, instead of a worker restart.
