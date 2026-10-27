# Verification: run-g2-native-acceptance-linux-host (25, native Linux host)

Date: 2026-10-27. The author's verification so far is recorded below; the evidence, the independent review, and the archive are still open.

## Scope and source

G2 work item 25, the Linux entry on a native Linux host, `run-g2-native-acceptance-linux-host`, assigned by the coordinating session (Niki) in its brief of 2026-10-27 and developed in a briefed subagent ([subagent execution](../../../docs/agent-task-protocol.md#subagent-execution)). Sources: [docs/g2-plan.md](../../../docs/g2-plan.md) item 25 and D11; [docs/worker-platforms.md](../../../docs/worker-platforms.md#native-acceptance-gates) "Native acceptance gates"; the archives of 25a ([harden-worker-container-seccomp](../archive/2026-10-26-harden-worker-container-seccomp/design.md)), 25b ([run-g2-native-acceptance-arm64](../archive/2026-10-26-run-g2-native-acceptance-arm64/design.md)), and 24b ([run-g2-crash-windows](../archive/2026-10-26-run-g2-crash-windows/design.md), decision 8).

- **In scope:** the eight Linux proofs of `make native-acceptance`, `make scenario-worker-namespace-confinement` on `x86_64`, `results.jsonl`, and the acceptance table ([acceptance.md](acceptance.md)).
- **Out of scope:** product, runner, and test code; the macOS x86_64 entry (25c); the D11 `ubuntu-24.04` hosted-runner entry; fixes of any defect found.

## Revision and environment

- Base: the branch was created from `dev` at `0d317f8`, which the first `make verify` runs below used; `origin/dev` at `656a34d` was then merged in with a merge commit, `4a2b45a`, without conflicts, and every check from the host gate on runs on the tree of `4a2b45a`. Branch `run-g2-native-acceptance-linux-host`. The merge changed no dependency inventory (`make dependency-inventory` left the tree clean).
- Host: native Ubuntu 26.04.1 LTS, `x86_64`, kernel 7.0.0-38-generic, cgroup v2; Node.js 24.22.1 from `.nvmrc` via `nvm use`.
- Engine: Docker Engine - Community 29.8.2 (not Docker Desktop), Docker Compose 5.6.0, storage driver overlayfs, cgroup version 2, Docker root `/var/lib/docker`; security options AppArmor (profile `default`), seccomp (profile `builtin`), and cgroupns. Worker and test images: the digest-pinned Ubuntu 24.04 base (`Makefile:11`), which reports Ubuntu 24.04.5 LTS.
- Docker disk headroom: the root file system that holds `/var/lib/docker` is 467 GiB with 163 GiB free (64 % used); `docker system df` shows 26.73 GB of images, 24.75 GB of local volumes, and 5.0 GB of build cache. Nothing was pruned.
- `/tmp`: a 31 GiB `tmpfs` with `usrquota`, 85 % full with other projects' caches at the first `make verify`, and 42 % full (18 GiB free) at the host gate on `4a2b45a`; every run sets `TMPDIR=/home/petar/.cache/taskelith-tmp`, on disk (design decision 6). Other projects' files were not deleted.

## Author self-check and evidence check

TODO: AGENTS.md, comment rule, ADR 0004, Docker hygiene, OpenSpec validation, and links.

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
| Evidence run of the Linux entry (`results.jsonl`) | TODO |
| `make scenario-worker-namespace-confinement` on `x86_64` | Held, not run: its inputs overlap the open change `report-all-unconfirmed-sealed-executions` (see "Dependency check for the namespace-confinement scenario") |
| `npm run openspec -- validate run-g2-native-acceptance-linux-host --strict` on `4a2b45a` | Passed: "Change 'run-g2-native-acceptance-linux-host' is valid" (`skip_specs`, zero deltas) |

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

A run now would hold only until that change merges. Task 3.3 waits for it to land on `dev`.

## Independent review

TODO: Codex CLI, `gpt-6-astra`, medium effort, read-only; invocation, model confirmation, reviewed head, snapshot, findings, and fixes.

## Candidate product defects

TODO.

## Limitations

- The host runs Ubuntu 26.04.1 LTS, not the pinned `ubuntu-24.04` hosted runner of D11; only the containers run the Ubuntu 24.04 base. The D11 `ubuntu-24.04` row stays open.
- The 24b crash windows and the duplicate delivery in a Linux composition are not run (design decision 4).
- TODO: limitations observed during the runs.

## Remaining gates

- The evidence run, the namespace-confinement run, `acceptance.md`, and the independent review.
- The D11 `ubuntu-24.04` hosted-runner entry; 25c (`macos-26-x86_64`).
- The Linux composed crash windows and duplicate delivery, carried by the coordinator to `close-g2` as a candidate deferral or follow-up.
- Integration into `dev` by the coordinator (single pull request).
- Archive of the change.
