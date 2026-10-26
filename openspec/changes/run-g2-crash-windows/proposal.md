## Why

G2 work item 24, `run-g2-failure-scenarios` ([docs/g2-plan.md](../../../docs/g2-plan.md)), is G2 exit evidence for R05 to R08 and R27 of [docs/architecture.md](../../../docs/architecture.md). The coordinator split it in three; this change is 24b: a crash at each process-launch window, followed by a restart and recovery, and duplicate delivery of an offer, run through the harness with recorded results. 24a (`run-g2-failure-scenarios-composition`) adds the results recorder and the Compose scenarios; 24c (`run-g2-partition-and-races`) runs partition and reconnect, cancellation races, and stale generations.

## What Changes

- **Harness composition.** A test-side composition of the real control plane, in the test process, and the real worker, as a child process with the production dependencies, against the `make` services (PostgreSQL and NATS). Each scenario gets its own database, data roots, broker account, and control plane. Product code is unchanged and gains no crash seam.
- **Crash points, test-side.** The worker journal's existing commit-point hook arms W1 to W6, through a module resolution hook in the worker process; a wrapper of the supervision port arms CP1 to CP4, CP10, and CP12; the launch supervisor is the real supervisor program with its existing crash-point option, armed for CP5 to CP9 and CP11. An armed point kills its process with `SIGKILL`.
- **Crash window scenarios.** For each window W1 to W6 (each before and after its commit) and CP1 to CP12: crash, restart, and check that the control plane and the worker journal hold exactly one execution beyond `not-started`, with the outcome the recovery tables assign, that the scripted child spawned at most once, and that no process of the scenario is left.
- **Duplicate delivery.** The offer the control plane published is published again, while the child runs and after its result, and the scenario checks one launch intent, one execution, one spawn, and one result.
- **Records.** Each scenario records its result through the recorder of 24a with target `harness-composition`; this change directory carries `results.jsonl`.

## Capabilities

### New Capabilities

- `g2-failure-scenarios`: the crash window and duplicate delivery scenarios of item 24b, beside the scenarios of 24a.

### Modified Capabilities

None.

## Impact

Tests of `apps/control-plane` only: a scenario file, its composition helpers, and fixtures for the worker and supervisor processes; `@taskelith/worker-journal` and `@taskelith/worker-supervisor` become development dependencies of `apps/control-plane`, and the dependency inventory follows. No product code, contract, OpenAPI, AsyncAPI, JSON schema, Compose file, or third-party dependency changes. The commits use `test`, `chore`, or `docs`.
