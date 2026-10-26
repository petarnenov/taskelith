# Verification: run-g2-native-acceptance-arm64 (25b)

Date: 2026-10-26. The author's verification is recorded below; the independent review is pending.

## Scope and source

G2 work item 25, part 25b, `run-g2-native-acceptance-arm64`, assigned by the coordinating session and developed in a briefed subagent ([subagent execution](../../../docs/agent-task-protocol.md#subagent-execution)): the acceptance runner and its records, and the arm64 entries, macOS 26 on Apple Silicon natively and Linux arm64 in the worker image under Docker Desktop. Sources: [docs/g2-plan.md](../../../docs/g2-plan.md) item 25 and D11; [docs/worker-platforms.md](../../../docs/worker-platforms.md#native-acceptance-gates) "Native acceptance gates"; [ADR 0007](../../../docs/decisions/0007-g0-closure.md); the archives of items 24a ([run-g2-failure-scenarios-composition](../archive/2026-10-26-run-g2-failure-scenarios-composition/design.md)), 24b ([run-g2-crash-windows](../archive/2026-10-26-run-g2-crash-windows/design.md), D1 in its decision 9), and 25a ([harden-worker-container-seccomp](../archive/2026-10-26-harden-worker-container-seccomp/design.md)).

- **In scope:** the recorder's acceptance context, the runner, the Linux test image per architecture, two lifecycle scenarios, two journal path tests, the arm64 evidence, and the acceptance table ([acceptance.md](acceptance.md)).
- **Out of scope:** product code, contracts, the x86_64 entries (25c), 24c's partition and races, fixes of any defect found.
- **Defects named in the brief.** D1 is the 24b defect: a relaunch after `not-started` is rejected with `execution-conflict` (24b design decisions 9 and 10); its fix, `fix-launch-recovery-reauthorization`, is not on `dev` at the base. B1, B2, and B4 could not be identified in `docs/` or `openspec/` at the base: the B-numbered items there are coordinator decisions of item 17 (`implement-launch-authority` design, "B1 (a)" to "B9"), not defects, and B3 is the 24c bug fixed by `fix-rejected-launch-slot-release`; the brief places B1, B2, and B4 with 24c, which is not pushed. No proof of this change failed on anything but D1, so none of them had to be cited.

## Revision and environment

- Base: `origin/dev` at `9cec6bb`. Branch `run-g2-native-acceptance-arm64`. Code and documents: `6e596fc` (recorder), `73c0b2f` (Linux test image and targets), `895cdf7` (runner, scenarios, tests), `4868c32` (OpenSpec artifacts and documents); the evidence run ran on `4868c32`, which every record names, and only `results.jsonl`, `acceptance.md`, `tasks.md`, and this file changed after it.
- Host: Apple Silicon Mac, macOS 26.6.2 (build 25G83, Darwin 25.6.0), `arm64`; Node.js 24.22.1 from `.nvmrc` via `nvm use`; GNU bash 3.2.57 as `/bin/bash`.
- Engine: Docker Desktop, Docker Engine 29.6.1, server architecture `aarch64`, kernel 6.12.76-linuxkit, storage driver overlay2; Docker Compose 5.2.0.
- Boot volume: APFS (case-insensitive), 228 GiB with 12 GiB free during the runs. Native data root: a 16 GiB sparse APFS disk image, `hdiutil create -size 16g -type SPARSEBUNDLE -fs APFS -volname "Taskelith Acceptance"`, attached with `hdiutil attach -owners on -nobrowse` at `/Volumes/Taskelith Acceptance` (`apfs, local, nodev, nosuid, journaled, nobrowse`), detached after the runs; its bundle stayed in the session's scratch directory outside the repository (design decision 7).

## Author self-check and evidence check

- AGENTS.md: English only; only the assigned scope; no product code, contract, OpenAPI, AsyncAPI, JSON schema, Compose file, or npm dependency change; the published package is unchanged (`verify:package` passed). Commits use `test`, `build`, and `docs` without attribution; nothing was pushed.
- Comment rule: every new or changed comment in `.ts`, `.sh`, `Dockerfile`, and `Makefile` files has at most two lines of at most 80 characters; `npm run verify:comments` passes.
- ADR 0004: Clean Code and SOLID (the platform probes are pure functions over an injected command runner, apart from the CLI's I/O; the runner's `prove` is one small step reused by every proof; the scenarios reuse the 24a and 25a steps); hexagonal architecture and microkernel untouched (no product module changes; the recorder stays in the test-only harness package); Docker (the Linux entry runs in the worker image and its base); contract-first OpenAPI (no API change); Makefile-driven operation (`make native-acceptance` and the new targets); SDLC through this change; coverage stays above 75 % (figures below).
- Backward compatibility of the recorder: `acceptance` is optional and appears only when `TASKELITH_ACCEPTANCE` is set; the two existing targets and every existing field are unchanged; the 24a, 24b, and 25a callers (`scripts/installation-scenario.ts`, `apps/control-plane/test/crash-windows.integration.test.ts`) needed no change; the only updated assertion is the error message that lists the allowed targets. No code reads `results.jsonl`.
- Timing margins: the new stub tests use deadlines of 12 s for probes that answer at once and the existing 2 s restart bound only for the case that must time out; the lifecycle scenarios reuse the 24a deadlines (60 s start, 60 s restart) and a 30 s stop, against observed values of a few seconds.
- Docker hygiene: the scenarios removed only their own throwaway projects with `down --volumes` and their images; the test containers ran with `--rm` and anonymous volumes; no prune; no other project's container, image, or volume was touched; no installation was left up.
- Specs: new capability `native-worker-acceptance` with a `## Purpose`; `deterministic-test-harness` modifies "Scenario result records" (copied whole, with the two targets) and adds two requirements. `npm run openspec -- validate run-g2-native-acceptance-arm64 --strict` passes.
- Evidence check: the change adds no external link; every link in the change and the touched documents is relative to the repository.

## Checks and results

| Check | Result |
| --- | --- |
| `node --experimental-strip-types --test packages/testing/test/scenario-results.test.ts` | 12 of 12 passed (recorder, acceptance context, malformed contexts) |
| `node --experimental-strip-types --test test/native-acceptance.test.ts test/native-acceptance-runner.test.ts` | 9 and 5 passed (entry and platform probes, context, record, runner `prove` and `summary`) |
| `node --experimental-strip-types --test test/installation-scenarios.test.ts` | 39 of 39 passed, including 8 new lifecycle stub tests |
| `node --experimental-strip-types --test packages/adapters/worker-journal/test/native-paths.test.ts` | 2 of 2 passed on case-insensitive APFS |
| Development run `make scenario-native-worker-lifecycle` with the data root in the temporary directory | Failed as designed: the worker logged `worker.admission-pressure.changed` `disk-floor` (12 GiB free, floor 22.8 GiB) and the first task did not end in 120 s; recorded nowhere (no results file). Led to `NATIVE_DATA_PARENT` (design decision 7) |
| Development run `make scenario-worker-lifecycle` | First run failed with `fetch failed`: the API's ephemeral host port changed after the restart; the scenario now reads it again. Second run passed |
| Development runs `make verify-linux-cgroup`, `make linux-test-suites` (journal, connectivity suites) on Docker Desktop aarch64 | 14 of 14; 93 of 95 with 2 skipped; 25 of 25 |
| Evidence run on `4868c32`: `NATIVE_DATA_PARENT="/Volumes/Taskelith Acceptance" make native-acceptance RESULTS=openspec/changes/run-g2-native-acceptance-arm64/results.jsonl` | Exit 0, "every proof passed": 18 proofs, 46 lines, every line with commit `4868c32`, seed `63367370`, and an `acceptance` field; 35 lines `macos-26-arm64`, 11 `linux-ubuntu-24.04-arm64`; 11 `failed` lines, all crash windows on D1 (the expected failures of 24b); see [acceptance.md](acceptance.md) |
| `npm run openspec -- validate run-g2-native-acceptance-arm64 --strict` | `Change 'run-g2-native-acceptance-arm64' is valid` |
| `make verify` on the final tree (records and documents added to `4868c32`) | Passed: 1887 tests, 1885 passed, 0 failed, 2 skipped (Linux-only scan tests on macOS); coverage 99.28 % lines, 92.09 % branches, 99.03 % functions; comment rule, contract compatibility, dependency inventory, `openspec validate --all --strict` (70 of 70), archive dry run, and package verification passed |

## Candidate product defects

None found. The only failures are D1's, known and asserted by 24b. The disk-floor refusal of the native worker is the specified behavior of the operational targets.

## Limitations

- The Linux entry ran under Docker Desktop's Linux VM (linuxkit kernel), not on an Ubuntu host; its test suites ran in the worker image's base with the host's built tree mounted read-only, because the worker image has no development dependencies.
- The native worker's data root was on a local APFS disk image, not the boot volume, because the boot volume was below the worker's disk floor; the boot volume's APFS was exercised by the suites.
- The native worker ran under the invoking user; a dedicated macOS service account needs the launchd work of G6.
- The rows' open parts are listed in [acceptance.md](acceptance.md); no row is fully accepted on either entry.

## Remaining gates

- Independent review: pending, reviewer to be assigned by the coordinator.
- 25c: the same runner on the x86_64 iMac for `macos-26-x86_64` and `linux-ubuntu-24.04-x86_64`.
- Re-run of the process ownership row on macOS after D1's fix; 24c's rows; integration and archive by the coordinator.
