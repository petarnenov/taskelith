## Context

Decision D7 (c) chose one small supervisor process per execution that owns the child and writes its exit status durably, so that a worker service restart or upgrade does not lose the child, and adoption reads a per-execution record instead of trusting a PID. The launch authorization contract (item 3, in review in parallel) expects from this item: the creator of `executionId`, a launch record, a single claimed spawn per execution identity, an irreversible seal before `not-started`, and the rule that a restart never spawns. The worker platform matrix (ADR 0007) requires the Linux worker image and native macOS on arm64 and x86_64, with process ownership proven natively on each.

## Goals / Non-Goals

Goals: a contract that items 7, 8, 14, and 15 can implement and items 24 and 25 can test. Non-goals: execution code, the message formats (item 8), the journal's own format and durability primitive (item 5), capacity accounting (item 6), launchd packaging (G6), and the harness port (G3).

## Decisions

- **One launch record, claimed once or sealed, by exclusive file creation.** The names follow item 3: a spawn claims the launch record, and recovery seals it. Exclusive creation lets the operating system pick one winner between a supervisor and a recovering worker without a shared lock; the loser reads the winner and decides again. Rejected: a decision row in the worker's SQLite journal, because the supervisor would then take the journal's lock, which item 5 owns; and a lock-only scheme, because a released lock cannot tell "not yet spawned" from "spawned and died".
- **A journaled record-exists step before the supervisor starts.** It separates "nothing was ever started" (seal safely) from "the record was lost" (uncertain), so data loss never becomes a false `not-started`.
- **A per-execution record beside the journal.** The record lives under `worker/executions/<executionId>/`, the "supervisor recovery records" of the storage layout, and uses item 5's durable write rule.
- **Supervisor liveness by `flock` plus identity.** The kernel releases the lock when the last holder dies, but a forked child keeps the descriptor until it executes its program, so a held lock alone is not proof; the highest numbered supervisor record names the identity that must also be alive. Numbered records make repeated adoption unambiguous.
- **Process identity is boot identity, process ID, and start time.** This closes PID reuse for identification; signalling needs more (below).
- **Exit means the whole process set is empty.** A child's exit alone does not end the execution, because descendants may keep running and acting. Ownership and capacity are released only on proof that the set is empty.
- **Linux containment by a cgroup v2 per execution.** Membership is inherited and cannot be left without privileges, `populated` proves emptiness without a scan, and `cgroup.kill` kills the set without a process-ID race. Rejected: an environment marker scan, which cannot prove absence (a scan is not atomic, and a process can execute a program without the marker) and can match descendants instead of the child; and a subreaper supervisor, which loses the set when it dies. A Linux worker without a delegated cgroup fails its self-check, in line with failing admission closed for unenforceable mandatory controls (`docs/operational-targets.md`).
- **macOS group signals only while the child is unreaped.** macOS has neither cgroups nor a process handle for signalling, so the only race-free target is the group of a child the supervisor still holds. A harness that leaves its group cannot be proven terminated, so supporting it on macOS needs that behavior to be qualified (G3).
- **Exit with an unknown status as a terminal fact.** When native evidence proves that no process of the set can run but the child's status is lost, the execution ends with an unknown status, which releases ownership truthfully while the attempt's outcome stays unknown.
- **A suspend-aware deadline clock.** `CLOCK_MONOTONIC` stops during suspend on Linux, so the deadline uses `CLOCK_BOOTTIME`, and `mach_continuous_time` on macOS; a supervisor that cannot read it seals.
- **Survival per OS.** On macOS supervisors survive worker service restarts in their own sessions; on Linux they survive only inside a kept container whose init outlives the worker service, and a container restart or image upgrade requires drain. The container init, the cgroup delegation, and the launchd behavior are qualification obligations, not assumptions.
- **No recovery path spawns.** Recovery adopts, reports a terminal fact, or reports uncertainty; a new execution needs a new identity and a new authorization (item 3).

## Risks / Trade-offs

- A Node supervisor per execution costs memory; the contract counts it toward the execution's reservation (item 6).
- Reading `kinfo_proc` and `mach_continuous_time` on macOS, and `CLOCK_BOOTTIME` and the cgroup files on Linux, from TypeScript needs mechanisms that item 15 must qualify, possibly a dependency that needs owner approval.
- Requiring cgroup delegation narrows the supported Linux container settings; item 25 qualifies them.
- On macOS, a harness whose processes leave their group can only end in an unproven termination, which holds its capacity until reconciled.
