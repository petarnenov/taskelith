## Context

The [supervisor identity contract](../../../docs/contracts/supervisor-identity.md) section 9 (data root lost, Linux column, line 146) says: "the worker lists populated containments without a record as unrecorded processes to reconcile, never as current work", and section 11 (line 178) defines `unrecorded-process` as "A populated containment of this worker without an execution record (Linux, after data loss)". The execution record is the directory `worker/executions/<executionId>/` (section 3). The control plane already records and lists the observation (`inventory-reconciliation` "Unrecorded process", `launch-reconciliation` "Reconciliation queue"). Start reconciliation left this scan to a follow-up (archived `implement-worker-start-reconciliation`, design D5 and Q2).

## Owner decision (2026-10-26)

The task stopped at its specification gate: the leftover's fate is open (D5 defers it, while `worker-runtime` "Reconciliation logs" requires keeping it), a leftover directory is a record without a journal row and so not the contract's case, and no `observationId` source exists for the fact. The owner's away delegate chose option A (OpenCode run `20261026T110406Z-opencode-12993`), relayed by the coordinator:

1. An additive identity rule: `['unrecorded-process', journalId, containment]`, decided as "emitted once per journal incarnation" and recorded as one identity per journal incarnation (D3), in the worker journal contract section 6 and the wire contracts' observation identity rule, with the matching spec delta; no other contract or spec change.
2. The Linux scan of the cgroups under the containment parent; each populated containment without a `worker/executions/<id>` directory is reported through the existing wire mapping.
3. Leftover directories keep today's behaviour: logged as `worker.execution.leftover`, kept, never removed, never reported as an unrecorded process. **Their fate stays open as a separate future task.**
4. macOS: no scan.

The coordinator named section 3 of the wire contracts; the observation identity rule is in section 5 ("Observations"), which is where it was added.

## Goals / Non-Goals

**Goals:** the identity rule, the Linux scan on start, the journal fact and its wire mapping.

**Non-Goals:** the fate of leftover directories; any journal format or AsyncAPI change; macOS; a worker without `TASKELITH_WORKER_COMMAND`.

## Decisions

### D1: the scan runs once, on the first pass, after the record listing

`LaunchOrchestrator` lists the record directories on its first pass (start reconciliation D5) and then calls the `ContainmentScan` port. A containment is unrecorded when its name, which is the `executionId` the supervisor named it after (`LinuxContainment`), has no record directory. Listing records first is safe: the worker creates a record directory before any supervisor creates its containment (CP3), and this process has launched nothing before its first pass. A failed listing or scan is reported through `onFailure` and journals nothing, because absence of a record cannot then be shown.

### D2: the scan is a port with a Linux adapter

`ContainmentScan` (`apps/worker`) returns the populated containments with their members as `ExecutionProcess`. Its adapter, `containmentScan`, wraps `LinuxContainmentScan` of `@taskelith/worker-supervisor`, which reads `cgroup.events` and `cgroup.procs` of each directory under the parent and each member's `/proc/<pid>/stat`. A child creates no cgroup (section 8, the Linux self-check), so `cgroup.procs` holds the whole set. A containment removed since the listing, or a member that exited, is left out; a missing parent holds no containment.

### D3: one identity per journal incarnation, without a format change

`recordUnrecordedProcess` journals nothing while the outbox holds an entry with the same identity. After confirmation the entry is pruned, so a later start can derive it again; it keeps its identity. On the normal path the control plane's inbox classifies the known identity, and its position at the new sequence is recorded without its effect (`observation-consumption`, 21c decision 2; `apps/control-plane/src/application/observation-service.ts`, `#record` and `#recordKnown`). Only if the inbox no longer holds the identity does the reconciliation queue's duplicate rule guard a second time (`launch-reconciliation` "Reconciliation queue": a duplicate records nothing). A table of reported containments would also stop this repeat, but it needs a journal format step, which the decision excluded.

- **Alternative:** journal format 4 with a reported-containment table. Rejected: a contract and format change outside the decided scope.

### D4: macOS does not scan

No containment exists on macOS. [Worker journal](../../../docs/contracts/worker-journal.md) section 11 (line 191): "on Linux, populated containments without an execution record are reported as unrecorded processes, never as current work; on macOS they cannot be found". [Supervisor identity](../../../docs/contracts/supervisor-identity.md) section 9 (line 146), macOS column: "Records are gone; surviving processes cannot be found, and every execution the worker held is reconciled at the control plane as `uncertain`". `containmentScan` returns no port for a darwin platform, and the orchestrator then skips the scan.

### D5: wire mapping

`execution.unrecorded-process` is about no attempt: its correlation is its own `observationId`, as for `worker.capacity.declared`. The containment is the cgroup path, cleaned to `DisplayText`, and the processes are cut to the wire's bound of 256.

## Risks / Trade-offs

- **Only with a launch command.** The scan runs where the launch host is built, which needs `TASKELITH_WORKER_COMMAND` (start reconciliation, review pass 2, M-B); decoupling is the 20d2 obligation.
- **Leftovers still accumulate** and are logged on every start until the separate task decides them.
- **Members of descendant cgroups are not listed.** `populated` counts descendants, but only the containment's own `cgroup.procs` is read, without recursion; the self-check makes such cgroups impossible for a child (D2).
- **A malformed containment never stops the scan.** One whose `cgroup.events` has no populated line is skipped, not reported; a populated one whose `cgroup.procs` holds a line that is not a decimal process ID, or whose member cannot be read, is reported with no processes.
- **The worker's own cgroup is not excluded.** If the containment parent were the parent of the worker's home cgroup, the home would be scanned like a containment; a check for this belongs to a future self-check task.
- **A leftover with a populated containment** is only logged, never reported, by decision 3; the future task on leftovers owns it.
