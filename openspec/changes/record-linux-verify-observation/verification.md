# Verification: record-linux-verify-observation

## Scope and source

Assigned by the coordinator (Niki) on 2026-10-25 to the worker Ziki: observe `make doctor`, `make setup`, `make verify`, and the opt-in `make verify-linux-cgroup` on Linux, record the results, and report failures without fixing product code. Base revision: `61e81f4` on `dev`. Scope: `docs/linux-verify-observation.md`, one line in `docs/foundation.md`, and this change. Prepared in the git worktree `../taskelith-worktrees/record-linux-verify-observation` on branch `record-linux-verify-observation`.

The change adds no requirement and changes no behavior; it records evidence. `.openspec.yaml` sets `skip_specs: true`.

## Environment

Ubuntu 24.04.5 LTS, Linux 6.8.0-147-generic, x86_64, cgroup v2; Docker Engine 27.3.1 and Compose v2.29.7; Node v24.22.1 and npm 12.2.1 through nvm, with `~/.nvm/versions/node/v24.22.1/bin` first in `PATH` for the runs after finding F1. The record gives the details.

## Author self-check before review

- Every number in the record comes from a run log kept outside the worktree: test counts, coverage, validation totals, and wall times.
- Both findings quote the observed output and name what was not established: F1's cause was reproduced with the wrapper script; F2's cause is stated as likely, and the measured lag was not recorded.
- The record claims no native acceptance and lists what was not observed.
- Evidence check: the change adds relative links to `worker-platforms.md`, ADR 0007, and the archived supervisor verification, and each target exists.

## Checks

- `npm run openspec -- validate record-linux-verify-observation --strict` passed.
- `make verify` at `10099f5`, the first commit of the record: four runs; run 1 failed one test (finding F2), runs 2 to 4 passed (868 passed, 0 failed, 15 skipped).

## Independent review

Reviewer: Codex (`gpt-6.1-sol`), reasoning effort medium, read-only sandbox, as assigned by the coordinator.

## Limitations

- One host and one revision; Linux arm64 and the worker image were not observed.
- F2's flake rate is from five full runs and ten isolated runs only.

## Remaining gates

- Fixes for F1 and F2, which the coordinator assigns separately.
- Coordinator integration into `dev` and archive.
