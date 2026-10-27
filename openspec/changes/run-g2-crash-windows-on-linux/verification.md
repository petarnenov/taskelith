## Scope and source

`run-g2-crash-windows-on-linux`, a worker task the coordinator assigned on 2026-10-27: run the G2 crash window and duplicate delivery scenarios of item 24b (`run-g2-crash-windows`, archived on 2026-10-26) on Linux. Coordinator decisions: option B, the privileged Linux test image with network to the services; a new Makefile target `verify-linux-crash-windows`, out of `make verify` unless it is as cheap and portable as `verify-linux-cgroup`; the macOS path unchanged; the Linux expectations of CP7 to CP9, and of any other window that differs, per section 6 of the [supervisor identity contract](../../../docs/contracts/supervisor-identity.md); a failing Linux scenario recorded as a candidate defect with its expectation kept, and no product fix. Excluded: product code, contracts, the macOS expectations, and `native-acceptance.sh`.

## Revision and environment

- Base: `origin/dev` at `fe643864`. Branch `run-g2-crash-windows-on-linux`. Code commits `7b6e3edc` (`test:`, the harness and the expectations) and `38079215` (`build:`, the make target and the image entry points); the evidence run is of `38079215` with a clean tree apart from this untracked change directory.
- Host: Ubuntu 26.04.1 LTS, kernel 7.0.0-38-generic, x86_64, cgroup v2, ext4; Docker Engine 29.8.2; Node.js 24.22.1 from `.nvmrc`. No sudo was used and no host-wide setting was changed.
- Container: the Linux test image `taskelith-linux-cgroup:test`, built by `make linux-test-image` from `ubuntu:24.04@sha256:68ee22004a9109b44973313b02ff7b1de250f1de0f5ecb628d73f579aaff33ac` with the pinned Node.js 24.22.1 for linux-x64, run with `--rm --init --privileged --cgroupns=private --network host --volume /tmp`, the checkout mounted read-only, the services secrets read-only. Services: the target's own `scripts/services.sh run` project, PostgreSQL and NATS on `127.0.0.1` ephemeral ports.
- `TMPDIR=/home/petar/.cache/taskelith-tmp` for every host command, because the host's `/tmp` tmpfs quota fails with `EDQUOT`.

## Author self-check and evidence check

- No product code, contract, OpenAPI, AsyncAPI, JSON schema, Compose file, or dependency changes; `packages/testing` is a private test package. The macOS expectations are the same objects as before, now under `MACOS_UNSUPERVISED`.
- Every expectation that differs on Linux cites section 6 in the test and in design decision 10; no expectation was changed to make a run pass. CP9's failure is kept as a plain failure.
- The guard: on this host, `make verify` runs the scenario file without the Linux launch settings, and its 29 tests are skipped with the reason that names the target.
- Each record of `results.jsonl` names commit `38079215f7411af7db3360d1302b5a7881c31418`, read on the host and passed as `TASKELITH_SCENARIO_COMMIT`, host `Linux 7.0.0-38-generic`, arch `x64`, seed `2776760789`, and target `harness-composition`; 29 distinct scenarios. 24b's run had 27 records; the two windows that `dev` added since (`crash-window-w2-after-2-after-a-runtime-seal`, `crash-window-w3-after-then-w2-after`) bring it to 28 windows and the duplicate delivery.
- The CP4 record names "CP4 after the claim", and the CP8 record "child released after the adopter's supervisor.2", so the populated containment row of section 6 is the one CP8 exercised.
- `npm run verify:comments`, `npm run check:boundaries`, and `npm run openspec -- validate run-g2-crash-windows-on-linux --strict` pass. `findings.jsonl` is empty before review.

## Checks

