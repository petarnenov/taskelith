# Verification: stabilize-workspace-handoff-race-conformance

## Scope and source

Assigned on 2026-10-27 by the coordinator to the worker session Maki. Source: `packages/modules/workspace/test/workspace-conformance.test.ts:76`, "a provider that races two concurrent hand-offs fails the suite", added in #359 (`align-git-workspace-with-execution-boundary`), failed 3 of 4 `make verify` runs at a load average of about 10 to 12 on an Apple M3 and passed alone. Base revision: `b87abe75` on `dev`. Prepared in the git worktree `../taskelith-worktrees/stabilize-workspace-handoff-race-conformance` on branch `stabilize-workspace-handoff-race-conformance`; the fix is commit `f8d26280`, and the fix of review pass 1 is `3b29f979`. The unpushed branch was rebuilt after pass 1 to retitle the fix commit (finding 2): `cd2abc0c`, `135f501c`, and `b4c1f8d7` became `f8d26280`, `512649b5`, and `95fe17cb`, with the same trees. Scope: the test double `packages/modules/workspace/test/temp-dir-workspaces.ts` and this change. No product code, conformance case, or requirement changes, so `.openspec.yaml` sets `skip_specs: true`. Commit types `test` and `docs`; the package is private.

## Environment

Apple M3 (8 CPUs), macOS 26.6.2 (Darwin 25.6.0, arm64), Node.js v24.22.1. The host also ran other sessions' work, so the load averages below include load that the runs did not start.

## Author self-check

- Against the requirement "One handed-off workspace per Linux worker", scenario "Concurrent hand-offs": the conformance case still expects exactly one of two concurrent hand-offs to succeed; the double with `racesHandOff` now lets both succeed every time, so the test proves that the case detects that race. The conforming double keeps the per-root chain and passes the case.
- Against "Workspace conformance suite": every other case keeps its expected result with each defect; the defect list in the test file is unchanged.
- Against the brief: the root cause is a scheduling assumption of the double, reproduced without load; the fix uses a barrier, not a sleep or a wider bound; mutation checks M1 and M2 show the test still fails against a double that does not race and against a case that does not count.
- Comments: the new comments and the moved one are within the comment length rule (`npm run verify:comments`).
- Evidence check: no external link; each number below comes from the command named next to it. Logs and scripts of the load runs were kept in the session's scratch directory, outside the repository.

## Diagnosis

See `design.md`. Observed failure under load: `Expected values to be strictly deep-equal`, actual `[]`, expected `['lets one of two concurrent hand-offs through where executions share a separate account']`, at `workspace-conformance.test.ts:76:3`. The old double ran the racy hand-offs without any ordering, so under load one hand-off often wrote its record before the other checked, and the case correctly saw one success.

## Checks

Unless named otherwise, the checks in the first three sections below ran on the tree of `f8d26280`, before review pass 1.

### Deterministic perturbation

Not committed. In a copy of the double, this line delays the check of the second attempt by 20 ms:

```ts
if (attemptId === 'attempt-2') await new Promise((r) => setTimeout(r, 20));
```

Before the fix it was inserted as the first line of `handOffAlone`, guarded by `this.defects.racesHandOff &&`; after the fix, right before `const mustWait = await this.mustWait(attemptId);` in `racingHandOff`. Without artificial load, 5 runs each of `node --experimental-strip-types --test --test-name-pattern='races two concurrent' packages/modules/workspace/test/workspace-conformance.test.ts`: before the fix 5 of 5 failed with the observed assertion; after the fix 5 of 5 passed.

### Mutation checks (fail-before)

Not committed; each was reverted after its run.

- **M1, barrier off.** On the fixed double with the perturbation, `arrive` resolved at once (`return Promise.resolve();` instead of the `inFlight === 0` test): 3 of 3 runs of the race test failed with the observed assertion. The barrier is what makes the race happen.
- **M2, case does not count.** On the fixed double, the line `expectSame(problems, 'concurrent hand-offs that succeed', …, 1)` in the built `packages/modules/workspace/dist/ports/workspace-conformance.js` was replaced by a comment: the race test failed (actual `[]`), while the conforming test of that case passed. The test still fails when the case stops detecting two successes. The built file was restored.

### Runs under artificial load

Runner: 8 `yes > /dev/null` processes, then N runs of the race test file, 8 at a time, each run its own process. In substance the runner was the following; the actual script also used the TAP reporter and recorded each exit code:

```sh
for i in $(seq 1 8); do yes > /dev/null & done
seq 1 "$N" | xargs -P 8 -n 1 sh -c 'node --experimental-strip-types --test \
  --test-name-pattern="races two concurrent" \
  packages/modules/workspace/test/workspace-conformance.test.ts > "$0.log" 2>&1'
```

Load averages (1, 5, 15 minutes) are `sysctl -n vm.loadavg` before and after each series.

