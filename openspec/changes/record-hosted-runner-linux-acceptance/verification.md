# Verification: record-hosted-runner-linux-acceptance

## Scope and source

A worker task of size S that the coordinator assigned on 2026-10-27, developed in a briefed subagent ([subagent execution](/docs/agent-task-protocol.md#subagent-execution)): the follow-up that `run-hosted-runner-linux-check` named ([its design](/openspec/changes/archive/2026-10-27-run-hosted-runner-linux-check/design.md), decision 3). The coordinator's brief gave the run (GitHub Actions run 40534340382 on `dev`) and the downloaded artifact; this change verified its facts against the artifact and the run metadata.

- **In scope:** the run's `results.jsonl`, [acceptance.md](acceptance.md), and the two hosted-runner rows of `docs/foundation.md` (the `linux-ubuntu-24.04-x86_64` row of the G2 native acceptance table and the deferred-item row "Hosted-runner Linux x86_64 check; multi-architecture `make verify-linux-cgroup`", whose multi-architecture part is unchanged).
- **Out of scope:** dispatching the workflow, other documents (listed under "Documents that still call the check open"), product code, and the workflow.
- **Specs:** `skip_specs: true`. The run is evidence under the existing `native-worker-acceptance` requirements "Acceptance table" and "Hosted-runner Linux x86_64 check" (scenario "Every proof passes"); neither needs a change.

## Revision

- Base: `origin/dev` at `b87abe75`. Branch `record-hosted-runner-linux-acceptance`.
- Tested revision of the run: `4fe094562e6ccb9e568dee91be24ff2c93108004`, the merge commit of #355 (`run-hosted-runner-linux-check`), parents `a00cbe3a` and `9aed75c5`. `git merge-base --is-ancestor 4fe09456 origin/dev` succeeds; it lies 10 first-parent commits before `b87abe75` on `origin/dev`, and `git diff --stat 4fe09456 b87abe75` outside `openspec/` and `docs/` changes 63 files, including code the run exercises (design decision 1).
- The checks below ran on the working tree of the second commit, which no longer marks process ownership met; they gave the same results as on the first commit.

## Environment

- Run facts: `gh` run metadata saved by the coordinator (`run.json`) and the artifact `linux-x86_64-acceptance` (`results.jsonl`, `environment.txt`, `disk-before.txt`, `disk-after.txt`, `run.log`), read as untrusted data; nothing from the artifact was executed.
- Local checks: Linux 6.8.0-147-generic, x86_64, Node.js through `nvm use` from `.nvmrc`, with `TMPDIR=/home/petar/.cache/taskelith-verify-tmp` for `make verify`.

## Author self-check and evidence check

- Run metadata: workflow "Linux acceptance", display title "Linux acceptance", event `workflow_dispatch`, branch `dev`, head `4fe094562e6ccb9e568dee91be24ff2c93108004`, conclusion `success`; job `linux-x86_64`, ID 122295371633, started 2026-10-27T15:46:44Z, completed 15:54:27Z (7 min 43 s), every step `success`. The artifact name and its 90-day retention are those of `.github/workflows/linux-acceptance.yml`.
- `results.jsonl`: `cmp` with the artifact's file reports no difference; SHA-256 `61acc8e503829e692279a60b9de1e5caa3cc08ae4c463671a5f46b7cf4acdb64`; 42 lines. A script that parses each line found: outcome `passed` on all 42; commit `4fe094562e6ccb9e568dee91be24ff2c93108004` on all; one seed, `3469395170`; host `Linux 6.17.0-1022-azure`, arch `x64`; acceptance entry `linux-ubuntu-24.04-x86_64` on all, with one platform value; rows process-ownership 32, journal-and-storage 3, connectivity 3, service-lifecycle 2, cancellation 2; targets `compose-installation`, `linux-test-container`, `harness-composition`; recorded from 15:51:10.667Z to 15:54:22.752Z.
- Proof counts in `acceptance.md` come from the records' `detail`: cgroup 14 of 14 (line 5), journal suites 99 tests, 97 passed, 2 skipped (line 6), cancellation cgroup 2 of 2 (line 9), cancellation suites 19 tests, 17 passed, 2 skipped (line 10), connectivity suites 25 of 25 (line 11), crash windows 28 of 28 (line 40; lines 12 to 39 are 28 windows, 25 ending `exited-code-0` with one spawn, CP8 and CP9 `exited-unknown` with one spawn, CP7 `exited-unknown` with none), duplicate delivery 1 of 1 (line 42; line 41: 1 copy during, 3 after). The skipped tests' names are in `run.log`.
- `environment.txt`: Ubuntu 24.04.5 LTS, kernel 6.17.0-1022-azure, x86_64, 4 CPUs, 15.61 GiB, Docker Engine - Community 28.0.4, Compose v2.38.2, containerd v2.4.1, runc 1.5.2, storage driver overlay2 on extfs, cgroup driver `systemd`, cgroup version 2, `stat -fc %T /sys/fs/cgroup` `cgroup2fs`, security options `apparmor`, `seccomp` (builtin), `cgroupns`. `disk-before.txt` and `disk-after.txt`: 86 GiB and 103 GiB available of 145 GiB. `run.log`: ten proof headers, one per proof, and the last line "native-acceptance.sh: every proof passed".
- Review checklist ([design.md](design.md), "Review checklist"):
  - evidence-mismatch: every number in `acceptance.md`, `docs/foundation.md`, and this record was checked against the files above; no row is reported beyond what its proofs show, and the worker-kill record's `exited` state is reported as it is.
  - docs: `docs/foundation.md` lines 66 and 87 now record the run; the other documents that still call the check open are listed below and are not edited.
  - stale-citation: cited commits (`4fe09456`, `b87abe75`, `a00cbe3a`, `9aed75c5`), the ADR 0015 decisions (3 at line 76, 5 at line 142), and the archived records were checked on this branch; `npm run verify:links` checks the links.
  - process: worker steps 2 to 4 and 6 of `/docs/agent-task-protocol.md`; no review, push, or archive is claimed. The 24c-dependent parts keep their G3 deferral of ADR 0015 decision 5 rather than pointing at 24c alone.
  - spec-wording: no spec delta; the existing requirements fit the run.
  - contract-drift, error-handling, missing-fail-before-test: the change has no code, workflow, or contract edits.
  - scope: only this change directory and the two named rows of `docs/foundation.md` change.
- Process ownership: every proof passed, crash windows 28 of 28 included, but it is not marked met, because the worker kill came after the task had exited (design decision 4); the limits of ADR 0015 decision 5 stay.

## Documents that still call the check open

Not edited here (design decision 6):

- `docs/decisions/0015-g2-closure.md:76` (decision 3: the Linux-host record keeps the check open) and `:142` (decision 5: the check, left open and non-blocking).
- `docs/g3-plan.md:75` (carried item "GitHub-hosted `ubuntu-24.04` runner check for Linux x86_64": "Non-blocking follow-up, left open; no gate").

`docs/foundation.md:11`, `docs/releases.md`, `docs/dependencies.md:41`, and `openspec/specs/native-worker-acceptance/spec.md:119` name the workflow without calling the check open.

## Checks and results

- `npm run openspec -- validate record-hosted-runner-linux-acceptance --strict`: `Change 'record-hosted-runner-linux-acceptance' is valid`.
- `TMPDIR=/home/petar/.cache/taskelith-verify-tmp make verify`: exit 0; `npm test` tests 2307, pass 2260, fail 0, skipped 47; all files 99.28 % lines, 92.33 % branches, 98.94 % functions; `Every comment is within the comment length rule.`; OpenSpec `Totals: 70 passed, 0 failed (70 items)`; `Every checked link conforms.`; `Every active OpenSpec change archives into strictly valid specs.`; findings 43 files and pass summaries 23 files valid. Only this record's results were added after the run.
- `make findings ARGS="checklist --capability native-worker-acceptance,foundation-closure --files docs/foundation.md"`: the text in [design.md](design.md), "Review checklist".

## Review

Not yet run. Assigned reviewers ([review process](/docs/governance.md#independent-review-process)):

- Pass 1, reviewer A: Codex CLI, `gpt-6.1-sol`. Not run.
- Pass 2, reviewer B: Claude Code, `claude-opus-5-5`, effort high. Not run.
- Pass 3, reviewer A: Codex CLI, `gpt-6.1-sol`, unless an earlier pass ends the review. Not run.

`findings.jsonl` and `passes.jsonl` are empty.

## Limitations

- One run on one GitHub-hosted `ubuntu-24.04` x86_64 runner; no arm64 entry, no macOS entry, and no other runner image.
- The evidence is of `4fe09456`; later `dev` commits change exercised code and are not covered (design decision 1).
- The crash windows ran as root in the privileged test image, not in the worker image; the worker kill came after the task had exited; namespace confinement and AppArmor were not exercised ([acceptance.md](acceptance.md), "What this run does not show").
- `run.log` and the environment files stay in the artifact, which GitHub deletes after 90 days; only `results.jsonl` is kept here.

## Remaining gates

- Independent review: pass 1 (reviewer A), pass 2 (reviewer B), and pass 3 (reviewer A) as the review process requires.
- Archive of the change after review.
- Integration into dev by the coordinator (single pull request).
