# Supervisor identity contract

Date: 2026-10-25. Status: proposed protocol contract for G2 ([G2 work plan](../g2-plan.md) item 4), under independent review; once reviewed and merged it resolves the pre-G2 contract "supervisor identity and adoption" of [architecture section 15](../architecture.md#15-decisions-still-requiring-evidence-or-owner-scope-confirmation). It serves invariant 8 and R06 of the [architecture](../architecture.md). G2 items 7 (execution domain model), 8 (wire contracts), and 14 (worker journal) build on it; item 15 implements it in `packages/adapters/worker-supervisor` and amended sections 2, 3, 4, 6, 8, and 10 with the decisions it needed; `implement-macos-native-process-evidence` added the macOS native readers under the owner's decision D-A of item 15 and amended sections 4, 8, and 10; items 24 and 25 run its failure scenarios and native acceptance.

## 1. Purpose and parties

Starting a process and recording its handle are not one atomic transaction (architecture F03). This contract defines how a worker spawns at most once per execution, finds the execution's processes again after any crash, proves when none of them can run, and reports uncertainty instead of guessing when it cannot prove either.

- **Worker:** the enrolled worker service ([trust model](../trust-model.md)) that holds the assignment and journals its steps under the worker journal contract (G2 item 5, `define-worker-journal-contract`). It never spawns an agent process itself.
- **Execution supervisor:** by decision D7 (c), one small supervisor process per execution that spawns the child, owns it as its parent, and writes its exit status durably, in the manner of a container shim. The worker starts it; it outlives restarts of the worker service where section 9 says so. It is a TypeScript program shipped with the worker, never a sandbox ([trust model](../trust-model.md)), and it never talks to the network.
- **Child:** the process the supervisor spawns for the execution; with its descendants it forms the execution's **process set**. In G2 the child is a test-only scripted process; the agent harness port belongs to G3 (item 15).
- **Launch authority:** the control-plane service of the launch authorization contract (G2 item 3, `define-launch-authorization-contract`), which issues the `launchAuthId` a spawn needs.

The supervisor reports only through files in its execution record (section 3). The worker reads them and turns them into observations in its local outbox (item 5); facts reach the control plane only that way.

## 2. Identities and execution states

- **Execution identity (`executionId`):** the stable execution identity. The worker creates it as a random 128-bit identifier and journals it with the launch intent (item 5) before it asks for a launch authorization (item 3). It names at most one spawn and is never reused. The architecture's phrase "stable launch identity" (section 9, failure behavior) means this identity.
- **Process identity:** the triple of boot identity, process ID, and process start time, read from the operating system (section 10). A process ID alone never identifies a process, because the kernel reuses process IDs. Two observations name the same process only if all three values are equal.
- **Boot identity:** the identifier the kernel assigns to the current boot (section 10).
- **Namespace incarnation (Linux):** the identity of the worker container's PID namespace, recorded in `intent`. A replaced container has a new incarnation, and its cgroup view may no longer show the old containments. The old namespace's end is proven only by evidence that its PID 1 died, because the kernel then ends every process of the namespace; the candidate is a lock on the data root held by that PID 1 for its whole life. By decision D-C2 (a) of item 15, the worker container's init is Docker's built-in init, which holds no such lock, so in G2 no old namespace's end is proven. Without that proof a missing containment proves nothing.
- **Supervisor identity:** the process identity of a supervisor, recorded in a numbered supervisor record (section 3) together with the execution it serves.
- **Containment:** on Linux, a cgroup v2 directory per execution, named from its `executionId` under the worker's cgroup, that the child and every descendant belong to from their creation and cannot leave, because the process set has no write access to any cgroup of the worker (section 8). macOS offers no equivalent; there the child's process group, while the supervisor still holds the unreaped child, is the closest boundary (section 8).

The execution states are those of the launch authorization contract (item 3): `authorized` (a grant exists and nothing has spawned), `started` (a start is recorded), and the terminal states `exited` and `not-started`. This contract defines when the worker may report the facts that move an execution between them (section 11); `uncertain` is an observation that leaves the state unchanged.

## 3. The execution record

Every execution has a directory `worker/executions/<executionId>/` under the worker's data root ([storage](../storage.md)), the "supervisor recovery records" of the `worker/` subtree. Workspace removal never deletes it. Its files are written with the durable write rule of the worker journal contract (item 5), which covers the file and its directory entry, and every file carries a format version. The record is separate from the worker's SQLite journal, so that a supervisor never takes the journal's lock.

| File | Written by | When | Content |
| --- | --- | --- | --- |
| `intent` | Worker | Before it starts the supervisor; replaced only while no launch record exists | `executionId`, `attemptId`, `ownershipGeneration`, the current `launchAuthId`, the spawn deadline in the deadline clock (section 4) with the boot identity it is valid in, the namespace incarnation on Linux, the supervisor program version, the command the child runs, and on Linux the execution account the child runs as (section 8) |
| `lock` | Every supervisor | For its whole life | An exclusive lock (section 6) |
| `supervisor.<n>` | Each supervisor, once | Right after it takes `lock` | Its supervisor identity; `n` is one more than the highest existing number, created exclusively |
| `launch` | The first supervisor, or the worker | Created once, exclusively | The **launch record**: either a **claim** (the `launchAuthId` it spawns under, `supervisor.1`, and the containment) or a **seal** |
| `handle` | The first supervisor | Right after a spawn returns | The child's process identity and process group ID, or the spawn failure (section 4) |
| `events` | Every supervisor | Append only; a torn last entry is cut off before the next one is written | Descendant identities observed, cancellation steps, and termination evidence (section 8) |
| `exit` | A supervisor | When the process set is proven empty | The child's exit code or signal, or an unknown status, and the termination evidence |
| `cancel` | Worker | Created once, when cancellation is requested | The cancellation reason; every supervisor of the execution acts on it as section 8 states |

The worker removes the directory only after the execution's terminal fact is recorded by the control plane and in its journal, and only while it holds `lock` itself, taken without waiting, so that no supervisor of the execution can hold it; it removes every file, the launch record last, and then the directory, before it releases `lock`. A supervisor takes `lock` without waiting and exits if it cannot, exits if the directory or `intent` is missing, and never creates the directory, so a supervisor that resumes after the cleanup cannot claim a launch record that a seal once occupied. An unreadable, corrupt, or newer-format file, or a combination the launch sequence cannot produce (for example a `handle` without a claim), is never guessed around: the execution becomes `uncertain` (section 7).

## 4. Launch sequence and crash points

The worker and supervisor run these steps in order. Each step is a named crash point for the deterministic test harness (item 10); section 6 defines recovery after a crash at any of them.

1. **CP1** The worker journals the launch intent with `executionId` (item 5) and obtains a launch authorization (item 3).
2. **CP2** The worker creates the execution directory and writes `intent`.
3. **CP3** The worker journals that the record exists (item 5). From this point on, a missing or damaged record is data loss, never evidence that nothing spawned.
4. **CP4** The worker starts the supervisor as a detached process in a new session, passing the execution directory, the mode (launch or adopt), and on Linux the containment parent of the worker's configuration.
5. **CP5** The supervisor takes `lock` without waiting (it exits if it cannot), reads `intent`, writes `supervisor.1` with its own process identity, and checks that the boot identity matches, that it can read the deadline clock, and that the deadline has not passed. If it cannot read its own identity, or any check fails, it seals the launch record with the reason and exits; if a durable write fails, it exits without spawning.
6. **CP6** On Linux the supervisor creates the containment; if it cannot, it seals. It removes the containment again when it loses the claim or the spawn fails.
7. **CP7** The supervisor creates the launch record as a claim. If the launch record already exists, it exits without spawning.
8. **CP8** The supervisor spawns the child, before the deadline, as the leader of a new session and process group. On Linux the supervisor moves itself into the containment just before the spawn, so that the child is born inside it, and moves itself back to its own cgroup right after, so that the containment holds only the process set. A spawn begun before the deadline is a start under the claimed authorization (item 3).
9. **CP9** The supervisor writes `handle`: the child's identity, or the spawn failure if no child process was created or the child failed to execute its program.
10. **CP10** The worker reads `handle` and puts the start observation, with the claimed `launchAuthId` and `executionId`, in its outbox.
11. **CP11** The child exits; the supervisor completes the termination evidence of section 8 and writes `exit`.
12. **CP12** The worker reads `exit` and puts the exit observation in its outbox.

The **deadline clock** must count time the system spends asleep and be shared by every process of one boot: `CLOCK_BOOTTIME` on Linux and `mach_continuous_time` on macOS. The worker and the supervisor both use it, so the deadline the worker derives under item 3 holds across a suspend. Reading it from TypeScript is an item 15 qualification; a supervisor that cannot read it fails closed and seals. On Linux, item 15 reads the first field of `/proc/uptime`, which the kernel takes from `CLOCK_BOOTTIME`. On macOS, the supervisor calls `mach_continuous_time` and `mach_timebase_info` through `koffi`, which the owner approved on 2026-10-25 (decision D-A of item 15); a host that cannot load it seals every launch. Item 3 states the worker's side of the same rule.

A supervisor whose durable writes fail (a flush failure or a full disk) before CP8 does not spawn. After CP8 it keeps the child running and retries the write, and recovery treats the missing file as the crash windows of section 6 do.

## 5. One spawn per execution

The launch record decides once and irreversibly whether the execution may spawn. It is created with exclusive creation (the operating system's create-if-absent) and made durable before anyone acts on it, so exactly one creation succeeds:

- **Claim:** written only by the execution's first supervisor while it holds `lock`, before its deadline. A spawn under any grant of the execution first claims the launch record, and the launch record is written once, so the supervisor spawns at most once per `executionId` across all its grants. The claim is durable before the spawn begins, so a power loss after the spawn cannot erase it.
- **Seal:** written by the worker during recovery, or by a supervisor whose checks failed. A sealed launch record can never be claimed, so no later spawn is possible.

When a creation fails because the launch record already exists, the creator reads the winning record and decides again from it; it never assumes its own outcome. The worker reports `not-started` only after reading a durable seal. These are the two obligations of the launch authorization contract (item 3, section 4).

## 6. Recovery and adoption

When the worker service starts, it reads its journal and every execution directory and decides from them and from native evidence, never from a process ID alone.

**Supervisor liveness.** A supervisor holds `lock` for its whole life. Node offers no `flock`, so by decision D-B (a) of item 15 the lock is the exclusive SQLite lock that the worker journal contract uses for `worker/lock` (section 9 there): an exclusive-locking-mode transaction, which takes a POSIX record lock on the file and which the kernel releases when the process dies. Two constraints follow:

- **Only the lock module opens `lock`.** Closing any descriptor of the file in the holding process releases a record lock, so no other code of the supervisor or the worker opens it.
- **Children never inherit it.** Record locks are not inherited across `fork`, and the descriptor is opened close-on-exec, so a child that has not yet executed its program holds no lock.

The worker treats a supervisor as live only if `lock` is held and the identity in the highest `supervisor.<n>` is alive. If `lock` is held and that identity is dead, the worker retries for a bounded time and then reports `uncertain`. The worker probes `lock` only during recovery, never while it starts a supervisor of the same execution, because a supervisor that finds `lock` taken exits.

**Adoption.** To adopt, the worker starts an adopting supervisor. It takes `lock` (only one process can), writes the next `supervisor.<n>`, and continues the execution's observation and cancellation. It is not the child's parent, so it cannot read the child's exit status. A crash between taking `lock` and writing its record leaves the lock free and the record absent, and the next recovery adopts again.

| Journal and record found | Native evidence | Result |
| --- | --- | --- |
| Launch intent journaled, record not journaled (crash at CP1 or CP2) | None needed | Create or complete the directory and seal; report `not-started` once the seal is read back |
| Record journaled, directory missing or damaged | Any | `uncertain`; on Linux, report any populated containment as below |
| No launch record | None needed | Seal; on losing the race, decide again from the winning record |
| Launch record is a seal | None needed | Report `not-started` |
| Claim; a supervisor is live | Its identity is alive | Adopt it: resume reading its files; nothing spawns |
| Claim; `exit` present | None needed | Report the recorded exit |
| Claim; `handle` records a spawn failure | None needed | The supervisor writes, or the worker completes, `exit` with the failure; report it |
| Claim; no live supervisor; no `exit` | Linux: the recorded namespace incarnation is not the current one, and the old namespace's end is not proven | `uncertain` |
| The same | Linux: the containment is populated | Adopt: an adopting supervisor watches the containment; when it empties, write `exit` with an unknown status |
| The same | Linux: in the recorded namespace incarnation, the containment is not populated; or the boot changed; or the old namespace's end is proven | Write `exit` with an unknown status, and with the start unproven if there is no `handle`; report it |
| The same | macOS, same boot, `handle` present: the child's identity is alive | Adopt the child (observation only, section 8) |
| The same | macOS, same boot, `handle` present: the child's identity is not alive | `uncertain`: descendants may live, and no containment proves they do not |
| The same | macOS, same boot, no `handle` | `uncertain` |
| The same | macOS, the boot changed | Write `exit` with an unknown status; report it |
| Any file unreadable, corrupt, of a newer format, or in an impossible combination | Any | `uncertain` |

A reboot ends every process of the boot, and the cgroup tree with them; a populated containment (Linux) and a live process identity (macOS) are always read in the current boot. No recovery path spawns. A worker that restarts with a journaled authorization reconciles by `executionId` and, after a `not-started`, re-authorizes a new execution with a new identity (item 3).

An exit with an unknown status ends the execution: no process of it can run. The attempt's outcome is still unknown, because side effects may have happened, and automatic retry needs operation-specific repeatability (architecture section 9) within the retry budget of `0` for uncertain execution ([operational targets](../operational-targets.md)).

## 7. Uncertainty

`uncertain` means the worker can prove neither that a process of the execution runs nor that none does. The worker reports it as an observation. The execution keeps its state, its ownership, and its capacity reservation (item 6), and no other execution of the attempt is authorized (item 3). Only new evidence ends it: a later proof, a reboot, or an operator's reconciliation recorded through the control plane. Loss of contact with a worker is not uncertainty about the process (invariant 4); this state is about native evidence on the worker itself.

## 8. Process sets, cancellation, and termination evidence

`exit` is written, and `exited` reported, only when the whole process set is proven empty, not merely when the child exits. If the child exits and the set is not proven empty, the execution stays `started` and the worker reports the surviving processes.

**Linux.** The containment holds the whole process set, whatever sessions or forks it creates, only if no process of the set can migrate itself or another process: migrating a process needs write access to the destination's `cgroup.procs` and to that of the common ancestor, and the supervisor has that access to move itself. The process set must therefore have no write access to any cgroup of the worker, which the supervisor ensures before the spawn: by decision D-C (a) of item 15, the child runs under a separate execution account (its own user and group IDs) that owns no cgroup of the worker. A Linux worker is admitted only if its self-check proves that a child can neither leave its containment nor change another one, and that the containment has a kill control; the container runtime settings that provide this are an item 15 and item 25 qualification.

- The set is empty when the containment reports itself unpopulated, which also covers descendant cgroups.
- Cancellation writes to the containment's kill control, which kills every member, including members created by concurrent forks, without naming a process ID, so no reuse race exists.

**macOS.** No containment exists, so termination evidence rests on the process group and on the processes the supervisor observed:

- While the child runs, the supervisor records in `events` the identity of every descendant it sees, by walking parent links at a fixed interval and at cancellation.
- The supervisor signals the child's process group only while it holds the child unreaped. A process group ID equals its leader's process ID, which no new process can receive until the child is reaped, so the signal cannot reach an unrelated group. It never signals by a process ID or group ID it no longer holds.
- Cancellation sends the group a termination signal, waits a grace period, then kills the group, all before reaping the child.
- A process inherits its parent's process group when it forks, and the kernel does not reuse a process group ID while any member exists, so the original group is gone only when no process at all carries its ID. After the child is reaped, the set is proven empty only if a kernel listing of all processes contains no process with the group's ID, whatever its start time, and no recorded descendant identity is alive. A process with that ID that started after the reap may belong to an unrelated group, but it still blocks the proof: a false unproven termination is safe, a false `exited` is not. `sysctl` with `KERN_PROC_ALL` takes the process IDs at one instant under the kernel's process list lock, skipping processes still being forked, and copies each entry afterwards without that lock (XNU `sysctl_prochandle` and `proc_iterate`). A member reaped between the two steps is left out, so if it forked a process after the IDs were taken, neither appears and a listing can miss a live member. By the owner's decision of 2026-10-25, the set is therefore proven empty only by two consecutive such listings, taken one after the other; the second narrows this race but does not close it, and the remainder is a residual risk of the macOS proof. A listing that cannot be read proves nothing, and the worker then reports an unproven termination.
- A descendant that leaves the child's process group, by starting a new session or group, escapes both the signals and the evidence, and the supervisor's interval walk cannot be relied on to see it. The guarantee on macOS therefore rests on qualification: a harness supported on macOS must be shown to keep every process in its group (a G3 harness qualification obligation), and a harness that does not is not supported on macOS. An escape the supervisor does observe, a recorded descendant alive outside the group, is reported as an unproven termination; an escape it does not observe is the residual risk this qualification accepts.
- Node reaps a child as soon as it exits and reports the exit later, so for a Node supervisor the child counts as unreaped only until the exit is reported; a group signal sent between the reap and the report is a residual risk of the macOS path, recorded with decision D-A of item 15, next to the listing race above.
- An adopting supervisor on macOS is not the child's parent, so it cannot signal safely: it observes only. A cancellation it receives is reported as not executed, and the execution stays `started` for reconciliation.

A cancellation request is never proof of termination (architecture section 9): the attempt is cancelled only on this evidence.

## 9. What survives a restart, an upgrade, or a reboot

Invariant 8 requires a worker service upgrade to state whether child runtimes survive or require drain.

| Event | Linux worker container | macOS native worker |
| --- | --- | --- |
| Worker service process crash or restart, container kept | Supervisors and process sets survive and are adopted, provided the container's main process is an init that outlives the worker service and reaps orphans; otherwise this is a container restart | Supervisors and process sets survive in their own sessions and are adopted |
| Container restart or replacement (including an image upgrade) | Every process ends with the container's PID namespace: requires drain. An execution not drained ends with an unknown status only if the old namespace's end is proven (section 2); otherwise it is `uncertain` | Not applicable |
| Worker package upgrade without replacing the processes | Not applicable: Linux workers upgrade by image | A running supervisor keeps its version, so the new worker must read the record format that supervisor writes; otherwise drain first |
| Service manager stop | The container runtime's stop: as a container restart | The launchd job must not kill supervisors outside its process group; whether it does is a launchd qualification obligation (G6, decision D5), and until it is proven, a service stop requires drain |
| Supervisor process crash | The process set survives and is adopted through its containment, without the child's exit status | The child is adopted for observation only (section 8), without its exit status |
| Machine reboot or power loss | Every execution ends; any without `exit` ends with an unknown status | The same |
| Loss of the data root | Records are gone and nothing is adopted. Containments survive in the kernel: the worker lists populated containments without a record as unrecorded processes to reconcile, never as current work | Records are gone; surviving processes cannot be found, and every execution the worker held is reconciled at the control plane as `uncertain` |
| System sleep and wake | Processes survive; the deadline clock counts the time asleep | The same |

The worker reads the record format of the current and the previous supervisor version. Drain means: start no new executions, let running ones finish or cancel them with the evidence of section 8, and upgrade only when every execution record has a terminal fact. Never activate a second owner over a live execution (architecture section 13, upgrade).

## 10. Native evidence per operating system

| Evidence | Linux (worker image, Ubuntu 24.04) | macOS 26 (arm64 and x86_64) |
| --- | --- | --- |
| Boot identity | `/proc/sys/kernel/random/boot_id` | `sysctl kern.bootsessionuuid` |
| Process start time | Field 22 of `/proc/<pid>/stat` (clock ticks since boot) | `p_starttime` of the process's `kinfo_proc` from `sysctl` (microseconds); the one-second time `ps` prints is not enough |
| Process group | Field 5 of `/proc/<pid>/stat` | `e_pgid` of `kinfo_proc` |
| Parent links | Field 4 of `/proc/<pid>/stat` | `e_ppid` of `kinfo_proc` |
| Process set membership and emptiness | The containment's `cgroup.procs` and its `populated` event | Group members and recorded descendants (section 8) |
| Kill without a reuse race | The containment's `cgroup.kill` | A group signal while the child is unreaped |
| Supervisor liveness | The exclusive SQLite lock on `lock`, with the supervisor identity alive | The same |
| Exit status | The supervisor reaps its child | The same |
| Deadline clock | `CLOCK_BOOTTIME` | `mach_continuous_time` |

The mechanisms that read these values from TypeScript on each OS, without product code in another language (AGENTS.md), are an item 15 qualification; a mechanism that needs a new dependency needs the owner's approval. On macOS, `koffi` calls `sysctl` and the Mach clock in `libSystem` (decision D-A of item 15); the boot identity is still read through the `sysctl` command. Behavior proven on one OS never establishes it on the other ([worker platforms](../worker-platforms.md)).

## 11. Facts reported

The worker reports these facts as observations; item 8 defines their messages.

| Fact | Moves the execution to | Meaning |
| --- | --- | --- |
| `started` | `started` | A spawn happened: the child's identity, with the claimed `launchAuthId` and `executionId` |
| `exited` | `exited` | The whole process set is proven empty: the child's exit code or signal, or an unknown status; whether the start is proven; the spawn failure if there was one; and the termination evidence |
| `not-started` | `not-started` | The launch record is sealed: no spawn happened and none can follow |
| `uncertain` | No change | Neither presence nor absence of the process set can be proven |
| `termination-unproven` | No change | The child exited or was cancelled, but processes of the set survive or cannot be ruled out |
| `unrecorded-process` | No change | A populated containment of this worker without an execution record (Linux, after data loss) |

The control plane decides the attempt's outcome from these facts; this contract only reports what the worker can prove.

## 12. Obligations on other items

- **Item 3:** the launch record of its section 7 is the claim of section 5 here; its spawn deadline uses the deadline clock of section 4.
- **Item 5:** the launch intent with `executionId` is journaled before the authorization request, and the record's existence is journaled before the supervisor starts (CP3); the durable write rule covers the record's files and directory entries; the execution directory is part of the `worker/` subtree and outlives workspaces.
- **Item 6:** an execution that is `uncertain`, has a `termination-unproven` set, or is being drained keeps its capacity reservation; the per-execution supervisor's memory counts toward the execution's reservation, not toward the worker daemon's overhead target.
- **Item 7:** the execution states of section 2, with `uncertain` and `termination-unproven` as observations that keep ownership, and termination observed apart from cancellation requested.
- **Item 15:** the supervisor and the adopting supervisor, the per-OS readers of section 10, the Linux containment with the mechanism that denies the process set any cgroup write access and the self-check that proves it, the namespace incarnation and the proof of an old namespace's end, the macOS process listing and its two-listing proof with the residual risk of section 8, and the crash points of section 4.
- **G3 harness qualification:** a harness supported on macOS keeps its processes in its process group.

## 13. Required tests

Items 15, 24, and 25 implement these through the deterministic test harness (item 10) on Linux and natively on macOS:

- A crash of the worker or a supervisor at each crash point CP1 to CP12, followed by recovery, gives the result section 6 assigns and never a second spawn.
- The worker seals while a delayed supervisor claims: whichever creation wins, the other party reads it and follows it, and `not-started` is reported only when the seal won.
- A supervisor paused before its claim while the worker seals does not spawn when it resumes.
- A supervisor started before a seal and paused before taking `lock`, resumed after the terminal fact was recorded and the directory removed, does not spawn; while a paused supervisor holds `lock`, the worker does not remove the directory.
- A recorded execution whose directory is deleted after CP3 gives `uncertain`, not `not-started`.
- A child whose process ID is reused by an unrelated process after the child exited is not adopted, and no signal reaches the unrelated process.
- The worker service restarts while executions run: supervisors are adopted, and the process sets are untouched.
- A supervisor is killed while its child runs, then the adopting supervisor is killed too: each recovery adopts through the highest supervisor record, and the later exit is reported with an unknown status.
- A crash between CP8 and CP9: on Linux the containment proves presence or absence; on macOS the result is `uncertain`.
- A child that starts a descendant in its own session and then exits: on Linux the execution stays `started` until the containment empties; on macOS, when the supervisor has recorded the descendant, the escape is reported as `termination-unproven`.
- On macOS, a child forks A and is reaped, then A forks B and exits before the next walk: B keeps the group's ID, so the set is not proven empty.
- On Linux, a child that tries to move itself or a descendant into another cgroup of the worker fails, and the worker's self-check proves that it fails.
- A spawn that fails before a child exists and a child that fails to execute its program each end with `exited` and the failure, without a second spawn.
- A system suspend that outlasts the deadline between hand-off and claim leads to a seal, not a spawn.
- A Linux worker without a delegated cgroup v2 containment fails its self-check.
- A machine reboot ends every execution with an unknown status where no `exit` was written; after a container replacement with the data root kept and the old cgroups gone, an execution is `uncertain` unless the old namespace's end is proven.
- A corrupt, newer-format, or impossible record gives `uncertain`.
- A worker of the next version reads records written by a supervisor of the previous version.