| Check | Result |
| --- | --- |
| `npm run openspec -- validate run-g2-crash-windows-on-linux --strict` | valid |
| `npm run verify:comments` | Every comment is within the comment length rule |
| `make findings ARGS="validate"` | Every findings file is valid: 3 file(s) |
| `make verify` of `38079215` with this change directory in the tree | Passed: 2018 tests, 1972 passed, 0 failed, 46 skipped (among them the 29 crash window and duplicate delivery tests, skipped with the reason that names `make verify-linux-crash-windows`); coverage of all files 99.19% lines, 91.85% branches, 98.80% functions; OpenSpec 70 passed; every active change archives into strictly valid specs |
| Evidence run of `38079215`: `TASKELITH_TEST_SEED=2776760789 TASKELITH_SCENARIO_RESULTS=openspec/changes/run-g2-crash-windows-on-linux/results.jsonl make verify-linux-crash-windows` | Exit status 2 (`make: *** [Makefile:117: verify-linux-crash-windows] Error 1`): 29 tests, 28 passed, 1 failed (CP9, candidate defect L1), 0 skipped, 84.8 s in the container; `results.jsonl` holds 29 lines, 28 `passed` and 1 `failed` |
| `make verify-linux-cgroup` after the layout moved into `cgroup-layout.sh` | Exit status 0: 14 tests, 14 passed |

## Windows and results

Seed `2776760789` for every row, on Linux in the privileged test image. "Journal section 5" is the recovery table of the [worker journal contract](../../../docs/contracts/worker-journal.md); "section 6" is the recovery table of the supervisor identity contract, Linux rows.

| Window | How it is reached | Expected | Result |
| --- | --- | --- | --- |
| W1.before, W1.after | Journal hook around the offer's inbox commit | Journal section 5: the broker redelivers; one execution exits 0 | passed |
| W2.before | Journal hook before the authorization operation's commit | Journal section 5: the intent continues with a new execution, exits 0 | passed |
| W2.after | Journal hook after that commit | Journal section 5: seal the pending execution, new execution, exits 0 | passed |
| W3.before, W3.after | Journal hook around the grant | Journal section 5: seal, `not-started`, relaunch, exits 0 | passed |
| W4.before, W4.after | Journal hook around "record written" | Journal section 5 and section 6 "No launch record": seal, relaunch, exits 0 | passed |
| W5s.before, W5s.after | Journal hook around the start fact | Section 6: adopt the live supervisor, exits 0 | passed |
| W5e.before, W5e.after | Journal hook around the exit fact | Section 6: report the recorded exit 0 | passed |
| W6.before, W6.after | First crash at W3.after, then the hook in the recovering worker's seal | Journal section 5: seal, relaunch, exits 0 | passed |
| W2.after@2 after a runtime seal | First preparation fails, then the second W2.after | Two sealed executions, relaunch, exits 0 | passed |
| W3.after then W2.after | Crash at W3.after, then at W2.after of the recovery | Two sealed executions, relaunch, exits 0 | passed |
| CP1, CP2, CP3 | Supervision port: `prepare` entry, `intent` written, `start` entry | Section 6 "Launch intent journaled, record not journaled" or "No launch record": seal, relaunch, exits 0 | passed |
| CP4 | Supervision port: the supervisor started; the crash waits for its claim | Section 6 "a supervisor is live": adopt, exits 0 | passed |
| CP5 | Supervisor program: `supervisor.1` written | Section 6 "No launch record": seal, relaunch, exits 0 | passed |
| CP6 | Supervisor program: the containment created under `executions/` | Section 6 "No launch record", with the containment empty: seal, relaunch, exits 0 | passed |
| CP7 | Supervisor program: claim written, nothing spawned | Section 6, Linux, "in the recorded namespace incarnation, the containment is not populated": `exit` with unknown status, start unproven, no spawn | passed |
| CP8 | Supervisor program: child spawned, no `handle`; the child runs until the adopter's `supervisor.2` | Section 6, Linux, "the containment is populated": adopt, then `exit` with unknown status, start unproven, one spawn | passed |
| CP9 | Supervisor program: `handle` written; the child runs until the adopter's `supervisor.2` | Section 6, Linux, "the containment is populated": adopt, then `exit` with unknown status, start proven, one spawn; one attempt, as section 6 and the retry budget of `0` for uncertain execution require | failed: candidate defect L1 |
| CP10 | Armed journal right after W5s; the journal holds `started` | Section 6 "a supervisor is live": adopt, exits 0 | passed |
| CP11 | Supervisor program: `exit` written | Section 6 "`exit` present": report the recorded exit 0 | passed |
| CP12 | Armed journal right after W5e; the journal holds `exited` | Section 6 "`exit` present": report the recorded exit 0 | passed |
| Duplicate delivery | 2 copies of the offer while the child ran and 3 after the result | One intent, one execution, one spawn, one result | passed |

