# Verification: stabilize-g2-cancellation-races-exit-signal

## Scope and source

Task from coordinator Niki, assigned to worker Zaki on 2026-10-27, developed by a subagent briefed by the worker session under [subagent execution](/docs/agent-task-protocol.md#subagent-execution). Source: a `make verify` run on a Linux host failed in `test/g2-cancellation-races.test.ts` at the `assertCancelled` assertion that an `exited` outcome of a cancelled attempt has the status `SIGTERM`; the outcome had exit code 0. Which scenario and seed failed there is not recorded. Prepared in the git worktree `../taskelith-worktrees/stabilize-g2-cancellation-races-exit-signal` on branch `stabilize-g2-cancellation-races-exit-signal`, created from `origin/dev`. Scope: `test/g2-cancellation-races.test.ts`, `test/g2-scenarios/scenario-worker.ts`, `test/g2-scenarios/fixtures/crash-before-ack-worker.ts`, and this change with its `results.jsonl`, `findings.jsonl`, and `passes.jsonl`. Exclusions: no product code, no requirement, and no other G2 test file changes. `.openspec.yaml` sets `skip_specs: true` (see `design.md`, "No spec delta"). Commit types `test` and `docs`; the touched files are not part of the published package.

## Revision

Base `e8ce8a11`. The fix is commit `67e20abe`; the change records are in `82e79272`, the review pass 1 fixes in `cc0a82ee`, and the evidence run of `cc0a82ee` in the commit that adds `results.jsonl`.

## Environment

Linux 6.8.0-147-generic x86_64 (Ubuntu 24.04.5 LTS), 8 CPUs, 23 GiB memory, cgroup v2; Docker Engine 27.3.1 (`amd64`); PostgreSQL, NATS, and Toxiproxy started by `bash scripts/services.sh run <project>`, as `make verify` starts them. The loops and perturbation runs used the Node.js on the shell's path, v24.22.0 (`/home/petar/.local/bin/node` shadows the nvm selection); `make verify` ran with v24.22.1 from `.nvmrc` and npm 11.19.1. Dependencies from `npm ci --ignore-scripts`, built by `npm run build`.

## Author self-check and evidence check

- Root cause, checked against `e8ce8a11`: the supervisor signals the process group with `SIGTERM` (`packages/adapters/worker-supervisor/src/process-set.ts:61`, from `packages/adapters/worker-supervisor/src/supervisor.ts:166`) and records the child's own exit status (`supervisor.ts:107`, `172`, `175`). The scripted process has no signal handler, so a `SIGTERM` that reaches it always gives the status `SIGTERM`; code 0 means that it ran its timer to the end first. `outcomeOf` sets `cancelled` from the request and the status from the last exit (`packages/modules/execution/src/domain/attempt.ts:73`), as the `execution-model` requirement "Cancellation requested versus termination observed" (`openspec/specs/execution-model/spec.md:104-105`) requires. So the product does not report a clean exit for a terminated process, and the contract is not ambiguous: the test assumed that the asynchronous cancel always lands within the run (5 s in f, 20 s in c and e).
- Requirements: "Cancel after W4" (`openspec/specs/g2-failure-scenarios/spec.md:166-171`) still holds that a started process exits by `SIGTERM`, and "Invalidation racing a grant" (lines 177-182) that a granted round ends cancelled. The held process makes both hold without a timing assumption.
- Against the brief: the race is removed by construction (a process that a cancel must end cannot end on its own); no scenario bound or existing sleep was widened, and the product is unchanged. The one new wait is the held process's own 50 ms poll for its release file, which only paces how soon a released process exits.
- Comments: every new or changed comment is within the comment length rule (`npm run verify:comments`).
- Evidence check: each count below comes from the run logs of the commands listed; the logs stay outside the repository.

## Checks and results

| Check | Result |
| --- | --- |
| Before, loop alone: `node --experimental-strip-types --test --test-reporter=spec test/g2-cancellation-races.test.ts` 50 times in one services project, on `e8ce8a11`, 2026-10-27 17:23 to 18:14 local | 49 passed, 1 failed; 2998 s in total, 52 to 115 s per run. The failure, run 25, seed `1870462344`, was scenario e, "the crashing worker start did not settle within 20000 ms", under a load spike in that run (f took 53 s instead of about 21 s); it is not the `SIGTERM` assertion and is outside this change. The `SIGTERM` assertion did not fail: 22 granted rounds of f, 50 runs of c, and 49 of e all ended by `SIGTERM`. |
| Load runs on `e8ce8a11` plus one uncommitted edit: `assertCancelled` in `test/g2-cancellation-races.test.ts` printed, after reading the outcome, a line with the attempt's cancellation request, outcome, each execution's start and exit facts (with `recordedAt`) and grant states, and the worker's and control plane's log records whose event names cancel, start, exit, or command. 8 rounds of 6 concurrent copies of the file with 4 busy CPU loops, then 10 rounds of 8 concurrent copies of scenario f (`--test-name-pattern '^f\.'`) with 12 busy loops | 48 and 80 runs, 0 failures. Under the heavier load the time from the cancel's request to the recorded exit of a granted round of f reached 4.4 s (12 granted rounds), against its 5 s run. |
| Perturbation, uncommitted files deleted after the runs: `test/perturb-before.tmp.ts`, the test file of `e8ce8a11`, and `test/perturb-after.tmp.ts`, the test file of `67e20abe`, each changed only by passing the f worker `transport: (transport) => delayCommands(transport, CANCELLATION, 7_000)`; `test/perturb-delayed-commands.tmp.ts` wraps the JetStream consumer's `fetch` as `test/g2-scenarios/ack-interception.ts` does and waits 7 s before yielding each fetched message that names `execution.cancellation.request`. Both ran against the `scenario-worker.ts` of `67e20abe`, whose finite `runMilliseconds` gives the timed process of `e8ce8a11`. f alone (`--test-name-pattern '^f\.'`), 10 runs of each | Old test: 2 runs had a granted round (seed `1870016203` twice) and both failed with `{ kind: 'code', code: 0 }` instead of `SIGTERM`, the observed failure. New test: 10 passed; its 1 granted round (seed `3689496949`) ended by `SIGTERM`. |
| After, loop alone: the same command 50 times on `67e20abe`, 2026-10-27 18:53 to 19:33 local | 50 passed, 0 failed; 2346 s in total, 44 to 80 s per run. 28 granted rounds of f, 50 runs of c, and 50 of e ended by `SIGTERM`; 122 rejected rounds of f ran to code 0 under a later assignment once released. |
| Evidence run on `cc0a82ee`, 2026-10-27, Node.js v24.22.1 from `.nvmrc` first on the path: `TASKELITH_SCENARIO_RESULTS=openspec/changes/stabilize-g2-cancellation-races-exit-signal/results.jsonl bash scripts/services.sh run taskelith-zaki-evidence node --experimental-strip-types --test test/g2-cancellation-races.test.ts` | Exit 0: 9 tests, 8 passed, 0 failed, 1 skipped (g, N/A on Linux, which records no row). `results.jsonl` holds 8 rows, all `passed`, 8 distinct scenarios, target `harness-composition`, host `Linux 6.8.0-147-generic`, arch `x64`, commit `cc0a82ee`, seed `3876534849`. Scenario c ended by `SIGTERM` after W4 before the start, e by `SIGTERM` restarted before the ack wait, and f had two rejected rounds and one granted round that ended by `SIGTERM`. |
| `npm run openspec -- validate stabilize-g2-cancellation-races-exit-signal --strict` | `Change 'stabilize-g2-cancellation-races-exit-signal' is valid` |
| `make verify` on `67e20abe` with this change's proposal, design, tasks, and empty findings files (before this record) | Exit 0 in 3 min 52 s: 2193 tests, 2146 passed, 0 failed, 47 skipped; coverage 99.24 % lines, 92.20 % branches, 98.92 % functions; comment rule, findings files (30 findings and 10 pass summary files), contract compatibility (0 breaking changes against `e8ce8a11`), dependency inventory, `openspec validate --all --strict` (70 of 70), `verify:links`, archive dry run, and package verification passed |

Seeds of the loop before: 2541591296, 2448509289, 722750197, 1136287814, 1562078247, 1254127224, 1566733704, 3254818334, 4185324733, 2304648741, 2016352741, 3646044752, 3561704494, 3071226712, 2437001467, 984866087, 2401953362, 905166302, 2499808758, 3103586253, 1873819861, 2270512534, 912094540, 222247033, 1870462344, 4065461604, 3074831983, 2806314963, 1727853383, 1571408465, 4205462523, 496614073, 4100687381, 2339721662, 492923541, 212746893, 1349471903, 2781307133, 2635986144, 228983992, 42524342, 1274550159, 1231235996, 2475543769, 3891903067, 4201063681, 2606752013, 3709338447, 4159681762, 1933382136.

Seeds of the loop after: 643241266, 3243994778, 2991625628, 2515174527, 2281684739, 625906304, 3197156807, 2034818923, 2934515291, 3500529384, 1849712842, 3284369673, 726366428, 1630205910, 3328022717, 530409055, 1565959882, 628825491, 1505439601, 189863616, 717561874, 463699542, 3621985654, 227599177, 4099764052, 185617844, 3633032722, 1111508888, 2089570241, 2637940087, 2440419424, 4267800681, 151046396, 3823355134, 3772135807, 3310341652, 1844070244, 411469051, 980426156, 3453295673, 679046719, 1026291230, 3318820136, 1933504739, 4098822526, 177758919, 116691379, 680586212, 814247513, 926360602.

## Independent review

Not yet performed. Reviewer A: Codex CLI `gpt-6-astra`, passes 1 and 3. Reviewer B: Claude Code `claude-fable-5-1`, pass 2. The coordinator replaced the planned OpenCode CLI `kimi-k2.7-code` reviewer, paused by the OpenCode Go weekly quota (HTTP 429) until about 2026-11-02 02:00. The [review process](/docs/governance.md#independent-review-process) applies.

## Limitations

- The observed failure was not reproduced without perturbation: 0 of 50 runs alone and 0 of 128 load runs failed the `SIGTERM` assertion on this host. The root cause rests on the code path above, the measured latency under load, and the perturbation, which reproduces the exact outcome.
- The original run's scenario and seed are unknown; f, with the shortest run, is the most likely, and c and e share the race with a longer run. All three now run held processes.
- The scenario e start timeout seen in run 25 before the fix is a separate flake, not addressed here.
- The loops ran with Node.js v24.22.0, not the `.nvmrc` v24.22.1 that `make verify` used.

## Remaining gates

- Independent review: reviewer A pass 1, reviewer B pass 2, and reviewer A pass 3 if needed.
- Archive after review and verification.
- Integration into dev by the coordinator (single pull request)
