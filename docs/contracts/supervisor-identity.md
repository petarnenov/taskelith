# Supervisor identity contract

Date: 2026-10-25. Status: proposed protocol contract for G2 ([G2 work plan](../g2-plan.md) item 4), under independent review; once reviewed and merged it resolves the pre-G2 contract "supervisor identity and adoption" of [architecture section 15](../architecture.md#15-decisions-still-requiring-evidence-or-owner-scope-confirmation). It serves invariant 8 and R06 of the [architecture](../architecture.md). No code implements it yet: G2 items 7 (execution domain model), 8 (wire contracts), 14 (worker journal), and 15 (process supervisor) build on it, and items 24 and 25 run its failure scenarios and native acceptance.

## 1. Purpose and parties

Starting a process and recording its handle are not one atomic transaction (architecture F03). This contract defines how a worker starts at most one process per execution, finds it again after any crash, and reports uncertainty instead of guessing when it cannot prove whether that process runs.

- **Worker:** the enrolled worker service ([trust model](../trust-model.md)) that holds the assignment and journals its steps under the worker journal contract (G2 item 5, `define-worker-journal-contract`). It never spawns an agent process itself.
- **Execution supervisor:** by decision D7 (c), one small supervisor process per execution that spawns the child, owns it as its parent, and writes its exit status durably, in the manner of a container shim. The worker starts it; it outlives restarts of the worker service (section 9). It is a TypeScript program shipped with the worker, never a sandbox ([trust model](../trust-model.md)), and it never talks to the network.
- **Child:** the process the supervisor spawns for the execution. In G2 it is a test-only scripted process; the agent harness port belongs to G3 (item 15).
- **Launch authority:** the control-plane service of the launch authorization contract (G2 item 3, `define-launch-authorization-contract`), which issues the `launchAuthId` that a spawn needs.

The supervisor reports only through files in its execution record (section 3). The worker reads them and turns them into observations in its local outbox (item 5); facts reach the control plane only that way.

## 2. Identities

- **Execution identity (`executionId`):** the stable execution identity. The worker creates it as a random 128-bit identifier and journals it with the launch intent (item 5) before it asks for a launch authorization (item 3). It names exactly one possible spawn and is never reused, not even after `not-started`. The architecture's phrase "stable launch identity" (section 9, failure behavior) means this identity.
- **Supervisor identity:** the process identity (below) of the supervisor, with the execution it serves. The worker addresses a supervisor only after proving this identity.
- **Process identity:** the triple of boot identity, process ID, and process start time, read from the operating system (section 10). A process ID alone never identifies a process, because the kernel reuses process IDs. Two observations name the same process only if all three values are equal.
- **Boot identity:** the identifier the kernel assigns to the current boot (section 10). On Linux the worker also records the **namespace identity**: the process identity of PID 1 of the worker container's PID namespace.
- **Execution marker:** the environment variable `TASKELITH_EXECUTION_ID` with the value `<workerId>:<executionId>`, which the supervisor sets in the child's environment. It is not a secret and not an authorization; it serves discovery on Linux (section 6).

## 3. The execution record

Every execution has a directory `worker/executions/<executionId>/` under the worker's data root ([storage](../storage.md)), the "supervisor recovery records" of the `worker/` subtree. Workspace removal never deletes it. Its files are written with the durable write rule of the worker journal contract (item 5), which covers the file and its directory entry, and every file carries a format version. The record is deliberately separate from the worker's SQLite journal, so that a supervisor never takes the journal's lock.

| File | Written by | When | Content |
| --- | --- | --- | --- |
| `intent` | Worker | Before it starts the supervisor | `executionId`, `attemptId`, `ownershipGeneration`, `launchAuthId`, the spawn deadline and the boot identity it is valid in, the worker's namespace identity on Linux, and the supervisor program version |
| `lock` | Supervisor | For its whole life | Held with an exclusive `flock`; the supervisor opens it close-on-exec so that no child inherits it |
| `fate` | Supervisor or worker | Created once, exclusively | `claim` with the supervisor's process identity, or `seal` (section 5) |
| `handle` | Supervisor | Right after the spawn returns | The child's process identity, process group ID, and session ID |
| `events` | Supervisor | Append only | Descendant identities observed, cancellation steps, and termination evidence (section 8) |
| `exit` | Supervisor | After it reaps the child | The exit code or signal, and the termination evidence |

The worker removes the directory only after the execution's terminal fact is recorded by the control plane and in its journal. An unreadable, corrupt, or newer-format file is never guessed around: the execution becomes `uncertain` (section 7).

## 4. Launch sequence and crash points

The worker and supervisor run these steps in order. Each step is a named crash point for the deterministic test harness (item 10); section 6 defines recovery after a crash at any of them.

1. **CP1** The worker journals the launch intent with `executionId` (item 5), then obtains a launch authorization (item 3).
2. **CP2** The worker creates the execution directory and writes `intent`.
3. **CP3** The worker starts the supervisor as a detached process in a new session, passing only the execution directory. The supervisor is not a child the worker waits for.
4. **CP4** The supervisor takes `lock`, then reads `intent` and checks that the boot identity matches and the spawn deadline has not passed. If either check fails, it seals (section 5) and exits.
5. **CP5** The supervisor creates `fate` as `claim`. If `fate` already exists, it exits without spawning.
6. **CP6** The supervisor spawns the child in a new session and process group, with the execution marker in its environment. It does so only before the deadline: a spawn begun before the deadline is a start under that authorization (item 3).
7. **CP7** The supervisor writes `handle`.
8. **CP8** The worker reads `handle` and puts the start observation, with `launchAuthId` and `executionId`, in its outbox.
9. **CP9** The child exits; the supervisor reaps it and writes `exit`.
10. **CP10** The worker reads `exit` and puts the exit observation in its outbox.

A supervisor that finds any of its own durable writes failing (a flush failure or a full disk) before step 6 does not spawn; after step 6 it keeps running the child and keeps retrying the write, and the worker treats a missing `handle` or `exit` as the crash windows of section 6 do.

## 5. One spawn decision per execution

The file `fate` decides, once and irreversibly, whether the execution may spawn. Both parties create it with exclusive creation (the operating system's create-if-absent), so exactly one creation succeeds:

- **`claim`** is written only by the execution's supervisor, while it holds `lock` and before its deadline. It is durable before the spawn begins, so a power loss after the spawn cannot erase it.
- **`seal`** is written by the worker during recovery, or by a supervisor whose checks failed. A sealed execution can never spawn, because a later supervisor's claim fails.

This meets the two obligations of the launch authorization contract (item 3, section 4): a single, claimed spawn per execution identity, and an irreversible seal before `not-started` is reported. The worker reports `not-started` only when `fate` is `seal`. A restarted worker never starts a second supervisor for an execution whose `fate` is `claim`; it adopts or reports (section 6).

## 6. Recovery and adoption

When the worker service starts, it reads every execution directory and decides from the files and native evidence alone, never from a process ID alone. First it compares boot identity and, on Linux, namespace identity with the recorded ones: if the machine rebooted or the worker container's PID namespace was replaced, every process of the record is proven gone, because both events end all of its processes.

| State found | Native evidence | Result |
| --- | --- | --- |
| Launch intent journaled, no directory | None needed | Create the directory and `seal`; report `not-started` |
| No `fate`, `lock` free or held | None needed | Create `seal`. A supervisor still between CP3 and CP5 then fails its claim and exits. Report `not-started` |
| `fate` is `seal` | None needed | Report `not-started` |
| `fate` is `claim`, `lock` held | The recorded supervisor identity is alive | **Adopt the supervisor:** resume reading its files; nothing is respawned |
| `fate` is `claim`, `lock` free, `exit` present | None needed | Report the recorded exit |
| `fate` is `claim`, `lock` free, `handle` present, no `exit` | The child's process identity is alive | **Adopt the child:** start an adopting supervisor (below) |
| The same | The child's process identity is not alive, or the boot or namespace changed | Report an exit with an unknown status |
| `fate` is `claim`, `lock` free, no `handle` | Linux: a complete marker scan (below) finds the child | Write `handle` from the scan, then adopt the child |
| The same | Linux: a complete marker scan finds no process; or the boot or namespace changed | Report an exit with an unknown status and an unproven start |
| The same | macOS, same boot | Report `uncertain` |
| Any file unreadable, corrupt, or of a newer format | Any | Report `uncertain` |

- **Adopting supervisor:** a new supervisor process for an execution whose supervisor died while its child lives. It takes `lock`, records its own identity in `events`, and observes the child by its process identity. It is not the child's parent, so it cannot read the exit status: when the child is gone it writes `exit` with an unknown status. It can cancel (section 8).
- **Marker scan (Linux only):** the worker reads `/proc/<pid>/environ` of every process in its container's PID namespace and selects those whose execution marker names this worker and execution. The scan is complete only if every process of the namespace was readable; a process that could not be read makes the scan incomplete, and an incomplete scan proves nothing. A process found by the scan is recorded by its process identity before anything uses it.
- **Exit with an unknown status:** a terminal fact that ends the execution's ownership, because no process of it can run. The attempt's outcome is unknown: side effects may have happened, and automatic retry needs operation-specific repeatability (architecture section 9) under the retry budget of `0` for uncertain execution ([operational targets](../operational-targets.md)).

No recovery path spawns. A worker that restarts with a journaled authorization reconciles by `executionId` and, if it reports `not-started`, re-authorizes a new execution with a new identity (item 3).

## 7. Uncertainty

`uncertain` means the worker can prove neither that a process of the execution runs nor that none does. The worker reports it as an observation; the execution keeps its ownership and its capacity reservation (item 6), and no other execution of the attempt is authorized (item 3). Only new evidence ends it: a later scan or proof, a reboot, or an operator's reconciliation recorded through the control plane. Loss of contact with a worker is not uncertainty about the process (invariant 4); this state is about native evidence on the worker itself.

## 8. Process groups, descendants, and cancellation

The child leads its own session and process group, so signals to the group reach the descendants that stayed in it. Descendants may leave the group (a new session, or a daemon that double-forks), so the group alone does not prove a tree is gone.

- **Observation:** while the child runs, the supervisor records in `events` the process identity of every descendant it sees, by walking parent links at a fixed interval and at cancellation. On Linux it also finds descendants by the execution marker, when they kept it.
- **Cancellation:** the worker asks the supervisor, whose identity it has proven, to cancel. The supervisor signals the process group to terminate, waits a grace period, then kills the group and every recorded descendant that is still alive by its process identity, and reaps the child.
- **Termination evidence:** the supervisor writes `exit` with the child's status and the evidence: the group is empty, and no recorded descendant identity, and on Linux no process with the marker, is alive. If a recorded descendant survives, or a scan is incomplete, the evidence says so, and the worker reports the termination as unproven rather than complete.

A cancellation request is never proof of termination (architecture section 9): the attempt is cancelled only on that evidence.

## 9. What survives a restart, an upgrade, or a reboot

Invariant 8 requires a worker service upgrade to state whether child runtimes survive or require drain.

| Event | Linux worker container | macOS native worker |
| --- | --- | --- |
| Worker service process crash or restart, container kept | Supervisors and children survive and are adopted, provided the container's main process is an init that outlives the worker service and reaps orphans; otherwise this is a container restart | Supervisors and children survive in their own sessions and are adopted |
| Container restart or replacement (including an image upgrade) | Every process ends with the PID namespace: requires drain; any execution not drained ends with an unknown status | Not applicable |
| Worker package upgrade without replacing the processes | Not applicable: Linux workers upgrade by image | A running supervisor keeps its version, so the new worker must read the record format version that supervisor writes; otherwise drain first |
| Service manager stop | The container runtime's stop ends the namespace: as a container restart | The launchd job must not kill supervisors outside its process group; whether it does is a launchd qualification obligation (G6, decision D5), and until it is proven, a service stop requires drain |
| Supervisor process crash | The child survives and is adopted by its identity, without its exit status | The same |
| Machine reboot or power loss | Every execution ends; any without `exit` ends with an unknown status | The same |
| Loss of the data root | Records are gone: the worker does not adopt. A marker scan lists surviving processes as unrecorded processes to reconcile, never as current work | Records are gone: surviving processes cannot be found; any execution held by this worker becomes uncertain at the control plane |
| System sleep and wake | Not applicable to the worker image | Processes survive and nothing is adopted again; whether the spawn deadline's clock counts sleep is an open question for item 3 |

The worker supports reading the record format of the current and the previous supervisor version. Drain means: start no new executions, let running ones finish or cancel them with the evidence of section 8, and upgrade only when no execution record lacks a terminal fact. Never start a second owner over a live execution (architecture section 13, upgrade).

## 10. Native evidence per operating system

| Evidence | Linux (worker image, Ubuntu 24.04) | macOS 26 (arm64 and x86_64) |
| --- | --- | --- |
| Boot identity | `/proc/sys/kernel/random/boot_id` | `sysctl kern.bootsessionuuid` |
| Namespace identity | Process identity of PID 1 in the container | Not applicable |
| Process start time | Field 22 of `/proc/<pid>/stat` (clock ticks since boot) | `p_starttime` of the process's `kinfo_proc`, read through `sysctl` (microseconds); the one-second time `ps` prints is not enough alone |
| Process group and session | Fields 5 and 6 of `/proc/<pid>/stat` | `kinfo_proc` |
| Parent links for descendants | Field 4 of `/proc/<pid>/stat` | `kinfo_proc` |
| Discovery without a handle | Marker scan of `/proc/<pid>/environ` | None; the window ends in `uncertain` |
| Supervisor liveness | `flock` on `lock`, released by the kernel when the supervisor dies | The same |
| Exit status | The supervisor reaps its child | The same |
| Proof of absence | The process identity is not alive, a complete marker scan finds nothing, or the boot or namespace changed | The process identity is not alive, or the boot changed |

The mechanism that reads these values from TypeScript on each OS, without code outside TypeScript (AGENTS.md), is an item 15 qualification. Behavior proven on one OS never establishes it on the other ([worker platforms](../worker-platforms.md)).

## 11. Facts reported

The worker reports these execution facts as observations (item 8 defines their messages):

| Fact | Meaning |
| --- | --- |
| `started` | A spawn happened: the child's process identity, with `launchAuthId` and `executionId` |
| `exited` | No process of the execution can run: the exit code or signal, or an unknown status, whether the start is proven, and the termination evidence |
| `not-started` | `fate` is `seal`: no spawn happened and none can follow |
| `uncertain` | Neither presence nor absence can be proven |
| `unrecorded-process` | A process carrying this worker's marker with no execution record (Linux, after data loss) |

`exited` and `not-started` are the terminal facts the launch authorization contract (item 3) needs. The control plane decides the attempt's outcome from them; this contract only reports what the worker can prove.

## 12. Obligations on other items

- **Item 3:** the launch record of its section 7 is `intent` plus `fate` as `claim`. Its open question about time asleep applies to the spawn deadline here.
- **Item 5:** the launch intent with `executionId` is journaled before the authorization request; the durable write rule covers the execution record's files and directory entries; the execution directory is part of the `worker/` subtree and outlives workspaces.
- **Item 6:** an `uncertain` execution and one being drained keep their capacity reservation; the per-execution supervisor's memory counts toward the execution's reservation, not toward the worker daemon's overhead target.
- **Item 7:** the execution states `authorized`, `started`, `exited`, and `not-started`, with `uncertain` as an observation that keeps ownership, and termination observed apart from cancellation requested.
- **Item 15:** the supervisor and the adopting supervisor, the per-OS readers of section 10, and the crash points of section 4.

## 13. Required tests

Items 15, 24, and 25 implement these through the deterministic test harness (item 10) on Linux and natively on macOS:

- A crash of the worker or the supervisor at each crash point CP1 to CP10, followed by recovery, gives the result section 6 assigns and never a second spawn.
- A supervisor paused between CP3 and CP5 while the worker seals does not spawn when it resumes.
- A child whose process ID is reused by an unrelated process after the child exited is reported as exited, not adopted.
- The worker service restarts while executions run: supervisors are adopted, and the running children are untouched.
- The supervisor is killed while its child runs: the child is adopted by its identity, and its later exit is reported with an unknown status.
- A crash between CP6 and CP7: on Linux, the marker scan finds the child and adopts it, or proves absence; on macOS the result is `uncertain`.
- An unreadable process during a marker scan makes the scan incomplete and the result `uncertain`.
- Cancellation of a tree with a descendant in its own session: the descendant is recorded and killed, or the termination is reported as unproven.
- A container restart and a machine reboot end every execution with an unknown status where no `exit` was written.
- A corrupt or newer-format record gives `uncertain`.
- A worker of the next version reads records written by a supervisor of the previous version.
