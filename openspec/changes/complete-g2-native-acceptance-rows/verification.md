# Verification: complete-g2-native-acceptance-rows

## Scope and source

G3 item 43 (`docs/g3-plan.md`, row 43), Linux x86_64 parts only, size M-L, assigned by the coordinator and developed in a briefed subagent. Scope and decisions: [design.md](design.md). Item 43 stays open: its macOS rows, race g, the `macos-26-arm64` re-run, the `linux-ubuntu-24.04-arm64` entry, and the hosted `ubuntu-24.04` re-dispatch.

## Revision

- Base: `dev` `3f23516a`.
- `0caf2b47` `test: run the G2 scenarios in the privileged Linux cgroup runner` (shared Linux launch helpers, runner, target, guard, and cancel signal; the fail-before runs are on this commit).
- `a20ebb2e` `chore: export the worker's Linux launch host`.
- `767b832c` `test: launch the G2 scenario workers through the Linux cgroup host`.
- `c8e624d6` `test: run the G2 races and partitions in native acceptance on Linux` (the first evidence runs, superseded, are on this commit).
- `09a62b39` `docs: record the Linux x86_64 rows of G3 item 43` and the commit after it (links, this record) change no input of the runs.
- Review pass 1 fixes: `de099e67`, `f4044cd0`, `e6229c44`, `75aa2b99`; review pass 2 fixes: `c708b307`, `0783d040`, `16b937a8`, `bcee61d3` (superseded evidence runs), and the commit that records them; review pass 3 fixes and record: `b4f6a799`, `bf793f2e`.
- `6b84ea47`: merge of `origin/dev` `2b90d0ab` (#378 worker self-check admission, #379 installation certificates, HTTPS API, and TLS NATS). Conflicts, each resolved by keeping both sides:
  - `Makefile`: the `.PHONY` line holds `verify-linux-g2-scenarios` and `installation-certificates installation-ca`;
  - `apps/control-plane/test/harness-composition.ts`, `test/g2-scenarios/scenario-installation.ts`, `test/g2-scenarios/scenario-worker.ts`: the union of the imports;
  - `apps/worker/src/main.ts`: imports `linuxContainmentCheck` (dev) and the moved `supervisionHost` (this change); dev did not change the inline `supervisionHost` this change moved, so it stays removed;
  - `packages/testing/src/index.ts`: dev's `integrationSecretPath`, `NODE_CERTIFICATE_INSPECTOR`, and `trustCertificateAuthority` with the Linux launch exports;
  - `docs/local-installation.md`: the G2 scenarios bullet and dev's `verify-installation` bullet.
- After the merge `make setup` installed the new `@taskelith/certificates` workspace before the build.
- `063e9818` `test: run the worker's own containment check under the cgroup host`: under the cgroup launch `ScenarioWorker` admits through `linuxContainmentCheck` instead of dev's passing stub (the process-group host keeps the stub, having no containment). Forcing the execution account to uid 0 locally made race h fail with `the authorized start not met within 20000 ms`, so the real check runs; the edit was reverted. A runner test pins the read-only secrets mount (`/secrets`, `TASKELITH_SERVICES_SECRETS`), which carries `ca.pem` for TLS NATS. TLS needed no runner change: `integrationSecretPath('ca.pem')` resolves in that mount, `installationCa` lives in the container's `/tmp` base, and the host network reaches the HTTPS API on 127.0.0.1.
- The evidence runs are on `063e9818`.

## Environment

`uname -a`: `Linux GEO-PetarPetrov 7.0.0-38-generic #38-Ubuntu SMP PREEMPT_DYNAMIC Fri Sep  4 09:10:14 UTC 2026 x86_64 GNU/Linux`. Native Ubuntu 26.04.1 LTS host, cgroup v2; Docker Engine - Community 29.8.2 (not Docker Desktop), Docker Compose 5.6.0, storage driver overlayfs, ext4 volumes; Node.js 24.22.1 pinned for the targets and in the test image. `TMPDIR=/home/petar/.cache/taskelith-verify-tmp` for every run.

## Fail-before

- Runner forwarding: `node --experimental-strip-types --test test/linux-crash-windows-script.test.ts` with the new test and the base `scripts/linux-crash-windows.sh` gave tests 3, pass 2, fail 1 (no `--env TASKELITH_TOXIPROXY_URL`); after the change tests 3, pass 3, fail 0.
- Containment guard, on `0caf2b47` (guard and target, scenario workers still on the process-group host): `make verify-linux-g2-scenarios PATTERN='a cancel after W4|an unauthorized start'`, exit 2; race c (seed `3709635626`, cancel after the start) and race h failed with `process 52 runs in /sys/fs/cgroup/, not under /sys/fs/cgroup/executions/` and `process 67 runs in /sys/fs/cgroup/, not under /sys/fs/cgroup/executions/` (the log's exact lines). The root, not `init/`: `tools/linux-cgroup/cgroup-layout.sh:4-7` moves the processes that `cgroup.procs` lists while it reads that file, and the read skips the entry shell. A check in the image (`docker run --rm --init --privileged --cgroupns=private --entrypoint bash taskelith-linux-cgroup:test -c 'source /usr/local/lib/taskelith/cgroup-layout.sh; cat /proc/self/cgroup; cat /proc/1/cgroup'`) printed `0::/` for the shell and its children and `0::/init` for PID 1, while writing the shell's own PID to `init/cgroup.procs` directly moves it. So the test processes run in the namespace root. The containment checks are unaffected, because `executions/` enables no controller; the layout script is outside this change (follow-up).
- Cancel signal, on `0caf2b47`: `make verify-linux-g2-scenarios PATTERN='a crash between W1'`, exit 2; race e (seed `1476658390`) failed in `assertCancelled`: actual `{ kind: 'signal', signal: 'SIGTERM' }`, expected `SIGKILL`.
- Native acceptance runner: `node --experimental-strip-types --test test/native-acceptance-runner.test.ts` with the new tests and the base `scripts/native-acceptance.sh` gave tests 14, pass 9, fail 5 (the two new tests and the three that check the not-applicable lists); after the change tests 14, pass 14, fail 0.

## After the seam

- Working tree of `767b832c` (before its commit): `make verify-linux-g2-scenarios`, exit 0 in 1 min 35 s: tests 18, pass 17, fail 0, skipped 1 (race g, not applicable on Linux); races seed `2358440917`, partitions seed `634222300`, stale generations seed `3255677099`.
- Unit tests: `apps/worker/test/execution-supervision.test.ts` and `packages/testing/test/linux-launch.test.ts`, tests 24, pass 24, fail 0.

## Revert proof (B2, `scope-execution-cancellation`)

`#targetedLaunches` in `apps/worker/src/launch-orchestrator.ts:324` was reverted locally to return every launch of the target's assignments, the widening that B2 removed (a partial revert: the launch filter only, not the cancel-file scope). `make verify-linux-g2-scenarios FILES=test/g2-cancellation-races.test.ts PATTERN='an unauthorized start'`, exit 2: race h (seed `3547295174`) failed with `one attempt`, actual 2, expected 1, so the owning execution was stopped and retried. The file was restored with `git checkout` and the build rerun; it is not part of any commit.

## Native acceptance

`TASKELITH_TEST_SEED=<seed> make native-acceptance ENTRIES=linux RESULTS=<scratch>/results-<seed>.jsonl`, one run after the other, on two commits:

| Commit | Seed | Local time | Exit | Last line | Records |
| --- | --- | --- | --- | --- | --- |
| `c8e624d6` (superseded) | `20261026` | 2026-10-28 02:17:35 to 02:24:56 | 0 | `every proof passed` | 61, all `passed`, all with an acceptance context: 12 proofs and 49 own records |
| `c8e624d6` (superseded) | `7` | 02:24:56 to 02:32:16 | 0 | `every proof passed` | 61, the same split |
| `bcee61d3` (superseded) | `20261026` | 03:02:34 to 03:08:48 | 0 | `every proof passed` | 61, the same split |
| `bcee61d3` (superseded) | `7` | 03:08:48 to 03:14:16 | 0 | `every proof passed` | 61, the same split |
| `063e9818` | `20261026` | 03:28:04 to 03:34:26 | 0 | `every proof passed` | 61, the same split |
| `063e9818` | `7` | 03:34:26 to 03:40:14 | 0 | `every proof passed` | 61, the same split |

The `063e9818` runs, after the merge of `dev`, are the evidence: every record names commit `063e981859898abf8c567608cc7675794975b9b4`, and [results.jsonl](results.jsonl) is their two files in that order (122 lines). The `c8e624d6` runs preceded the review fixes and the `bcee61d3` runs the merge; neither is kept in the change, and their records differ from these in the order of records within a proof and in the scenario details that seeds and timing vary. New proofs: `acceptance-cancellation-races` tests 12, pass 11, skipped 1 (race g), fail 0, in both runs (lines 54, 115), with 11 scenario records each (lines 43 to 53, 104 to 114); `acceptance-partition` tests 6, pass 6, fail 0 (lines 61, 122), with 6 scenario records each (lines 55 to 60, 116 to 121). Races c, e, and a granted round of f ended their process by `SIGKILL` in both runs (lines 45, 48, 50; 109, 111, 112). The unchanged proofs passed as before: crash windows 28 of 28, duplicate delivery 1 of 1, privileged cgroup tests 17 of 17, journal suites 102 of 104 with 2 skipped (dev's merge added one test). The rows: [acceptance.md](acceptance.md).

## Hosted arm64 runner

`gh api repos/petarnenov/taskelith`: public, owner type `User`; `gh api repos/petarnenov/taskelith/actions/runners`: total 0 (no self-hosted runner). `github/docs` `data/reusables/actions/supported-github-runners.md` (last commit `eb5a6158a3`, 2026-10-16) lists `ubuntu-24.04-arm` among the standard GitHub-hosted runners for public repositories, free and unlimited there. Nothing was dispatched on it. Follow-up: add a `linux-ubuntu-24.04-arm64` hosted dispatch.

## Not applicable: the Intel iMac for the Docker-Engine row

The iMac's Docker Desktop gives no host network outside its virtual machine, which the privileged runner needs (`run-g2-crash-windows-on-linux` design decision 3), so it cannot give the Docker-Engine evidence of the Linux worker image. The GitHub-hosted `ubuntu-24.04` runner of `.github/workflows/linux-acceptance.yml` gives it; it is re-dispatched after the merge (follow-up).

## Checks

- `npm run openspec -- validate complete-g2-native-acceptance-rows --strict`: valid. Spec bodies: 409, 435 (457 before review pass 2), and 256 characters.
- `make findings ARGS="validate"`: 53 findings files and 33 pass summary files valid.
- `make verify` on `09a62b39` failed only in `npm run verify:links`: the docs linked the active change's `acceptance.md`. The links became plain mentions, to be linked at the archive (task 5.1).
- `make verify` on that working tree, the commit after `09a62b39`: exit 0; tests 2363, pass 2316, fail 0, cancelled 0, skipped 47, todo 0; all files 99.29 % lines, 92.40 % branches, 98.95 % functions; comments within the length rule; OpenSpec 70 passed; every checked link conforms.
- Coverage of the changed product files (lines, branches, functions): `packages/testing` `linux-launch.js` 100, 100, 100; `apps/worker` `execution-supervision.js` 97.96, 87.67, 91.67; `apps/worker` `main.js` 91.23, 91.67, 84.21 (uncovered: the entry under `import.meta.main` and the launch failure report, which the move did not touch).
- After the merge, on `063e9818`: `make verify-linux-crash-windows` exit 0, 29 of 29; `make verify-linux-g2-scenarios` exit 0, tests 18, pass 17, skipped 1 (seeds `2791542779`, `198321456`, `3595013721`); `node --experimental-strip-types --test test/linux-crash-windows-script.test.ts` tests 9, pass 9.
- `make verify` on `063e9818`: exit 0; tests 2492, pass 2445, fail 0, skipped 47; all files 99.32 % lines, 92.46 % branches, 98.96 % functions; findings 56 files and pass summaries 36 files valid; OpenSpec 70 passed; links and comments conform. `execution-supervision.js` 97.96, 87.67, 91.67; worker `main.js` 91.38, 91.67, 84.21.

## Review pass 1 fixes

Pass 1 (reviewer A) found 2 Medium and 1 Low; the coordinator records the pass in `passes.jsonl` and `findings.jsonl`. Fixes, on the working tree after `fd24a25f`:

- Finding 1 (Medium, `test/g2-cancellation-races.test.ts`): `assertCancelled` takes the cancel point. After a proven start (race c when the seed cancels after the start, race e) it requires the outcome `exited` with a proven start and `CANCEL_SIGNAL`; where the process may not have started (race b, race c after W4 and before the start, the granted rounds of race f) `not-started` stays allowed and an `exited` outcome must carry the signal. Fail-before with the outcome forced to `not-started` in a temporary local edit: `TASKELITH_TEST_SEED=20261026 make verify-linux-g2-scenarios FILES=test/g2-cancellation-races.test.ts PATTERN='a cancel after W4|a crash between W1'`, exit 2, tests 2, fail 2 (`a started process ends exited`); the edit was removed.
- Finding 2 (Medium, `tools/linux-cgroup/crash-windows.sh`): the script takes the node:test options, then `--` and the files; without files after a `--` it runs the crash windows, so a separate option value is never a file. `make verify-linux-g2-scenarios` passes `-- <files>`; `make verify-linux-crash-windows` passes no `--` and runs as before. `test_arguments` is sourced by four new tests in `test/linux-crash-windows-script.test.ts` (`--test-name-pattern=value` and `--test-name-pattern value`, each with and without files, and no files): tests 7, pass 7; with the script of `fd24a25f`, which has no such function, tests 7, pass 3, fail 4.
- Finding 3 (Low, `acceptance.md`): the stale writes cite the stale ownership generation (lines 47; 108) and the stale recovery epoch scenarios (lines 49, 51; 110, 112) separately; design decision 8 says the same.

Checks after the fixes:

- `make verify-linux-crash-windows`: exit 0, tests 29, pass 29, fail 0. `make verify-linux-crash-windows PATTERN=redelivered`: exit 0, tests 1, pass 1.
- `make verify-linux-g2-scenarios`: exit 0, tests 18, pass 17, fail 0, skipped 1 (race g); seeds races `984716667`, partitions `127468814`, stale generations `392610103`.
- `make verify`: exit 0; tests 2367, pass 2320, fail 0, cancelled 0, skipped 47, todo 0; all files 99.29 % lines, 92.39 % branches, 98.95 % functions; OpenSpec 70 passed; every checked link conforms.
- At pass 1 the native acceptance evidence stayed that of `c8e624d6`; the runs on `bcee61d3` ("Native acceptance") replace it. The fixes change the runner's argument form, which both runs used only with `=` options and the default or `FILES` files, and tighten an assertion: in both runs races c and e recorded `exited by SIGKILL` (lines 45, 48; 106, 109), and the stricter check covers race c after the start (seed `20261026`, line 45) and race e (lines 48; 109), all recorded as exited by that signal. The records do not state `startProven`, so that part of the check is shown only by the runs after the fix. They were not re-run on the fixed commit.

## Review pass 2 fixes

Pass 2 (reviewer B) ran at `759dbc21` and found 1 Medium and 14 Low; the coordinator records its counts in `passes.jsonl` and `findings.jsonl`.

| Finding | Fix | Commit |
| --- | --- | --- |
| M1: a missing or partial launch environment silently dropped the cgroup mode | `linuxLaunchFromEnvironment` throws on a partial launch on Linux, and throws when `TASKELITH_REQUIRE_LINUX_LAUNCH=1` is set without a full Linux launch; `tools/linux-cgroup/crash-windows.sh` sets that marker for both privileged targets. Three new unit tests in `packages/testing/test/linux-launch.test.ts` (tests 7, pass 7); with the `packages/testing/src` of `759dbc21` the file fails to load, because the marker export is missing (tests 1, fail 1). On this host, `TASKELITH_REQUIRE_LINUX_LAUNCH=1 node --experimental-strip-types --test test/g2-cancellation-races.test.ts` fails at load naming the three missing variables, and `TASKELITH_EXECUTION_UID=2000 ... test/g2-partition.test.ts` fails with `a partial Linux launch: TASKELITH_CONTAINMENT_PARENT, TASKELITH_EXECUTION_GID not set`. The launch host is not added to the records (optional, not done) | `c708b307` |
| L1: the guard claim for seed 7 in `acceptance.md` | race h in both runs, race c in the `20261026` run | `bcee61d3` |
| L2: the spec's guard claim | narrowed to race h and race c when its cancel lands after the start; a scenario for the required launch added | `bcee61d3` |
| L3: the proposal's guard and signal claims | the same narrowing; the signal applies to races b, c, e, and f through `assertCancelled` | `bcee61d3` |
| L4: task 4.2 unticked | ticked | `bcee61d3` |
| L5: "Independent review: not yet run" | summarizes pass 1 and names pass 2 | `bcee61d3` |
| L6: the quoted guard failure and `cgroup-layout.sh` | the exact log lines quoted, and the root cgroup explained by a check in the image ("Fail-before"); a follow-up for the layout script | `bcee61d3` |
| L7: `process-group-supervision.ts:38-52` | `:38-55` | `bcee61d3` |
| L8: the skip reason of the supervision host tests | "supervisionHost composes the Linux platform only on Linux" | `16b937a8` |
| L9: one test for two cases | split into "without a launch prepares nothing" (now `precondition-failed`) and "a launch without an account prepares none"; `apps/worker/test/execution-supervision.test.ts` tests 20, pass 20 | `16b937a8` |
| L10: `echo` swallowed `-n`, `-e`, `-E` | `printf '%s\n'`; new test with `--test-name-pattern -e -n -E` (tests 8, pass 8; with the script of `759dbc21` tests 8, fail 1) | `c708b307` |
| L11: the open list of `docs/worker-platforms.md` | adds the hosted `ubuntu-24.04` re-dispatch | `bcee61d3` |
| L12: "Done since" in ADR 0015 | "Since done" | `bcee61d3` |
| L13: the evidence commit before the fixes | `acceptance.md` names the superseded `c8e624d6` runs and the fixes; the evidence is now the re-run on `bcee61d3` | this record |
| L14: the guard checked only the delegated parent | `assertContained` takes the worker's own containment parent and requires a containment directly below it (`isContainmentOf`), so the bare parent, a deeper cgroup, and another worker's containment fail; `test/g2-scenario-launch.test.ts` tests 2, pass 2 | `0783d040` |

Checks after the fixes:

- `make verify-linux-crash-windows` on `bcee61d3`: exit 0, tests 29, pass 29, fail 0.
- `make verify-linux-g2-scenarios` on `bcee61d3`: exit 0, tests 18, pass 17, fail 0, skipped 1 (race g); seeds races `1364487483`, partitions `3860545978`, stale generations `3825485312`.
- Native acceptance re-run on `bcee61d3`, seeds `20261026` and `7`: both exit 0, `every proof passed`, 61 records each, all `passed` ("Native acceptance").
- `make verify` on `bcee61d3` with the re-run's `results.jsonl` and `acceptance.md`: exit 0; tests 2373, pass 2326, fail 0, cancelled 0, skipped 47, todo 0; all files 99.29 % lines, 92.40 % branches, 98.95 % functions; `linux-launch.js` 100, 100, 100; `execution-supervision.js` 97.96, 87.67, 91.67; OpenSpec 70 passed; comments within the length rule; every checked link conforms; 53 findings and 33 pass summary files valid.

## Follow-ups

- A services-network mode of the privileged runner for Docker Desktop, so that a macOS host can run the Linux scenarios.
- A `linux-ubuntu-24.04-arm64` hosted dispatch on `ubuntu-24.04-arm`.
- `tools/linux-cgroup/cgroup-layout.sh` leaves the entry shell, and so the test processes, in the namespace root cgroup instead of `init/`.
- After the merge: dispatch `linux-acceptance.yml` on `dev` and record its run, which now includes the two new proofs.

## Independent review

- Pass 1 (reviewer A): Codex `gpt-6.1-sol` (session `01a17ff2-a788-7663-a492-66c51bf33cfd`), recorded in `passes.jsonl` and `findings.jsonl`: Critical 0, High 0, Medium 2, Low 1. Fixed in `de099e67` (finding 1), `f4044cd0` (finding 2), and `e6229c44` and `75aa2b99` (finding 3); see "Review pass 1 fixes".
- Pass 2 (reviewer B), at `759dbc21`: Claude Code `claude-opus-5-5` (high, session `a80c238d-4183-4690-b5a5-6989686b7d89`): Critical 0, High 0, Medium 1, Low 14, all fixed; see "Review pass 2 fixes" and `findings.jsonl`.
- Pass 3 (reviewer A), at `bae620b2`: Codex `gpt-6.1-sol` (session `01a18016-8b21-77f1-aa43-88a32beda6c7`) confirmed the pass 2 fixes and found Low 3 only (a stale design summary of the partial launch environment, the re-run difference in `acceptance.md`, and this section). They were fixed without another review, as the process sets for a Low-only pass; the review is complete.
- Merge of `dev` (reviewer A): after the passes, merge `6b84ea47` brought in `dev` `2b90d0ab` (#378, #379), with `063e9818` and `ae07eb5f` (see "Revision"). Codex `gpt-6.1-sol` (session `01a1802c-dd23-7372-87f0-561909c6791c`) reviewed the resolved diff and the reconciliation, `git diff bf793f2e ae07eb5f` against `dev`'s own diff, and found no problems (High 0, Medium 0, Low 0): every conflict keeps both sides, the cgroup-launched worker uses the real `linuxContainmentCheck`, the runner gives the scenarios the CA and HTTPS settings, the evidence and its citations match `results.jsonl`, and the deltas agree with `dev`'s requirement text.
