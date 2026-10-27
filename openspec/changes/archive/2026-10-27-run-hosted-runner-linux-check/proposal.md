## Why

ADR 0015 (`/docs/decisions/0015-g2-closure.md`, section 3 and its open items) keeps the GitHub-hosted `ubuntu-24.04` runner check for Linux x86_64 open under D11 (a) of the G2 plan: every matrix entry ran on a local host, so no hosted-runner workflow exists. The coordinator approved adding it as a non-blocking follow-up.

## What Changes

- A new workflow, `.github/workflows/linux-acceptance.yml`, that runs only on manual dispatch. Its one job, `linux-x86_64`, runs on `ubuntu-24.04` with `contents: read`, no secrets, and no `id-token`; it records the runner's environment, frees disk space, runs `make native-acceptance ENTRIES=linux`, and uploads `results.jsonl`, `run.log`, and the environment and disk records as an artifact kept for 90 days, even when a proof fails. A failed proof fails the run.
- `integration-flow`: "Promotion flow and releases" names the release workflow's triggers and allows a second workflow that runs only on manual dispatch.
- `native-worker-acceptance`: adds "Hosted-runner Linux x86_64 check".
- `docs/foundation.md` (line 11), `docs/releases.md`, and `docs/dependencies.md` name the new workflow and its `actions/upload-artifact` pin.

This change adds the workflow and its contracts only. The run happens after integration, because GitHub dispatches only workflows on the default branch; the follow-up change `record-hosted-runner-linux-acceptance` records its `results.jsonl` and `acceptance.md` and updates the hosted-runner rows of `docs/foundation.md` (lines 66 and 87), which this change does not touch.

## Capabilities

### New Capabilities

### Modified Capabilities

- `integration-flow`: modifies "Promotion flow and releases".
- `native-worker-acceptance`: adds "Hosted-runner Linux x86_64 check".

## Impact

CI configuration and documentation only: the new workflow, two spec deltas, and three documents. `.github/workflows/release.yml`, product code, and the published package are unchanged. No push or pull request starts the new workflow.
