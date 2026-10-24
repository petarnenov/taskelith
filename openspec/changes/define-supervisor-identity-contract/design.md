## Context

Decision D7 (c) chose one small supervisor process per execution that owns the child and writes its exit status durably, so that a worker service restart or upgrade does not lose the child, and adoption reads a per-execution record instead of trusting a PID. The launch authorization contract (item 3, in review in parallel) expects from this item: the creator of `executionId`, a launch record, a single claimed spawn per execution identity, an irreversible seal before `not-started`, and the rule that a restart never spawns. The worker platform matrix (ADR 0007) requires the Linux worker image and native macOS on arm64 and x86_64, with process ownership proven natively on each.

## Goals / Non-Goals

Goals: a contract that items 7, 8, 14, and 15 can implement and items 24 and 25 can test. Non-goals: execution code, the message formats (item 8), the journal's own format and durability primitive (item 5), capacity accounting (item 6), launchd packaging (G6), and the harness port (G3).

## Decisions

- **Spawn decision by exclusive file creation.** `fate` is created once as `claim` or `seal`; exclusive creation lets the operating system pick one winner between a supervisor and a recovering worker without a shared lock. Rejected: a decision row in the worker's SQLite journal, because the supervisor would then take the journal's lock, which item 5 owns; and a lock-only scheme, because a released lock cannot tell "not yet spawned" from "spawned and died".
- **A per-execution record beside the journal.** The record lives under `worker/executions/<executionId>/`, the "supervisor recovery records" of the storage layout, and uses item 5's durable write rule. Rejected: writing supervisor facts into the journal directly, for the lock reason above.
- **Supervisor liveness by `flock`.** The kernel releases the lock when the supervisor dies, on Linux and macOS, so a held lock proves a live supervisor without trusting a process ID. The file is opened close-on-exec so that children cannot keep it held.
- **Process identity is boot identity, process ID, and start time.** This closes PID reuse; a process ID alone is never trusted.
- **Discovery by an environment marker on Linux only.** It closes the window between spawn and handle persistence where every process is readable. macOS offers no comparable reliable read of another process's environment, so that window ends in `uncertain` there, as R06 allows, instead of a guess.
- **Exit with an unknown status as a terminal fact.** When native evidence proves no process can run but the exit status is lost (a supervisor crash, a reboot, a container restart), the execution ends with an unknown status. This releases ownership truthfully, while the attempt's outcome stays unknown and is not retried automatically.
- **Survival per OS.** On macOS, supervisors run in their own sessions and survive worker service restarts. On Linux they survive only a worker service restart inside a kept container whose init outlives the worker service; a container restart or image upgrade ends the PID namespace and requires drain. This answers invariant 8 per OS; the container init and the launchd behavior are qualification obligations, not assumptions.
- **No recovery path spawns.** Recovery adopts, reports a terminal fact, or reports uncertainty; a new execution needs a new identity and a new authorization (item 3).

## Risks / Trade-offs

- A Node supervisor per execution costs memory; the contract counts it toward the execution's reservation (item 6).
- Reading `kinfo_proc` on macOS from TypeScript needs a mechanism that item 15 must qualify, possibly a dependency that needs owner approval.
- Whether the spawn deadline's monotonic clock counts system sleep is left to item 3; this contract records the dependency.
- Descendants that leave the process group and are never observed cannot be proven gone on macOS; the evidence then says the termination is unproven.
