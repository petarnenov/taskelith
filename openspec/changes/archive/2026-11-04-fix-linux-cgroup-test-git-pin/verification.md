# Verification: fix-linux-cgroup-test-git-pin

## Scope and source

Assigned on 2026-11-04 by the coordinator (Niki) to the worker Zaki, size S, developed by a briefed subagent. Source: every case of `make verify-linux-crash-windows` failed on `dev` `163fe9e5` with `git-client-mismatch`, because the Linux test image of `tools/linux-cgroup/Dockerfile` has no `/usr/bin/git` and the worker checks its client against `GIT_CLIENT_PINS.linux` (`packages/modules/workspace/src/domain/git-client.ts:14`). Scope: the pinned Git package and its build checks in `tools/linux-cgroup/Dockerfile`, the agreement test `test/git-package-pin.test.ts`, the `native-worker-acceptance` delta that pass 1 asked for, and this change. Excluded: the Git pin itself, the worker, and other flaky tests. Commit types `test`, `chore`, and `docs`; nothing of the published package changes. Until pass 1 the change set `skip_specs: true`; since the pass 1 fixes it has a spec delta (`proposal.md` "Capabilities"), and since the pass 2 fixes it updates the Ubuntu 24.04 row of `docs/dependencies.md`.

## Revision

