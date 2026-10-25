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
- `make verify` at `d6d119f`, before pass 1, passed (868 passed, 0 failed, 15 skipped).

## Independent review

Reviewer: Codex (`gpt-6.1-sol`), reasoning effort medium, read-only sandbox, as assigned by the coordinator, run from the worktree as `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, with the prompt and log outside the worktree.

- **Pass 1 — session `01a17384-0762-7711-b0fd-6ec5835ecf6e`, head `d6d119f`.** The header confirmed the model, reasoning effort medium, and the read-only sandbox; the snapshot (`git ls-files -co --exclude-standard | xargs shasum -a 256 | shasum -a 256`) was `8c0fc833…159f` before and after the pass. The reviewer confirmed F1's mechanism against the wrapper and nvm's `nvm_change_path`, that F2's cause is stated as a hypothesis, that the links resolve, that `skip_specs` is justified, and that nothing claims native acceptance. Findings: 0 Critical, 0 High, 1 Medium, 4 Low. All accepted and resolved (unreviewed until pass 2):
  1. Medium: the failures of the first `make doctor` and `make setup` were summarized without their output. F1 now quotes the first setup's output, the doctor exit, and the `make verify` toolchain failure under the host's own `PATH`, which was run again for this.
  2. Low: F1 said the npm check names `make setup`; it says "Fix the Node.js check first". F1 now quotes both remedies.
  3. Low: F2 described the asserted value as the p99. It now states that `event-loop.lag` is the p99 minus the 10 ms resolution.
  4. Low: the proposal said earlier runs were on macOS arm64; they were on macOS, x86_64 included. It now says macOS.
  5. Low: the design said the host setup stayed unchanged, although `make setup` installs Node.js and npm and sets the nvm default. It now says that only the `PATH` workaround is temporary.

## Limitations

- One host and one revision; Linux arm64 and the worker image were not observed.
- F2's flake rate is from five full runs and ten isolated runs only.

## Remaining gates

- Fixes for F1 and F2, which the coordinator assigns separately.
- Coordinator integration into `dev` and archive.
