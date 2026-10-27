## Scope and source

`run-g2-crash-windows-on-linux`, a worker task the coordinator assigned on 2026-10-27: run the G2 crash window and duplicate delivery scenarios of item 24b (`run-g2-crash-windows`, archived on 2026-10-26) on Linux. Coordinator decisions: option B, the privileged Linux test image with network to the services; a new Makefile target `verify-linux-crash-windows`, out of `make verify` unless it is as cheap and portable as `verify-linux-cgroup`; the macOS path unchanged; the Linux expectations of CP7 to CP9, and of any other window that differs, per section 6 of the [supervisor identity contract](../../../docs/contracts/supervisor-identity.md); a failing Linux scenario recorded as a candidate defect with its expectation kept, and no product fix. After the first evidence run the coordinator decided for candidate defect L1: mark CP9 on Linux `expectFailure`, citing L1, as 24b did for D1, with the CP9 expectation of section 6 unchanged and macOS unchanged; fix L1 in the separate change `stop-automatic-retry-of-unknown-exit`, which removes the mark as its fail-before test; document the target beside `make verify-linux-cgroup`. Excluded: product code, contracts, the macOS expectations, and `native-acceptance.sh`.

## Revision and environment

- Base: `origin/dev` at `fe643864`. Branch `run-g2-crash-windows-on-linux`. Code commits `7b6e3edc` (`test:`, the harness and the expectations) and `38079215` (`build:`, the make target and the image entry points); `dbc8d00f` (`test:`, CP9 on Linux an expected failure on L1); after review pass 1, `d18d6d5c` (`build:`, the secrets check and the shellcheck directives, findings L4 and L5) and `5dd1025c` (`docs:`, the CP8 scenario, findings L1 and L2). The evidence run is of `d18d6d5c`, the last commit that changes a verification input, with the tree clean apart from the emptied `results.jsonl` it appends to; `5dd1025c` changes only the change's records. The run of `dbc8d00f` is superseded by it. The first evidence run, of `38079215` with this change directory untracked, is superseded as the change's evidence: its `results.jsonl` was replaced. Its CP9 output stays below as the evidence of candidate defect L1.
- Host: Ubuntu 26.04.1 LTS, kernel 7.0.0-38-generic, x86_64, cgroup v2, ext4; Docker Engine 29.8.2; Node.js 24.22.1 from `.nvmrc`. No sudo was used and no host-wide setting was changed.
- Container: the Linux test image `taskelith-linux-cgroup:test`, built by `make linux-test-image` from `ubuntu:24.04@sha256:68ee22004a9109b44973313b02ff7b1de250f1de0f5ecb628d73f579aaff33ac` with the pinned Node.js 24.22.1 for linux-x64, run with `--rm --init --privileged --cgroupns=private --network host --volume /tmp`, the checkout mounted read-only, the services secrets read-only. Services: the target's own `scripts/services.sh run` project, PostgreSQL and NATS on `127.0.0.1` ephemeral ports.
- `TMPDIR=/home/petar/.cache/taskelith-tmp` for every host command, because the host's `/tmp` tmpfs quota fails with `EDQUOT`.

## Author self-check and evidence check

- No product code, contract, OpenAPI, AsyncAPI, JSON schema, Compose file, or dependency changes; `packages/testing` is a private test package. The macOS expectations are the same objects as before, now under `MACOS_UNSUPERVISED`.
- Every expectation that differs on Linux cites section 6 in the test and in design decision 10; no expectation was changed to make a run pass. CP9 keeps its section 6 expectation; on Linux only, it is marked `expectFailure` with L1's signature, `/one attempt: .*"retryOf":"t[0-9a-f]+"/`, so any other failure of CP9 stays red. A scratch `node:test` check confirmed that a non-matching error fails such a test.
- The guard: on this host, `make verify` runs the scenario file without the Linux launch settings, and its 29 tests are skipped with the reason that names the target.
- Each record of `results.jsonl` names commit `d18d6d5c5adbddb84a061e3fcbe18e671f1e38c1`, read on the host and passed as `TASKELITH_SCENARIO_COMMIT`, host `Linux 7.0.0-38-generic`, arch `x64`, seed `2776760789`, and target `harness-composition`; 29 distinct scenarios. 24b's run had 27 records; the two windows that `dev` added since (`crash-window-w2-after-2-after-a-runtime-seal`, `crash-window-w3-after-then-w2-after`) bring it to 28 windows and the duplicate delivery.
- The `crash-window-cp9` record is `failed` with `AssertionError [ERR_ASSERTION]: one attempt: [...`: the recorder writes the scenario's result before `expectFailure` turns the test into a pass, and it truncates the detail at 500 characters, before the second attempt's `retryOf`. The CP4 record names "CP4 after the claim", and the CP8 record "child released after the adopter's supervisor.2", so the populated containment row of section 6 is the one CP8 exercised.
- `npm run verify:comments`, `npm run check:boundaries`, and `npm run openspec -- validate run-g2-crash-windows-on-linux --strict` pass. `findings.jsonl` is empty before review.

