## Context

The [supervisor identity contract](../../../docs/contracts/supervisor-identity.md) (G2 item 4) defines the execution record, the launch sequence CP1 to CP12, recovery, termination evidence, and native evidence per operating system. Decision D7 (c) makes the supervisor one small process per execution. The worker journal contract (item 5) gives the durable file rule and the root lock. Item 14 implements both helpers in its adapter, and this item reuses them when item 14 merges. The deterministic test harness (item 10) provides crash points, scenario processes, and a simulated host.

On 2026-10-25 the coordinator brought four mechanism questions to the owner. A Claude Fable 5.1 subagent decided them under the owner's delegation; they are not the owner's own decisions:

- **D-A:** deferred to the owner. A native dependency or addon is the owner's call, so macOS fails closed for now. `koffi` evidence is proposed for that decision.
- **D-B (a):** the execution lock is an exclusive SQLite lock.
- **D-C (a):** the child runs under a separate execution account.
- **D-C2 (a):** the worker container uses Docker's built-in init.

The Linux cgroup test stays out of `make verify`, because `make verify` stays unprivileged; it runs from an explicit opt-in target.

## Goals / Non-Goals

**Goals:** everything the contract assigns to item 15 (section 12): the supervisor and the adopting supervisor; the per-OS readers; the Linux containment with the denial mechanism and the self-check; the namespace incarnation; the crash points; and the recovery table. Also the required tests of section 13 that a single host can run.

**Non-Goals:** the worker runtime that schedules these steps and publishes observations (item 20); the journal (item 14); the image, its account, capabilities, and init (item 23); native acceptance on the matrix (item 25); and the agent harness (G3).

## Decisions

1. **Hexagonal shape.** Everything that touches the operating system sits behind ports in `ports.ts`:
   - `DeadlineClock`, `ProcessInspector`, `Containment`, and `Platform` for native evidence;
   - `Spawner` for processes;
   - `RecordStore` for the record's files;
   - `ExecutionLock` for the lock.

   The launch sequence (`supervisor.ts`), the worker's steps (`worker-supervision.ts`), the recovery table (`recovery.ts`), and the macOS proof (`termination.ts`) use only these ports. That lets the harness drive every crash window in process with fakes, and lets item 20 compose the real adapters.
2. **Recovery as a pure decision.** `decideRecovery` maps the evidence of contract section 6 to one decision. `recoverExecution` gathers the evidence and applies the decision: it seals and reads the seal back, writes an exit, or starts an adopter. A seal that loses its race is decided again from the winner. No decision spawns.
3. **Crash points.** Each step reaches its contract name, such as `CP5`, through an injected hook, right after the step's durable effect. Product code never imports `@taskelith/testing`, as item 14 does with its write points. The worker's own CP1, CP3, CP10, and CP12 belong to the journal and the runtime (items 14 and 20).
4. **Record format.** Each file is one JSON object with `format: 1`. The event log frames each entry with its byte length and a CRC-32, using Node's built-in `zlib.crc32`. A reader treats a corrupt, unversioned, or newer file as a problem, so recovery is `uncertain`. The list of readable formats keeps the previous format readable once a second one exists.
5. **Contract amendments.** `intent` gains the command the child runs and, on Linux, the execution account. The record gains a `cancel` file, because the supervisor reports and receives only through files (section 1). The worker creates it once, and every supervisor of the execution acts on it. A supervisor that cannot read its own identity seals with `identity-unreadable`, because no supervisor record could name who claims; one that cannot create its containment seals with `containment-unavailable`; a durable write that fails before the spawn ends the supervisor without a spawn. Contract steps CP4 to CP6 state these rules. Under D-B (a), the lock rules of sections 3, 6, and 10 now name the SQLite lock and its two constraints. The worker probes the lock only during recovery.
6. **Linux.** The readers use `/proc` through `node:fs`:
   - `boot_id`;
   - fields 4, 5, and 22 of `stat`, counted after the command's last parenthesis;
   - `uptime` for `CLOCK_BOOTTIME`;
   - `self/cgroup`, and `self/ns/pid` with PID 1's start time as the namespace incarnation, because a namespace inode alone can be reused.

   A containment is a directory named from the `executionId` under a delegated parent that holds no processes. The supervisor admits itself just before the spawn and releases itself right after. Cancellation writes `cgroup.kill`, and emptiness comes from `cgroup.events`. The self-check creates a probe cgroup, requires `cgroup.kill`, and runs a probe as the execution account against the probe cgroup, the parent, and the worker's own cgroup. Each write must be denied.
