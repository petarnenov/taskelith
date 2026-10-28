# Verification: complete-g2-native-acceptance-rows

## Scope and source

G3 item 43 (`docs/g3-plan.md`, row 43), Linux x86_64 parts only, size M-L, assigned by the coordinator and developed in a briefed subagent. Scope and decisions: [design.md](design.md). Item 43 stays open: its macOS rows, race g, the `macos-26-arm64` re-run, the `linux-ubuntu-24.04-arm64` entry, and the hosted `ubuntu-24.04` re-dispatch.

## Revision

- Base: `dev` `3f23516a`.
- `0caf2b47` `test: run the G2 scenarios in the privileged Linux cgroup runner` (shared Linux launch helpers, runner, target, guard, and cancel signal; the fail-before runs are on this commit).
- `a20ebb2e` `chore: export the worker's Linux launch host`.
- `767b832c` `test: launch the G2 scenario workers through the Linux cgroup host`.
- `c8e624d6` `test: run the G2 races and partitions in native acceptance on Linux` (the evidence runs are on this commit).
- `09a62b39` `docs: record the Linux x86_64 rows of G3 item 43` and the commit after it (links, this record) change no input of the runs.

## Environment

`uname -a`: `Linux GEO-PetarPetrov 7.0.0-38-generic #38-Ubuntu SMP PREEMPT_DYNAMIC Fri Sep  4 09:10:14 UTC 2026 x86_64 GNU/Linux`. Native Ubuntu 26.04.1 LTS host, cgroup v2; Docker Engine - Community 29.8.2 (not Docker Desktop), Docker Compose 5.6.0, storage driver overlayfs, ext4 volumes; Node.js 24.22.1 pinned for the targets and in the test image. `TMPDIR=/home/petar/.cache/taskelith-verify-tmp` for every run.

## Fail-before

