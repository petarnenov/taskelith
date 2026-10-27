## Why

ADR 0015 ([decision 5](/docs/decisions/0015-g2-closure.md)) left the GitHub-hosted `ubuntu-24.04` runner check for Linux x86_64 open under D11 (a) of the [G2 work plan](/docs/g2-plan.md) as a non-blocking follow-up owned by the coordinator. `run-hosted-runner-linux-check` (#355) added the dispatch-only workflow `.github/workflows/linux-acceptance.yml` and named this change as the follow-up that records the run and updates the hosted-runner rows of [docs/foundation.md](/docs/foundation.md). The coordinator dispatched the workflow on `dev` on 2026-10-27 (run 40534340382), and it succeeded.

## What Changes

- **Evidence.** This change directory carries the run's `results.jsonl`, copied byte for byte from the artifact `linux-x86_64-acceptance`, and `acceptance.md`, the acceptance table of the `linux-ubuntu-24.04-x86_64` entry on the hosted runner, with the run, the environment, every row, and what the run does not show.
- **Status.** `docs/foundation.md` records the hosted-runner Linux x86_64 check as resolved: the `linux-ubuntu-24.04-x86_64` row of the G2 native acceptance table and the deferred-item row "Hosted-runner Linux x86_64 check; multi-architecture `make verify-linux-cgroup`", whose multi-architecture part stays as it is.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The change is documentation-only evidence under the existing `native-worker-acceptance` requirements "Acceptance table" and "Hosted-runner Linux x86_64 check", and has no spec delta.

## Impact

This change directory and `docs/foundation.md`. No product code, workflow, runner, test, script, `make` target, contract, schema, Compose file, or npm dependency changes. No runtime impact. The accepted ADR 0015 and the G3 plan, which still call the check open, are not edited here; `verification.md` lists them. The commits use `docs`.