7. **macOS.** By D-A, the clock, the identities, and the listing fail closed, so a macOS supervisor seals every launch. Only the boot identity is read, through `sysctl -n kern.bootsessionuuid`. The termination proof, the descendant walk, group signalling while the child is unreaped, and observation-only adoption are implemented against the ports and tested with a simulated host. They wait for a native reader before they run on macOS.
8. **Spawn.** Node's `spawn` with `detached: true` calls `setsid`, so the child leads a new session and process group, and its group ID is its process ID. An `error` before `spawn` is a spawn failure. On Linux the child is spawned only after the supervisor entered the containment, and the supervisor retries leaving it until it succeeds, before it watches or proves anything (pass-1 finding H1). Node reaps a child as soon as it exits, so on macOS the "unreaped" window ends when the exit event arrives. A signal sent in the interval between the kernel reaping the child and the event arriving can reach a recycled group ID. This is a residual risk of the macOS path, recorded for D-A; Linux signals no process ID.
9. **Reuse of item 14.** `FileRecordStore` uses the durable file helpers of `@taskelith/worker-journal` (`createOnce`, `replaceFile`, `syncBeforeUse`, `syncPath`, `createPrivateDirectory`), and `SqliteExecutionLock` its `ExclusiveFileLock`, through that package's root export. The boundary rule of item 9 forbids only modules from importing adapters, not one worker-only adapter from importing another, so no shared package is needed. The coordinator asked for one only if the rule blocked the import. Append-only writes, which the journal adapter does not need, are local to `FileRecordStore`: it appends, flushes the file, and on the first append flushes the directory.
10. **Supervisor program.** `supervisor-main.ts` is the detached process; `startDetachedSupervisor` starts it in a new session at CP4 with the mode (`launch` or `adopt`), the execution directory, and on Linux the containment parent. `runSupervisorProgram` composes the real adapters and takes an optional crash point hook. The real-process tests run it through a test fixture that arms `TASKELITH_CRASH_POINT` with the harness, as item 14's journal scenario does.

11. **Opt-in Linux cgroup target.** `make verify-linux-cgroup` builds a test-only image from the digest-pinned `ubuntu:24.04` with the pinned Node.js linux-x64 tarball, verified by `ADD --checksum`, and adds the execution account `taskelith-exec` (UID and GID 2000). The image choice was the coordinator's decision on 2026-10-25: it adds no software beyond the worker OS of ADR 0007 and the pinned runtime. The target runs the image privileged with `--cgroupns=private`, without network, and with the checkout mounted read-only. Its entry script moves every process into a leaf, so that the namespace root can hold the containment parent. It then runs `test/linux-cgroup.privileged.ts`, which `make verify` does not match, with the real program, store, and lock, and real processes:
   - the self-check;
   - a descendant escaping its group but not its containment;
   - a child denied leaving its containment;
   - cancellation through `cgroup.kill`;
   - a supervisor killed with `SIGKILL` at each of CP5 to CP9 and CP11, then recovered, with at most one spawn counted by the child itself;
   - a worker restart that adopts a live supervisor;
   - a supervisor and then its adopter killed, with adoption through the highest supervisor record;
   - a deleted record that is `uncertain`.

   The target refuses arm64 Docker hosts, because only the linux-x64 tarball is pinned. One early run failed because the test recovered before the supervisor had claimed, which the contract excludes; the test now waits for the handle. The fixed suite then passed all 13 tests in eight of eight runs. It is therefore reliable enough for a later CI job on an x86_64 runner that allows privileged containers; adding that job is a CI change outside this item. Item 23 can reuse the same base for the worker image.

## Risks / Trade-offs

- Until D-A is decided, nothing runs on macOS. Item 25's macOS rows stay open.
- `/proc/uptime` counting suspend comes from the kernel source. It is not measured here, because no test host can suspend; item 25 measures it.
- The containment parent must be delegated and must hold no processes, which item 23's composition provides.
