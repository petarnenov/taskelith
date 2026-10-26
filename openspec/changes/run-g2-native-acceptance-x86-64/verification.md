# Verification: run-g2-native-acceptance-x86-64 (25c)

Date: 2026-10-26. This record holds the setup and preflight of the evidence run; the evidence, the checks, and the review are pending.

## Scope and source

G2 work item 25, part 25c, `run-g2-native-acceptance-x86_64`, assigned by the coordinating session and developed in a briefed subagent ([subagent execution](../../../docs/agent-task-protocol.md#subagent-execution)). OpenSpec refuses underscores in change names, so the change is `run-g2-native-acceptance-x86-64` on the branch `run-g2-native-acceptance-x86_64`. Sources: [docs/g2-plan.md](../../../docs/g2-plan.md) item 25 and D11; [docs/worker-platforms.md](../../../docs/worker-platforms.md#native-acceptance-gates) "Native acceptance gates"; the archive of 25b ([run-g2-native-acceptance-arm64](../archive/2026-10-26-run-g2-native-acceptance-arm64/design.md)), whose runner this change runs unchanged.

- **In scope:** the x86_64 evidence of `macos-26-x86_64` (natively) and `linux-ubuntu-24.04-x86_64` (worker image and its base under Docker Desktop for x86_64), the acceptance table ([acceptance.md](acceptance.md), pending), and the x86_64 observations in the platform documents.
- **In-scope fix:** the runner builds the checkout before its seed (design decision 6), assigned by the coordinator after the preflight found the failure; the seccomp line of `docs/local-installation.md` cites 25a's x86_64 evidence.
- **Pending extra:** `make scenario-worker-namespace-confinement` after the acceptance run (design decision 7).
- **Out of scope:** product code, the runner's proofs, contracts, 24c's partition and races, and fixes of any defect found; a failed proof is reported to the coordinator as a candidate defect.
- **Specs:** `skip_specs: true`; the run exercises the existing `native-worker-acceptance` requirements without changing them.

## Revision and environment

- Base: `origin/dev` at `843e293`. Branch `run-g2-native-acceptance-x86_64`.
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

Pending the evidence run.

## Checks and results

| Check | Result |
| --- | --- |
| `node --experimental-strip-types --test test/native-acceptance-runner.test.ts` with the new order test, before the fix of `scripts/native-acceptance.sh` | 8 tests, 7 passed, 1 failed: the order test, because `main` drew the seed without a build |
| `node --experimental-strip-types --test test/native-acceptance-runner.test.ts test/native-acceptance.test.ts` after the fix | 18 of 18 passed |
| `npm run verify:comments` | Every comment is within the comment length rule |
| `npm run openspec -- validate run-g2-native-acceptance-x86-64 --strict` | Valid (`skip_specs`) |

The evidence run, the confinement extra, and `make verify` are pending; the coordinator held them while the host runs its integration queue.

## Independent review

Reviewer: Claude Code (claude-fable-5-1), assigned by the coordinator. Pending.

## Candidate product defects

Pending the evidence run.

## Limitations

Pending the evidence run.

## Remaining gates

- The evidence run, the confinement extra, `acceptance.md`, the document updates, `make verify`, and the independent review.
- Integration into dev by the coordinator (single pull request).