- Base: `dev` `163fe9e5` (#441); the brief's checklist was saved with `--at 163fe9e56e439e7612a39bc170da48e3aa8f93a0 --size S`.
- `009808f2` `test: install the pinned Git client in the Linux test image` (the Dockerfile, the test, the proposal, design, tasks, `checklist.json`, and the empty `findings.jsonl` and `passes.jsonl`).
- `71d00e13` `chore: route the fix linux cgroup test git pin change` (`route.json` unedited).
- `d452ca63` `docs: record the checks of the fix linux cgroup test git pin change` (this record before pass 1).
- Pass 1 fixes: `c84f7927` `test: read the Dockerfile instructions of the worker stages in the Git pin agreement test` (with the pass 1 line of `passes.jsonl`), `863c516c` `docs: specify the pinned Git client of the Linux test image in native-worker-acceptance` (the delta, `.openspec.yaml` without `skip_specs`, proposal, design, tasks), `ab5df31e` and `c1078cb9` (the stale `route.json` dropped and the change routed again), and `f16004f2` `docs: record the pass 1 findings of the fix linux cgroup test git pin change`.
- `d52c06fb` and `93543a78` record the pass 1 fix round and its checks.
- Pass 2 fixes: `8b2a5aa8` `test: install the pinned Git client before Node.js in the Linux test image` (with the pass 2 line of `passes.jsonl`) and `635ac3a7` `docs: state the pinned Git client of the Linux test image and correct the citations of its change`.
- The commits that record the pass 2 fix round and its checks follow, and the archive is the last commit of the branch.

## Environment

Zaki's host `hpz600`: Linux 6.8.0-147-generic, x86_64, 8 logical CPUs, Docker Engine 27.3.1. The `make` targets select the `.nvmrc` pin, Node.js 24.22.1; the targeted test runs used Node.js 24.22.0 from the shell's `PATH`, as `node --experimental-strip-types --test test/git-package-pin.test.ts` from the worktree.

## Author self-check

- Base image: both images build on `UBUNTU_BASE` of the `Makefile` (`Makefile:16`, `ubuntu:24.04@sha256:68ee2200...`), Ubuntu 24.04 (noble): `make linux-test-image` passes it as `BASE` (`Makefile:130`) and `scripts/installation.sh` gets it through `INSTALLATION_PINS` (`Makefile:23`). The worker stage's package resolves the same in the test image.
- The Dockerfile change (`tools/linux-cgroup/Dockerfile:12-19` at `009808f2`) copies `ARG GIT_PACKAGE_VERSION=1:2.43.0-1ubuntu7.4`, the `git=${GIT_PACKAGE_VERSION}` install, and the `dpkg-query` and `/usr/bin/git --version` checks of `infra/installation/Dockerfile:61-65`, and removes the apt lists; the worker stage's other cleanup and `SOURCE_DATE_EPOCH` clamping are left out, because the test image is not built reproducibly (`design.md` "Decisions").
- Single source of truth: no mechanism shares a Dockerfile pin today; the `Makefile` passes only the base and Node.js pins. `test/git-package-pin.test.ts` keeps the two pins equal and ties both version checks to `GIT_CLIENT_PINS.linux.version` (`design.md` "One pin, checked by a test").
- `npm run verify:comments`: "Every comment is within the comment length rule."; the new Dockerfile comment is two lines of at most 80 characters. No AI attribution in commits.
- `npm run openspec -- validate fix-linux-cgroup-test-git-pin --strict`: `Change 'fix-linux-cgroup-test-git-pin' is valid`, before pass 1 and again with the delta of `863c516c`.
- Archive test after pass 1: a copy of `openspec/` in the scratchpad, `openspec archive fix-linux-cgroup-test-git-pin -y` with the worktree's pinned CLI (`native-worker-acceptance`: `+ 1 added`), then `openspec validate --specs --strict`: `Totals: 71 passed, 0 failed (71 items)` (`flcgp/fix1-archive-test.log`). The new requirement has 355 characters. After the pass 2 fixes, the same test on a fresh copy at `a44055c7` (`native-worker-acceptance: update`): `Totals: 71 passed, 0 failed (71 items)` (`flcgp/fix2-archive-test.log`); the reworded requirement has 408 characters.
- This also exercises the crash-harness edits of 11c (`require-existing-project-for-runs`, #439) in `apps/control-plane/test/harness-composition.ts` and `test/g2-scenarios/scenario-installation.ts` on Linux, whose verification left `make verify-linux-crash-windows` and `make verify-linux-g2-scenarios` as a remaining gate.

## Logs

The logs stay outside the repository, in Zaki's session scratchpad `/tmp/claude-1000/-home-petar-taskelith/b2f59113-7371-431b-8ca7-f0f5db414984/scratchpad`. The logs of the first runs hold the output only, not the command line or the tree; the runs after pass 1 were started as `env -u NODE_ENV make <target> > <log> 2>&1` with the exit status appended as `exit <n>`.

- `flcgp-before.log`: `make verify-linux-crash-windows` on `163fe9e5` (fail-before).
- `flcgp-after-cw.log` and `flcgp-after-g2.log`: the first after runs.
- `flcgp/fix1-cw.log` and `flcgp/fix1-g2.log`: the runs on `f16004f2`, tree `8f22534b`, after the pass 1 fixes.
- `flcgp/fix1-fail-before.log`, `flcgp/fix1-after.log`, and `flcgp/fix1-old-dockerfile.log`: the agreement test runs of the pass 1 fixes, with the old-logic copy `flcgp/fb-old-git-package-pin.test.ts`.
- `flcgp/fix1-archive-test.log`: the archive of the change in a scratch copy.
- `flcgp/fix2-cw.log` and `flcgp/fix2-g2.log`: the runs on `635ac3a7`, tree `ae824160`, after the pass 2 fixes.
- `flcgp/fix2-verify-1.log` and `flcgp/fix2-verify-2.log`: the `make verify` runs on `a44055c7`, tree `3339aaae`.
- `flcgp/fix2-archive-test.log`: the archive of the change in a scratch copy after the pass 2 fixes.

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
| `env -u NODE_ENV make verify-linux-crash-windows` | `635ac3a7`, tree `ae824160`, clean, after the pass 2 fixes (`flcgp/fix2-cw.log`) | `exit 0`; `tests 29, suites 1, pass 29, fail 0, cancelled 0, skipped 0`, `duration_ms 68019`; no `git-client-mismatch` in the log |
| `env -u NODE_ENV make verify-linux-g2-scenarios` | the same tree (`flcgp/fix2-g2.log`) | `exit 0`; `tests 18, suites 4, pass 17, fail 0, cancelled 0, skipped 1`; the skip is race g, as above; seeds `2501117062`, `3500388998`, and `2973150950` |
| `env -u NODE_ENV make verify` | `71d00e13` (tree `5d33f134`) | Passed on the first run, no known flake, profile full, stamp written; tests 4815, pass 4768, fail 0, skipped 47 (the record before pass 1: all files 99.42% lines, 92.92% branches, 98.86% functions); both tests of `test/git-package-pin.test.ts` passed |
| `env -u NODE_ENV make verify` | `d52c06fb` (tree `e3661192`), after the pass 1 fixes (`flcgp/fix1-verify-1.log`; `make record` read a copy without the appended `exit 0`) | Passed on the first run, no known flake, profile full, stamp written; tests 4821, pass 4774, fail 0, skipped 47; all files 99.42% lines, 92.91% branches, 98.84% functions; the eight tests of `test/git-package-pin.test.ts` passed |
| `env -u NODE_ENV make verify` | `a44055c7` (tree `3339aaae`), after the pass 2 fixes, run 1 (`flcgp/fix2-verify-1.log`) | Failed on the known flake secrets linear-time: `value redaction takes linear time on long runs` with `"a b" repeated took 305 ms` (`packages/adapters/secrets/test/secrets.test.ts:218`); tests 4821, pass 4773, fail 1, skipped 47; `make: *** [Makefile:42: verify] Error 2` |
| `env -u NODE_ENV make verify` | the same tree, run 2, the one rerun (`flcgp/fix2-verify-2.log`; `make record` read a copy without the appended `exit 0`) | Passed, profile full, stamp written; tests 4821, pass 4774, fail 0, skipped 47; all files 99.42% lines, 92.89% branches, 98.83% functions; the flaky test passed in 528 ms |

### Route

Before pass 1, route (`route.json` of `71d00e13`, rule version 5): elevated (docker); pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-fable-5-1#high`, pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding. The shadow router (jev-1.14.0) disagreed: standard, P(third) 0.18, threshold 0.4, with all three reviewers at medium. The route is a recommendation only; the reviews run at effort medium, owner decision 2026-11-02, so the elevated high efforts are not used.

The pass 1 fixes changed the diff, a spec delta and a new test, so `ab5df31e` dropped that `route.json` and `c1078cb9` routed the change again with `bash -lc 'make findings ARGS="route --change fix-linux-cgroup-test-git-pin"'`, committed unedited: elevated (docker), rule version 5, the same reviewers and efforts; the shadow router again disagreed, standard, P(third) 0.33, threshold 0.4, all three reviewers at medium.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `3339aaae1d05436aecc5f9fa9a1e729309f902c0`; tests 4821, pass 4774, fail 0, skipped 47; all files 99.42% lines, 92.89% branches, 98.83% functions.
- `npm run openspec -- validate fix-linux-cgroup-test-git-pin --strict`: passed, `Change 'fix-linux-cgroup-test-git-pin' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 118 file(s); every pass summary file is valid: 98 file(s); every route file is valid: 51 file(s).`.
- Spec diff against the merge base `163fe9e56e43` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a1a5c4-ff35-7f93-abf8-9d51d745fdd8` | 0 | 0 | 1 | 1 |
| 2 | B | `claude claude-fable-5-1#medium` | `7771165c-107e-4d81-8816-c38910b1660f` | 0 | 0 | 0 | 4 |
<!-- make record: end -->

## Independent review

The worker runs the passes that the coordinator assigns. The review effort is medium, owner decision 2026-11-02.

### Pass 1

Codex `gpt-6-astra`, effort medium, role A, session `01a1a5c4-ff35-7f93-abf8-9d51d745fdd8`, on `d452ca63`: Critical 0, High 0, Medium 1, Low 1 (`passes.jsonl`, `findings.jsonl`). Both are fixed; they need pass 2, because pass 1 reported a Medium finding.

- M1 (`process`, `.openspec.yaml:3`): `skip_specs` is for documentation-only work. Fixed in `863c516c`: no `skip_specs`, and the `native-worker-acceptance` requirement "Pinned Git client in the Linux test image" (`specs/native-worker-acceptance/spec.md`), whose capability `design.md` "Spec delta in `native-worker-acceptance`" justifies.
- L1 (`missing-fail-before-test`, `test/git-package-pin.test.ts:23`): the test matched literal text. Fixed in `c84f7927`: the test reads the instructions of the worker stage and the last stage (`design.md` "Instructions, not text"), with seven focused cases; fail-before under "Fail-before".
- The reviewer could not check the crash-window and G2 results against logs; "Logs" now names them, and the runs after pass 1 name their tree.

### Pass 2

Claude Code `claude-fable-5-1`, effort medium, role B, session `7771165c-107e-4d81-8816-c38910b1660f`, on `93543a78`: Critical 0, High 0, Medium 0, Low 4 (`passes.jsonl`, `findings.jsonl`). A Low-only pass ends the review: pass 3 did not run, and the four fixes are recorded as `fixed-unreviewed`. No later pass reviewed them; they are left for the coordinator's check as solution architect.

- L1 (`contract-drift`, `docs/dependencies.md:127`): the Ubuntu 24.04 row said the build adds no package. Fixed in `635ac3a7`: the row states that the test-only image of `make verify-linux-cgroup` installs the pinned `git=1:2.43.0-1ubuntu7.4` since this change; `proposal.md` lists the row, and "Scope and source" no longer claims no doc changes.
- L2 (`stale-citation`, `design.md:3`): fixed in `635ac3a7`, which cites `infra/installation/Dockerfile:61-69`. The other line citations of the change resolve: `Makefile:16`, `:23`, `:130`, and `:154`, `apps/worker/src/workspace-composition.ts:53`, `packages/modules/workspace/src/domain/git-client.ts:14`, `infra/installation/Dockerfile:61-65`, and, at `009808f2`, `tools/linux-cgroup/Dockerfile:12-19` and `test/git-package-pin.test.ts:23`.
- L3 (`spec-wording`, `specs/native-worker-acceptance/spec.md:4`): fixed in `635ac3a7`: the build fails "unless that package is installed and `/usr/bin/git --version` prints the Linux Git client pin, `git version 2.43.0`".
- L4 (`process`, the closest category, `tools/linux-cgroup/Dockerfile:14`): fixed in `8b2a5aa8`: `ARG GIT_PACKAGE_VERSION` and its `RUN` (now lines 5-12) come before `ARG NODE_VERSION`, so a Node.js pin bump keeps the cached Git layer. `make verify-linux-crash-windows` and `make verify-linux-g2-scenarios` pass on the fixed tree ("After"); `test/git-package-pin.test.ts` passes 8 of 8 and `npm run verify:comments` passes.

## Limitations

- The fix was run on one x86_64 Linux host only; the aarch64 build of the test image was not run.
- The image build needs the Ubuntu package mirror and the package revision `1ubuntu7.4`, as the worker image does.

## Remaining gates

- The coordinator's check, as solution architect, of the four pass 2 fixes that no later pass reviewed.
- Integration into dev by the coordinator (single pull request).

## Archive

The checks of protocol worker step 7 ran on the working tree after `npm run openspec -- archive fix-linux-cgroup-test-git-pin --yes`, which is the tree of the archive commit apart from this section:

- `npm run openspec -- validate --all --strict`: 71 passed, 0 failed.
- `npm run openspec -- validate --archived --no-interactive`: `✓ change/2026-11-04-fix-linux-cgroup-test-git-pin`.
- `git diff "$(git merge-base HEAD origin/dev)" -- openspec/specs` (merge base `163fe9e5`): only this change's delta, the new requirement "Pinned Git client in the Linux test image" in `native-worker-acceptance`.
- The moved change has `findings.jsonl` (2 pass 1 and 4 pass 2 findings) and `passes.jsonl` (passes 1 and 2); `make findings ARGS="validate"`: every findings file is valid, 118 files.
- `env -u NODE_ENV make verify` (`flcgp/fix2-verify-archive.log`): passed, profile full, on the uncommitted archive tree, so no stamp written. Tests 4821, suites 50, pass 4774, fail 0, cancelled 0, skipped 47. All files: 99.42 % lines, 92.93 % branches, 98.84 % functions.