## Candidate defect L1: an unknown exit with a proven start is retried automatically

- Scenario `crash-window-cp9`, seed `2776760789`, commit `38079215`; reproduced in every run of CP9 on this host (three exploratory runs and the evidence run). CP7 and CP8, whose unknown exits have an unproven start, open no retry.
- Sequence: the supervisor is killed after it wrote `handle`; the restarted worker finds the claim, no live supervisor, no `exit`, and a populated containment, so it adopts; once the child exits, the adopting supervisor writes `exit` with status `unknown` and a proven start; the control plane ends the attempt `exited` with that status and, in the same transaction, opens a second attempt with `retryOf` naming the first.
- Exact output (the attempts, truncated inside the first execution):

  ```
  AssertionError [ERR_ASSERTION]: one attempt: [{"id":"t9340890e1c3153c3208272087cc202e75806745d47d1898f55158a7cda1a9dbd","executions":[{"id":"eaa5f492-777c-48ff-b904-1eceec0caf00",...,"state":"exited",...,"exit":{"status":{"kind":"unknown"},"startProven":true,...}}],"outcome":{"cancelled":false,"ownershipGeneration":2,"endedAt":"2026-10-27T06:03:11.263Z","kind":"exited","executionId":"eaa5f492-777c-48ff-b904-1eceec0caf00","status":{"kind":"unknown"},"startProven":true}},{"id":"t50b3074605844ab62307fdad6864e88b10f02ebc818ae51a57516a50db239b21","retryOf":"t9340890e1c3153c3208272087cc202e75806745d47d1898f55158a7cda1a9dbd","executions":[]}]

  2 !== 1
      at recoveredExecution (file:///repo/apps/control-plane/test/crash-windows.integration.test.ts:286:10)
  ```

- Cause, as read: `isRetryableOutcome` (`packages/modules/scheduling/src/domain/automatic-retry.ts:14-17`) retries every `exited` outcome with a proven start that is not a clean exit, and an `unknown` status is not a clean exit; `followAttemptEnd` (`apps/control-plane/src/application/task-ending.ts:10-14`) opens the retry.
- Expected, per supervisor identity contract section 6: "An exit with an unknown status ends the execution ... The attempt's outcome is still unknown, because side effects may have happened, and automatic retry needs operation-specific repeatability ... within the retry budget of `0` for uncertain execution"; [operational targets](../../../docs/operational-targets.md) section 1: `0` automatic retries for uncertain execution. So the attempt ends with no automatic retry.
- Observed: a second attempt, `retryOf` the first, without executions yet.
- Why only Linux shows it: on macOS CP9 ends `uncertain` without an exit, so no attempt ends.
- Not fixed here (coordinator decision 3). Options for the coordinator: a product fix in a separate change (no automatic retry for an `unknown` status), after which CP9 passes unchanged; or, until then, mark CP9 on Linux as an expected failure matched on L1's signature, as 24b did for D1.

## Limitations

- One Linux host, x86_64, kernel 7.0.0-38-generic under the Ubuntu 24.04 image; the arm64 Linux entry and the Ubuntu 24.04 kernel are not covered.
- The test runs as root in a privileged container; the composed worker is not the installation's worker image with its seccomp profile and capability set.
- `make native-acceptance` does not run this target in its Linux entry.
- The control plane runs in the test process; the scenarios crash the worker and the supervisor only.

## Independent review

TODO. Reviewer: Claude Code `claude-fable-5-1`.

## Remaining gates

- Independent review (Claude Code `claude-fable-5-1`) and its record above.
- The coordinator's decision on candidate defect L1.
- Archive of this change.
- Integration into dev by the coordinator (single pull request)
