## Why

G2 work item 24, `run-g2-failure-scenarios` ([docs/g2-plan.md](../../../docs/g2-plan.md)), is the G2 exit evidence for R05 to R08 and R27 of [docs/architecture.md](../../../docs/architecture.md). The coordinator split it in three; this change is 24c, `run-g2-partition-and-races`: partition and reconnect through Toxiproxy, the cancellation races, and stale ownership generations and recovery epochs, each run through the harness with a recorded result. 24a, `run-g2-failure-scenarios-composition`, provides the results recorder that this change adopts; 24b, `run-g2-crash-windows`, runs the process-launch crash windows. The coordinator decided that duplicate delivery stays with 24b and is out of scope here.

## What Changes

- **Partition and reconnect.** Toxiproxy cuts the worker's broker connection and the control plane's PostgreSQL connection at seeded moments of an attempt: before the offer, during authorization, while the process runs, and beyond the observation redelivery budget. Each scenario checks that the attempt runs once and its facts are applied once after the heal.
- **Cancellation races.** A cancel before the worker receives the offer, during authorization before W4, after W4 through the cancel file, and during the admission-pressure wait; a crash between W1 and the ack of a cancellation with its redelivery; an invalidation racing a grant; and an unauthorized start that cancels only its execution. The adopting macOS supervisor that does not apply a cancel is recorded not applicable on Linux.
- **Stale generations.** With two workers and a seeded order of their authorization requests: a stale ownership generation after a supersession, and a stale recovery epoch after a test-side epoch advance.
- **Test-side composition.** The scenarios compose the real modules: the control plane by `startControlPlane`, each worker by the product's `startWorker`, with a test-side process-group launch host on Linux without a delegated cgroup. Cancellations are the scheduling module's capacity operations committed in a test transaction, since there is no operator cancel API. A crash point exists only in a test-side transport wrapper.
- **Records.** Each scenario records its result with the 24a recorder and target `harness-composition`; this change directory carries `results.jsonl`. Scenarios that fail because of product code are kept as expected failures B1 to B4, with evidence in `verification.md`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `g2-failure-scenarios` (added by 24a): adds the partition, cancellation race, and stale generation scenarios.

## Impact

Test files under `test/` only: three scenario files and their helpers under `test/g2-scenarios/`. No product code, published CLI command, OpenAPI, AsyncAPI, or JSON schema, Compose file, or npm dependency changes. The commits use `test` or `docs`.
