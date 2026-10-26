## Why

On Linux a worker that lost its execution records still has their containments in the kernel. The [supervisor identity contract](../../../docs/contracts/supervisor-identity.md) section 9 requires the worker to list populated containments without a record as unrecorded processes, never as current work, and section 11 names the `unrecorded-process` fact. The control plane already consumes `execution.unrecorded-process` (inventory and launch reconciliation), but no worker produces it: start reconciliation (`implement-worker-start-reconciliation`, design D5) left the scan to this follow-up. The wire contracts also give no deterministic `observationId` source for the observation.

## What Changes

- **Identity rule (contract, additive).** `execution.unrecorded-process` takes its `observationId` from `journalId` and the containment, so it has one identity per journal incarnation: a derivation after confirmation is published again under that identity, and the receiver applies it without effect (worker journal contract section 6, wire contracts section 5).
- **Linux scan.** On the first pass after start, a worker with a launch host on Linux lists the cgroups under its containment parent and journals each populated one without a `worker/executions/<id>` directory as `unrecorded-process`, with its members, published through the existing AsyncAPI mapping.
- **Leftovers unchanged.** A record directory that no journal row names is still logged as `worker.execution.leftover` and kept; it is never reported as an unrecorded process. Its fate stays open.
- **macOS.** No scan: surviving processes cannot be found there.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `worker-journal`: the local outbox names the identity of an unrecorded process.

## Impact

- `@taskelith/execution`: the `unrecorded-process` observation fact and `WorkerJournal.recordUnrecordedProcess`.
- `@taskelith/worker-journal`: the identity rule and the journal method; no format change.
- `@taskelith/worker-supervisor`: `LinuxContainmentScan` and `LinuxProcessInspector.entry`.
- `apps/worker`: the `ContainmentScan` port, its Linux adapter, the orchestrator's first pass, the launch host wiring, and the wire mapping.
- `docs/contracts/worker-journal.md` and `docs/contracts/execution-wire-contracts.md`: the identity rule.
- No AsyncAPI change and no new dependency.
