# Verification

Date: 2026-10-27. The author's verification is recorded below; the independent review is pending.

## Scope and source

Coordinator Niki assigned `fix-platform-probe-filesystem-label` after another worker session saw the native acceptance platform probe name an ext4 file system `ext2/ext3` on its Ubuntu host. The session developed it in a briefed and checked subagent ([subagent execution](../../../docs/agent-task-protocol.md#subagent-execution)), in worktree `taskelith-worktrees/fix-platform-probe-filesystem-label` on branch `fix-platform-probe-filesystem-label`.

- **Base revision:** `fe64386` on `dev`.
- **Revision verified:** `c87ada8` (the probe, its tests, and the OpenSpec records before this file), on which `make verify` ran.
- **Scope:** the file system probe of `linuxPlatform` in `scripts/native-acceptance.ts` and of `platform` in `scripts/installation-scenarios.sh`, their tests, and the `native-worker-acceptance` delta.
- **Out of scope:** the macOS entry (`diskutil`), the other platform facts, and any record already written with `ext2/ext3`.

## Environment

This Linux host: Ubuntu 24.04.5 LTS, kernel Linux 6.8.0-147-generic, Docker engine 27.3.1, Node.js from `.nvmrc` (24.22.1). On the worktree path, `stat -f -c %T .` prints `ext2/ext3`, while `findmnt -no FSTYPE --target .` and the new probe print `ext4`. In a container of the pinned base `ubuntu:24.04@sha256:68ee2200…` with an anonymous volume at `/probe`, the new probe prints `ext4`; in `taskelith-worker:local` with a named volume at `/var/lib/taskelith`, the probe prints `ext4` and `stat -f -c %T` alone `ext2/ext3`.

## Author self-check

- One probe, `findmnt -no FSTYPE --target "$1" 2>/dev/null || stat -f -c %T "$1"`, is `FILE_SYSTEM_PROBE` in both files; a test checks the shell variable equals the TypeScript constant.
- The macOS path is untouched; its test still passes unchanged.
- Every new comment is at most two lines of at most 80 characters; `npm run verify:comments` passes.
- Commit types are `chore` and `docs`; only scripts, tests, and records change, and no published package.
- **Redaction:** the probe prints only a file system type name; no secret, path outside the probed one, or private value reaches output, logs, or records. The environment above names only public host facts.
- **Contract drift:** the code, the delta of "Platform facts of a proof", the proposal, and the design describe the same probe and fallback. No OpenAPI contract or wire message changes.
- **Error handling:** `2>/dev/null` hides only `findmnt`'s own message when it is missing or fails, and the fallback then runs; a failing `stat` still fails the probe with its own status and message, as before the change (`execFileSync` throws in TypeScript; the shell library's assignment fails as it did). No failure is newly swallowed or misreported.

## Evidence check

- **Fails on the old code.** With `FILE_SYSTEM_PROBE` exported but `linuxPlatform` still running `stat -f -c %T /probe`, `node --experimental-strip-types --test test/native-acceptance.test.ts` gave 11 tests, 10 pass, 1 fail: `the Linux entry is the image release under the engine architecture` failed with `Error: unexpected command: docker run --rm --volume /probe ubuntu:24.04@sha256:68ee stat -f -c %T /probe`. With the old `platform` in the shell library, `node --experimental-strip-types --test test/installation-scenarios.test.ts` gave 43 tests, 41 pass, 2 fail: `the platform row names the type of the worker data root mount` (actual `file system ext2/ext3 (worker data root)`) and `the platform row probes the file system as the native acceptance does` (actual empty).
- **Passes on the new code.** Both files together: 54 tests, 54 pass, 0 fail.
- **Determinism.** The tests run stub `findmnt` and `stat` programs from a temporary directory and answer fixed text; no timing is involved.

## Checks

- `npm run openspec -- validate fix-platform-probe-filesystem-label --strict`: valid.
- `npm run verify:comments`: every comment is within the comment length rule.
- `make verify` at `c87ada8`: exit 0; 2021 tests, 1975 pass, 0 fail, 46 skipped (the macOS-only native supervision suites, skipped on this Linux host); coverage lines 99.19%, branches 91.88%, functions 98.80%; comment length, findings validation, `validate --all --strict` (70 passed), archive dry run, and package verification passed. No flaky rerun was needed. Only this file changed afterwards.

## Independent review

### Pass 1

Pending: the independent review by OpenCode CLI, model `opencode-go/kimi-k2.7-code`, assigned by the coordinator, run by the session.

## Limitations

- An image without `findmnt`, or one where it fails, keeps the `ext2/ext3` label for ext4 through the `stat -f` fallback.
- The probe was checked on this Linux host with Docker Engine; it was not run on Docker Desktop or on a macOS host, whose path does not change.
- Records written before this change keep their `ext2/ext3` label.

## Remaining gates

- Independent review pass 1 and the resolution of its findings in this file and `findings.jsonl`.
- Handoff by the session, and integration and archive by the coordinator.
