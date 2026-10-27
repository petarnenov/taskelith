# Verification: run-g2-native-acceptance-x86-64 (25c)

Date: 2026-10-26, updated 2026-10-27. This record holds the setup and preflight of the evidence run and the checks of the merged tree; the evidence, the confinement extra, and the review are pending.

## Scope and source

G2 work item 25, part 25c, `run-g2-native-acceptance-x86_64`, assigned by the coordinating session and developed in a briefed subagent ([subagent execution](../../../docs/agent-task-protocol.md#subagent-execution)). OpenSpec refuses underscores in change names, so the change is `run-g2-native-acceptance-x86-64` on the branch `run-g2-native-acceptance-x86_64`. Sources: [docs/g2-plan.md](../../../docs/g2-plan.md) item 25 and D11; [docs/worker-platforms.md](../../../docs/worker-platforms.md#native-acceptance-gates) "Native acceptance gates"; the archive of 25b ([run-g2-native-acceptance-arm64](../archive/2026-10-26-run-g2-native-acceptance-arm64/design.md)), whose runner this change runs unchanged.

- **In scope:** the x86_64 evidence of `macos-26-x86_64` (natively) and `linux-ubuntu-24.04-x86_64` (worker image and its base under Docker Desktop for x86_64), the acceptance table ([acceptance.md](acceptance.md), pending), and the x86_64 observations in the platform documents.
- **In-scope fix:** the runner builds the checkout before its seed (design decision 6), assigned by the coordinator after the preflight found the failure; the seccomp line of `docs/local-installation.md` cites 25a's x86_64 evidence.
- **Pending extra:** `make scenario-worker-namespace-confinement` after the acceptance run (design decision 7).
- **Out of scope:** product code, the runner's proofs, contracts, 24c's partition and races, and fixes of any defect found; a failed proof is reported to the coordinator as a candidate defect.
- **Specs:** `skip_specs: true`; the run exercises the existing `native-worker-acceptance` requirements without changing them.

## Revision and environment

- Base: `origin/dev` at `843e293`. Branch `run-g2-native-acceptance-x86_64`.
- Dev merge: `origin/dev` at `1847570` was merged into the branch as `e14b2ed` (clean merge; no `package.json` or lockfile change, so the dependency inventory is current). `git diff 843e293 1847570` changes suites the runner executes: `packages/adapters/worker-journal/src/journal-reads.ts` and its test, `apps/worker/test/command-intake.test.ts`, the control-plane code under the crash-window proofs (`apps/control-plane/src/application/observation-effects.ts`, `observation-service.ts`, `inventory-reconciliation.ts`, and `packages/modules/execution`), and `scripts/installation-scenarios.sh`, which the confinement extra uses. The evidence run therefore runs on `e14b2ed` or later.
- Host: 2020 Intel iMac, Intel Core i7-10700K, 16 logical CPUs, 40 GiB memory; macOS 26.6.2 (build 25G83, Darwin 25.6.0), `x86_64`; Node.js 24.22.1 and npm 12.2.1 from `.nvmrc` via `nvm use`; GNU bash 3.2.57 as `/bin/bash`; GNU Make 3.81; git 2.33.0; jq 1.7.1.
- Engine: Docker Desktop 4.75.0 (227598), Docker Engine 29.5.2, client and server `amd64`, server architecture `x86_64`, kernel 6.12.76-linuxkit, storage driver overlay2, cgroup v2, seccomp `builtin` and `cgroupns`; Docker Compose 5.1.3; 16 CPUs and 31.3 GiB memory in the VM; context `desktop-linux`.
- Boot volume: APFS (case-insensitive), 931.5 GiB with 504.5 GiB available. Docker Desktop's VM disk: about 251.7 GiB with 229 GiB available.

## Setup and preflight

The runner has no dry-run or plan mode. Its prerequisites were checked on this host without writing to the repository; the logs stay in the session's scratch directory.

| Check | Result |
| --- | --- |
| Tools and versions (`sw_vers`, `uname`, `node`, `npm`, `bash`, `make`, `git`, `jq`, `curl`, `docker version`, `docker info`, `docker compose version`, `df`, `diskutil`) | As listed under "Revision and environment" |
| Disk floor of the native data root: `statfs` of the temporary directory, as `packages/adapters/worker-journal/src/volume.ts` measures it, against `max(5 GiB, 10 %)` | 504.5 GiB available, floor 93.2 GiB, margin 411.4 GiB: above the floor, so `NATIVE_DATA_PARENT` is not needed (design decision 2) |
| Disk floor in Docker Desktop's VM: `df` of a fresh volume in the pinned base | 229 GiB available of 251.7 GiB, floor 25.2 GiB: above the floor; `stat -f` reports ext2/ext3; the base reports `x86_64` and Ubuntu 24.04.5 LTS |
| `make linux-test-image` | Exit 0 in 30 s; image `taskelith-linux-cgroup:test` is `linux/amd64` and runs Node.js v24.22.1 `x64` |
| `scripts/native-acceptance.ts seed`, `platform macos`, `platform linux` (with `TASKELITH_UBUNTU_BASE` and `LINUX_TEST_IMAGE` as the Makefile sets them) | Before `npm run build`: each failed with `ERR_MODULE_NOT_FOUND` for `@taskelith/testing/dist/index.js`. This is the defect that design decision 6 fixes. After the build: a seed, and the entries `macos-26-x86_64` (APFS at `/System/Volumes/Data`, which holds the temporary directory) and `linux-ubuntu-24.04-x86_64` (Ubuntu 24.04.5 LTS, Linux 6.12.76-linuxkit, ext2/ext3 on Docker volumes, overlay2) |
| `make verify-installation` (throwaway project removed with its volumes and images; no results file) | Exit 0 in 4 min 44 s: "built, bootstrapped, started, enrolled, restarted, removed"; the control-plane and worker images built for linux/amd64 and the worker container started healthy under the seccomp profile; no container, image, volume, or sentinel file was left |
| Ports and permissions | Every scenario and service composition publishes ephemeral ports on 127.0.0.1 under its own project name; the user is in the `docker` and `admin` groups; the temporary directory is the user's own with mode 0700 |

## Author self-check and evidence check

For the work up to `e14b2ed`: the runner fix, its test, the seccomp line, and these records. The self-check of the evidence run is pending.

- AGENTS.md: English only; only the assigned scope; no product code, contract, OpenAPI, AsyncAPI, JSON schema, Compose file, or npm dependency change. Commits use `chore` and `docs` without attribution; nothing was pushed.
- Scope: `scripts/native-acceptance.sh` moves `npm run --silent build` from `macos_entry` into `build_checkout`, which `main` calls before the seed, so every entry, not only macOS, gets the built harness (design decision 6). The proofs, their order, and the recorder are unchanged. `docs/local-installation.md` changes one paragraph: the design link points at the archived change, and the line cites 25a's x86_64 confinement evidence.
- Comment rule: the one new comment, above `build_checkout`, is one line within 80 characters; `npm run verify:comments` passes.
- ADR 0004: Clean Code (one small named step, one call site; the test stubs it like the runner's other tools); SOLID, hexagonal architecture, and microkernel untouched (no product module change); Docker and contract-first OpenAPI untouched; Makefile-driven operation (`make native-acceptance` unchanged); SDLC through this change; coverage stays above 75 % (figures below).
- Tests: the order test fails before the fix and passes after it, and asserts the build before the seed line.
- Evidence check: neither the change's files nor `git diff 843e293 784f3ef` contain an external link. Every link is relative to the repository: `docs/agent-task-protocol.md#subagent-execution`, `docs/g2-plan.md`, `docs/worker-platforms.md#native-acceptance-gates`, the 25b archive (`design.md`, `proposal.md`, `acceptance.md`), the 25a archive (`design.md`, `verification.md`), and this change's `acceptance.md` and `verification.md`.

## Checks and results

| Check | Result |
| --- | --- |
| `node --experimental-strip-types --test test/native-acceptance-runner.test.ts` with the new order test, before the fix of `scripts/native-acceptance.sh` | 8 tests, 7 passed, 1 failed: the order test, because `main` drew the seed without a build |
| `node --experimental-strip-types --test test/native-acceptance-runner.test.ts test/native-acceptance.test.ts` after the fix | 18 of 18 passed |
| `npm run verify:comments` | Every comment is within the comment length rule |
| `npm run openspec -- validate run-g2-native-acceptance-x86-64 --strict` | Valid (`skip_specs`) |
| Runner tests (the two files above) on `e14b2ed` | 18 of 18 passed |
| `npm run verify:comments` on `e14b2ed` | Pass |
| `npm run openspec -- validate run-g2-native-acceptance-x86-64 --strict` on `e14b2ed` | Valid |
| `make verify` on `e14b2ed`, first run | Exit 2 after 2 min 43 s: 1955 tests, 1953 passed, 0 failed, 2 skipped; the `test` target failed only because Node's test runner could not report coverage: `ERR_OPERATION_FAILED: coverage file is empty` for `coverage-66529-1793076310303-0.json` in its temporary node-coverage directory |
| `make verify` on `e14b2ed`, rerun | Exit 0 in 2 min 48 s: 1955 tests, 1953 passed, 0 failed, 2 skipped; coverage of all files 99.29 % lines, 92.10 % branches, 99.04 % functions; package allowlist and installed CLI verification passed |

The evidence run and the confinement extra are pending; the coordinator held them while the host runs its integration queue. `make verify` runs again after the evidence (task 2.6).

## Independent review

Reviewer: Claude Code (claude-fable-5-1), assigned by the coordinator. Pending.

## Candidate product defects

Pending the evidence run.

## Follow-up candidates

- Flaky coverage report: the first `make verify` on `e14b2ed` failed with `ERR_OPERATION_FAILED: coverage file is empty`, with no failed test. It was transient, the rerun passed, and no change on this branch touches the test runner or coverage. Not fixed here (out of scope).

## Limitations

Pending the evidence run.

## Remaining gates

- The evidence run, the confinement extra, `acceptance.md`, the document updates, the final `make verify`, and the independent review.
- Integration into dev by the coordinator (single pull request).