| Double | Perturbation | Runs | Passed | Failed | Load before | Load after |
|---|---|---|---|---|---|---|
| before the fix (first series) | no | 40 | 37 | 3 | 17.44 9.16 7.30 | 19.97 9.83 7.55 |
| before the fix | no | 60 | 58 | 2 | 20.54 13.65 9.41 | 21.38 14.06 9.60 |
| before the fix | yes | 30 | 0 | 30 | 21.27 14.16 9.66 | 22.60 14.55 9.83 |
| after the fix | no | 60 | 60 | 0 | 22.32 14.62 9.88 | 23.46 15.12 10.11 |
| after the fix | yes | 30 | 30 | 0 | 23.34 15.23 10.18 | 23.55 15.41 10.27 |

Every failure printed the observed assertion. All `yes` processes were stopped afterwards; `pgrep -fl yes` printed nothing.

After the pass-1 fix, on `3b29f979`, the same runner without `yes` processes ran the race test 30 times: 30 passed, 0 failed, load before 2.51 3.88 5.91, after 3.75 4.12 5.98.

### Other checks

- `node --experimental-strip-types --test packages/modules/workspace/test/*.test.ts` on `f8d26280`: 69 tests, 68 passed, 0 failed, 1 skipped ("the clone writes into a checkout that is set-group-ID already", skipped on this host).
- `npx tsc -p tsconfig.check.json`: no errors.
- `npm run verify:comments`: every comment is within the rule.
- `npm run openspec -- validate stabilize-workspace-handoff-race-conformance --strict`: valid.
- `make verify` passed (exit 0) on `135f501c`, whose tree is that of `512649b5`, started at a load average of 3.38 (1 minute): 2,289 tests, 2,286 passed, 0 failed, 3 skipped; coverage 99.33 % lines, 92.29 % branches, 99.03 % functions; strict OpenSpec validation 70 passed, 0 failed; findings, links, contract compatibility, archive dry run, and package verification passed.

### Checks after review pass 1

- Fail-before of finding 1 (not committed): with `this.leave();` removed from the `catch` of `afterAllChecks`, `node --experimental-strip-types --test --test-timeout=5000 --test-name-pattern='racing|race again' packages/modules/workspace/test/temp-dir-workspaces.test.ts` reported the three new tests `not ok` with `test timed out after 5000ms`. With the fix they pass.
- `node --experimental-strip-types --test --test-timeout=20000 packages/modules/workspace/test/*.test.ts` on `3b29f979`: 72 tests, 71 passed, 0 failed, 1 skipped.
- `npm run verify:comments`: every comment is within the rule.
- `make findings ARGS="validate"`: every findings file and pass summary file is valid.
- `npm run openspec -- validate stabilize-workspace-handoff-race-conformance --strict`: valid.
- `make verify` passed (exit 0) on `9c80be8b`, started at a load average of 4.61 (1 minute): 2,292 tests, 2,289 passed, 0 failed, 3 skipped; coverage 99.34 % lines, 92.28 % branches, 99.03 % functions; strict OpenSpec validation 70 passed, 0 failed; findings, links, contract compatibility, archive dry run, and package verification passed.

## Independent review

- **Pass 1, reviewer A: Codex CLI, model `gpt-6.1-sol`, reasoning effort `medium`, read-only sandbox, session `01a17f11-f2e8-7282-a761-476950315c06`, range `b87abe75..b4c1f8d7`.** Run by the coordinator. Invocation: `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`. Model confirmation: the model, effort, and read-only sandbox are confirmed in the session header. The tree snapshot was identical before and after the pass. The reviewer confirmed the root cause, found no product gap and no scope creep, and checked the concurrent, single, sequential, and early not-found paths and that the conforming path is kept. Findings: 0 Critical, 0 High, 1 Medium, 1 Low.
  1. Medium (`packages/modules/workspace/test/temp-dir-workspaces.ts:313`, `error-handling`, `git-workspace-port`): a racing hand-off whose `checkoutOf` or `mustWait` threw never left the barrier, so the other hand-off and every later call on the provider waited forever; the reviewer reproduced it with an injected throw. Fixed in `3b29f979`: `CheckBarrier.afterAllChecks` runs the check, leaves on a throw, and rethrows the original error; three tests in `temp-dir-workspaces.test.ts` cover the rejection with the original error, the release of the waiting check, and a barrier and a provider that race again afterwards.
  2. Low (`verification.md:5`, `process`): the fix commit was titled `test: wip …` and the record cited it. Fixed by rebuilding the unpushed branch: `git cherry-pick -n cd2abc0c` on `b87abe75`, committed as `f8d26280` `test: make the racing hand-off double deterministic`, then the two record commits cherry-picked, the trees compared equal, and the branch moved with `git branch -f`.

  Both fixes were checked by pass 2.
