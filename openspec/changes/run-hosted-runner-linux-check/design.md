## Context

ADR 0015 (`/docs/decisions/0015-g2-closure.md:76` and `:142`) keeps the GitHub-hosted `ubuntu-24.04` runner check for Linux x86_64 open under D11 (a) of the G2 plan (`/docs/g2-plan.md:90`), as a non-blocking follow-up owned by the coordinator. The coordinator (Niki) approved this design on 2026-10-27. `make native-acceptance` (`Makefile:205-208`, `scripts/native-acceptance.sh`) already runs the Linux entry on any Linux Docker host; only a workflow that runs it on a hosted runner is missing.

## Decisions

1. **Dispatch only.** The workflow has `on: workflow_dispatch` and no other trigger. A run takes up to an hour, builds the worker and test images, and starts several Compose projects; it is evidence for an acceptance row, not a gate on every change, so pushes and pull requests to `dev` keep running no workflow (`integration-flow`, "Promotion flow and releases"), and promotions to `main` do not wait for it. GitHub dispatches only workflows on the default branch, so the first run is possible only after integration.
2. **`ubuntu-24.04`, not `ubuntu-latest`.** The matrix entry is `linux-ubuntu-24.04-x86_64`; `ubuntu-latest` moves to a newer release without a change here, and the run would then prove a different entry. `release.yml` keeps `ubuntu-latest`; it is unchanged.
3. **Two steps for the evidence.** This change adds the workflow and its contracts; the follow-up change `record-hosted-runner-linux-acceptance` dispatches it after integration, records `results.jsonl` and `acceptance.md` from the artifact, and updates `docs/foundation.md` lines 66 and 87. This change leaves those lines alone, because nothing has run yet.
4. **Free disk space first.** The run builds the worker image and the Linux test image and starts PostgreSQL and NATS, and a hosted runner's root file system starts largely filled with preinstalled toolchains. The step removes the preinstalled .NET, Android, and GHC toolchains (`/usr/share/dotnet`, `/usr/local/lib/android`, `/opt/ghc`), which no step uses, and records `df -h /` before and after.
5. **A record of the runner.** One step writes `uname -a`, `docker version`, `docker info`, `docker compose version`, the cgroup file system type (`stat -fc %T /sys/fs/cgroup`), and `df -h /` to `environment.txt`, which the artifact carries with `disk-before.txt`, `disk-after.txt`, `results.jsonl`, and `run.log`, so the follow-up can describe the host without the job log, which GitHub keeps for less time.
6. **A failed proof fails the run.** `native-acceptance.sh` runs every proof and exits 1 when any failed ("Every proof runs"); the step pipes `make` into `tee` under `set -o pipefail`, so that status fails the step. The upload step runs with `if: always() && steps.environment.outcome != 'skipped'`, so a failure before the evidence directory exists adds no second, empty-upload failure, and with `if-no-files-found: error`, and keeps the artifact for 90 days.
7. **No extra scenario.** The workflow runs the Linux entry as it is; it does not add `scenario-worker-namespace-confinement` or any other proof, so the run proves the same rows as a local Linux host.
8. **Least privilege.** Top-level `permissions: contents: read`; no job-level permissions, no secrets, no `id-token`; `actions/checkout` with `persist-credentials: false`. `concurrency` groups runs per ref without cancelling a running one.
9. **Pins.** `actions/checkout` `d23441a48e516b6c34aea4fa41551a30e30af803` and `actions/setup-node` `249970729cb0ef3589644e2896645e5dc5ba9c38` are the full SHAs of `release.yml`, with the same `node-version-file: .nvmrc`, `package-manager-cache: false`, `npm install --global npm@12.2.1 --ignore-scripts`, and `npm ci --ignore-scripts`. `actions/upload-artifact` is v7.0.2, `cf430e030ddbb5b0abf93d22962f4752f3646cd9`, published 2026-10-07T10:08:14Z, 20 days before this change; the tag and its date were read from the GitHub API on 2026-10-27.
10. **The npm pin readers.** `Makefile:3` (`NPM_PIN`), `scripts/collect-toolchain-metadata.ts:5`, and `scripts/inventory-dependencies.ts:11` read the npm pin from `.github/workflows/release.yml` only, and the latter two require exactly two matching pins there. A second workflow does not change what they read. Nothing checks that this workflow's npm pin matches; a change of the CI npm pin must update both files.

