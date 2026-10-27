## Why

G2 work item 24, `run-g2-failure-scenarios` ([docs/g2-plan.md](/docs/g2-plan.md)), is the G2 exit evidence for R05 to R08 and R27 of [docs/architecture.md](/docs/architecture.md): from a fresh composition, an admitted task is submitted, assigned, executed, and its result persisted, and then the failure scenarios run through the harness, with recorded results. The coordinator split the item in three. 24a, this change, establishes the results recorder and the scenarios that run against the item 23 Docker Compose installation; 24b, `run-g2-crash-windows`, runs the process-launch crash windows; 24c, `run-g2-partition-and-races`, runs partition and reconnect, cancellation races, stale generations, and duplicate delivery. 24b and 24c adopt the recorder of this change.

## What Changes

- **Results recorder.** `@taskelith/testing` gains a small recorder API: a scenario reports its name, seed, target, outcome, and an optional detail; the recorder adds the rerun hint, host, architecture, commit, and the time, and appends the result as one JSON line to the file that `TASKELITH_SCENARIO_RESULTS` names. Without that variable it records nothing, so ordinary test runs leave the tree unchanged. The target is `harness-composition`, a test-side composition of the real modules against the `make` services, or `compose-installation`, the item 23 installation.
- **Fresh-composition happy path on arm64.** From a fresh Compose installation on an Apple Silicon host, submit an admitted task, have it assigned and executed, and check its persisted result.
- **Worker disk loss.** In the Compose installation, kill the worker while an attempt runs, delete its journal and check that the worker refuses to start, then delete its whole data root, revoke it, enrol a new worker, and check that the old execution stays `started` with uncertain evidence and that a new task runs on the new worker.
- **Untimed worker SIGKILL.** Send `SIGKILL` to the worker container at an untimed moment derived from the seed, restart it, and check that the reconciliation ends every execution or makes it uncertain, in agreement with the worker journal.
- **Records.** This change directory carries the recorded results in `results.jsonl`.

## Capabilities

### New Capabilities

- `g2-failure-scenarios`: the G2 failure scenarios, their targets, and their recorded results.

### Modified Capabilities

- `deterministic-test-harness`: adds scenario result records.

## Impact

The private package `@taskelith/testing` and its tests; the scenario steps in `scripts/installation-scenarios.sh`, sourced by `scripts/installation.sh`, and `scripts/installation-scenario.ts`, a parametrized `scripts/installation-smoke.ts`, the test-only `infra/installation/scenarios/`, the `make` targets `scenario-fresh-composition`, `scenario-worker-disk-loss`, and `scenario-worker-kill`, and `docs/local-installation.md`. No product code, published CLI command, OpenAPI, AsyncAPI, or JSON schema, or npm dependency changes; product code still cannot import the harness. The commits use `test`, `chore`, or `docs`.
