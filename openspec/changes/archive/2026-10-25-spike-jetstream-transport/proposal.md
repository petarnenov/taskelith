## Why

Architecture section 9 prefers NATS JetStream only on the condition of a protocol spike, and the owner decided D3 (a) on 2026-10-25, one command stream on worker-addressed subjects with one durable pull consumer per worker, to be confirmed by G2 item 2. Item 1 left a known risk: nats.js 3.4.0 states no support for nats-server 2.15. Items 8, 12, 13, and 21 need measured broker behavior, not documentation, before they define the wire contracts, build the adapter, issue credentials, and reconcile executions.

## What Changes

- Add a test-only spike, `apps/control-plane/test/jetstream-spike.integration.test.ts` with its fixture, that runs against the pinned NATS container of item 9 and measures addressed per-worker durable pull consumers, explicit acknowledgement and redelivery, outstanding-acknowledgement and payload bounds, the deduplication window, per-worker subject permissions, retention limits, and poison-message quarantine.
- Add `@nats-io/transport-node`, `@nats-io/jetstream`, and `@nats-io/nats-core` 3.4.0 as exact-pinned development dependencies of `@taskelith/control-plane`, regenerate the dependency inventory, and update their register rows.
- Extend the shared `infra/services/nats-server.conf` with static per-worker users for the permission measurements and a `no_auth_user`, so that other integration tests keep connecting without credentials (coordinator decision, option A, 2026-10-25).
- Add `docs/g2-jetstream-spike.md` with the exact versions, the measured behavior, what was not measured, and the consequences for items 8, 12, 13, and 21.
- Add the `jetstream-transport-spike` capability.

## Capabilities

### New Capabilities
- `jetstream-transport-spike`: the measured JetStream behavior that the broker choice and D3 (a) depend on, and how it is recorded.

### Modified Capabilities

## Impact

Test code, test configuration, development dependencies, and documentation only; no product code and no change to the published `taskelith` package. Decentralized authentication with JWTs and NKeys (D9 a) is not measured and moves to item 13. Items 8, 12, 13, and 21 build on the findings.
