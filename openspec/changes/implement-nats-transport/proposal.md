## Why

G2 work item 12 ([docs/g2-plan.md](../../../docs/g2-plan.md)): the NATS transport, serving "NATS transport" and "duplicate delivery". Decision D3 (a) selects JetStream with one command stream on worker-addressed subjects and one durable pull consumer per worker, plus observation streams with independent consumers. Architecture section 9 requires an outbox publisher that keeps the command identity until the broker acknowledges, receivers that deduplicate for their lifetime, bounded streams and consumers, and quarantine with diagnostics and a controlled redrive. The [JetStream spike](../../../docs/g2-jetstream-spike.md) (item 2) and the [execution wire contracts](../../../docs/contracts/execution-wire-contracts.md) (item 8) give this item its obligations. Before this change no product code spoke NATS.

## What Changes

- New private adapter package `@taskelith/nats` (`packages/adapters/nats`):
  - `TransportAddress`: the contract subjects `taskelith.<installationId>.workers.<workerId>.commands` and `.observations`, stream names, a per-worker inbox prefix, and the mapping of an outbox row's `workers.<workerId>.commands` to its full subject. It refuses an `installationId` or `workerId` that is not 1-64 letters, digits, `_`, or `-`.
  - Topology: the command, observation, quarantine, and advisory streams, and the durable pull consumers for a worker, an observation reader, and the quarantine keeper, created or updated in place with the bounds below.
  - `JetStreamPublisher` and `OutboxPublisher`: an outbox row is published as its payload with `Nats-Msg-Id` set to its event identity, and marked published only after the broker acknowledged it. An unacknowledged row stays unpublished and is sent again with the same identity. Rows of one subject keep their append order, and a failing subject backs off without delaying the others.
  - `ValidatingConsumer` for worker commands and for observations, one message per pull: each message is validated against its contract schema, and the handler's commit is acknowledged only after it returns. A failed commit is redelivered after a backoff, and a long commit extends `ack_wait`. A message that fails its schema is terminated with the reason, which quarantines it. A command of a protocol version this build does not support passes with its stable part, for the worker to reject.
  - `applyOnce`: receiver-side deduplication through the existing `Inbox` port by the identity in the message body, which also holds after the broker's window.
  - `Quarantine`: it captures the `MAX_DELIVERIES` and `MSG_TERMINATED` advisories, copies the original into the quarantine stream with diagnostic headers, and lists the records. It redrives one on request under the new `Nats-Msg-Id` `<original>.redrive.<n>`.
  - `connectTransport`: connects without a reconnection limit, with the worker's inbox prefix on a worker connection.
- `docs/operational-targets.md` gains a provisional row for the transport bounds, which G6 verifies: `ack_wait` 30 s, `max_deliver` 5, redelivery backoff 5 s to 60 s, `max_ack_pending` 4 per worker, 10,000 queued commands per worker subject, and a 2-minute duplicate window. The existing 7 days, 10 GiB, and 1 MiB stream bounds apply.
- The boundary check counts the `@nats-io` packages as infrastructure SDKs, which modules may not import.
- The dependency register records the runtime installation and the evidence of the tests.

## Capabilities

### New Capabilities
- `nats-transport`: the JetStream adapter: topology, outbox publication, validating consumers, receiver deduplication, and quarantine with redrive.

### Modified Capabilities

## Impact

New private workspace package. The published `taskelith` package and CLI are unchanged. `@nats-io/jetstream`, `@nats-io/nats-core`, and `@nats-io/transport-node` 3.4.0, approved by the coordinator for this item, become runtime dependencies of `@taskelith/nats`. The dependency inventory is regenerated.

The coordinator decided on 2026-10-25 to leave four things to other items:
- the wire commands built from the provisional scheduling outbox payloads go to item 16;
- the operator API and authorization for redrive go to item 16;
- credentials, TLS, `installationId`, and the shared server users go to item 13;
- the restore-quarantine stop of command publication goes to item 13 or 16.

Item 20 maps journal entries to observations and commits commands before the acknowledgement. Item 21 applies observations, confirmations, and inventories.
