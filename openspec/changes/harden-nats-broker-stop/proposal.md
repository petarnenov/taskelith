## Why

`abortableDelay` in `packages/adapters/nats` waits for its timer even when the signal has already aborted, so a stop requested during a publication round waits a full idle poll (1 s) before the loop ends.

This change was first assigned together with excluding the worker's home cgroup from the unrecorded-process scan. Under away run `20261026T130340Z-opencode-33653`, the coordinator, as the owner's delegate, chose option A (a self-check refusal) for that item and moved it to its own change, `harden-worker-linux-self-check-home-layout`.

## What Changes

- **Prompt broker stop.** `abortableDelay` resolves at once when its signal has already aborted, as it does when the signal aborts during the wait. A unit test proves that a stop during an idle publication round ends `runPublicationLoop` without the pause.

No contract, schema, wire message, or requirement changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `skip_specs: true`: no requirement of `nats-transport` states how fast a loop stops, and the fix only removes a needless wait, so no requirement needs to record it (design D1). Recording stop latency would add a requirement beyond what the specs require, which this task excludes.

## Impact

- `packages/adapters/nats/src/abortable-delay.ts`, used by the outbox publication loop, the validating consumers, and the quarantine capture loop; a test in `packages/adapters/nats/test/transport.test.ts`.
- No change to `apps/worker`, `packages/adapters/worker-supervisor`, `docs/contracts`, AsyncAPI, or OpenAPI.