## Checks

| Check | Result |
| --- | --- |
| `npm run openspec -- validate run-g2-crash-windows-on-linux --strict` | valid |
| `npm run verify:comments` | Every comment is within the comment length rule |
| `make findings ARGS="validate"` | Every findings file is valid: 3 file(s) |
| `make verify` of `38079215` with this change directory in the tree | Passed: 2018 tests, 1972 passed, 0 failed, 46 skipped (among them the 29 crash window and duplicate delivery tests, skipped with the reason that names `make verify-linux-crash-windows`); coverage of all files 99.19% lines, 91.85% branches, 98.80% functions; OpenSpec 70 passed; every active change archives into strictly valid specs |
| Superseded first evidence run of `38079215`: `TASKELITH_TEST_SEED=2776760789 TASKELITH_SCENARIO_RESULTS=openspec/changes/run-g2-crash-windows-on-linux/results.jsonl make verify-linux-crash-windows` | Exit status 2 (`make: *** [Makefile:117: verify-linux-crash-windows] Error 1`): 29 tests, 28 passed, 1 failed (CP9, candidate defect L1), 0 skipped, 84.8 s in the container; `results.jsonl` holds 29 lines, 28 `passed` and 1 `failed` |
| `make verify-linux-cgroup` after the layout moved into `cgroup-layout.sh` | Exit status 0: 14 tests, 14 passed |
| Superseded evidence run of `dbc8d00f`: `TASKELITH_TEST_SEED=2776760789 TASKELITH_SCENARIO_RESULTS=openspec/changes/run-g2-crash-windows-on-linux/results.jsonl make verify-linux-crash-windows`, `results.jsonl` emptied first | Exit status 0: 29 tests, 29 passed, CP9 among them as `# EXPECTED FAILURE` on L1, 0 failed, 0 skipped, 85.9 s in the container; `results.jsonl` holds 29 lines, 28 `passed` and 1 `failed` (`crash-window-cp9`) |
| `make verify-linux-cgroup` of `dbc8d00f` | Exit status 0: 14 tests, 14 passed |
| `make verify` of `dbc8d00f` with the new `results.jsonl` and `docs/local-installation.md` in the tree, before the record edits | Passed: 2018 tests, 1972 passed, 0 failed, 46 skipped (among them the 29 crash window and duplicate delivery tests, skipped with the reason that names `make verify-linux-crash-windows`); coverage of all files 99.19% lines, 91.86% branches, 98.80% functions; OpenSpec 70 passed; every active change archives into strictly valid specs |
| Evidence run of `d18d6d5c`, after review pass 1: `TASKELITH_TEST_SEED=2776760789 TASKELITH_SCENARIO_RESULTS=openspec/changes/run-g2-crash-windows-on-linux/results.jsonl make verify-linux-crash-windows`, `results.jsonl` emptied first | Exit status 0: 29 tests, 29 passed, CP9 among them as `# EXPECTED FAILURE` on L1, 0 failed, 0 skipped, 85.3 s in the container; `results.jsonl` holds 29 lines, 28 `passed` and 1 `failed` (`crash-window-cp9`) |
| `make verify-linux-cgroup` of `d18d6d5c` | Exit status 0: 14 tests, 14 passed |
| `env -u TASKELITH_SERVICES_SECRETS bash scripts/linux-crash-windows.sh img` of `d18d6d5c` | Exit status 2 with the message that names `TASKELITH_SERVICES_SECRETS` |
| `make verify` of `5dd1025c` with the pass 1 records in the tree | Passed: 2018 tests, 1972 passed, 0 failed, 46 skipped (the 29 crash window and duplicate delivery tests among them, skipped with the reason that names `make verify-linux-crash-windows`); coverage of all files 99.19% lines, 91.86% branches, 98.80% functions; OpenSpec 70 passed; every active change archives into strictly valid specs |
| `npm run openspec -- validate run-g2-crash-windows-on-linux --strict`, `npm run verify:comments`, and `make findings ARGS="validate"` with the pass 1 records | valid; every comment within the rule; every findings file valid: 3 file(s) |

## Windows and results

Seed `2776760789` for every row, evidence run of `d18d6d5c`, on Linux in the privileged test image. "Journal section 5" is the recovery table of the [worker journal contract](../../../docs/contracts/worker-journal.md); "section 6" is the recovery table of the supervisor identity contract, Linux rows.

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
| CP9 | Supervisor program: `handle` written; the child runs until the adopter's `supervisor.2` | Section 6, Linux, "the containment is populated": adopt, then `exit` with unknown status, start proven, one spawn; one attempt, as section 6 and the retry budget of `0` for uncertain execution require | expected failure: candidate defect L1 |
| CP10 | Armed journal right after W5s; the journal holds `started` | Section 6 "a supervisor is live": adopt, exits 0 | passed |
| CP11 | Supervisor program: `exit` written | Section 6 "`exit` present": report the recorded exit 0 | passed |
| CP12 | Armed journal right after W5e; the journal holds `exited` | Section 6 "`exit` present": report the recorded exit 0 | passed |
| Duplicate delivery | 2 copies of the offer while the child ran and 3 after the result | One intent, one execution, one spawn, one result | passed |