- Runner forwarding: `node --experimental-strip-types --test test/linux-crash-windows-script.test.ts` with the new test and the base `scripts/linux-crash-windows.sh` gave tests 3, pass 2, fail 1 (no `--env TASKELITH_TOXIPROXY_URL`); after the change tests 3, pass 3, fail 0.
- Containment guard, on `0caf2b47` (guard and target, scenario workers still on the process-group host): `make verify-linux-g2-scenarios PATTERN='a cancel after W4|an unauthorized start'`, exit 2; race c (seed `3709635626`, cancel after the start) and race h each failed with `process <pid> runs in /sys/fs/cgroup/, not under /sys/fs/cgroup/executions/` (the container's root cgroup as `/proc/<pid>/cgroup` shows it).
- Cancel signal, on `0caf2b47`: `make verify-linux-g2-scenarios PATTERN='a crash between W1'`, exit 2; race e (seed `1476658390`) failed in `assertCancelled`: actual `{ kind: 'signal', signal: 'SIGTERM' }`, expected `SIGKILL`.
- Native acceptance runner: `node --experimental-strip-types --test test/native-acceptance-runner.test.ts` with the new tests and the base `scripts/native-acceptance.sh` gave tests 14, pass 9, fail 5 (the two new tests and the three that check the not-applicable lists); after the change tests 14, pass 14, fail 0.

## After the seam

- Working tree of `767b832c` (before its commit): `make verify-linux-g2-scenarios`, exit 0 in 1 min 35 s: tests 18, pass 17, fail 0, skipped 1 (race g, not applicable on Linux); races seed `2358440917`, partitions seed `634222300`, stale generations seed `3255677099`.
- Unit tests: `apps/worker/test/execution-supervision.test.ts` and `packages/testing/test/linux-launch.test.ts`, tests 24, pass 24, fail 0.

## Revert proof (B2, `scope-execution-cancellation`)

`#targetedLaunches` in `apps/worker/src/launch-orchestrator.ts:324` was reverted locally to return every launch of the target's assignments, the widening that B2 removed (a partial revert: the launch filter only, not the cancel-file scope). `make verify-linux-g2-scenarios FILES=test/g2-cancellation-races.test.ts PATTERN='an unauthorized start'`, exit 2: race h (seed `3547295174`) failed with `one attempt`, actual 2, expected 1, so the owning execution was stopped and retried. The file was restored with `git checkout` and the build rerun; it is not part of any commit.

## Native acceptance

On `c8e624d6`, `TASKELITH_TEST_SEED=<seed> make native-acceptance ENTRIES=linux RESULTS=<scratch>/results-<seed>.jsonl`, one run after the other:

| Seed | Local time | Exit | Last line | Records |
| --- | --- | --- | --- | --- |
| `20261026` | 2026-10-28 02:17:35 to 02:24:56 | 0 | `every proof passed` | 61, all `passed`, all with an acceptance context: 12 proofs and 49 own records |
| `7` | 02:24:56 to 02:32:16 | 0 | `every proof passed` | 61, the same split |

Every record names commit `c8e624d606f93c6c69b033cec92e158dcadbea63`. [results.jsonl](results.jsonl) is the two files in that order (122 lines). New proofs: `acceptance-cancellation-races` tests 12, pass 11, skipped 1 (race g), fail 0, in both runs (lines 54, 115), with 11 scenario records each (lines 43 to 53, 104 to 114); `acceptance-partition` tests 6, pass 6, fail 0 (lines 61, 122), with 6 scenario records each (lines 55 to 60, 116 to 121). Races c, e, and a granted round of f ended their process by `SIGKILL` in both runs (lines 45, 48, 50, 106, 109, 111). The unchanged proofs passed as before: crash windows 28 of 28, duplicate delivery 1 of 1, privileged cgroup tests 17 of 17, journal suites 101 of 103 with 2 skipped. The rows: [acceptance.md](acceptance.md).

## Hosted arm64 runner

`gh api repos/petarnenov/taskelith`: public, owner type `User`; `gh api repos/petarnenov/taskelith/actions/runners`: total 0 (no self-hosted runner). `github/docs` `data/reusables/actions/supported-github-runners.md` (last commit `eb5a6158a3`, 2026-10-16) lists `ubuntu-24.04-arm` among the standard GitHub-hosted runners for public repositories, free and unlimited there. Nothing was dispatched on it. Follow-up: add a `linux-ubuntu-24.04-arm64` hosted dispatch.

## Not applicable: the Intel iMac for the Docker-Engine row

The iMac's Docker Desktop gives no host network outside its virtual machine, which the privileged runner needs (`run-g2-crash-windows-on-linux` design decision 3), so it cannot give the Docker-Engine evidence of the Linux worker image. The GitHub-hosted `ubuntu-24.04` runner of `.github/workflows/linux-acceptance.yml` gives it; it is re-dispatched after the merge (follow-up).

## Checks

- `npm run openspec -- validate complete-g2-native-acceptance-rows --strict`: valid. Spec bodies: 409, 457, and 256 characters.
- `make findings ARGS="validate"`: 53 findings files and 33 pass summary files valid.
- `make verify` on `09a62b39` failed only in `npm run verify:links`: the docs linked the active change's `acceptance.md`. The links became plain mentions, to be linked at the archive (task 5.1).
- `make verify` on that working tree, the commit after `09a62b39`: exit 0; tests 2363, pass 2316, fail 0, cancelled 0, skipped 47, todo 0; all files 99.29 % lines, 92.40 % branches, 98.95 % functions; comments within the length rule; OpenSpec 70 passed; every checked link conforms.
- Coverage of the changed product files (lines, branches, functions): `packages/testing` `linux-launch.js` 100, 100, 100; `apps/worker` `execution-supervision.js` 97.96, 87.67, 91.67; `apps/worker` `main.js` 91.23, 91.67, 84.21 (uncovered: the entry under `import.meta.main` and the launch failure report, which the move did not touch).

## Review pass 1 fixes

Pass 1 (reviewer A) found 2 Medium and 1 Low; the coordinator records the pass in `passes.jsonl` and `findings.jsonl`. Fixes, on the working tree after `fd24a25f`:

- Finding 1 (Medium, `test/g2-cancellation-races.test.ts`): `assertCancelled` takes the cancel point. After a proven start (race c when the seed cancels after the start, race e) it requires the outcome `exited` with a proven start and `CANCEL_SIGNAL`; where the process may not have started (race b, race c after W4 and before the start, the granted rounds of race f) `not-started` stays allowed and an `exited` outcome must carry the signal. Fail-before with the outcome forced to `not-started` in a temporary local edit: `TASKELITH_TEST_SEED=20261026 make verify-linux-g2-scenarios FILES=test/g2-cancellation-races.test.ts PATTERN='a cancel after W4|a crash between W1'`, exit 2, tests 2, fail 2 (`a started process ends exited`); the edit was removed.
- Finding 2 (Medium, `tools/linux-cgroup/crash-windows.sh`): the script takes the node:test options, then `--` and the files; without files after a `--` it runs the crash windows, so a separate option value is never a file. `make verify-linux-g2-scenarios` passes `-- <files>`; `make verify-linux-crash-windows` passes no `--` and runs as before. `test_arguments` is sourced by four new tests in `test/linux-crash-windows-script.test.ts` (`--test-name-pattern=value` and `--test-name-pattern value`, each with and without files, and no files): tests 7, pass 7; with the script of `fd24a25f`, which has no such function, tests 7, pass 3, fail 4.
- Finding 3 (Low, `acceptance.md`): the stale writes cite the stale ownership generation (lines 47; 108) and the stale recovery epoch scenarios (lines 49, 51; 110, 112) separately; design decision 8 says the same.

Checks after the fixes:

- `make verify-linux-crash-windows`: exit 0, tests 29, pass 29, fail 0. `make verify-linux-crash-windows PATTERN=redelivered`: exit 0, tests 1, pass 1.
- `make verify-linux-g2-scenarios`: exit 0, tests 18, pass 17, fail 0, skipped 1 (race g); seeds races `984716667`, partitions `127468814`, stale generations `392610103`.
- `make verify`: exit 0; tests 2367, pass 2320, fail 0, cancelled 0, skipped 47, todo 0; all files 99.29 % lines, 92.39 % branches, 98.95 % functions; OpenSpec 70 passed; every checked link conforms.
- The native acceptance evidence stays that of `c8e624d6`. The fixes change the runner's argument form, which both runs used only with `=` options and the default or `FILES` files, and tighten an assertion: in both runs races c and e recorded `exited by SIGKILL` (lines 45, 48; 106, 109), and race c after the start (seed `20261026`, line 45) is the only after-start case the stricter check adds, so both runs would have passed it. They were not re-run on the fixed commit.

## Follow-ups

- A services-network mode of the privileged runner for Docker Desktop, so that a macOS host can run the Linux scenarios.
- A `linux-ubuntu-24.04-arm64` hosted dispatch on `ubuntu-24.04-arm`.
- After the merge: dispatch `linux-acceptance.yml` on `dev` and record its run, which now includes the two new proofs.

## Independent review

Not yet run; the coordinator runs it.
