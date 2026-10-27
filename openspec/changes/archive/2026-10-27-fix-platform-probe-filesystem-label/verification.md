# Verification

Date: 2026-10-27. The author's verification, review passes 1 and 2, and the archive checks are recorded below.

## Scope and source

Coordinator Niki assigned `fix-platform-probe-filesystem-label` after another worker session saw the native acceptance platform probe name an ext4 file system `ext2/ext3` on its Ubuntu host. The session developed it in a briefed and checked subagent ([subagent execution](../../../docs/agent-task-protocol.md#subagent-execution)), in worktree `taskelith-worktrees/fix-platform-probe-filesystem-label` on branch `fix-platform-probe-filesystem-label`.

- **Base revision:** `fe64386` on `dev`.
- **Revision verified:** `c87ada8` (the probe, its tests, and the OpenSpec records before this file), on which `make verify` ran; after review pass 1, `082ff61` with the M1 fix and `d7537a7` with its records, on which `make verify` ran again.
- **Scope:** the file system probe of `linuxPlatform` in `scripts/native-acceptance.ts` and of `platform` and `volume_of` in `scripts/installation-scenarios.sh`, their tests, and the `native-worker-acceptance` delta.
- **Out of scope:** the macOS entry (`diskutil`), the other platform facts, and any record already written with `ext2/ext3`.

## Environment

This Linux host: Ubuntu 24.04.5 LTS, kernel Linux 6.8.0-147-generic, Docker engine 27.3.1, Node.js from `.nvmrc` (24.22.1). On the worktree path, `stat -f -c %T .` prints `ext2/ext3`, while `findmnt -no FSTYPE --target .` and the new probe print `ext4`. In a container of the pinned base `ubuntu:24.04@sha256:68ee2200…` with an anonymous volume at `/probe`, the new probe prints `ext4`; in `taskelith-worker:local` with a named volume at `/var/lib/taskelith`, the probe prints `ext4` and `stat -f -c %T` alone `ext2/ext3`.

## Author self-check

- One probe, `findmnt -no FSTYPE --target "$1" 2>/dev/null || stat -f -c %T "$1"`, is `FILE_SYSTEM_PROBE` in both files; a test checks the shell variable equals the TypeScript constant.
- The macOS path is untouched; its test still passes unchanged. `volume_of` keeps its macOS `diskutil` branch.
- After pass 1, `grep -rn 'stat -f' scripts/ infra/ Makefile` finds no other file system label: the remaining `stat -f %Lp` in `mode_of` is the BSD form that prints a file mode.
- Every new comment is at most two lines of at most 80 characters; `npm run verify:comments` passes.
- Commit types are `chore` and `docs`; only scripts, tests, and records change, and no published package.
- **Redaction:** the probe prints only a file system type name; no secret, path outside the probed one, or private value reaches output, logs, or records. The environment above names only public host facts.
- **Contract drift:** the code, the delta of "Platform facts of a proof", the proposal, and the design describe the same probe and fallback. No OpenAPI contract or wire message changes.
- **Error handling:** `2>/dev/null` hides only `findmnt`'s own message when it is missing or fails, and the fallback then runs; a failing `stat` still fails the probe with its own status and message, as before the change (`execFileSync` throws in TypeScript; the shell library's assignment fails as it did). No failure is newly swallowed or misreported.

## Evidence check

- **Fails on the old code.** With `FILE_SYSTEM_PROBE` exported but `linuxPlatform` still running `stat -f -c %T /probe`, `node --experimental-strip-types --test test/native-acceptance.test.ts` gave 11 tests, 10 pass, 1 fail: `the Linux entry is the image release under the engine architecture` failed with `Error: unexpected command: docker run --rm --volume /probe ubuntu:24.04@sha256:68ee stat -f -c %T /probe`. With the old `platform` in the shell library, `node --experimental-strip-types --test test/installation-scenarios.test.ts` gave 43 tests, 41 pass, 2 fail: `the platform row names the type of the worker data root mount` (actual `file system ext2/ext3 (worker data root)`) and `the platform row probes the file system as the native acceptance does` (actual empty).
- **Passes on the new code.** Both files together: 54 tests, 54 pass, 0 fail.
- **Review pass 1 (M1).** With the old `volume_of` (`4b5d2d0`), `node --experimental-strip-types --test test/installation-scenarios.test.ts` gave 44 tests, 43 pass, 1 fail: `the native worker volume names the type of its Linux mount` (actual `ext2/ext3 at '/' with 524 GiB free`). With the fix (`082ff61`), both files: 55 tests, 55 pass, 0 fail. On this host `volume_of .` in the worktree prints `ext4 at '/' with 524 GiB free`. The test runs with `PATH` limited to the stubs, `/usr/bin`, and `/bin`, so a macOS `diskutil` in `/usr/sbin` does not take the macOS branch.
- **Determinism.** The tests run stub `findmnt` and `stat` programs from a temporary directory and answer fixed text; no timing is involved.

## Checks

- `npm run openspec -- validate fix-platform-probe-filesystem-label --strict`: valid.
- `npm run verify:comments`: every comment is within the comment length rule.
- `make verify` at `c87ada8`: exit 0; 2021 tests, 1975 pass, 0 fail, 46 skipped (the macOS-only native supervision suites, skipped on this Linux host); coverage lines 99.19%, branches 91.88%, functions 98.80%; comment length, findings validation, `validate --all --strict` (70 passed), archive dry run, and package verification passed. No flaky rerun was needed. Only this file changed afterwards.
- After review pass 1, at `d7537a7`: `npm run openspec -- validate fix-platform-probe-filesystem-label --strict` valid; `npm run verify:comments` passed; `make findings ARGS="validate"`: every findings file is valid (3 files); `make verify` exit 0, 2022 tests, 1976 pass, 0 fail, 46 skipped (the same macOS-only suites); coverage lines 99.19%, branches 91.86%, functions 98.80%; `validate --all --strict` 70 passed; archive dry run and package verification passed; no flaky rerun was needed. Only this file changed afterwards.

## Independent review

### Pass 1

- **Reviewer:** OpenCode CLI, model `opencode-go/kimi-k2.7-code`, default variant, `reviewer` agent (read-only), assigned by the coordinator and run by the session from the worktree.
- **Invocation:** `opencode run --standalone --agent reviewer -m 'opencode-go/kimi-k2.7-code' --format json --title fix-platform-probe-filesystem-label "$(cat <prompt-file>)" < /dev/null > <log>`.
- **Revision:** `e75e173`, diff `fe64386..e75e173`.
- **Session:** `ses_e8406820effepKVtaNp0QOzyYp`.
- **Snapshot:** `ff385e7059a32ba3bcbabca2bb05fab1192ee9f705d982cb7e3f0ffebe5fbf35` before and after; unchanged.
- **Findings:** 0 Critical, 0 High, 1 Medium, 0 Low; fixed in `4b5d2d0` and `082ff61`, confirmed by pass 2. Recorded in `findings.jsonl` as `fixed`.
  1. **M1 (contract-drift):** `volume_of` in `scripts/installation-scenarios.sh:636` still named a Linux native worker's file system with `stat -f -c %T`, so its lifecycle record could say `ext2/ext3` for ext4. **Fixed:** its Linux branch runs `sh -c "$FILE_SYSTEM_PROBE" sh "$mount_point"`; the macOS branch is unchanged. The test `the native worker volume names the type of its Linux mount` failed before and passes after; the delta's ext4 scenario, the proposal, and the design name the native worker volume. No other `stat -f` file system label is left in `scripts/`.
- **Checklist with no findings:** redaction and error handling (fallback quoting, `findmnt` stderr, a failing `stat` still failing).

### Pass 2

- **Reviewer and invocation:** as in pass 1 (OpenCode CLI, `opencode-go/kimi-k2.7-code`, default variant, `reviewer` agent, read-only).
- **Revision:** `5e08d88`; the pass 1 resolutions are `e75e173..5e08d88`, the whole change `fe64386..5e08d88`.
- **Session:** `ses_e83fb7fd2ffetIk8iBAk6L8p7d`.
- **Snapshot:** `0692e9e4243541ccc1a604d8d07065c635cad141144fdb3cab06d49e9075bf75` before and after; unchanged.
- **Pass 1 findings:** M1 resolved: `volume_of` runs the shared probe, its macOS branch is unchanged, and no other `stat -f` file system label is left in `scripts/`.
- **New findings:** 0 Critical, 0 High, 0 Medium, 1 Low. A Low-only pass is fixed without another review ([review process](../../../docs/governance.md#independent-review-process)).
  1. **L1 (docs):** task 3.1 in `tasks.md:17` called `findings.jsonl` empty although it holds M1. **Fixed, unreviewed:** the task names `findings.jsonl` with the review findings; recorded in `findings.jsonl` as `fixed-unreviewed`.
- **Checklist with no findings:** redaction, contract drift apart from L1, and error handling.

## Limitations

- An image without `findmnt`, or one where it fails, keeps the `ext2/ext3` label for ext4 through the `stat -f` fallback.
- The probe was checked on this Linux host with Docker Engine; it was not run on Docker Desktop or on a macOS host, whose path does not change.
- Records written before this change keep their `ext2/ext3` label.

## Remaining gates

- Integration into dev by the coordinator (single pull request).

## Archive checks

Worker step 7, run after review pass 2 and its unreviewed L1 fix. The checked state is the tree of the archive commit, the working tree these checks ran on after `npm run openspec -- archive fix-platform-probe-filesystem-label --yes` (base `f02cb57`), which applied the delta to `native-worker-acceptance` (1 requirement modified).

- `npm run openspec -- validate --all --strict`: 69 passed, 0 failed.
- `npm run openspec -- validate --archived --no-interactive`: this change's line `change/2026-10-27-fix-platform-probe-filesystem-label` passes.
- `git diff "$(git merge-base HEAD origin/dev)" -- openspec/specs`: only `openspec/specs/native-worker-acceptance/spec.md`, where "Platform facts of a proof" gains the mount-type sentence and the scenarios "An ext4 volume on Linux" and "No mount type readable"; the existing scenario is unchanged.
- The moved change has its `findings.jsonl` (M1 `fixed`, L1 `fixed-unreviewed`); `make findings ARGS="validate"`: every findings file is valid (3 files).
- `make verify`: exit 0; 2022 tests, 1976 pass, 0 fail, 46 skipped (the macOS-only native supervision suites); coverage lines 99.19%, branches 91.86%, functions 98.80%; `validate --all --strict` 69 passed; archive dry run and package verification passed; no flaky rerun was needed.
- `origin/dev` moved to `33d341a` after the base `fe64386`; the branch is not merged with it. The new commits touch none of this change's scripts, tests, or living spec.
