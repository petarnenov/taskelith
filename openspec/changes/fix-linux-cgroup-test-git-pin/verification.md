# Verification: fix-linux-cgroup-test-git-pin

## Scope and source

Assigned on 2026-11-04 by the coordinator (Niki) to the worker Zaki, size S, developed by a briefed subagent. Source: every case of `make verify-linux-crash-windows` failed on `dev` `163fe9e5` with `git-client-mismatch`, because the Linux test image of `tools/linux-cgroup/Dockerfile` has no `/usr/bin/git` and the worker checks its client against `GIT_CLIENT_PINS.linux` (`packages/modules/workspace/src/domain/git-client.ts:14`). Scope: the pinned Git package and its build checks in `tools/linux-cgroup/Dockerfile`, the agreement test `test/git-package-pin.test.ts`, the `native-worker-acceptance` delta that pass 1 asked for, and this change. Excluded: the Git pin itself, the worker, and other flaky tests. Commit types `test`, `chore`, and `docs`; nothing of the published package changes. Until pass 1 the change set `skip_specs: true`; since the pass 1 fixes it has a spec delta and no doc changes (`proposal.md` "Capabilities").

## Revision

- Base: `dev` `163fe9e5` (#441); the brief's checklist was saved with `--at 163fe9e56e439e7612a39bc170da48e3aa8f93a0 --size S`.
- `009808f2` `test: install the pinned Git client in the Linux test image` (the Dockerfile, the test, the proposal, design, tasks, `checklist.json`, and the empty `findings.jsonl` and `passes.jsonl`).
- `71d00e13` `chore: route the fix linux cgroup test git pin change` (`route.json` unedited).
- `d452ca63` `docs: record the checks of the fix linux cgroup test git pin change` (this record before pass 1).
- Pass 1 fixes: `c84f7927` `test: read the Dockerfile instructions of the worker stages in the Git pin agreement test` (with the pass 1 line of `passes.jsonl`), `863c516c` `docs: specify the pinned Git client of the Linux test image in native-worker-acceptance` (the delta, `.openspec.yaml` without `skip_specs`, proposal, design, tasks), `ab5df31e` and `c1078cb9` (the stale `route.json` dropped and the change routed again), and `f16004f2` `docs: record the pass 1 findings of the fix linux cgroup test git pin change`.
- The commit that adds this record of the pass 1 fixes follows.

## Environment

Zaki's host `hpz600`: Linux 6.8.0-147-generic, x86_64, 8 logical CPUs, Docker Engine 27.3.1. The `make` targets select the `.nvmrc` pin, Node.js 24.22.1; the targeted test runs used Node.js 24.22.0 from the shell's `PATH`, as `node --experimental-strip-types --test test/git-package-pin.test.ts` from the worktree.

## Author self-check

- Base image: both images build on `UBUNTU_BASE` of the `Makefile` (`Makefile:16`, `ubuntu:24.04@sha256:68ee2200...`), Ubuntu 24.04 (noble): `make linux-test-image` passes it as `BASE` (`Makefile:130`) and `scripts/installation.sh` gets it through `INSTALLATION_PINS` (`Makefile:23`). The worker stage's package resolves the same in the test image.
- The Dockerfile change (`tools/linux-cgroup/Dockerfile:12-19` at `009808f2`) copies `ARG GIT_PACKAGE_VERSION=1:2.43.0-1ubuntu7.4`, the `git=${GIT_PACKAGE_VERSION}` install, and the `dpkg-query` and `/usr/bin/git --version` checks of `infra/installation/Dockerfile:61-65`, and removes the apt lists; the worker stage's other cleanup and `SOURCE_DATE_EPOCH` clamping are left out, because the test image is not built reproducibly (`design.md` "Decisions").
- Single source of truth: no mechanism shares a Dockerfile pin today; the `Makefile` passes only the base and Node.js pins. `test/git-package-pin.test.ts` keeps the two pins equal and ties both version checks to `GIT_CLIENT_PINS.linux.version` (`design.md` "One pin, checked by a test").
- `npm run verify:comments`: "Every comment is within the comment length rule."; the new Dockerfile comment is two lines of at most 80 characters. No AI attribution in commits.
- `npm run openspec -- validate fix-linux-cgroup-test-git-pin --strict`: `Change 'fix-linux-cgroup-test-git-pin' is valid`, before pass 1 and again with the delta of `863c516c`.
- Archive test after pass 1: a copy of `openspec/` in the scratchpad, `openspec archive fix-linux-cgroup-test-git-pin -y` with the worktree's pinned CLI (`native-worker-acceptance`: `+ 1 added`), then `openspec validate --specs --strict`: `Totals: 71 passed, 0 failed (71 items)` (`flcgp/fix1-archive-test.log`). The new requirement has 355 characters.
- This also exercises the crash-harness edits of 11c (`require-existing-project-for-runs`, #439) in `apps/control-plane/test/harness-composition.ts` and `test/g2-scenarios/scenario-installation.ts` on Linux, whose verification left `make verify-linux-crash-windows` and `make verify-linux-g2-scenarios` as a remaining gate.

## Logs

The logs stay outside the repository, in Zaki's session scratchpad `/tmp/claude-1000/-home-petar-taskelith/b2f59113-7371-431b-8ca7-f0f5db414984/scratchpad`. The logs of the first runs hold the output only, not the command line or the tree; the runs after pass 1 were started as `env -u NODE_ENV make <target> > <log> 2>&1` with the exit status appended as `exit <n>`.

- `flcgp-before.log`: `make verify-linux-crash-windows` on `163fe9e5` (fail-before).
- `flcgp-after-cw.log` and `flcgp-after-g2.log`: the first after runs.
- `flcgp/fix1-cw.log` and `flcgp/fix1-g2.log`: the runs on `f16004f2`, tree `8f22534b`, after the pass 1 fixes.
- `flcgp/fix1-fail-before.log`, `flcgp/fix1-after.log`, and `flcgp/fix1-old-dockerfile.log`: the agreement test runs of the pass 1 fixes, with the old-logic copy `flcgp/fb-old-git-package-pin.test.ts`.
- `flcgp/fix1-archive-test.log`: the archive of the change in a scratch copy.

## Fail-before

- `make verify-linux-crash-windows` on the unmodified tree of `163fe9e5` (only the untracked change directory added), `flcgp-before.log`: `make: *** [Makefile:154: verify-linux-crash-windows] Error 1`; `tests 29, suites 1, pass 0, fail 29, cancelled 0, skipped 0`. 22 cases failed with `the worker was not killed: {"error":{"code":"precondition-failed","message":"/usr/bin/git is not git version 2.43.0","details":{"reason":"git-client-mismatch"}}}`; the other 7, which wait for a running worker, timed out: "a redelivered offer and assignment give one execution and one result" with `no offer was published`, and CP5 to CP9 and CP11 with `timed out waiting for the supervisor's crash at CP<n>`.
- `test/git-package-pin.test.ts` of `009808f2` with `tools/linux-cgroup/Dockerfile` of `163fe9e5` swapped in, then restored: `tests 2, pass 0, fail 2`; the first with `actual: [ '1:2.43.0-1ubuntu7.4', undefined ]`. With the fix: `tests 2, pass 2, fail 0`. No log of this run was kept.
- Pass 1 L1, the test of `c84f7927`: a copy whose `pinnedGitPackage` is the literal matching and anchored `ARG` regex of `009808f2` (`flcgp/fb-old-git-package-pin.test.ts`), run from the worktree as `node --experimental-strip-types --test test/fb-old-git-package-pin.test.ts` and then deleted: `tests 8, pass 4, fail 4` (`flcgp/fix1-fail-before.log`). The failures are "a commented-out check pins nothing", "equivalent whitespace in the RUN keeps the pin", "a trailing space after the ARG keeps the pin", and "a check in another stage does not pin the named stage". "a check of another client version pins nothing" and "mismatched package versions are different pins" pass with both versions. The new test: `tests 8, pass 8, fail 0` (`flcgp/fix1-after.log`); with `tools/linux-cgroup/Dockerfile` of `163fe9e5` swapped in, then restored, its first test fails, `tests 8, pass 7, fail 1` (`flcgp/fix1-old-dockerfile.log`).

## After

| Check | Revision | Result |
| --- | --- | --- |
| `make verify-linux-crash-windows` | working tree before the commit `009808f2`, as recorded before pass 1; the log names no tree (`flcgp-after-cw.log`) | `tests 29, suites 1, pass 29, fail 0, cancelled 0, skipped 0`, `duration_ms 66294`; no `git-client-mismatch` in the log |
| `make verify-linux-g2-scenarios` | the same tree (`flcgp-after-g2.log`) | `tests 18, suites 4, pass 17, fail 0, cancelled 0, skipped 1`; the skip is race g, `not applicable off macOS: only a macOS adopter leaves a cancel unapplied`; seeds `110679307` (cancellation races), `4283259331` (partitions), and `3067852930` (stale generations) |
| `env -u NODE_ENV make verify-linux-crash-windows` | `f16004f2`, tree `8f22534b`, clean (`flcgp/fix1-cw.log`) | `exit 0`; `tests 29, suites 1, pass 29, fail 0, cancelled 0, skipped 0`, `duration_ms 66588`; no `git-client-mismatch` in the log |
| `env -u NODE_ENV make verify-linux-g2-scenarios` | the same tree (`flcgp/fix1-g2.log`) | `exit 0`; `tests 18, suites 4, pass 17, fail 0, cancelled 0, skipped 1`; the skip is race g, as above; seeds `2317296863`, `2097202248`, and `114639551` |
| `env -u NODE_ENV make verify` | `71d00e13` (tree `5d33f134`) | Passed on the first run, no known flake, profile full, stamp written; tests 4815, pass 4768, fail 0, skipped 47 (totals and coverage in "Generated checks"); both tests of `test/git-package-pin.test.ts` passed |

### Route

Before pass 1, route (`route.json` of `71d00e13`, rule version 5): elevated (docker); pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-fable-5-1#high`, pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding. The shadow router (jev-1.14.0) disagreed: standard, P(third) 0.18, threshold 0.4, with all three reviewers at medium. The route is a recommendation only; the reviews run at effort medium, owner decision 2026-11-02, so the elevated high efforts are not used.

The pass 1 fixes changed the diff, a spec delta and a new test, so `ab5df31e` dropped that `route.json` and `c1078cb9` routed the change again with `bash -lc 'make findings ARGS="route --change fix-linux-cgroup-test-git-pin"'`, committed unedited: elevated (docker), rule version 5, the same reviewers and efforts; the shadow router again disagreed, standard, P(third) 0.33, threshold 0.4, all three reviewers at medium.

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

The worker runs the passes that the coordinator assigns. The review effort is medium, owner decision 2026-11-02.

### Pass 1

Codex `gpt-6-astra`, effort medium, role A, session `01a1a5c4-ff35-7f93-abf8-9d51d745fdd8`, on `d452ca63`: Critical 0, High 0, Medium 1, Low 1 (`passes.jsonl`, `findings.jsonl`). Both are fixed; they need pass 2, because pass 1 reported a Medium finding.

- M1 (`process`, `.openspec.yaml:3`): `skip_specs` is for documentation-only work. Fixed in `863c516c`: no `skip_specs`, and the `native-worker-acceptance` requirement "Pinned Git client in the Linux test image" (`specs/native-worker-acceptance/spec.md`), whose capability `design.md` "Spec delta in `native-worker-acceptance`" justifies.
- L1 (`missing-fail-before-test`, `test/git-package-pin.test.ts:23`): the test matched literal text. Fixed in `c84f7927`: the test reads the instructions of the worker stage and the last stage (`design.md` "Instructions, not text"), with seven focused cases; fail-before under "Fail-before".
- The reviewer could not check the crash-window and G2 results against logs; "Logs" now names them, and the runs after pass 1 name their tree.

## Limitations

- The fix was run on one x86_64 Linux host only; the aarch64 build of the test image was not run.
- The image build needs the Ubuntu package mirror and the package revision `1ubuntu7.4`, as the worker image does.

## Remaining gates

- Independent review pass 2, and pass 3 if pass 2 reports a Medium or worse finding.
- Archive of the change.
- Integration into dev by the coordinator (single pull request)
