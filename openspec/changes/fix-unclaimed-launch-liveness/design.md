## Context

`ExecutionWatch.observe` (archived `implement-worker-start-reconciliation`, design D3) reads an execution's record at the poll interval and, every `LIVENESS_POLLS` (ten) polls of a claimed record, asks the recovery table through `#checkLiveness`, so a dead supervisor is adopted or decided. A record without a launch record was never checked. When the supervisor dies at CP5 or CP6 ([supervisor identity contract](../../../docs/contracts/supervisor-identity.md) section 4), before CP7 claims, nothing writes the launch record, and the watch reads the same empty record until the worker stops; the next start's reconciliation seals it. G2 item 24b found this as defect O1, and the owner's delegate decided in away run `20261026T161148Z-opencode-90873` to fix it in G2 with a bounded check.

## Goals / Non-Goals

**Goals:** a running worker decides a record left unclaimed by a dead supervisor, through the existing liveness check and its outcomes, without sealing a launch that can still spawn in time.

**Non-Goals:**

- Launch authorization and relaunch reauthorization (D1 of 24b, another change).
- The crash-window tests of 24b.
- Any contract, AsyncAPI, OpenAPI, or journal format change.

## Decisions

### D1: the bound is thirty polls, three liveness intervals

`UNCLAIMED_LIVENESS_POLLS = 3 * LIVENESS_POLLS`. A record with no launch record is checked on the thirtieth poll and then every tenth poll, the cadence of a claimed record.

- **Why thirty.** The recovery table seals a record without a launch record without probing the supervisor (contract section 6, "No launch record"), so a check before the supervisor could claim would seal a healthy but slow launch. The worker hands the supervisor a deadline of at most `ttl` minus `skew` after its first request's reading, `25s` with the operational targets' `30s` and `5s` ([operational targets](../../../docs/operational-targets.md), "Launch authorization validity window"), and starts the supervisor after that reading. Thirty polls at the default `1s` interval (`WATCH_POLL_MILLISECONDS`) take at least `30s`, so by then the deadline has passed: a supervisor that has not claimed cannot spawn, because CP5 seals past the deadline and a later claim finds the deadline passed before the spawn and records a spawn failure. The seal therefore preempts nothing that could still start.
- **Why a multiple of `LIVENESS_POLLS`.** The check keeps one cadence for both kinds of record, and the first unclaimed check is the third liveness interval, the smallest one past the deadline.
- **Recovery rounds.** The round is kept as for a claim: `first`, then `after-retry` after a `retry`, back to `first` after `observe`. Without a launch record the table answers `not-started` after its seal; it answers `retry` or `observe` only when the seal lost to a claim and the table decided again from it.
- **Alternative:** carry the deadline in `WatchTarget` and compare it with the deadline clock. It is exact, but the watch would need the clock and a reconciled record has no deadline in hand; a poll count reuses the existing cadence.

### D2: outcomes through the existing paths

`livenessDue(launch, polls)` replaces the claim-only condition in `observe`; `#checkLiveness` and the rest are unchanged. A `not-started` answer logs `worker.supervisor.lost` and keeps observing, the next read sees the seal, and `#commitFacts` commits W6 and returns `not-started`, after which the launch orchestrator launches the intent again under a new execution. `observe` keeps a live supervisor watched, `adopted` is read back, and `uncertain` is reported once with its reason. A seal in the record is decided by `#commitFacts` before any check.

### D3: no contract change

The contract states supervisor liveness and the recovery table without restricting the worker's check to a claimed record, and the table already seals a record without a launch record. Its rule that the worker probes `lock` only during recovery, never while it starts a supervisor, holds: the check is a recovery-table call, made only after the deadline. A supervisor that has not even taken `lock` by then exits when it finds the lock probed, and spawns nothing.

## Risks / Trade-offs

- **The bound counts polls, not time.** With a shorter `pollMilliseconds` or a longer installation `ttl`, the check can come before the deadline. It stays safe, because the seal is exclusive and the seal or a lost race decides once; at worst a slow live launch is sealed, reported `not-started`, and launched again under a new execution.
- **Detection takes about thirty seconds** at the default interval, instead of a worker restart.
