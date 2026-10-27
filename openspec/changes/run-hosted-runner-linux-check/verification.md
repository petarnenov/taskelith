# Verification: run-hosted-runner-linux-check

## Scope and source

A worker task the coordinator (Niki) assigned on 2026-10-27 with an approved design, developed in a briefed subagent: the ADR 0015 follow-up "GitHub-hosted `ubuntu-24.04` runner check for Linux x86_64" under D11 (a) of the G2 plan (`/docs/decisions/0015-g2-closure.md:76` and `:142`). Scope: the dispatch-only workflow `.github/workflows/linux-acceptance.yml`, the `integration-flow` and `native-worker-acceptance` spec deltas, and the documents that list the workflows. Out of scope: running the workflow, `release.yml`, `scenario-worker-namespace-confinement`, and `docs/foundation.md` lines 66 and 87, which the follow-up change `record-hosted-runner-linux-acceptance` updates with the run's evidence. Design: [design.md](design.md).

## Revision

- Base: `origin/dev` `e8ce8a11`.
- Two commits on that base: the workflow (`ci: add the dispatch-only Linux acceptance workflow`) and the change records, spec deltas, and documents (`docs: record the run-hosted-runner-linux-check change`); `make verify` ran on their combined working tree.

## Environment

Linux 7.0.0-38-generic, x86_64; Node.js through `nvm use` from `.nvmrc`. This host has an empty `/tmp/.git` that breaks tests whose temporary directories sit under `/tmp`, so every `make verify` ran with `TMPDIR=/home/petar/.cache/taskelith-verify-tmp`.

## Author self-check

- `.github/workflows/linux-acceptance.yml`: `on: workflow_dispatch` only; top-level `permissions: contents: read`; `concurrency` group `linux-acceptance-${{ github.ref }}` with `cancel-in-progress: false`; one job `linux-x86_64` on `ubuntu-24.04` with `timeout-minutes: 60`; no job permissions, secrets, or `id-token`. Checkout and setup-node use the full SHAs of `release.yml`, checkout with `persist-credentials: false`; the npm install and `npm ci` lines are those of `release.yml`. The environment step writes `environment.txt`; the cleanup step writes `disk-before.txt` and `disk-after.txt`; the acceptance step runs `make native-acceptance ENTRIES=linux RESULTS="$RUNNER_TEMP/acceptance/results.jsonl"` under `set -o pipefail` into `run.log`; the upload step runs with `if: always()`, `if-no-files-found: error`, and `retention-days: 90`.
- Variable names: `Makefile:205-208` requires `RESULTS` and passes `ENTRIES` to `scripts/native-acceptance.sh`, which exits 1 at the end when any proof failed (its `main`); with `pipefail` that status fails the step.
- npm pin readers: `Makefile:3`, `scripts/collect-toolchain-metadata.ts:5`, and `scripts/inventory-dependencies.ts:11` read `.github/workflows/release.yml` only; the new file does not change their input. `INVENTORY_INPUTS` (`scripts/inventory-provenance.ts:12-15`) lists no workflow, so the dependency inventory stays current.
- `actions/upload-artifact` pin: `gh api repos/actions/upload-artifact/git/ref/tags/v7.0.2` gave commit `cf430e030ddbb5b0abf93d22962f4752f3646cd9`, and its release was published 2026-10-07T10:08:14Z, 20 days before 2026-10-27, so the two-week age rule holds.
- Spec deltas: `integration-flow` MODIFIED "Promotion flow and releases" (body 408 characters; both existing scenarios kept, scenario "Linux acceptance workflow" added); `native-worker-acceptance` ADDED "Hosted-runner Linux x86_64 check" (body 342 characters, two scenarios).
- Documents: `docs/foundation.md:11`, `docs/releases.md:7`, and `docs/dependencies.md:41` name the new workflow; the line 11 edit keeps lines 66 and 87 where they were. A search of `docs/`, `openspec/specs/`, `README.md`, and `AGENTS.md` for statements about the repository's workflows also found `docs/releases.md:64` and `:69` (the npm trusted publisher names `release.yml`, still true) and `docs/decisions/0015-g2-closure.md:76` and `:142` (no hosted-runner workflow was added in G2; an accepted record, left unchanged; the follow-up updates the living status in `docs/foundation.md`).
- Plan checklist: [design.md](design.md), section "Plan checklist".

## Checks and results

- Workflow parse: `yaml` 2.9.1 from the lockfile, `parse(..., { strict: true, uniqueKeys: true })`: valid; `on` is `{"workflow_dispatch":null}`, `permissions` `{"contents":"read"}`, one job `linux-x86_64` on `ubuntu-24.04`, steps checkout, setup-node, npm install, `npm ci`, "Record the environment", "Free disk space", "Run the native acceptance Linux entry", upload-artifact. `actionlint` is not installed on this host and was not run.
- `npm run verify:comments`: every comment is within the comment length rule.
- `make findings ARGS="checklist --capability native-worker-acceptance,integration-flow,dependency-register --files .github/**,docs/**"`: identical to the brief's checklist.
- `npm run openspec -- validate run-hosted-runner-linux-check --strict`: `Change 'run-hosted-runner-linux-check' is valid`.
- `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify` on the working tree of the change commit: passed (exit 0); tests 2193, pass 2146, fail 0, skipped 47; all files 99.24% lines, 92.19% branches, 98.92% functions; OpenSpec `Totals: 70 passed, 0 failed (70 items)`; every active change archives into strictly valid specs; findings 30 files and pass summaries 10 files valid.

## Independent review

Not yet run. Reviewer A: OpenCode `opencode-go/deepseek-v4-pro#high` (passes 1 and 3); reviewer B: Claude Code `claude-opus-5-5`, effort high (pass 2). `findings.jsonl` and `passes.jsonl` are empty.

## Limitations

- The workflow has not run. GitHub dispatches only workflows on the default branch, so its first run follows integration into `dev`; its evidence comes in the follow-up change `record-hosted-runner-linux-acceptance`, which also updates `docs/foundation.md` lines 66 and 87.
- Whether 60 minutes and the freed disk space suffice on a hosted runner is unproven until that run.
- Nothing checks that this workflow's npm pin matches `release.yml` (design decision 10).

## Remaining gates

- Review pass 1 by reviewer A (OpenCode `opencode-go/deepseek-v4-pro#high`).
- Review pass 2 by reviewer B (Claude Code `claude-opus-5-5`, effort high).
- Review pass 3 by reviewer A.
- Archive of the change (worker step 7).
- Integration into dev by the coordinator (single pull request).
- Manual dispatch of the workflow on `dev` and the follow-up change `record-hosted-runner-linux-acceptance`.