## Candidate defect L1: an unknown exit with a proven start is retried automatically

- Scenario `crash-window-cp9`, seed `2776760789`, commit `38079215`; reproduced in every run of CP9 on this host (three exploratory runs, the first evidence run, and the evidence runs of `dbc8d00f` and `d18d6d5c`, where it is the expected failure). CP7 and CP8, whose unknown exits have an unproven start, open no retry.
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
- Contract: [`docs/contracts/supervisor-identity.md:107`](../../../docs/contracts/supervisor-identity.md), the retry budget of `0` for uncertain execution. Code: `packages/modules/scheduling/src/domain/automatic-retry.ts:14-17`, `isRetryableOutcome`.
- Not fixed here (coordinator decision 3). Coordinator decision of 2026-10-27: CP9 on Linux is marked `expectFailure` now, matched on L1's signature, as 24b did for D1, with its expectation unchanged; L1 is fixed in the separate change `stop-automatic-retry-of-unknown-exit`, which removes the constant `L1` and its use on the CP9 row as its fail-before test, after which CP9 passes unchanged.

## Limitations

- One Linux host, x86_64, kernel 7.0.0-38-generic under the Ubuntu 24.04 image; the arm64 Linux entry and the Ubuntu 24.04 kernel are not covered.
- The test runs as root in a privileged container; the composed worker is not the installation's worker image with its seccomp profile and capability set.
- `make native-acceptance` does not run this target in its Linux entry.
- The control plane runs in the test process; the scenarios crash the worker and the supervisor only.

## Independent review

Criteria: the ADR 0004 principles, every instance of a problem. Snapshots: SHA-256 of all tracked and untracked files before and after each pass.

- Failed attempt (not a pass): Claude Code `claude-fable-5-1`, Claude Code 2.1.311, invocation `claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json < /dev/null`, on `1edbab86`, 2026-10-27 08:14:51 to 08:20:21 local. Exit status 1, empty JSON, stderr `Error: No messages returned from query`, no session. Under "Unavailable reviewer" Fable is paused until 08:50, and the coordinator assigned the replacement, OpenCode CLI (`kimi-k2.7-code`).
- Pass 1: OpenCode CLI, model `opencode-go/kimi-k2.7-code`, variant `default` (confirmed in the stored session messages), invocation `opencode run --standalone --agent reviewer -m 'opencode-go/kimi-k2.7-code' --format json --title run-g2-crash-windows-on-linux "$(cat <prompt-file>)" < /dev/null > <log>`, session `ses_e83fa4eaeffeUf3sSv1vDmQiB2`, 2026-10-27 08:21:49 to 08:28:50 local, on `1edbab86` with evidence revision `dbc8d00f`, which the reviewer confirmed fresh. Snapshot before and after: `f0cd1d49d9fa7726f934129ca870c04f2b7d813b5836085b03cff5cb4296f509`, identical. Findings: Critical 0, High 0, Medium 0, Low 5. The reviewer confirmed the guard, the section 6 expectations, the narrow `expectFailure` signature, the cleanup, the agreement of `results.jsonl`, and that no product code changed.

| Finding | Resolution | Commit |
| --- | --- | --- |
| L1: the spec delta has Linux scenarios for CP7 and CP9 but not CP8 | Added "Populated containment without a handle on Linux" for CP8 and renamed CP9's to "with a handle"; the requirement texts are unchanged | `5dd1025c` |
| L2: the proposal's capability line names only CP7 and CP9 | Names CP7, CP8, and CP9, as design decision 1 now does | `5dd1025c` |
| L3: the review section is a placeholder naming Fable | This section | this record |
| L4: `# shellcheck source=cgroup-layout.sh` in `tools/linux-cgroup/crash-windows.sh` and `run.sh` resolves to no file | `source=tools/linux-cgroup/cgroup-layout.sh`: the repository runs no shellcheck, and this path resolves from the repository root, where make runs, unlike the image path, which exists only in the container | `d18d6d5c` |
| L5: `scripts/linux-crash-windows.sh` mounts `$TASKELITH_SERVICES_SECRETS` unchecked | Exits 2 with a message naming the variable when it is unset, as the usage check does | `d18d6d5c` |

Pass 1 found only Low findings, so they are fixed without another pass (governance, "Low findings are fixed"); these fixes are unreviewed. `findings.jsonl` holds the five findings with outcome `fixed-unreviewed`; the failed attempt adds none.

## Remaining gates

- The fix of candidate defect L1 in `stop-automatic-retry-of-unknown-exit`, outside this change; it removes CP9's `expectFailure` as its fail-before test.
- Carried over to `close-g2`: the arm64 Linux entry and the Ubuntu 24.04 kernel are not covered, and `make native-acceptance` does not run this target in its Linux entry (Limitations).
- Integration into dev by the coordinator (single pull request)
