## Why

G2 work items 20 (`implement-worker-agent-runtime`, report reachability) and 21 (`implement-execution-reconciliation`) both need lost contact ([docs/g2-plan.md](../../../docs/g2-plan.md), rows 20 and 21). Item 21b records first contact from observations, but nothing ever marks a worker unreachable, so a silent worker stays eligible for placement forever. A worker that has nothing to observe also sends nothing, so observations alone cannot tell a quiet worker from a lost one.

On 2026-10-26 the coordinator moved this change ahead of item 20d and assigned the contract and the control-plane side. The worker-side publisher stays in 20d.

Obligations this change meets, from the coordinator's brief of 2026-10-26:
- coordinator decision Q1 (a) of item 20: a worker heartbeat on its own subject, outside the journal sequence, like the inventory report; interval `10s` and lost-contact timeout `30s` as provisional targets that G6 verifies;
- a minimal heartbeat: the worker identity, the `journalId`, and a sent-at time, with nothing about capacity or pressure;
- the contract: the message and subject in `execution.asyncapi.json`, the worker's publish permission for its own heartbeat subject, the documented subject, the contract compatibility check, a version bump, and the contract page;
- the provisional targets in `docs/operational-targets.md`;
- a consumer that authenticates a heartbeat (the subject's worker is the `workerId`, enrolled, not revoked, under its current `journalId`) and records contact;
- a periodic, bounded, logged check that marks a worker unreachable for placement after `30s` without any contact, which any later contact reverses, reusing the reachability that 21b records;
- tests: a heartbeat records contact; a stale worker turns unreachable after the timeout with an injected clock; a revoked worker's or another worker's heartbeat is refused; a contract test for the message.

Left to other changes:
- 20d: the worker's heartbeat publisher and its own detection of lost contact;
- reconciling the attempts of a lost worker; this change affects only placement eligibility.

## What Changes

- **Contract.** `execution.asyncapi.json` 0.4.0 adds the `workerHeartbeats` channel, `taskelith.<installationId>.workers.<workerId>.heartbeats`, with the `worker.heartbeat` message and its `WorkerHeartbeat` schema, and the control plane's `receiveWorkerHeartbeat` operation. The contract page, the enrollment contract, and the trust model document the subject and the permission.
- **Transport.** `TransportAddress` gains the heartbeat subject and adds it to each worker's broker permissions, which enrollment and rotation issue. A new `HeartbeatReceiver` reads every worker's heartbeats over core NATS in one queue group, with no stream.
- **Scheduling.** `WorkerReports.markContactLost(before, limit)` makes the oldest silent reachable workers unreachable, in memory and in PostgreSQL, with a conformance case.
- **Control plane.** `HeartbeatService` authenticates a heartbeat and records contact; `LostContactCheck` runs every `10s` with a `30s` timeout and at most `100` workers per run. Observations and heartbeats share one producer authentication.
- **Targets.** `docs/operational-targets.md` gains the heartbeat and lost-contact row.

## Capabilities

### New Capabilities
- `worker-contact`: heartbeat contact and the bounded lost-contact check.

### Modified Capabilities
- `execution-wire-contracts`: the heartbeat channel and message.
- `installation-enrollment`: the worker's permission to publish its own heartbeats.
- `nats-transport`: the heartbeat receiver.

## Impact

- Code: `packages/contracts`, `packages/adapters/nats`, `packages/modules/scheduling`, `packages/adapters/postgres`, and `apps/control-plane`.
- No migration: `workers.reachable` and `workers.last_contact_at` exist since 21b.
- A worker enrolled before this change has broker credentials without the heartbeat permission; its next credential rotation adds it. No worker publishes heartbeats before 20d.
