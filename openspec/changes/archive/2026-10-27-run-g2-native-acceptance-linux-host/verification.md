# Verification: run-g2-native-acceptance-linux-host (25, native Linux host)

Date: 2026-10-27. The author's verification, the evidence, and the independent review are recorded below.

## Scope and source

G2 work item 25, the Linux entry on a native Linux host, `run-g2-native-acceptance-linux-host`, assigned by the coordinating session (Niki) in its brief of 2026-10-27 and developed in a briefed subagent ([subagent execution](../../../docs/agent-task-protocol.md#subagent-execution)). Sources: [docs/g2-plan.md](../../../docs/g2-plan.md) item 25 and D11; [docs/worker-platforms.md](../../../docs/worker-platforms.md#native-acceptance-gates) "Native acceptance gates"; the archives of 25a ([harden-worker-container-seccomp](../archive/2026-10-26-harden-worker-container-seccomp/design.md)), 25b ([run-g2-native-acceptance-arm64](../archive/2026-10-26-run-g2-native-acceptance-arm64/design.md)), and 24b ([run-g2-crash-windows](../archive/2026-10-26-run-g2-crash-windows/design.md), decision 8).

- **In scope:** the eight Linux proofs of `make native-acceptance`, `make scenario-worker-namespace-confinement` on `x86_64`, `results.jsonl`, and the acceptance table ([acceptance.md](acceptance.md)).
- **Out of scope:** product, runner, and test code; the macOS x86_64 entry (25c); the GitHub-hosted `ubuntu-24.04` runner check for Linux x86_64 that the coordinator's brief of 2026-10-27 keeps open; fixes of any defect found.

## Revision and environment

- Base: the branch was created from `dev` at `0d317f8`, which the first `make verify` runs below used; `origin/dev` at `656a34d` was then merged in with a merge commit, `4a2b45a`, without conflicts, and the host gate, the dry run, and the first validation ran on the tree of `4a2b45a`. When `report-all-unconfirmed-sealed-executions` landed (#325), `origin/dev` at `fe64386` was merged in with a merge commit, `4880193`, without conflicts, and the empty `findings.jsonl` was added in `9a5ef14`. The second host gate, `make verify`, the evidence run, and the namespace-confinement scenario ran on `9a5ef14`, which every `results.jsonl` line names as its `commit`. At `9a5ef14` the change's documents were tracked and `results.jsonl` did not exist; the runs created it untracked. The later commits add `results.jsonl` and edit only this change's tracked records, so the runtime evidence stays fresh. Branch `run-g2-native-acceptance-linux-host`. Neither merge changed the dependency inventory (`make dependency-inventory` left the tree clean).
- Host: native Ubuntu 26.04.1 LTS, `x86_64`, kernel 7.0.0-38-generic, cgroup v2; Node.js 24.22.1 from `.nvmrc` via `nvm use`.
- Engine: Docker Engine - Community 29.8.2 (not Docker Desktop), Docker Compose 5.6.0, storage driver overlayfs, cgroup version 2, Docker root `/var/lib/docker`; security options AppArmor (profile `default`), seccomp (profile `builtin`), and cgroupns. Worker and test images: the digest-pinned Ubuntu 24.04 base (`Makefile:11`), which reports Ubuntu 24.04.5 LTS.
- Docker disk headroom: the root file system that holds `/var/lib/docker` is 467 GiB with 163 GiB free (64 % used), on `4a2b45a` and again on `9a5ef14`; `docker system df` shows 26.73 GB of images, 24.75 GB of local volumes, and 5.0 GB of build cache. Nothing was pruned.
- `/tmp`: a 31 GiB `tmpfs` with `usrquota`, 85 % full with other projects' caches at the first `make verify`, and 42 % full (18 GiB free) at the host gates on `4a2b45a` and `9a5ef14`; every run sets `TMPDIR=/home/petar/.cache/taskelith-tmp`, on disk (design decision 6). Other projects' files were not deleted.

## Author self-check and evidence check

- **AGENTS.md.** The records are in English. The change is evidence only: `git diff origin/dev --stat` lists only files under `openspec/changes/run-g2-native-acceptance-linux-host/`, with no product, runner, test, script, `make`, contract, Compose, document, or dependency change. The commits use `docs` and `test`, with no attribution. Nothing was pushed or published.
- **Comment rule.** No comment-bearing file changed; `npm run verify:comments` passes.
- **ADR 0004.** Every proof ran through a `make` target (`native-acceptance`, `scenario-worker-namespace-confinement`) in Docker containers of the pinned base. The change is bound to OpenSpec. `make verify` keeps coverage above 75 % (lines 99.19 %, branches 91.88 %, functions 98.80 %). No code, port, adapter, plugin, or OpenAPI contract changed.
- **Docker hygiene.** Each composed scenario removed its own Compose project (`taskelith-3913158916-installation-scenario`, "removed" in lines 2, 4, and 8 and in the namespace-confinement run). After the runs no `taskelith` container or volume of this worktree was left. No image, volume, or build cache was pruned, and no other project's container, volume, or file was touched.
- **Evidence check.** `results.jsonl` has 12 lines. Lines 1 to 11 are the runner's: every `acceptance-*` line carries an `acceptance` field with entry `linux-ubuntu-24.04-x86_64`, its row, command, and platform; the scenario lines that the proofs write themselves (1, 3, 7) carry it through `TASKELITH_ACCEPTANCE`. Line 12 is the namespace-confinement scenario, run directly as task 3.3, so it has no `acceptance` field. Every line names commit `9a5ef14`, host "Linux 7.0.0-38-generic", and `x64`. No line holds a token, credential, or local state beyond the worker image digests and execution identifiers.
- **OpenSpec validation and links.** `npm run openspec -- validate run-g2-native-acceptance-linux-host --strict` and `make findings ARGS="validate"` pass. The relative links of `proposal.md`, `design.md`, `verification.md`, and `acceptance.md` resolve to existing files and headings.

## Checks and results

| Check | Result |
| --- | --- |
| `make setup` | Passed |
| `make verify` on `dev` `0d317f8`, first run | Failed with "Unknown system error -122" (`EDQUOT`) while writing Node.js coverage to `/tmp`; a host condition (design decision 6), not a defect |
| `make verify` on `dev` `0d317f8` with `TMPDIR` on disk | Exit 0: tests 1952, pass 1908, fail 0, skipped 44, cancelled 0; coverage of all files: lines 99.18 %, branches 91.82 %, functions 98.79 %; the packed allowlist and the installed CLI verification passed |
| `npm ci --ignore-scripts` and `make dependency-inventory` on `4a2b45a` | Passed; the inventory was unchanged (731 package paths) |
| `make verify` on `4a2b45a` with `TMPDIR` on disk | Exit 0: tests 1973, suites 39, pass 1929, fail 0, skipped 44, cancelled 0, todo 0; coverage of all files: lines 99.18 %, branches 91.85 %, functions 98.80 %; `openspec validate --all --strict` 70 of 70, the archive dry run, and the packed allowlist and installed CLI verification passed |
| `npm run build` on `4a2b45a` | Exit 0 |
| Dry run of the Linux entry on `4a2b45a` | Passed, with no proof run and no record written. The runner has no dry-run mode, so the dry run is: `make -n native-acceptance RESULTS=… ENTRIES=linux`, which expands to `scripts/native-acceptance.sh` with the pins, `LINUX_TEST_IMAGE=taskelith-linux-cgroup:test`, and `SERVICES=taskelith-3913158916-acceptance`; `make linux-test-image` (exit 0); the runner's `platform linux`, `context`, and `seed` commands (exit 0); and `linux_entry` with `prove` replaced by a printer in a sourcing shell, which lists the eight proofs. The platform record is entry `linux-ubuntu-24.04-x86_64`, os "Ubuntu 24.04.5 LTS in containers of the pinned base on Ubuntu 26.04.1 LTS", architecture `x86_64`, kernel "Linux 7.0.0-38-generic", file system "ext2/ext3 on Docker volumes (…), storage driver overlayfs" (`stat -f` names the ext4 magic `ext2/ext3`), node `v24.22.1`, docker "Docker Engine - Community 29.8.2; Docker Compose 5.6.0" |
| `make scenario-worker-namespace-confinement` on `x86_64`, before `fe64386` | Held, not run: its inputs overlapped the then-open change `report-all-unconfirmed-sealed-executions` (see "Dependency check for the namespace-confinement scenario") |
| `npm ci --ignore-scripts` and `make dependency-inventory` on `4880193` | Passed; the inventory was unchanged (731 package paths) |
| `make findings ARGS="validate"` on `9a5ef14` | Passed: "Every findings file is valid: 3 file(s)." |
| `make verify` on `9a5ef14` with `TMPDIR` on disk | Exit 0: tests 2017, suites 39, pass 1971, fail 0, cancelled 0, skipped 46, todo 0; coverage of all files: lines 99.19 %, branches 91.88 %, functions 98.80 %; the comment rule, findings validation (3 files), `openspec validate --all --strict` 70 of 70, the archive dry run, and the packed allowlist and installed CLI verification passed |
| `npm run build` on `9a5ef14` | Exit 0 |
| Evidence run on `9a5ef14`: `make native-acceptance ENTRIES=linux RESULTS=openspec/changes/run-g2-native-acceptance-linux-host/results.jsonl` | Exit 0, 2026-10-27 05:28:43Z to 05:32:36Z UTC, seed `1140438646`: "every proof passed"; all eight proofs passed, lines 1 to 11 of [results.jsonl](results.jsonl), per row in [acceptance.md](acceptance.md) |
| `make scenario-worker-namespace-confinement` on `9a5ef14`, with `TASKELITH_SCENARIO_RESULTS` set to this change's `results.jsonl` | Exit 0, 2026-10-27 05:32:55Z to 05:33:36Z UTC, seed `2677284533`: "refused the execution account's namespaces, ran a task, removed"; applied seccomp profile sha256 `4c5d107d…aed1`, equal to `infra/installation/seccomp/worker.json`; the execution ran as uid 10003 with `CapEff: 0000000000000000`, `NoNewPrivs: 1`, `Seccomp: 2`; `unshare -U`, `unshare -Urm` with a tmpfs mount, `clone` with `CLONE_NEWUSER`, and `setns` were refused with EPERM, `clone3` answered ENOSYS; line 12 |
| `npm run openspec -- validate run-g2-native-acceptance-linux-host --strict` on the final records | Passed: "Change 'run-g2-native-acceptance-linux-host' is valid" |
| `npm run verify:comments` on the final records | Passed: "Every comment is within the comment length rule." |
| `make verify` after the pass 1 fixes, on the tree of `63be2c3` with this record and the `findings.jsonl` lines of the next commit | Exit 0: tests 2017, suites 39, pass 1971, fail 0, cancelled 0, skipped 46, todo 0; coverage of all files: lines 99.19 %, branches 91.86 %, functions 98.80 %; the comment rule, findings validation (3 files), `openspec validate --all --strict` 70 of 70, the archive dry run, and the packed allowlist and installed CLI verification passed |
| `make findings ARGS="validate"`, `validate run-g2-native-acceptance-linux-host --strict`, and `verify:comments` after the pass 1 fixes | Passed: "Every findings file is valid: 3 file(s).", "Change 'run-g2-native-acceptance-linux-host' is valid", "Every comment is within the comment length rule." |
| `npm run openspec -- validate run-g2-native-acceptance-linux-host --strict` on `4a2b45a` | Passed: "Change 'run-g2-native-acceptance-linux-host' is valid" (`skip_specs`, zero deltas) |

## Archive checks

These checks ran on the tree of the archive commit: the working tree after `npm run openspec -- archive run-g2-native-acceptance-linux-host --yes`, which moved the change to `openspec/changes/archive/2026-10-27-run-g2-native-acceptance-linux-host/` with every task done.

- `npm run openspec -- validate --all --strict`: "Totals: 69 passed, 0 failed (69 items)".
- `npm run openspec -- validate --archived --no-interactive`: this change's line is "✓ change/2026-10-27-run-g2-native-acceptance-linux-host".
- `git diff "$(git merge-base HEAD origin/dev)" -- openspec/specs` is empty, as the change has no spec delta (`skip_specs`).
- The moved change has `findings.jsonl` (3 lines) and `results.jsonl` (12 lines), and `make findings ARGS="validate"` passes: "Every findings file is valid: 3 file(s)."
- `make verify` exit 0: tests 2017, suites 39, pass 1971, fail 0, cancelled 0, skipped 46, todo 0. Coverage of all files: lines 99.19 %, branches 91.87 %, functions 98.80 %. The comment rule, findings validation, `openspec validate --all --strict` 69 of 69, the archive dry run, and the packed allowlist and installed CLI verification passed.

## Dependency check for the namespace-confinement scenario

On 2026-10-27 the coordinator asked for task 3.3 to run only if its inputs are disjoint from `report-all-unconfirmed-sealed-executions` (Pepi), which is not on `dev` yet. After `git fetch origin`, the branch `origin/report-all-unconfirmed-sealed-executions` at `ceea886` changes 30 files against `origin/dev` `656a34d` (`git diff --stat origin/dev...origin/report-all-unconfirmed-sealed-executions`). None of them is under `infra/`, `scripts/`, `Makefile`, or `packages/adapters/`.

The scenario's inputs:

- `Makefile:171` runs `SCENARIO_RUN` (`Makefile:158`), which is `npm run build` and then `scripts/installation.sh … scenario-worker-namespace-confinement`.
- The scenario is `namespace_confinement_scenario` in `scripts/installation-scenarios.sh:487`. It submits a task through the control plane and probes the worker's execution.
- `infra/installation/compose.yaml` takes the control plane and the worker from `infra/installation/Dockerfile`, whose build stage copies the whole checkout (`COPY . .`, line 19) and runs `apps/control-plane/dist/main.js` and `apps/worker/dist/main.js`. The same files apply `infra/installation/seccomp/worker.json` and `infra/installation/worker-entrypoint.sh`.
- The installation's smoke fixtures are under `infra/installation/smoke/`.

The inputs overlap, so the scenario was not run. The sealed change modifies runtime source that both images build and that a task's launch passes through:

- `apps/worker/src/launch-orchestrator.ts`
- `packages/modules/execution/src/domain/launch-authorization.ts`, `journal-recovery.ts`, and `index.ts`
- `apps/control-plane/src/api/launch-wire.ts`
- `packages/contracts/documents/execution.openapi.json`

A run before the merge would have been valid only until that change merged, so task 3.3 waited for it to land on `dev`. It landed as #325 (`dev` `fe64386`), was merged into this branch (`4880193`), and the scenario then ran on `9a5ef14`, which contains it, so the evidence covers the sealed change.

## Independent review

Reviewer: Codex CLI, assigned by the coordinator. One pass; the coordinator ran it and handed its data to the author.

- **Pass 1.**
  - Invocation: `codex exec -m gpt-6-astra -c model_reasoning_effort='"medium"' -s read-only -C /home/petar/taskelith-worktrees/run-g2-native-acceptance-linux-host - < review-p1.md`.
  - Model confirmation: the session header reports model `gpt-6-astra`, provider openai, sandbox read-only, and reasoning effort medium (Codex CLI v0.163.0).
  - Session `01a17bdb-eab6-7043-8515-10a20f500b93`.
  - Reviewed head `5153b3e` (`origin/dev...5153b3e`).
  - Snapshot: the worktree snapshot before and after the pass was identical, `5093b5a6abf74f55df47d97156b95ee21b3cd9b2f38bb77a1b976c63edef773f`.
  - Counts: Critical 0, High 0, Medium 0, Low 3.
  - The reviewer confirmed that the 12 records, their outcomes, counts, seeds, revision, and timings match the documents. It confirmed that the host and container OS distinction is honest, that the AppArmor, reproducibility, crash-window, and duplicate-delivery limitations hold, and that `fe64386` is in the run revision.
- **Findings and resolutions**, all fixed in `63be2c3`, recorded in [findings.jsonl](findings.jsonl) as `fixed-unreviewed`:
  - L1 (`design.md:3`, `:7`, `:17`; `acceptance.md:3`, `:35`, `:44`; `verification.md:10`, `:81`, `:91`): the records attributed a GitHub-hosted `ubuntu-24.04` runner for Linux x86_64 to D11 (a). The labels of D11 (a) in `docs/g2-plan.md:90` name no such runner. The open hosted-runner check is now attributed to the coordinator's brief of 2026-10-27. D11 is cited only for requiring all four matrix entries and for recording any entry not established as open in the closure ADR. The other D11 and `ubuntu-24.04` mentions were rechecked and are correct (`proposal.md:3` and the `verification.md:7` source list).
  - L2 (`acceptance.md:5`, `verification.md:14`): the records said all of this change's records were untracked at run time. They now say that only `results.jsonl` was new and untracked, that the documents were tracked, and that the runtime evidence stays fresh because the later commits change only records.
  - L3 (`verification.md:22`): the self-check named only `docs` commits; it now names `docs` and `test`.
- **Unreviewed fixes.** The pass found only Low findings, so under the [review process](../../../docs/governance.md#independent-review-process) the fixes of `63be2c3` were made without another pass and are unreviewed.

## Candidate product defects

None. Every proof of the evidence run and the namespace-confinement scenario passed; none was skipped or retried.

## Limitations

- The host runs Ubuntu 26.04.1 LTS, not a GitHub-hosted `ubuntu-24.04` runner; only the containers run the Ubuntu 24.04 base. The hosted-runner Linux x86_64 check of the coordinator's brief of 2026-10-27 stays open; D11 requires all four matrix entries and records any entry not established as open in the closure ADR.
- The 24b crash windows and the duplicate delivery in a Linux composition are not run (design decision 4).
- The worker container runs with `apparmor=unconfined` (`infra/installation/compose.yaml`), so the host's AppArmor does not confine it, and no AppArmor or SELinux confinement is claimed. The seccomp profile was applied by this host's own kernel (line 12).
- The worker image was built twice from the same commit, with different digests: `sha256:3e787b33…` in the evidence run (line 1) and `sha256:5cfad4b3…` in the namespace-confinement scenario (line 12). Each run builds its own image, so the image is not claimed to be reproducible.
- `stat -f` reports the ext4 volumes as `ext2/ext3` (one magic number), as in 25b.
- The skipped tests of the suites in the test image (2 journal, 2 cancellation) are the macOS-only and case-insensitive tests that 25b names; the Linux entry does not cover them.

## Remaining gates

- The GitHub-hosted `ubuntu-24.04` runner check for Linux x86_64 (coordinator's brief of 2026-10-27); 25c (`macos-26-x86_64`).
- The Linux composed crash windows and duplicate delivery, carried by the coordinator to `close-g2` as a candidate deferral or follow-up.
- Integration into `dev` by the coordinator (single pull request).
