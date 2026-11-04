# Verification: fix-linux-cgroup-test-git-pin

## Scope and source

Assigned on 2026-11-04 by the coordinator (Niki) to the worker Zaki, size S, developed by a briefed subagent. Source: every case of `make verify-linux-crash-windows` failed on `dev` `163fe9e5` with `git-client-mismatch`, because the Linux test image of `tools/linux-cgroup/Dockerfile` has no `/usr/bin/git` and the worker checks its client against `GIT_CLIENT_PINS.linux` (`packages/modules/workspace/src/domain/git-client.ts:14`). Scope: the pinned Git package and its build checks in `tools/linux-cgroup/Dockerfile`, the agreement test `test/git-package-pin.test.ts`, and this change. Excluded: the Git pin itself, the worker, and other flaky tests. Commit types `test`, `chore`, and `docs`; nothing of the published package changes. No spec or doc changes (`proposal.md` "Capabilities", `skip_specs: true`).

## Revision

- Base: `dev` `163fe9e5` (#441); the brief's checklist was saved with `--at 163fe9e56e439e7612a39bc170da48e3aa8f93a0 --size S`.
- `009808f2` `test: install the pinned Git client in the Linux test image` (the Dockerfile, the test, the proposal, design, tasks, `checklist.json`, and the empty `findings.jsonl` and `passes.jsonl`).
- `71d00e13` `chore: route the fix linux cgroup test git pin change` (`route.json` unedited).
- The commit that adds this record follows.

## Environment

Zaki's host `hpz600`: Linux 6.8.0-147-generic, x86_64, 8 logical CPUs, Docker Engine 27.3.1. The `make` targets select the `.nvmrc` pin, Node.js 24.22.1; the targeted test runs used Node.js 24.22.0 from the shell's `PATH`, as `node --experimental-strip-types --test test/git-package-pin.test.ts` from the worktree.

## Author self-check

- Base image: both images build on `UBUNTU_BASE` of the `Makefile` (`Makefile:16`, `ubuntu:24.04@sha256:68ee2200...`), Ubuntu 24.04 (noble): `make linux-test-image` passes it as `BASE` (`Makefile:130`) and `scripts/installation.sh` gets it through `INSTALLATION_PINS` (`Makefile:23`). The worker stage's package resolves the same in the test image.
- The Dockerfile change (`tools/linux-cgroup/Dockerfile:12-19` at `009808f2`) copies `ARG GIT_PACKAGE_VERSION=1:2.43.0-1ubuntu7.4`, the `git=${GIT_PACKAGE_VERSION}` install, and the `dpkg-query` and `/usr/bin/git --version` checks of `infra/installation/Dockerfile:61-65`, and removes the apt lists; the worker stage's other cleanup and `SOURCE_DATE_EPOCH` clamping are left out, because the test image is not built reproducibly (`design.md` "Decisions").
- Single source of truth: no mechanism shares a Dockerfile pin today; the `Makefile` passes only the base and Node.js pins. `test/git-package-pin.test.ts` keeps the two pins equal and ties both version checks to `GIT_CLIENT_PINS.linux.version` (`design.md` "One pin, checked by a test").
- `npm run verify:comments`: "Every comment is within the comment length rule."; the new Dockerfile comment is two lines of at most 80 characters. No AI attribution in commits.
- `npm run openspec -- validate fix-linux-cgroup-test-git-pin --strict`: `Change 'fix-linux-cgroup-test-git-pin' is valid`.
- This also exercises the crash-harness edits of 11c (`require-existing-project-for-runs`, #439) in `apps/control-plane/test/harness-composition.ts` and `test/g2-scenarios/scenario-installation.ts` on Linux, whose verification left `make verify-linux-crash-windows` and `make verify-linux-g2-scenarios` as a remaining gate.

## Fail-before

- `make verify-linux-crash-windows` on the unmodified tree of `163fe9e5` (only the untracked change directory added): exit 2; `tests 29, suites 1, pass 0, fail 29, cancelled 0, skipped 0`. 22 cases failed with `the worker was not killed: {"error":{"code":"precondition-failed","message":"/usr/bin/git is not git version 2.43.0","details":{"reason":"git-client-mismatch"}}}`; the other 7, which wait for a running worker, timed out: "a redelivered offer and assignment give one execution and one result" with `no offer was published`, and CP5 to CP9 and CP11 with `timed out waiting for the supervisor's crash at CP<n>`.
- `test/git-package-pin.test.ts` with `tools/linux-cgroup/Dockerfile` of `163fe9e5` swapped in, then restored: `tests 2, pass 0, fail 2`; the first with `actual: [ '1:2.43.0-1ubuntu7.4', undefined ]`. With the fix: `tests 2, pass 2, fail 0`.

## After

| Check | Revision | Result |
| --- | --- | --- |
| `make verify-linux-crash-windows` | working tree of `009808f2` before its commit (the committed diff) | exit 0; `tests 29, suites 1, pass 29, fail 0, cancelled 0, skipped 0`, `duration_ms 66294`; no `git-client-mismatch` in the log |
| `make verify-linux-g2-scenarios` | the same tree | exit 0; `tests 18, suites 4, pass 17, fail 0, cancelled 0, skipped 1`; the skip is race g, `not applicable off macOS: only a macOS adopter leaves a cancel unapplied`; seeds `110679307` (cancellation races) and `4283259331` (partitions) |
| `env -u NODE_ENV make verify` | `71d00e13` (tree `5d33f134`) | Passed on the first run, no known flake, profile full, stamp written; tests 4815, pass 4768, fail 0, skipped 47 (totals and coverage in "Generated checks"); both tests of `test/git-package-pin.test.ts` passed |

### Route

Route (`route.json`, rule version 5): elevated (docker); pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-fable-5-1#high`, pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding. The shadow router (jev-1.14.0) disagreed: standard, P(third) 0.18, threshold 0.4, with all three reviewers at medium. The route is a recommendation only; the reviews run at effort medium, owner decision 2026-11-02, so the elevated high efforts are not used.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `5d33f134ef3aa51380ecb3a694902ca3e2156f46`; tests 4815, pass 4768, fail 0, skipped 47; all files 99.42% lines, 92.92% branches, 98.86% functions.
- `npm run openspec -- validate fix-linux-cgroup-test-git-pin --strict`: passed, `Change 'fix-linux-cgroup-test-git-pin' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 118 file(s); every pass summary file is valid: 98 file(s); every route file is valid: 51 file(s).`.
- Spec diff against the merge base `163fe9e56e43` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

Not yet run; the worker runs the passes that the coordinator assigns. The review effort is medium, owner decision 2026-11-02.

## Limitations

- The fix was run on one x86_64 Linux host only; the aarch64 build of the test image was not run.
- The image build needs the Ubuntu package mirror and the package revision `1ubuntu7.4`, as the worker image does.

## Remaining gates

- Independent review passes 1 to 3 as the review process requires.
- Archive of the change.
- Integration into dev by the coordinator (single pull request)
