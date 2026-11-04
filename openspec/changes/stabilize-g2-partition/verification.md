# Verification: stabilize-g2-partition

## Scope and source

Assigned on 2026-11-04 by the coordinator (Niki) to the worker Zaki, size S, developed by a briefed subagent. Source: the intermittent G2 partition scenario file `test/g2-partition.test.ts`, which `make verify` and `make verify-linux-g2-scenarios` run. The brief asked first whether #446 (merge `3d40034c`) already removed the cause. Scope: the broker while-running scenario of that file, the `g2-failure-scenarios` delta (no `skip_specs`, coordinator decision), and this change. Excluded: product code, the other scenarios, other flaky tests. Commit types `test` and `docs`.

## Revision

- Base: `dev` `3d40034c` (#446); the checklist was saved with `--at 3d40034c1262af4430aa4709c9395753246a7ec3 --size S` and capabilities `g2-failure-scenarios` and `deterministic-test-harness`, unchanged, as the cause is in the test.
- `7ecbfa3a` `test: hold the process of the broker partition scenario until the worker is offline` (the fix).
- `b3d642c2` `docs: propose the stabilize g2 partition change` (proposal, design, tasks, the spec delta, `checklist.json`, `.openspec.yaml`, and the empty `findings.jsonl` and `passes.jsonl`).
- `fcc8afd5` `docs: record the review route of the stabilize g2 partition change` (`route.json` unedited).
- The commit of these records follows; the review record and the archive commit follow it.

## Environment

Zaki's host `hpz600`: Linux 6.8.0-147-generic, x86_64, 8 logical CPUs, Docker Engine 27.3.1. All runs used Node.js 24.22.1, the `.nvmrc` pin; the targeted runs ran after `npm run build`, inside `bash scripts/services.sh run sg2p ...` from the worktree, with the process-group launch host of `make verify`. The logs and scripts are in Zaki's session scratchpad `/tmp/claude-1000/-home-petar-taskelith/b2f59113-7371-431b-8ca7-f0f5db414984/scratchpad/sg2p/`.

## Diagnosis

Past failures of the file in the session scratchpads under `/tmp/claude-1000/-home-petar-taskelith/`, all before #446 was merged (2026-11-04 16:03 +0200):

| Log | Scenario | Message |
| --- | --- | --- |
| `b4ff37b6-…/scratchpad/rr-verify-2-failed.log`, seed 1948878807 | broker, while running | `AssertionError [ERR_ASSERTION]: the exit waits in the local outbox`, `'ended' !== 'pending'`, `g2-partition.test.ts:108` |
| `b2f59113-…/scratchpad/20c/verify-pass2fix.log`, seed 3736254888 | broker, while running | the same, `:108` |
| `b2f59113-…/scratchpad/20e/verify-p3-r1.log`, seed 2975354216 | broker, while running | the same, `:108` |
| `8482e89c-…/scratchpad/eehc-verify-1.log`, seed 1686208801 | broker, while running | `Error: the start is recorded not met within 20000 ms`, `:103` |
| `b2f59113-…/scratchpad/20b/verify7.log`, seed 2757380422 | database, while running | `Error: the start is journaled not met within 20000 ms`, `:168` |
| `b2f59113-…/scratchpad/sabt/verify4.log`, seed 1146846054 | database, while running | the same, `:168` |

`f9647f91-…/scratchpad/sim1.log`, a debugger session that timed out on the Toxiproxy lock, is not counted.

- The two kinds of start timeout belong to the class that #446 removed: a start that waited for a redelivery after `postgres.serialization.exhausted`. Those logs hold no control plane log, so this is an inference from the message, not a capture.
- The outbox assertion does not need that mechanism. At the base the scripted process ran 2.5 s from its launch (`connectedWorker`, `test/g2-partition.test.ts:35` at `3d40034c`), and the scenario cut the route only after the control plane recorded the start (`:103-104`). When the record and the cut took longer than the run, the exit was published and applied before the cut, so the task had ended when the scenario asserted `pending` (`:108`). After the cut nothing reaches the broker: `disconnect` closes the proxy's connections and refuses new ones (`packages/testing/src/toxiproxy.ts:55-58`), and the worker reports offline only after its contact timeout (`apps/worker/src/worker-contact.ts:76-80`).
- Measured on `3d40034c` with a copy of the file that saves the control plane's and the worker's logs (`sg2p/zz-diag-partition.test.ts`, `sg2p/load.sh`, logs `sg2p/dev-load/`): from the `authorizeLaunch` grant to `worker.broker.disconnected`, 933 to 1026 ms in 15 plain runs and 1560 to 1859 ms in 15 runs under 8 busy-loop processes, against the 2.5 s run. #446 removed the redelivery wait, but any delay of the start record past that margin still fails the assertion.

## Was the cause removed by #446?

Not completely. On `3d40034c` the base file passed all 30 load runs (`sg2p/dev-load/summary.txt`: 15 plain and 15 under 8 hogs, each `tests 6, pass 6, fail 0`), and the saved logs show one `postgres.serialization.exhausted`, in the database beyond-redelivery scenario, none in the while-running scenarios. Five parallel loops of three runs of that copy under 4 hogs (`sg2p/par.sh`, logs `sg2p/dev-par/`): 10 of 15 runs `tests 6, pass 6, fail 0`; the 5 others failed only with `Lock toxiproxy-34671 (port 24649) is still held after 240000 ms` (5 scenarios), as five copies of one file queue for one Toxiproxy; every scenario that got the lock passed. So the start-timeout failures did not recur, but the ordering that the outbox assertion depends on is not pinned, and "Fail-before" reproduces it on `3d40034c` every time.

A run on the parent of the #446 merge (`d0acd304`) under the same load was not done: on the base the failure needs a start record more than about 0.6 s later than under 8 hogs, which the past logs show only rarely, and a rate difference would need far more than 30 runs of about two minutes each. The deterministic reproduction stands in for it.

## Author self-check

- Fix (`test/g2-partition.test.ts:102-119`): the scenario holds its scripted process (`HELD_RUN`) and asserts that the journal still shows `started` once the worker is offline (`:110`). When the seed heals after the exit, it releases the process, waits for the exit in the journal, asserts `pending`, then heals (`:111-115`); otherwise it heals, then releases (`:116-118`). `connectedWorker` takes `runMilliseconds`, default 2.5 s, so the other two broker scenarios are unchanged (`:33-38`). No timeout, retry, or seed draw changed, and no assertion was weakened; one was added.
- Spec delta: MODIFIED "Worker broker partition" copies the requirement (249 characters, unchanged) and both its scenarios, and adds "Exit while the worker is offline". Archive probe: a copy of `openspec/` in `sg2p/archive-probe`, `openspec archive stabilize-g2-partition --yes` with the worktree's pinned CLI (`Totals: + 0, ~ 1, - 0, → 0`), then `openspec validate --all --strict`: `Totals: 71 passed, 0 failed (71 items)`.
- `npm run openspec -- validate stabilize-g2-partition --strict`: `Change 'stabilize-g2-partition' is valid`.
- `npx tsc -p tsconfig.check.json`: exit 0. `npm run verify:comments`: `Every comment is within the comment length rule.` No AI attribution in commits.

## Fail-before

`sg2p/repro.sh` ran copies of the base and the fixed file in which the worker's transport delays the publication of `execution.started` by 3 s (`sg2p/delayed-start.ts.txt`, the test-side `transport` seam of `ScenarioWorker`), so the control plane records the start after the 2.5 s process has exited. Command per copy: `TASKELITH_TEST_SEED=<seed> node --experimental-strip-types --test --test-reporter=spec '--test-name-pattern=a partition while the process runs keeps its observations' test/zz-repro-<base|fixed>-partition.test.ts`; the copies were then deleted (kept as `sg2p/zz-repro-*.ts`).

- Base, seed 1948878807, which heals after the exit, the seed of the first past failure (`sg2p/repro/base-1948878807.log`): `tests 1, pass 0, fail 1`, `AssertionError [ERR_ASSERTION]: the exit waits in the local outbox`, `'ended' !== 'pending'`, at the copy's line 109, the base's line 108: the message of the past failures.
- Base, seed 3, which heals before the exit (`sg2p/repro/base-3.log`): `tests 1, pass 1, fail 0`, as that branch makes no outbox assertion.

## After

- The same delayed start on the fixed copy: seed 1948878807 (`sg2p/repro/fixed-1948878807.log`) and seed 3 (`sg2p/repro/fixed-3.log`), each `tests 1, pass 1, fail 0`.
- The fixed file on `fcc8afd5`'s tree, 30 runs with random seeds (`sg2p/load.sh`, logs `sg2p/fixed-load/`): 15 plain and 15 under 8 busy-loop processes on the 8 logical CPUs, each `tests 6, pass 6, fail 0`; 16 of the seeds healed after the exit and 14 before. The while-running broker scenario took 11120 to 11523 ms plain and 12434 to 18154 ms under the hogs. The hogs were killed by their saved PIDs; `ps` showed none afterwards.

## make verify

- Run 1, `env -u NODE_ENV make verify` on `fcc8afd5` (tree `94939924`, clean), profile full (`sg2p/verify-1.log`; `sg2p/verify-1.make.log` is the same log without the exit line added by the run script, which `make record` read): passed, `make verify: passed, profile full, tree 94939924a9ef76a0ec81790d888995731b7be69a; stamp written`; tests 4880, pass 4833, fail 0, skipped 47; all files 99.42% lines, 92.97% branches, 98.85% functions; the web suite `Tests  717 passed (717)`. No known flake failed, so none was rerun. Both while-running partition scenarios passed in it.
- `env -u NODE_ENV make verify-linux-g2-scenarios` on the same tree, through the Linux cgroup supervisor (`sg2p/g2-scenarios-1.log`): `tests 18, pass 17, fail 0, skipped 1` (g, macOS only); cancellation races, worker to NATS, control plane to PostgreSQL, and stale generations passed; exit 0.

### Route

`route.json` of `fcc8afd5`, rule version 5: standard (no trigger); pass 1 reviewer A `codex gpt-6-astra#medium`, pass 2 reviewer B `claude claude-fable-5-1#medium`, pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding. The shadow router (jev-1.14.0) agrees: standard, P(third) 0.35, threshold 0.4. The route is a recommendation only. Review effort medium: owner decision 2026-11-02.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `94939924a9ef76a0ec81790d888995731b7be69a`; tests 4880, pass 4833, fail 0, skipped 47; all files 99.42% lines, 92.97% branches, 98.85% functions.
- `npm run openspec -- validate stabilize-g2-partition --strict`: passed, `Change 'stabilize-g2-partition' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 123 file(s); every pass summary file is valid: 103 file(s); every route file is valid: 56 file(s).`.
- Spec diff against the merge base `3d40034c1262` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

Pending; Zaki runs the passes.

## Limitations

- The two start timeouts of the past logs were not reproduced, before or after the fix, and their logs hold no control plane log; their attribution to the mechanism #446 removed is an inference.
- The outbox failure was reproduced by delaying the start publication, not by the load that caused it in the past runs.
- No run on the parent of #446 (see "Was the cause removed by #446?").

## Remaining gates

- Independent review.
- Integration into dev by the coordinator (single pull request).
