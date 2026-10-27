# Verification: run-g2-native-acceptance-x86-64 (25c)

Date: 2026-10-26, updated 2026-10-27. This record holds the setup and preflight, the evidence run and the confinement extra on the merged head, the checks, and review passes 1 and 2.

## Scope and source

G2 work item 25, part 25c, `run-g2-native-acceptance-x86_64`, assigned by the coordinating session and developed in a briefed subagent ([subagent execution](../../../docs/agent-task-protocol.md#subagent-execution)). OpenSpec refuses underscores in change names, so the change is `run-g2-native-acceptance-x86-64` on the branch `run-g2-native-acceptance-x86_64`. Sources: [docs/g2-plan.md](../../../docs/g2-plan.md) item 25 and D11; [docs/worker-platforms.md](../../../docs/worker-platforms.md#native-acceptance-gates) "Native acceptance gates"; the archive of 25b ([run-g2-native-acceptance-arm64](../archive/2026-10-26-run-g2-native-acceptance-arm64/design.md)), whose runner this change runs unchanged except for the build before the seed (design decision 6).

- **In scope:** the x86_64 evidence of `macos-26-x86_64` (natively) and `linux-ubuntu-24.04-x86_64` (worker image and its base under Docker Desktop for x86_64), the acceptance table ([acceptance.md](acceptance.md)), and the x86_64 observations in the platform documents.
- **In-scope fix:** the runner builds the checkout before its seed (design decision 6), assigned by the coordinator after the preflight found the failure; the seccomp line of `docs/local-installation.md` cites 25a's x86_64 evidence.
- **Extra:** `make scenario-worker-namespace-confinement` after the acceptance run (design decision 7), recorded in the same `results.jsonl`.
- **Out of scope:** product code, the runner's proofs, contracts, 24c's partition and races, and fixes of any defect found; a failed proof is reported to the coordinator as a candidate defect.
- **Specs:** `skip_specs: true`; the run exercises the existing `native-worker-acceptance` requirements without changing them.

## Revision and environment

- Base: `origin/dev` at `843e293`. Branch `run-g2-native-acceptance-x86_64`.
- Dev merge: `origin/dev` at `1847570` was merged into the branch as `e14b2ed` (clean merge; no `package.json` or lockfile change, so the dependency inventory is current). `git diff 843e293 1847570` changes suites the runner executes: `packages/adapters/worker-journal/src/journal-reads.ts` and its test, `apps/worker/test/command-intake.test.ts`, the control-plane code under the crash-window proofs (`apps/control-plane/src/application/observation-effects.ts`, `observation-service.ts`, `inventory-reconciliation.ts`, `packages/modules/execution`, and `apps/control-plane/src/api/api-server.ts` from PR #317), and `scripts/installation-scenarios.sh`, which the confinement extra uses. The evidence run therefore runs on `e14b2ed` or later.
- Second dev merge (2026-10-27): `origin/dev` at `fe64386` was merged as `46a6a59` without conflicts; `npm ci --ignore-scripts` installed the new root development dependency `ajv` and `npm run verify:dependencies` passed, so the inventory is current. Of `git diff 1847570 fe64386`, the runner's proofs execute `apps/control-plane/test/crash-windows.integration.test.ts` and its fixtures `crash-hook.ts` and `worker-composition.ts` (the `crash_windows` proofs), and the product code under them: `packages/modules/execution` (journal recovery, launch authorization), `apps/control-plane/src/api/launch-wire.ts`, `apps/worker/src/launch-orchestrator.ts`, and `packages/adapters/worker-control-plane-client` (failure causes), which the worker image of the Linux scenarios also contains. No suite of `journal_suites`, `cancellation_suites`, or `connectivity_suites`, no file of the runner, and neither `scripts/installation-scenarios.sh` (the confinement scenario) nor `infra/` changed. Of the records' citations, `docs/dependencies.md` changed only in the `ajv` row, not the Ubuntu row. The evidence run therefore runs on `46a6a59` or later.
- Evidence revision: the evidence run and the confinement extra ran on `b82ad2f` (the merge `46a6a59` and the findings record), with a clean tree apart from the emptied `results.jsonl`; every record names `b82ad2f0e7bf392fddf4acbf8cf9797f4fabdce0`. The evidence is committed in `000c6ca`.
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

### Environment re-check before the evidence run (2026-10-27)

- Disk floor of the native data root: `df -k` of the temporary directory `/var/folders/s8/0wdlqwhs7gsby61drq80tlhh0000gq/T/` on `/System/Volumes/Data` showed 536487568 KiB (511.6 GiB) available of 976797816 KiB (931.5 GiB): the floor is 93.2 GiB, so `NATIVE_DATA_PARENT` stayed unset (design decision 2); the native scenario's record reports 510 GiB free on APFS at `/System/Volumes/Data`.
- Docker Desktop's VM disk: `docker system df` showed 2.0 GB of images, 1.8 GB of build cache, and one unrelated volume; no volume was pruned or removed. The VM disk itself was not re-measured with a fresh volume, because the probe needed a registry call that hung (next item); the Linux scenarios' records show no disk-floor refusal.
- Docker credentials: `docker pull` and every registry call through the user's Docker configuration hung in its credential helper (`credsStore: desktop`, `docker-credential-desktop get` never returned), while the engine itself answered and ran local images. The run therefore used `DOCKER_CONFIG` set to an empty configuration (`{}`) in the session's scratch directory, which pulls public images anonymously and reaches the same engine through the default context (`unix:///var/run/docker.sock`, a link to Docker Desktop's socket) with the system plugins (Compose 5.1.3, Buildx 0.34.0-desktop.1, builder `default`, docker driver). Every image the run pulls is public and digest- or checksum-pinned; no credential was read, and the runner, the Makefile, and the product were not changed.
- Docker state before and after: no container of the run's projects, no `taskelith` volume, and only the pre-existing `taskelith-linux-cgroup:test` image remained after the run; three exited containers of another project from the day before were left untouched.

## Author self-check and evidence check

For the work up to `e14b2ed`: the runner fix, its test, the seccomp line, and these records. The self-check of the evidence run follows the list.

- AGENTS.md: English only; only the assigned scope; no product code, contract, OpenAPI, AsyncAPI, JSON schema, Compose file, or npm dependency change. Commits use `chore` and `docs` without attribution; nothing was pushed.
- Scope: `scripts/native-acceptance.sh` moves `npm run --silent build` from `macos_entry` into `build_checkout`, which `main` calls before the seed, so every entry, not only macOS, gets the built harness (design decision 6). The proofs, their order, and the recorder are unchanged. `docs/local-installation.md` changes one paragraph: the design link points at the archived change, and the line cites 25a's x86_64 confinement evidence.
- Comment rule: the one new comment, above `build_checkout`, is one line within 80 characters; `npm run verify:comments` passes.
- ADR 0004: Clean Code (one small named step, one call site; the test stubs it like the runner's other tools); SOLID, hexagonal architecture, and microkernel untouched (no product module change); Docker and contract-first OpenAPI untouched; Makefile-driven operation (`make native-acceptance` unchanged); SDLC through this change; coverage stays above 75 % (figures below).
- Tests: the order test fails before the fix and passes after it. Its stubs of `build_checkout` and `tool seed` each print a mark on standard error, and it asserts that the build's mark directly precedes the seed's, so a build after the `tool seed` call fails it (review pass 1, finding M1).
- Evidence check: neither the change's files nor `git diff 843e293 784f3ef` contain an external link. Every link is relative to the repository: `docs/agent-task-protocol.md#subagent-execution`, `docs/g2-plan.md`, `docs/worker-platforms.md#native-acceptance-gates`, the 25b archive (`design.md`, `proposal.md`, `acceptance.md`), the 25a archive (`design.md`, `verification.md`), and this change's `acceptance.md` and `verification.md`.

Self-check of the evidence run (`46a6a59` to the final commit):

- Scope: the commits after the merge add `findings.jsonl`, `results.jsonl`, and `acceptance.md`, update these records and `tasks.md`, and append one sentence each to `docs/worker-platforms.md`, `docs/local-installation.md`, and the Ubuntu row of `docs/dependencies.md`, each stating only facts of this run's records and citing `acceptance.md`. No runner, Makefile, product, contract, or dependency file changed after the merge, and no proof was changed to pass.
- Evidence check: `results.jsonl` holds 49 lines, every one `passed`, with commit `b82ad2f0e7bf392fddf4acbf8cf9797f4fabdce0` and `arch` `x64`; lines 1 to 48 carry seed `4080300788` and an `acceptance` field (37 for `macos-26-x86_64`, 11 for `linux-ubuntu-24.04-x86_64`), line 49 is the confinement extra with seed `4100903782` and none. Every count and line number in `acceptance.md` was read from these records (`jq`) and the run's log. `acceptance.md` reports no proof as passed that did not pass and keeps every open part of 25b's table except the macOS process ownership failure on D1, which this run did not reproduce.
- Links: the new links are relative (`acceptance.md`, `results.jsonl`, `findings.jsonl`, `docs/agent-task-protocol.md#review-findings-record`, the 25b archive, and from the three documents this change's `acceptance.md`); no external link was added.
- Comment rule: no comment was added or changed after the merge.

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
| Order test of review pass 1 (M1) in a scratch copy of the runner and its test, outside the worktree | Real runner: 8 of 8 passed. Variant with `build_checkout` after the `tool seed` call: 8 tests, 7 passed, 1 failed, the order test. The test of `53b5b19` passes that variant 8 of 8 |
| Runner tests (the two files above) on `354258b` | 18 of 18 passed |
| `npm run verify:comments` on `354258b` | Pass |
| `npm run openspec -- validate run-g2-native-acceptance-x86-64 --strict` on `354258b` | Valid (`skip_specs`) |
| `npx tsc -p tsconfig.check.json`, the type check of `npm run check:boundaries`, which includes `test/**/*.ts`, on `354258b` | Exit 0, no diagnostics |

| `make native-acceptance RESULTS=openspec/changes/run-g2-native-acceptance-x86-64/results.jsonl` on `b82ad2f`, with `DOCKER_CONFIG` as under "Environment re-check" | Exit 0 in 500 s (8 min 20 s), 2026-10-27 07:42:22 to 07:50:42 +0200, seed `4080300788`: "every proof passed"; 48 records, all `passed`, from 15 proofs. `macos-26-x86_64`: 7 proofs, 37 records (native lifecycle, supervisor suites 113 of 113, 28 crash-window records and the crash-window proof 28 of 28, duplicate delivery 1 of 1, journal suites 97 of 97, cancellation suites 19 of 19, connectivity suites 25 of 25). `linux-ubuntu-24.04-x86_64`: 8 proofs, 11 records (lifecycle, kill, cgroup 14 of 14, journal suites 95 of 97 with 2 skipped, disk loss, cgroup cancellation 2 of 2, cancellation suites 17 of 19 with 2 skipped, connectivity suites 25 of 25) ([acceptance.md](acceptance.md)) |
| `TASKELITH_SCENARIO_RESULTS=<the same results.jsonl> make scenario-worker-namespace-confinement` on `b82ad2f`, right after | Exit 0 in 43 s, ending 07:51:44 +0200: passed, line 49 |
| `make verify` on `000c6ca` with this record's and `tasks.md`'s uncommitted updates, `DOCKER_CONFIG` as above | Exit 0 in 2 min 53 s (173 s), 07:54:23 to 07:57:16 +0200, first run: `npm run verify:findings` found every findings file valid (3 files); 2018 tests, 2016 passed, 0 failed, 2 skipped; coverage of all files 99.29 % lines, 92.14 % branches, 99.05 % functions; package allowlist and installed CLI verification passed |
| `npm run openspec -- validate run-g2-native-acceptance-x86-64 --strict`, `npm run findings -- validate`, `npm run verify:comments` on the same tree | Valid (`skip_specs`); every findings file valid (3 files); every comment within the rule |

## Independent review

### Pass 1

- Reviewer: Claude Code (claude-fable-5-1), assigned by the coordinator. Invocation, run from the worktree: `claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json < /dev/null`.
- Model confirmation: the JSON result's `modelUsage` lists `claude-fable-5-1`, and also `claude-opus-5-5`, which the CLI uses internally.
- Session `ce36db0f-4a5b-4036-b905-5f140f511cae`, started 2026-10-27 06:52; result `success`. Reviewed head `53b5b19`: the branch diff `843e293..784f3ef` and `53b5b19`.
- Snapshot: SHA-256 `459af8553d1ce191cf777abb2fbf3a1a71275b3152325ee17e4dff8396e9246e` before and after, unchanged.
- The reviewer's own checks included a simulated failing build: `main` stops before the seed with npm's exit code.
- Findings: 0 Critical, 0 High, 1 Medium, 3 Low. M1 is fixed in `354258b`, and the three Lows in `0991490`, the commit that records this pass; pass 2 confirmed all four.

| # | Severity | Finding | Fix |
| --- | --- | --- | --- |
| M1 | Medium | `test/native-acceptance-runner.test.ts:70-74`: the order test compares the build with the seed line that `scripts/native-acceptance.sh:133` prints, not with the `tool seed` call at line 131, so a build between the call and the line passes | In `354258b` the `tool seed` stub prints `drew the seed` on standard error, and the test asserts that `built the checkout` directly precedes it; the variant now fails (Checks and results); `design.md` decision 6 and the self-check say what the test proves. To be confirmed in pass 2 |
| L1 | Low | `proposal.md:3`, `design.md:3`, `verification.md:7`: 25c runs the runner "unchanged", though decision 6 edits it | Each says unchanged except for the build before the seed (design decision 6). Checked in pass 2 |
| L2 | Low | `verification.md:18`: the dev-changed inputs omit `apps/control-plane/src/api/api-server.ts` (PR #317), which the crash-window proofs exercise | Added. Checked in pass 2 |
| L3 | Low | `design.md:5`: 24c is said to be absent only at the base `843e293` | Also absent at the merged `1847570`: no `run-g2-partition-and-races` change is active or archived there. Checked in pass 2 |

The four findings are also recorded in [findings.jsonl](findings.jsonl), the [review findings record](../../../docs/agent-task-protocol.md#review-findings-record), first with the outcome `fixed-unreviewed` and, after pass 2 confirmed them, `fixed`; `npm run findings -- validate` passes.

### Pass 2

- Reviewer: Claude Code (claude-fable-5-1), effort medium, the same reviewer and invocation as pass 1: `claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json < /dev/null`, run from the worktree. The prompt named pass 1's session and asked for each finding's resolution before a review of the whole change.
- Model confirmation: the JSON result's `modelUsage` lists only `claude-fable-5-1`.
- Session `d2ea5b8e-c8ea-4461-99c8-203782c6e4fd`, started 2026-10-27 07:58:53; result `success`. Reviewed head `19e61cb`.
- Snapshot: SHA-256 `1f7bd1844646cec97f6000312611fe6bc9d134017c92f672a14a28160b9c2289` before and after, unchanged.
- Findings: 0 Critical, 0 High, 0 Medium, 6 Low. The pass is Low-only, so under the [review process](../../../docs/governance.md#independent-review-process) the six are fixed without another pass; they are **unreviewed fixes**, made in the commit `docs: fix and record review pass 2 of 25c`.

Confirmation of pass 1:

| # | Pass 2 result |
| --- | --- |
| M1 | Resolved: the order test now fails when the build follows the `tool seed` call |
| L1 | Resolved |
| L2 | Resolved |
| L3 | Resolved for the state of pass 1; extended by pass 2 L2 to the later `dev` merge |

| # | Severity | Finding | Fix (unreviewed) |
| --- | --- | --- | --- |
| L1 | Low | `docs/worker-platforms.md:31`, `acceptance.md:37`: every row is said to keep an open part, though macOS process ownership and journal and storage on both entries are met for their G2 part with nothing open | The document says those rows are met for their G2 part and that the rows the table leaves partly open keep the open parts it names; the summary of `acceptance.md` says the same and that no row is accepted beyond its G2 part |
| L2 | Low | `design.md:5`: 24c is said to be absent at the base and at `1847570`, not at `fe64386`, the `dev` merged before the evidence run | Added `fe64386`; `git ls-tree -r --name-only fe64386 openspec/changes` lists no `run-g2-partition-and-races` path |
| L3 | Low | `docs/dependencies.md`, Ubuntu row: "the linux/arm64 images are not yet built or run" is stale | Replaced: both installation image architectures ran the lifecycle, kill, and disk-loss scenarios, linux/arm64 in 25b (its `results.jsonl` lines 36, 38, and 43, `arch` `arm64`, all `passed`) and linux/amd64 in 25c |
| L4 | Low | `acceptance.md`: the table does not say that the Docker CLI ran with an empty `DOCKER_CONFIG` | One sentence after the introduction, linking "Environment re-check before the evidence run"; the engine, images, and plugins were Docker Desktop's own |
| L5 | Low | `proposal.md:27`: the commit types omit `test` for the runner test | `chore` for the runner fix, `test` for its test, and `docs` for the rest |
| L6 | Low | `verification.md:97`: "the commit that records this pass" does not name it | Names `0991490` |

The six findings are in [findings.jsonl](findings.jsonl) with the outcome `fixed-unreviewed`.

The reviewer also observed, outside this change's scope, that relative links inside change records break when the directory moves under `archive/`, as they did in 25b. The coordinator was told; nothing was changed here.

## Candidate product defects

None: every proof passed, so task 2.4 had nothing to report.

## Follow-up candidates

- Flaky coverage report: the first `make verify` on `e14b2ed` failed with `ERR_OPERATION_FAILED: coverage file is empty`, with no failed test. It was transient, the rerun passed, and no change on this branch touches the test runner or coverage. Not fixed here (out of scope).

## Limitations

- The Linux entry ran in Docker Desktop's Linux VM for x86_64 (kernel 6.12.76-linuxkit), not on an Ubuntu host kernel; AppArmor and SELinux hosts are not observed.
- The run used an empty Docker configuration because the user's credential helper hung (Environment re-check); the engine, images, and plugins were Docker Desktop's own.
- One run per entry: timing-sensitive proofs (the worker kill after a planned pause of 788 ms, the duplicate delivery's 1 copy during and 3 after) ran once with seed `4080300788`; no other session's container was running before or after the run, but the host was not otherwise isolated.
- The native worker ran as the invoking user on the boot volume's APFS; no other macOS file system or a case-sensitive APFS volume was exercised.
- The three documents link to this change's active path; the archive step points them at the archived change.

## Remaining gates

- At archive: the links of `docs/worker-platforms.md`, `docs/local-installation.md`, and `docs/dependencies.md` to this change's `acceptance.md` move to the archived path.
- Integration into dev by the coordinator (single pull request).