- **Failed attempt 1 of pass 2, not a pass.** Reviewer B as assigned, Claude Code, model `claude-opus-5-5`, effort `high`, 2026-10-27 22:43 to 22:48 EET. Invocation: `claude -p "<prompt>" --model claude-opus-5-5 --effort high --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json < /dev/null`. It exited 1 with `Error: No messages returned from query`, wrote empty JSON output, and opened no session. The tree snapshot was unchanged.
- **Failed attempt 2 of pass 2, not a pass.** The replacement Claude Code, model `claude-fable-5-1`, effort `medium`, assigned by the coordinator under [governance "Unavailable reviewer"](/docs/governance.md#independent-review-process) because `claude-opus-5-5` was paused for 30 minutes; the same invocation with that model and effort, 22:48 to 22:52 EET. Same error, empty output, no session. The tree snapshot was unchanged.
- **Smoke test.** `claude -p "Reply with the single word OK." --model claude-fable-5-1 --effort low --output-format json < /dev/null` with Claude Code CLI 2.1.312 succeeded (exit 0, session `a11f2ee6-2f89-449e-b710-6ad3d1ad6e32`): the CLI and its authentication work, so the failure lies with the documented long plan-mode reviewer invocation on this host.
- **Switch.** The coordinator then assigned Codex CLI, model `gpt-6-astra`, effort `medium`, as replacement reviewer B, another model of reviewer A's harness. Reason: under "Unavailable reviewer" no reviewer of another harness was available; all OpenCode models and Antigravity are paused under [Reviewer pauses](/docs/agent-task-protocol.md#reviewer-pauses), and both Claude Code reviewers failed on this host.
- **Pass 2, reviewer B (replacement): Codex CLI, model `gpt-6-astra`, reasoning effort `medium`, read-only sandbox, session `01a17f23-76a7-7422-8734-3c729339ea06`, range `b87abe75..e630c802`.** Run by the coordinator. Invocation: `codex exec -m gpt-6-astra -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`. Model confirmation: the model, effort, and read-only sandbox are confirmed in the output header. The tree snapshot was identical before and after the pass. Findings: 0 Critical, 0 High, 0 Medium, 0 Low. The reviewer confirmed pass 1 finding 1 fixed: the barrier leaves on a throw and keeps the original error, and with `leave()` removed, in memory only, it reproduced the 5000 ms timeout. It confirmed finding 2 fixed: `f8d26280` has a proper message and the rewritten commits have trees identical to the originals. It confirmed the root cause, found no deadlock in the not-found, exception, or reuse paths, found the conforming path preserved, the records, citations, SHAs, and counts consistent, and the scope test-only.
- **End of review.** Pass 2 found nothing, so there are no pass 2 fixes for reviewer A to confirm in a pass 3; the review ends after pass 2.

## Limitations

- The conformance case detects a real adapter's race only probabilistically: it starts two hand-offs together and can see a race only if it happens during the run. That is correct for a black-box conformance check and is not a product gap; this change only makes the double's race certain.
- The original failure was observed in `make verify` runs; it was reproduced here with the race test alone under artificial load and with the forced delay, not in full `make verify` runs.
- The documented Claude Code reviewer invocation fails on this host (Apple M3) with Claude Code CLI 2.1.312 (`Error: No messages returned from query`), while a plain `claude -p` call works; the coordinator will open a follow-up to investigate it.

## Remaining gates

- Integration into dev by the coordinator (single pull request).

## Archive checks

Worker step 7, run by the worker session after review pass 2. Before archiving, `origin/dev` at `dc9f1b66` was merged into the branch with the merge commit `60bbb653`, without conflicts; `dev` had not changed `packages/modules/workspace`. `make verify` on `60bbb653`, started at a load average of 3.05 (1 minute), passed (exit 0): 2,292 tests, 2,289 passed, 0 failed, 3 skipped; coverage 99.33 % lines, 92.29 % branches, 99.03 % functions; strict OpenSpec validation 70 passed, 0 failed.

The checked state is the tree of the archive commit, which is the working tree these checks ran on after `npm run openspec -- archive stabilize-workspace-handoff-race-conformance --yes` (base `60bbb653`). The archive commit also points the record finding's `file` at the moved `verification.md`.

- `npm run openspec -- validate --all --strict`: 69 passed, 0 failed.
- `make verify`, started at a load average of 5.66 (1 minute): exit 0; 2,292 tests, 2,289 passed, 0 failed, 3 skipped; coverage 99.34 % lines, 92.30 % branches, 99.03 % functions; strict OpenSpec validation 69 passed, 0 failed; findings, links, contract compatibility, archive dry run, and package verification passed.
- `npm run openspec -- validate --archived --no-interactive`: the line of `change/2026-10-27-stabilize-workspace-handoff-race-conformance` passes.
- `git diff "$(git merge-base HEAD origin/dev)" -- openspec/specs`: empty, as intended for a change with `skip_specs: true`.
- The moved change has its `findings.jsonl` with the two pass-1 lines and its `passes.jsonl` with the pass-1 and pass-2 lines, and `make findings ARGS="validate"` passes.
