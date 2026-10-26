## Why

Two small follow-ups were assigned together. First, the [unrecorded-process scan](../archive/2026-10-26-implement-unrecorded-process-scan/design.md) records as a risk that the worker's own home cgroup is not excluded: if it lies under the containment parent, the scan could report the worker itself as `execution.unrecorded-process`. Second, `abortableDelay` in `packages/adapters/nats` waits for its timer even when the signal has already aborted, so a stop requested during a publication round waits a full idle poll (1 s) before the loop ends.

## What Changes

- **Home cgroup exclusion (stopped at the gate, no code).** The task allowed code only if `docs/contracts/supervisor-identity.md` states how the home cgroup is kept out of the scan. It does not: it neither forbids the home under the containment parent nor says the scan skips it (design D1). The gap goes to the owner with options; nothing changes for it here.
- **Prompt broker stop.** `abortableDelay` resolves at once when its signal has already aborted, as it does when the signal aborts during the wait. A unit test proves that a stop during an idle publication round ends `runPublicationLoop` without the pause.

No contract, schema, wire message, or requirement changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `skip_specs: true`: no requirement of `nats-transport` states how fast a loop stops, and the fix only removes a needless wait, so no requirement needs to record it (design D2). Recording stop latency would add a requirement beyond what the specs require, which this task excludes.

## Impact

- `packages/adapters/nats/src/abortable-delay.ts`, used by the outbox publication loop, the validating consumers, and the quarantine redrive loop; a test in `packages/adapters/nats/test/transport.test.ts`.
- No change to `apps/worker`, `packages/adapters/worker-supervisor`, `docs/contracts`, AsyncAPI, or OpenAPI.
