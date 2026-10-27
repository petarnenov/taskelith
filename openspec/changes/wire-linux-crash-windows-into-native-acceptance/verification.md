# Verification: wire-linux-crash-windows-into-native-acceptance

## Scope and source

A worker task the coordinator (Niki) assigned on 2026-10-27, developed in a briefed subagent: a follow-up from G2, because `make native-acceptance` did not run `make verify-linux-crash-windows`, so a run on a Linux host omitted the crash-window suites that G2 proves only on Linux. Step 0 gate: the omission is a known limitation, not a decision (`openspec/changes/archive/2026-10-27-run-g2-crash-windows-on-linux/design.md:31`, `verification.md:92` and `:126`, carried to `close-g2`). Design: [design.md](design.md).

## Revision

- Base: `origin/dev` `bd6108d4`.
- Implementation commit: `cbe92a40` (`test: run the Linux crash windows in the native acceptance Linux entry`); change documents: `b76040c3`.
- Merge of `origin/dev` `34af90f4` (#343, the `passes.jsonl` rule): `126b52d7`. It changes no input of native acceptance; its only `Makefile` edit is the comment of the `findings` target. This record and the empty `passes.jsonl` come after it.

## Environment

Linux 6.8.0-147-generic, x86_64, Ubuntu 24.04.5 LTS host; Docker Engine - Community 27.3.1, Docker Compose 2.29.7, storage driver overlay2, ext4 volumes; Node.js 24.22.0 on the host through `nvm use`, 24.22.1 pinned for the targets and in the test image.

## Author self-check

- `scripts/native-acceptance.sh`: `linux_crash_window_proofs` (lines 91-106) runs `acceptance-crash-windows` (process ownership, `SKIP_PATTERN=redelivered`) and `acceptance-duplicate-delivery` (connectivity, `PATTERN=redelivered`) through `prove` when `uname -s` is `Linux`, and otherwise reports both through `not_applicable` (lines 85-89). `linux_entry` calls it last (line 127). The last line of `main` names the not-applicable proofs after a pass and after a failure (lines 177-185).
- `Makefile:112-119`: `verify-linux-crash-windows` passes `--test-skip-pattern` when `SKIP_PATTERN` is set; without it the command is unchanged.
- `scripts/linux-crash-windows.sh:26-27`: passes `TASKELITH_ACCEPTANCE` into the container when it is set.
- `docs/local-installation.md:88-89`: the new proofs, the macOS report, `SKIP_PATTERN`, and `TASKELITH_ACCEPTANCE`.
- Spec delta: one ADDED requirement in `native-worker-acceptance`, body 476 characters.
- Plan checklist (design.md): a not-applicable proof neither fails a run nor hides a failure; runner, spec, and docs agree; every new test fails on the base; `findings.jsonl` and `passes.jsonl` are empty.

## Checks and results

- Fail-before, on `bd6108d4` with only the new tests added: `node --experimental-strip-types --test test/native-acceptance-runner.test.ts` gave tests 11, pass 8, fail 3: the Linux entry printed no `verify-linux-crash-windows` proof; `not_applicable_proofs: unbound variable`; the last line lacked the not-applicable list. `test/linux-crash-windows-script.test.ts` with the base `scripts/linux-crash-windows.sh` gave tests 2, pass 1, fail 1 (no `--env TASKELITH_ACCEPTANCE`).
- After the change: the two files gave tests 13, pass 13, fail 0.
- Finding 3 of pass 1: the new test "a failed run names its failed and its not-applicable proofs" (`test/native-acceptance-runner.test.ts:128`) fails with the base `scripts/native-acceptance.sh` of `bd6108d4` (tests 1, pass 0, fail 1) and passes after; the file now gives tests 12, pass 12, fail 0.
- Real run on `cbe92a40`, 2026-10-27 13:39:00 to 13:49:26 local: `make native-acceptance RESULTS=<scratch>/results.jsonl`, default entries (`linux` only), seed 2593973655. Exit 0, `every proof passed`. 42 records, all `passed`, all with an acceptance context, all on commit `cbe92a403d82bc3a0c658bb8c61c6dd1a94f4761`: ten proofs and 32 own records (three scenarios, 28 crash windows, one duplicate delivery). `acceptance-crash-windows`: tests 28, pass 28, fail 0, skipped 0; `acceptance-duplicate-delivery`: tests 1, pass 1, fail 0. Each of the 28 `crash-window-*` records carries row `process-ownership`, and `duplicate-delivery` row `connectivity`. A copy is [results.jsonl](results.jsonl).
- Not run: the macOS branch on a real macOS host; only the stubbed tests cover it.
- `npm run openspec -- validate wire-linux-crash-windows-into-native-acceptance --strict`: valid.
- `make verify` on `b76040c3`: passed; tests 2116, pass 2069, fail 0, skipped 47; all files 99.24% lines, 92.17% branches, 98.92% functions; OpenSpec 70 passed; findings 20 files valid.
- `make verify` after the merge, on `126b52d7` with this record and the empty `passes.jsonl`: passed; tests 2136, pass 2089, fail 0, skipped 47; all files 99.24% lines, 92.19% branches, 98.92% functions; OpenSpec 70 passed; findings 21 files and pass summaries 2 files valid.
- `make verify` after the pass 1 fixes, on their working tree: passed; tests 2137, pass 2090, fail 0, skipped 47; all files 99.24% lines, 92.19% branches, 98.92% functions; OpenSpec 70 passed; findings 21 files and pass summaries 2 files valid.

## Independent review

Criteria: the ADR 0004 principles and the plan checklist of [design.md](design.md). Reviewer A: OpenCode; reviewer B: Claude Code `claude-fable-5-1`.

- Pass 1 (reviewer A): OpenCode, model `opencode-go/deepseek-v4-pro`, variant `high`, invocation `opencode run --standalone --agent reviewer -m 'opencode-go/deepseek-v4-pro#high' --format json --title wire-linux-crash-windows-into-native-acceptance "$(cat <prompt-file>)" < /dev/null > <log>`, session `ses_e82c1a3dfffelHrljRmn627wfe`, on `50618a30`, run by the coordinator after `make verify` passed on that revision. Model confirmation: the stored assistant messages of the session export record provider `opencode-go`, model `deepseek-v4-pro`, variant `high`, agent `reviewer`. Snapshot before and after: identical. Findings: Critical 0, High 0, Medium 0, Low 3.

| Finding | Resolution |
| --- | --- |
| L1: this record gave the spec body as 477 characters | Recounted without the line feed: 476 |
| L2: the design's checklist named the capability `linux-crash-windows`, which does not exist, and a docs glob that matches nothing | Ran the checklist again with `g2-failure-scenarios` and `docs/local-installation.md` and pasted its real output into design.md |
| L3: no test covered a failed proof together with a not-applicable one | Added the test at `test/native-acceptance-runner.test.ts:128`; it fails on the base script |

Pass 1 found only Low findings, so they are fixed without another pass (governance, "Low findings are fixed"); these fixes are unreviewed. Reviewer B (Claude Code `claude-fable-5-1`) did not run, because pass 1 was Low-only. `findings.jsonl` holds the three findings with outcome `fixed-unreviewed`, and `passes.jsonl` the summary of pass 1.

## Limitations

- On a macOS host the Linux entry still leaves the Linux crash windows and duplicate delivery unproven; it reports them, and the scenario recorder has no outcome for a not-applicable proof (design decision 4).
- One Linux host, x86_64; the arm64 Linux entry is not covered.

## Remaining gates

- Archive of the change (worker step 7).
- Integration into dev by the coordinator (single pull request)