## Plan checklist

The coordinator's brief gave the checklist of `make findings ARGS="checklist --capability native-worker-acceptance,integration-flow,dependency-register --files .github/**,docs/**"`; the same command on this branch prints the same text. Verbatim:

```text
Review checklist (capabilities native-worker-acceptance, integration-flow, dependency-register; files .github/**, docs/**), most frequent finding categories first:
1. docs (10): Documentation is missing, wrong, or out of date with the change. Example: "The claim that no later task fits unless capacity frees ignores a new candidate, renewed eligibility, cleared admission pressure, or lifted quarantine between transactions"
2. contract-drift (6): Code, a contract document, and its specification disagree. Example: "The native worker volume still named its Linux file system with stat -f alone, so ext4 read ext2/ext3"
3. process (4): A protocol, governance, or review rule was not followed. Example: "The Linux cancellation and connectivity rows pointed to 24c, whose records come from the test-side process-group launch host on Linux x64, with no deferral"
4. evidence-mismatch (2): A recorded result, count, or claim differs from what the checks show. Example: "The platforms document and the table summary said every row keeps an open part, though three rows are met for their G2 part"
5. missing-fail-before-test (2): A fix has no test that fails before it and passes after it. Example: "No test covered a failed proof together with a not-applicable one in the run's last line"
6. redaction (1): A secret or private value can leak into output, logs, or records. Example: "The text pattern allows C1 controls and Unicode line separators"
7. stale-citation (1): A cited file line, commit, or record no longer matches its target. Example: "ADR 0015 still cites the removed in-memory cursor field of the placement service"

Record quality (archived findings under openspec/changes/), most frequent finding categories first:
1. docs (28): Documentation is missing, wrong, or out of date with the change. Example: "The record groups the #settle comment with comments that said a pass stops only when the store fails, though it was about waits"
2. evidence-mismatch (28): A recorded result, count, or claim differs from what the checks show. Example: "The record gave the spec delta body as 477 characters, one more than its length"
3. stale-citation (15): A cited file line, commit, or record no longer matches its target. Example: "The plan checklist named a capability that does not exist and a docs glob that matches no file"
4. spec-wording (14): A requirement or scenario is ambiguous, untestable, or inaccurate. Example: "Scenario Capacity freed during a pass expects the next pass to place the declined task, which fails when earlier offers were own declines and one placement, leaving the cursor before a later project"
5. contract-drift (6): Code, a contract document, and its specification disagree. Example: "The proposal and verification record said the index and checklist commands were unchanged, although they now refuse invalid pass summaries"
6. process (3): A protocol, governance, or review rule was not followed. Example: "Task 4.2 is unticked although review pass 1 is recorded"
```

How this change meets it:

- docs: `docs/foundation.md:11`, `docs/releases.md:7`, and `docs/dependencies.md:41` name the new workflow; the other statements found about workflows are listed in `verification.md`.
- contract-drift: the workflow, both spec deltas, and the docs name the same trigger, runner, permissions, pins, and artifact files.
- process: the change follows worker steps 2 to 4 and 6 of `/docs/agent-task-protocol.md`; no review, push, or archive is claimed.
- evidence-mismatch: `verification.md` claims no run of the workflow; every count and line is checked against the tree.
- missing-fail-before-test: the change adds no product or script code; the failure path relies on the tested "Every proof runs" behaviour and `pipefail`, and the follow-up run is its evidence.
- redaction: the job has no secrets and no token beyond the read-only `GITHUB_TOKEN`, which checkout does not persist.
- stale-citation: cited lines are checked on this branch.

## Risks

- The run may exceed 60 minutes or the runner's disk; the follow-up change then adjusts the timeout or the cleanup.
- The npm pin of this workflow can drift from `release.yml` unnoticed (decision 10).
