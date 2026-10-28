# Verification: wire-git-workspace-into-worker

## Scope and source

G3 item 16 (`docs/g3-plan.md`, row 16), sub-change 16e, developed by a briefed subagent for the coordinator Niki: the worker wiring and admission of the Git workspace adapter, namely the execution group, the single slot and its start refusal, `fs.protected_hardlinks`, `reclaim-failed` handling, and the macOS composition, with the architect's answers to Q1 to Q10 of 2026-10-28 (`design.md`, "Coordinator questions"). Out of scope: the delegated-child half of "One handed-off workspace" (item 38), the harness host and its calls of the slot service (item 18), and the reconciliation observation of a failed reclaim (item 21). No new third-party dependency.

## Revision

- Base: `dev` `f68d4f76`; the change was opened in `64974bd8`.
- `a7f22c2d` `chore: kill a reclaim program past its bound and expose the hand-off records` (adapter `#failedProgram` and `LaunchedReclaim.kill`, `handOffRecords`, the journal port's `redeclareCapacity`, the reason `hardlinks-unprotected`).
- `e9c27329` `chore: wire the Git workspace into the worker` (settings, `workspace-composition.ts`, `workspace-slots.ts`, admission, start, entrypoint, tests).
- `11171b2e` `docs: record the architect's answers and amend the Git workspace contract`.
- `9c1e56e0` the merge of `origin/dev` `16667399` (#405, governance policy v8, `record-the-review-sequence`), without a conflict; its `post-merge` hook reported the dependency inventory stale, regenerated in `7971e4b2`. The change still validates (`npm run openspec -- validate wire-git-workspace-into-worker --strict`).
- `3a6784fe` the first route (`route.json`, unedited). The `make verify` on its tree failed at `npm run verify:comments` (`apps/worker/src/workspace-slots.ts:16: comment spans 3 lines (max 2)`); `624112b7` fixed the comment, which changed the diff after routing, so `b513fe37` deleted `route.json` and `e7d61265` routed again, unedited, as worker step 4 of the agent task protocol requires. Both routes gave the same result.
- `efbb79ca` `docs: record the verification of the wire git workspace into worker change`, the revision that review pass 1 reviewed.
- Review pass 1 fixes: `f40abcec` (finding 1), `824ccab2` (finding 3), `3acc3dc1` (finding 2), `291f9822` (finding 4), `00a1e2b0` (finding 5, the worker-runtime delta of finding 1, and the contract text of findings 1 and 2), `004144e1` (the git-workspace-port delta of finding 2 with its "Interrupted cleanup" scenario, and design, proposal, and tasks, with the architect's answers N1 and N2), and `38d39dda` (the pass 1 line of `passes.jsonl` and the five lines of `findings.jsonl`). `route.json` is not routed again: worker step 4 routes before pass 1 only.
- Review pass 2 fixes: `c764fd2a` (finding 4), `45b308d8` (finding 3 and the tests of answer A2), `d26690b6` (findings 1, 2, and 5 and the contract and spec text of finding 4), `44b5b314` (design and tasks, with the coordinator's answers A1 and A2), `aeaf36b8` (findings 6 and 7), `64917d03` (the pass 2 line of `passes.jsonl`, the seven lines of `findings.jsonl`, and this record), `ff78b57d` (the two tests of `reclaim-program.test.ts` typed through the `ReclaimHost` port, after the first `make verify` below failed its type check), and the commit after it (`make record` and the checks below).
- Review pass 3 fixes, unreviewed: `08a9347d` (finding 1), `51daebe7` (finding 2), `23caaad6` (finding 3, and the `design.md` text of finding 1), `7845c3da` (the `design.md` text of finding 2), `fb2b6108` (the pass 3 line of `passes.jsonl` and the three lines of `findings.jsonl`), and the commit after it (`make record`, the checks below, and this record).

## Environment

Native Ubuntu host `hpz600`, Linux 6.8.0-147-generic x86_64; Node.js 24.22.1 and the npm of the `Makefile` pin; host Git 2.43.0 at `/usr/bin/git`; Docker 27.3.1 with cgroup v2. The Linux suite ran in `taskelith-worker:taskelith-2373734874-installation-git-workspace`, built by `make verify-linux-git-workspace` from this branch, with the repository's host-built `dist` mounted read-only.

## Author self-check

- Scope: every answer is applied as the architect gave it (Q1 (a), Q2 (a), Q3 (a), Q4 (a), Q5 (a), Q6 (b), Q7 (a), Q8 (a), Q9 (a), Q10 (a)); `launch-orchestrator.ts` is unchanged; the scan exclusion wraps the launch host's scan in `worker-start.ts`. `resource-admission` has no delta.
- Implementation details beyond the design's first draft, recorded in `design.md`: the adapter's `handOffRecords()` reads the record of each attempt that `handedOff()` returns; the journal port gains `redeclareCapacity` (replaced by `oweCapacityDeclaration` in `f40abcec`, review pass 1 finding 1); the held slot is counted wherever the workspace is composed, macOS included; a failed `handOff` re-reads the records; the entrypoint adds the group only with a launch command; the pinned OpenSpec refuses a `MODIFIED` block that drops scenarios, so the narrowing of "One handed-off workspace per Linux worker" is a `REMOVED` requirement plus the `ADDED` "Handed-off workspace refusal in the adapter", whose two scenarios are copied unchanged.
- Requirement texts of both deltas are under 500 characters. Before the review fixes the longest was "Git workspace composition", 463; for the figures after the fixes of passes 1 and 2 see "Independent review".
- Comments: `npm run verify:comments` passes. No AI attribution in commits.
- Evidence check: the counts below are copied from the logs named with them.

## Fail-before

On the working tree of `e9c27329` with `apps/worker/src`, `apps/worker/package.json`, `apps/worker/tsconfig.json`, `packages/adapters/git-workspace/src`, `packages/adapters/worker-journal/src`, `packages/modules/execution/src`, `packages/modules/workspace/src`, and `infra/installation/worker-entrypoint.sh` restored from `f68d4f76` (the two new worker modules removed), `npm run build`, then the new tests, then everything restored from `HEAD` (`git status` clean):

| Test | How it failed before the change |
| --- | --- |
| `command-intake.test.ts` "a handed-off workspace holds its slot after its assignment ended, once per attempt, until its reclaim" | Outcomes `accepted, accepted, accepted, worker-slots-exhausted` where `accepted, accepted, worker-slots-exhausted, accepted` was expected |
| `command-intake.test.ts` "a handed-off attempt that the journal no longer counts holds its slot only, not its CPU and memory" | Third offer `worker-capacity-exhausted` where `worker-slots-exhausted` was expected |
| `worker-settings.test.ts` "a Linux worker with a separate execution account declares one slot unless told otherwise" | Slots `2`, expected `1` |
| `worker-settings.test.ts` "... refuses more than one slot, naming the variable and the account" | `expected a failure`: `TASKELITH_WORKER_SLOTS=2` was accepted |
| `worker-start.test.ts` "a workspace precondition that fails stops the start before enrollment and creates nothing" | `expected a failure`: the start ignored the composition and enrolled |
| `worker-start.test.ts` "the start sweeps the workspaces, holds the recorded slots, and skips their containments in the scan" | Sweeps `0`, expected `1` |
| `worker-start.test.ts` "a reclaim through the worker's slots declares the unchanged capacity again" | `TypeError: Cannot read properties of undefined (reading 'reclaim')`: no `workspaceSlots` |
| `worker-start.test.ts` "hand-off records or a sweep that fail fail the start and release the root" | `expected a failure`: the start succeeded |
| `worker-start.test.ts` "a worker with an execution account opens the workspaces to its group" | Mode `0700` (448) where `0710` (456) was expected |
| `workspace-composition.test.ts` (all 5 tests, including "a Linux worker without a launch command composes no workspace and runs no hard-link check or Git gate") | The file failed at import: `SyntaxError: The requested module '@taskelith/worker' does not provide an export named 'CLONE_UMASK'` |
| `workspace-slots.test.ts` (all 7 tests, including "the reclaim-failed line holds no path, no credential, and no checkout content") | The file failed at import: no export `RECLAIM_FAILED_EVENT` |
| `hand-off.test.ts` "a program still running at the run bound is killed and freed, and the workspace stays handed off" (kill after the bound) | `AssertionError: the program is killed and proven gone` (`populated` was `true`) |
| `hand-off.test.ts` "a failed reclaim program keeps the workspace handed off and never runs again" (new assertion) | `AssertionError: the empty containment of the failed program is freed` (`released` was `[]`) |
| `worker-journal.test.ts` "a capacity redeclaration is journaled also when unchanged, and later ones compare with it" (replaced in `f40abcec` by "an owed capacity declaration is journaled once, also when unchanged and after a restart") | Failed: no `redeclareCapacity` |
| `workspace-domain.test.ts` "WORKSPACE_FAILURE_REASONS holds the contract's values, frozen" | The list lacked `hardlinks-unprotected` |
| `worker-entrypoint.test.ts` "a launching worker holds the execution group as its supplementary group" | `setpriv` ran without `--groups 10003` |
| Worker image, `linux-git-workspace.privileged.ts` "a reclaim program past its run bound is killed and its cgroup removed, and the workspace stays handed off" (only `packages/adapters/git-workspace/src` restored, built with `tsc -b`) | `AssertionError: the killed program is proven gone and its cgroup removed` |
| Worker image, "a failed or killed reclaim program keeps the workspace handed off and never runs again" (new assertion) | `AssertionError: the empty cgroup of the failed program is removed` |

Without a fail-before, because they guard behavior that already held: "a worker whose executions run as its own account keeps the slots it is given" and "a worker without a composed workspace has no workspace slots" passed before the change. The `installation-composition.test.ts` assertion on the entrypoint's `setpriv` line was adapted to the new line, not added.

## After the change

- Host: `apps/worker/test/*.test.ts` gave tests 320, pass 320, fail 0 (before the start precondition test was widened to `git-client-mismatch`); the adapter, journal, and workspace module tests gave tests 455, pass 453, fail 0, skipped 2 (the privileged ones); the entrypoint and installation composition tests gave tests 22, pass 22.
- Worker image: `make verify-linux-git-workspace` on the source of `e9c27329` gave tests 42, pass 42, fail 0, skipped 0, with the two kill tests above; after the pass 1 fixes see "Independent review".

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `make verify` | `fb2b6108`, after the pass 3 fixes, tree `3cac536f` (log `16e-verify-4.log` in the session scratchpad) | Passed, profile full, stamp written: tests 3575, suites 46, pass 3528, fail 0, cancelled 0, skipped 47; all files 99.37 % lines, 92.78 % branches, 98.76 % functions. `make record` of this run is under "Generated checks" |
| `make verify-linux-git-workspace` | `fb2b6108` | Passed: tests 43, pass 43, fail 0, skipped 0 (log `16e-linux-4.log`) |
| `make verify` | `64917d03` | Failed at `npm run check:boundaries`: `reclaim-program.test.ts(265,29): error TS2554` (the one-account host's `killRecorded` takes no argument), fixed in `ff78b57d` |
| `make verify` | `ff78b57d`, after the pass 2 fixes, tree `d1b22d39` (log `16e-verify-3.log` in the session scratchpad) | Passed, profile full, stamp written: tests 3571, suites 46, pass 3524, fail 0, cancelled 0, skipped 47; all files 99.37 % lines, 92.78 % branches, 98.76 % functions; its `make record` was replaced by the run after the pass 3 fixes |
| `make verify-linux-git-workspace` | `ff78b57d` | Passed: tests 43, pass 43, fail 0, skipped 0 (log `16e-linux-3.log`) |
| `make verify` | `3a6784fe` | Failed at `npm run verify:comments` (one comment of 3 lines), fixed in `624112b7` |
| `make verify` | `38d39dda`, after the pass 1 fixes, tree `1fb8f298` (log `16e-verify-2.log` in the session scratchpad) | Passed, profile full, stamp written: tests 3567, suites 46, pass 3520, fail 0, cancelled 0, skipped 47; all files 99.37 % lines, 92.77 % branches, 98.76 % functions; its `make record` was replaced by the run after the pass 2 fixes |
| `make verify-linux-git-workspace` | `38d39dda` | Passed: tests 43, pass 43, fail 0, skipped 0 (log `16e-linux-2.log`) |
| `make verify` | `e7d61265`, tree `d17b367a` | Passed, profile full, stamp written: tests 3558, pass 3511, fail 0, skipped 47; all files 99.36 % lines, 92.77 % branches, 98.76 % functions; its `make record` was replaced by the run after the pass 1 fixes |
| `make findings ARGS="route --change wire-git-workspace-into-worker"` | `7971e4b2`, again on `b513fe37` | "route: elevated (lines, files, contracts, docker), rule version 2"; pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-opus-5-5#xhigh`, pass 3 reviewer A `codex gpt-6.1-sol#high` only after a pass 2 with a Medium or worse finding; shadow `jev-1.14.0` agrees; recommendation only, committed unedited as `3a6784fe` and `e7d61265`. The brief names pass 1 `codex gpt-6-astra#medium`, pass 2 `claude claude-opus-5-5#medium` (accepted by `make review` since governance policy v8, #405), and pass 3 `codex gpt-6.1-sol#medium` |
| `make verify-linux-git-workspace` | `e9c27329` | Passed: tests 42, pass 42, fail 0 |

## Contract amendments

`docs/contracts/git-workspace.md`, by the architect's answers of 2026-10-28; nothing under `packages/contracts/` changes, so `breaking-changes.json` needs no declaration:

- Section 2, "Hard links" (Q2): the start precondition with reason `hardlinks-unprotected`, before enrollment, an unreadable setting refusing too, and that it is not an admission check.
- Section 3, "Which worker" (Q3): a worker with executions under a separate account is a Linux worker with a launch command; a worker without one composes no workspace, runs no Git gate, and reads no `fs.protected_hardlinks`.
- Section 3, step 7 (Q6): the kill of a program past `RECLAIM_RUN_BOUND_MS`, the proof, and the removal of its empty containment, also after a failure after `go`; the record keeps `reclaimFailed`, the slot stays held, no retry, and the slot is never freed without a successful reclaim.
- Section 3, step 7 (Q9): the reused process group on macOS as an accepted residual risk.
- Section 9 (Q2): the table row `precondition-failed`, `hardlinks-unprotected`.
- The header records the revision.
- Section 3, step 6 (review pass 1, finding 1): the worker owes the capacity declaration of a reclaim in its journal, so that a later reclaim or the next start journals it after a journal failure or a crash. The coordinator accepted it as answer A1 (Niki, 2026-10-28; `design.md`, "Review pass 1 follow-up questions").
- Section 3, step 7 (review pass 1, finding 2): a fault that interrupts the kill, proof, or removal still fails with `reclaim-failed`, and a later `reclaim` finishes the cleanup without the program, killing through the recorded cgroup's `cgroup.kill` on Linux and only proving a recorded process group on macOS, which it never signals. The coordinator accepted it as answer A2 (Niki, 2026-10-28), which also asks for the explicit macOS no-signal rule; the sentence states it.
- `docs/contracts/execution-wire-contracts.md` section 5, the row "Capacity declared" (review pass 2, finding 1): the worker declares again after a reclaim that removes a hand-off record, also unchanged, as `docs/contracts/git-workspace.md` section 3, step 6, and worker-runtime "Capacity declaration" already say; the header names the sub-change.
- Section 3, step 7 (review pass 2, finding 2): the proof by polling, never by killing, applies to a record without a failure; a record with `reclaimFailed` is cleaned up as the cleanup of a failed program says.
- Section 3, step 7 (review pass 2, finding 4, keeping the answer to Q6): a fault of the durable write of the failure still kills, proves, and removes the containment, and `reclaim` fails with that write's `unavailable`; the record then names the containment without the failure, so a later `reclaim` proves it empty and runs the program once more, as after a crash at `WS8.after`, and the slot stays held until a reclaim succeeds. That holds only for a fault before the rename into place (review pass 3, finding 3, below).
- Section 3, step 7 (review pass 3, findings 1 and 3, unreviewed): a write fault that a file system call throws is handled the same way, and a later `reclaim` follows the record that it reads: after a fault before the rename it runs the program once more; after a fault of the directory flush that follows the rename the record keeps the failure, and it finishes the cleanup without starting the program.
- The header records the pass 2 and pass 3 fixes.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `3cac536f345d2d68c2df22cac60d4fe9dee4432d`; tests 3575, pass 3528, fail 0, skipped 47; all files 99.37% lines, 92.78% branches, 98.76% functions.
- `npm run openspec -- validate wire-git-workspace-into-worker --strict`: passed, `Change 'wire-git-workspace-into-worker' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 82 file(s); every pass summary file is valid: 62 file(s); every route file is valid: 18 file(s).`.
- Spec diff against the merge base `166673998210` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a18418-c2ef-7430-8b47-0d49b8341c30` | 0 | 1 | 3 | 1 |
| 2 | B | `claude claude-opus-5-5#medium` | `b1712a46-c45e-4d1a-bc1a-c52f61a40928` | 0 | 0 | 4 | 3 |
| 3 | A | `codex gpt-6.1-sol#medium` | `01a18459-5a52-7251-8d82-c4ac209370dd` | 0 | 0 | 2 | 1 |
<!-- make record: end -->

## Independent review

### Pass 1

- Reviewer A: Codex CLI, model `gpt-6-astra`, reasoning effort `medium`, sandbox read-only, session `01a18418-c2ef-7430-8b47-0d49b8341c30`, on `efbb79ca`. The worktree snapshot before and after the review was `2a125441e153858d4bc24e06577bf71a750edb198a8cb87fb442b9c9b20dc979`, equal.
- Invocation (from `make review`): `codex exec -m gpt-6-astra -c model_reasoning_effort="medium" -s read-only -C /home/petar/taskelith-worktrees/wire-git-workspace-into-worker -`, environment `PATH HOME USER LANG TERM`, started 2026-10-28T19:59:37.500Z. Model confirmation: `model: gpt-6-astra`, `effort: medium`, `sandbox: read-only`, as reported by the Codex log header and printed by `make review`. The brief names pass 1 reviewer A `codex gpt-6-astra#medium`; `make review` printed "route: recommends effort high; the authorized medium applies (policy version 8)", since `route.json` recommends `codex gpt-6-astra#high`.
- Result: Critical 0, High 1, Medium 3, Low 1, matching the pass 1 line of `passes.jsonl`; all five fixed and recorded in `findings.jsonl`. The reviewer also noted that `make record-check` could not pass in its environment (no local verify stamp); that is a property of the reviewer's sandbox, not a finding.
  1. High, error-handling (`apps/worker/src/workspace-slots.ts`): the held attempt left the set before the capacity was declared again, so a journal failure or a crash lost the declaration. Fixed in `f40abcec`: the journal port's `oweCapacityDeclaration` clears the last declared capacity before the reclaim of a held attempt, and `recordCapacity` after every successful reclaim and at every start journals the owed declaration (`design.md` decision 7).
  2. Medium, error-handling (`packages/adapters/git-workspace/src/git-workspaces.ts`): after a durable `reclaimFailed`, a fault of the kill, the proof, or the release became `unavailable`, so no `worker.workspace.reclaim-failed` line, and no later reclaim finished the cleanup. Fixed in `3acc3dc1`: every outcome after the durable failure is `reclaim-failed`, and a later reclaim cleans up through `ReclaimHost.killRecorded` without the program (decision 9).
  3. Medium, redaction (`workspace-slots.ts`, `worker-start.ts`, `workspace-composition.ts`): the three start failures repeated the raw error message. Fixed in `824ccab2`: `faultMessage` gives a fixed message and only a code matching `E[A-Z0-9]+` (decision 14).
  4. Medium, missing-fail-before-test (`handOffRecords`): no direct adapter test. Fixed in `291f9822` with three adapter tests.
  5. Low, spec-wording (worker-runtime "Reclaim after the exit"): fixed in `00a1e2b0`; the scenario holds every slot of the worker, as the architect's answer N2 requires.
- Fail-before, with the new tests on the source of `efbb79ca` (`apps/worker/src`, `packages/adapters/git-workspace/src`, `packages/adapters/worker-journal/src`, `packages/modules/execution/src` stashed, `npm run build`, then restored and rebuilt; log `16e-failbefore.out` in the session scratchpad):

| Test | How it failed before the fix |
| --- | --- |
| `worker-start.test.ts` "a capacity declaration that a reclaim owes is journaled by the next start after a crash" | Last declaration `1`, expected `2` |
| `workspace-slots.test.ts` "a capacity declaration that a reclaim owes outlives a journal failure until a later reclaim" | `TypeError: this[#options].redeclareCapacity is not a function`; with the test's journal passed as the old option `redeclareCapacity`, `[declarations, owed]` was `[0, true]`, expected `[1, false]`: the second reclaim returned success without a declaration |
| `worker-journal.test.ts` "an owed capacity declaration is journaled once, also when unchanged and after a restart" | `TypeError: journal.oweCapacityDeclaration is not a function` |
| `worker-start.test.ts` "the entry reports a workspace start failure with its fault code and never the path of the fault" | The written line held the private path (`fs.protected_hardlinks cannot be read (EACCES)`: `true`, expected `false`) |
| `workspace-slots.test.ts` "hand-off records that cannot be read fail the opening with the fault code and without its path" | Message `the hand-off records cannot be read: EIO: i/o error, open '/var/lib/taskelith/worker/workspaces/attempt-1-abc/checkout/notes.txt'`, expected `the hand-off records cannot be read (EIO)` |
| `hand-off.test.ts` "a fault at kill / populated / release after a failed program still fails as reclaim-failed, and a later reclaim cleans up" (3 tests) | Reason `undefined` (code `unavailable`), expected `reclaim-failed`, each |
| Worker image, `linux-git-workspace.privileged.ts` "a later reclaim kills and removes the cgroup of a failed program whose kill was interrupted" (only `packages/adapters/git-workspace/src` of `efbb79ca`, `make verify-linux-git-workspace PATTERN='kill was interrupted'`, log `16e-linux-failbefore.log`) | Reason `undefined`, expected `reclaim-failed`; tests 1, fail 1 |
| `hand-off.test.ts` "the hand-off records are read from disk, also by a restarted adapter", "a malformed or unreadable hand-off record rejects the read of the records", "a hand-off record removed between the listing and its read is left out" | They test code that `efbb79ca` already had, so they passed there; with `git-workspaces.ts` of `f68d4f76`, before `handOffRecords`, all three failed with `handOffRecords is not a function`; mutants of `efbb79ca`: keeping a vanished record failed the vanished test (`record: undefined` listed), returning no record on a malformed one failed the malformed test (`Missing expected rejection`), and returning an empty list failed the read and vanished tests |

- After the fixes: `npm run build`, then `node --experimental-strip-types --test` of `packages/adapters/git-workspace/test/*.test.ts`, `apps/worker/test/*.test.ts`, and `packages/adapters/worker-journal/test/*.test.ts` gave tests 654, pass 652, fail 0, skipped 2 (the privileged ones); `npm run check:boundaries` and `npm run verify:comments` passed; `npm run openspec -- validate wire-git-workspace-into-worker --strict` valid, the longest requirement body 468 characters ("Reclaim program containment" and "Capacity declaration"); `make findings ARGS="validate"` valid. `make verify` and `make verify-linux-git-workspace` are under "Checks".
- The fixes change code and contracts, and pass 1 found a High finding, so pass 2 by reviewer B is required.

### Pass 2

- Reviewer B: Claude Code, model `claude-opus-5-5`, effort `medium`, permission mode `plan` with `Edit`, `Write`, and `NotebookEdit` disallowed, session `b1712a46-c45e-4d1a-bc1a-c52f61a40928`, on `d318d297`. The worktree snapshot before and after the review was `d6b801991b88aaa7c523bfa26658d844ce7a672402f83c8f76f58ee101565e97`, equal.
- Invocation (from `make review`): `claude -p --model claude-opus-5-5 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format stream-json --verbose -- <prompt>`, environment `PATH HOME USER LANG TERM`, started 2026-10-28T20:35:34.937Z. Model confirmation: `model: claude-opus-5-5 (reported)`, from the stream's own report, printed by `make review`. `route.json` recommends pass 2 reviewer B `claude claude-opus-5-5#xhigh`; `make review` printed "route: recommends effort xhigh; the authorized medium applies (policy version 8)", and the brief names `claude claude-opus-5-5#medium`.
- Result: Critical 0, High 0, Medium 4, Low 3, matching the pass 2 line of `passes.jsonl`; all seven fixed and recorded in `findings.jsonl`. The reviewer reported one denied write of a note outside the worktree, which changed no file of the review.
  1. Medium, contract-drift (`docs/contracts/execution-wire-contracts.md`, the row "Capacity declared"): the row did not name the declaration after a reclaim. Fixed in `d26690b6` ("Contract amendments").
  2. Medium, contract-drift (`docs/contracts/git-workspace.md` section 3, step 7, and git-workspace-port "Reclaim program containment"): the proof without a kill also covered a record with `reclaimFailed`, whose later reclaim kills the cgroup on Linux. Fixed in `d26690b6`: both apply it only to a record without a failure and send the other to "Killed reclaim containment".
  3. Medium, missing-fail-before-test (`reclaim-host.ts`, `killUnreapedGroup`): no test checked the guard that spares an exited program's group. Fixed in `45b308d8`: `ProcessGroupReclaimHost` takes an injected `SendSignal`, with tests below.
  4. Medium, error-handling (`git-workspaces.ts`, `#failedProgram`): a fault of the durable `reclaimFailed` write skipped the kill. Fixed in `c764fd2a`, keeping the answer to Q6: the containment is still killed, proven empty, and freed, the write's `unavailable` is returned, and the slot stays held until a reclaim succeeds; the contract and the spec state that outcome in `d26690b6` (new scenario "Failure record not written").
  5. Low, spec-wording (git-workspace-port "Interrupted cleanup" and "Killed reclaim containment"): fixed in `d26690b6`; the scenario kills only a Linux cgroup and on one account only proves the group empty without a signal, and the requirement again keeps a containment populated at the proof's bound.
  6. Low, evidence-mismatch (this record, "Author self-check"): the longest requirement before the fixes was given as current. Fixed in `aeaf36b8`.
  7. Low, stale-citation (this record, "Revision"): `004144e1`, not `00a1e2b0`, holds the git-workspace-port delta of pass 1 finding 2. Fixed in `aeaf36b8`.
- Answers A1 and A2 (Niki, 2026-10-28) are recorded in `design.md`. A2 asks for the macOS no-signal rule in the contract and in a test: contract section 3, step 7, states it, and the two tests "a one-account host never signals a recorded process group, also one still running" and "on one account a later reclaim of a failed program signals no recorded process group" check it.
- Fail-before, with the new tests on the fixed tree and one source change at a time, rebuilt with `npx tsc -b packages/adapters/git-workspace`, then restored (log `16e-pass2-failbefore.out` in the session scratchpad; the two `reclaim-program.test.ts` mutants ran again after `ff78b57d` with the same failures):

| Test | How it failed before the fix |
| --- | --- |
| `hand-off.test.ts` "a failure record that cannot be written still kills the overrunning program, and a later reclaim runs it again" | With `#failedProgram` of `d318d297`: `AssertionError: the program is killed and proven gone` (`populated` was `true`) |
| `reclaim-program.test.ts` "a one-account kill signals the group of an unreaped program, never that of an exited one" | Mutant without the guard `exitCode !== null \|\| signalCode !== null`: `the group of an exited program is not signalled`, 2 signals where 1 was expected |
| `hand-off.test.ts` "on one account a later reclaim of a failed program signals no recorded process group" | The same mutant: `no process group is signalled`, one `SIGKILL` to the exited group; a mutant whose `killRecorded` sends `SIGKILL` to the recorded group: the same assertion, one `SIGKILL` |
| `reclaim-program.test.ts` "a one-account host never signals a recorded process group, also one still running" | The `killRecorded` mutant: `the recorded group is not signalled`, one `SIGKILL` |

  The behavior of the last three already held on `d318d297`, so their fail-before is the mutants; `d318d297` had no injected signal call to observe it.
- After the fixes: `node --experimental-strip-types --test packages/adapters/git-workspace/test/*.test.ts` gave tests 224, pass 224, fail 0; `npm run verify:comments` passed; `npm run openspec -- validate wire-git-workspace-into-worker --strict` valid, the longest requirement body 489 characters ("Reclaim program containment"; "Killed reclaim containment" 482), and an archive of the change in a scratch copy of `openspec/` validated every spec strictly (71 passed); `make findings ARGS="validate"` valid. `make verify` and `make verify-linux-git-workspace` are under "Checks".
- The pass 2 fixes change code and pass 2 found Medium findings, so pass 3 by reviewer A is required.

### Pass 3

- Reviewer A: Codex CLI, model `gpt-6.1-sol`, reasoning effort `medium`, sandbox read-only, session `01a18459-5a52-7251-8d82-c4ac209370dd`, on `4531fcf7`. The worktree snapshot before and after the review was `05a4a27cc2bd982d9f36e66f84f5f971c03dfbe2037e2f6dd4fea5b514571d6d`, equal.
- Invocation (from `make review`): `codex exec -m gpt-6.1-sol -c model_reasoning_effort="medium" -s read-only -C /home/petar/taskelith-worktrees/wire-git-workspace-into-worker -`, environment `PATH HOME USER LANG TERM`, started 2026-10-28T21:10:10.563Z. Model confirmation: `model: gpt-6.1-sol (reported)`, `effort: medium (reported)`, `sandbox: read-only (reported)`, printed by `make review`. `route.json` recommends pass 3 reviewer A `codex gpt-6.1-sol#high`; `make review` printed "route: recommends effort high; the authorized medium applies (policy version 8)", and the brief names `codex gpt-6.1-sol#medium`.
- Result: Critical 0, High 0, Medium 2, Low 1, matching the pass 3 line of `passes.jsonl`. The reviewer confirmed the pass 2 fixes of findings 1 to 3 and 5 to 7 and found the fix of pass 2 finding 4 partial (finding 1 below). Pass 3 is the last pass (governance "At most three passes per task"), so all three fixes are unreviewed: `findings.jsonl` records each as `fixed-unreviewed`.
  1. Medium, error-handling (`packages/adapters/git-workspace/src/git-workspaces.ts:368`, `#failedProgram`): `replaceFileAsync` throws a fault of its `rename`, such as `EIO`, so the reclaim rejected before `#cleanedUp`, and an overrunning program kept running. Fixed, unreviewed, in `08a9347d`: the write runs through `failingFileSystemAsUnavailable`, which turns a Node system error into `unavailable` and still rejects a simulated crash or a programming error, so the kill, the proof, and the release run; `design.md` decision 9 states it in `23caaad6`. No `missedBy`: pass 2 reported the fault of this write as its finding 4, whose fix was partial.
  2. Medium, concurrency-race (`apps/worker/src/workspace-slots.ts:63`, `reclaim`): concurrent reclaims of two workspaces shared the one owed declaration, so the first one's declaration cleared the second one's debt, also when the worker died after the second removal. Fixed, unreviewed, in `51daebe7` (code and tests) and `7845c3da` (`design.md` decision 7): `WorkspaceSlots` chains its reclaims, so each owes, reclaims, updates the held set, and declares before the next starts. `missedBy` pass 2, role B: the owed declaration came with the pass 1 fixes (`f40abcec`).
  3. Low, spec-wording (git-workspace-port scenario "Failure record not written", `docs/contracts/git-workspace.md:69`, `design.md` decision 9, and the pass 2 bullet of "Contract amendments"): a fault after the rename into place, a failed flush of the directory, leaves `reclaimFailed` in the record, so a later reclaim does not run the program. Fixed, unreviewed, in `23caaad6`: the texts separate a fault before the rename from one after it, the later reclaim follows the record that it reads, and the new scenario "Failure record not flushed" and a test cover the second case.
- Fail-before, with the new tests on the source of `4531fcf7` (`packages/adapters/git-workspace/src` and `apps/worker/src` checked out from it, `npm run build`, then restored and rebuilt; log `16e-pass3-failbefore.out` in the session scratchpad):

| Test | How it failed before the fix |
| --- | --- |
| `hand-off.test.ts` "a failure record whose rename throws still kills, proves empty, and frees the overrunning program" | `AssertionError: the program is killed and proven gone` (`populated` was `true`) |
| `workspace-slots.test.ts` "two concurrent reclaims of different workspaces each declare the capacity" | `[held, declarations, owed]` was `[[], 1, false]`, expected `[[], 2, false]` |
| `workspace-slots.test.ts` "a worker killed after the second of two concurrent removals still owes its declaration" | `[declarations, owed]` was `[1, false]`, expected `[1, true]` |
| `hand-off.test.ts` "a failure record renamed into place before its directory flush fails keeps the failure, so no reclaim runs the program again" | It guards behavior that `4531fcf7` already had, so it passed there; the fix of finding 3 corrects the texts. A mutant whose `#reclaim` ignores a recorded `reclaimFailed` failed it: `the program never runs again`, 2 launches where 1 was expected |

- After the fixes: `node --experimental-strip-types --test` of `packages/adapters/git-workspace/test/*.test.ts` and `apps/worker/test/*.test.ts` gave tests 551, pass 551, fail 0; `make findings ARGS="validate"` valid; `npm run openspec -- validate wire-git-workspace-into-worker --strict` valid, requirement bodies unchanged, the longest 489 characters ("Reclaim program containment"; "Killed reclaim containment" 482); an archive of the change in a scratch copy of `openspec/` validated every spec strictly (71 passed). `make verify` and `make verify-linux-git-workspace` are under "Checks".
- Architect check (Niki, coordinator as solution architect, 2026-10-28): passed for 08a9347d, 51daebe7 and 7845c3da, and 23caaad6; the docs commit 23caaad6 carrying one test is accepted.

## Return and reconciliation

The coordinator (Niki) returned the archived branch (archive commit `fde11070`): the full `make verify` of `make integrate` on the iMac (macOS, `/bin/bash` 3.2.57), merging `origin/dev` `8b18c540`, failed two tests of `test/worker-entrypoint.test.ts`, "a launching worker holds the execution group as its supplementary group" and "a data root that root already owns keeps its owners". Cause: `infra/installation/worker-entrypoint.sh` expanded the empty array `"${groups[@]}"` under `set -u`, which bash 3.2 rejects (`groups[@]: unbound variable`, exit status 1) and bash 5 accepts. Nothing was merged; `dev` stayed at `8b18c540`. Under worker step 10:

1. `666525ea` reverted the archive commit `fde11070`, which restored the active change and the living specs.
2. The base is `git merge-base fde11070 origin/dev`, `16667399`. The merge `64c681c6` of `origin/dev` `8b18c540` had no conflict, and no hook reported the dependency inventory stale.
3. `git diff 16667399 8b18c540 -- openspec/specs` changes only `agent-task-protocol` and `integration-flow`, no file of `worker-runtime` or `git-workspace-port`, so the deltas needed no reconciliation and are unchanged.
4. `81875115` `chore: keep empty option lists valid under set -u in bash 3.2`, unreviewed, pending the coordinator's architect check: the entrypoint's `setpriv` takes `${groups[@]+"${groups[@]}"}`, as the architect decided. A search of `infra/` and `scripts/` for `[@]}` found one more empty-array expansion under `set -u` in a script that host tests run: `scripts/installation.sh` `enrollment_token` expanded an empty `"${options[@]}"` when no platform, architecture, or hostname is set, now guarded the same way. The other expansions are of arrays that are never empty (`compose_files`, the `options` of `scripts/linux-crash-windows.sh`) or are guarded by a count (`built`, `running`, `platforms`).
5. Fail-before, in the image `bash:3.2` (`GNU bash, version 3.2.57(1)-release`) with fakes for `id`, `stat`, `mount`, `chown`, and `setpriv` (script `repro-entrypoint.sh` in the session scratchpad): the entrypoint of `64c681c6` without a launch command printed `line 47: groups[@]: unbound variable` and exited 1; after the fix it ran `setpriv` without `--groups`, and with a launch command and group `10003` with `--groups 10003`. `installation.sh enrollment-token` with a fake `docker` and no option set printed `line 281: options[@]: unbound variable` and exited 1 before the fix, and ran `issue-enrollment-token` without options after it. No host test runs on bash 3.2 here; the iMac run above is the test-level fail-before.

No reviewer pass ran on the return: the coordinator checks the unreviewed fix as solution architect before the archive.

## Limitations

- A whole worker started through the worker image's entrypoint was not run: the entrypoint's group is tested with its fakes, the umask and the hard-link reader through the injected `WorkspaceHost`, and the real `/proc/sys/fs/protected_hardlinks` read is untested; the slot service's real hand-off and reclaim are tested only through the adapter's own suites.
- A crash between the hand-off record's removal and the capacity declaration is simulated by a fake workspace that throws after removing the record; the real adapter's crash points are not combined with the worker's journal.
- The intake's `handedOff` wiring in `worker-start.ts` is exercised through `CommandIntake` directly; the start test's broker has no consumer.
- The delegated-child scenario moved to worker-runtime "Slot held by a handed-off workspace" is item 38's test.
- Residual risk (Q9): on macOS a recorded process group identifier can be reused by an unrelated group after the program's group ended; the proof then reads it as populated, which only delays the reclaim to the proof's bound and reports the workspace, and never releases one early. The kill after the run bound signals a group only while Node has not reaped its leader, so it never kills a reused group; since review pass 2 a test with an injected signal call checks it.
- Until item 21, a failed reclaim is visible only as the log line `worker.workspace.reclaim-failed` and the held slot (Q5; `design.md`, "Obligations and residual risks").

## Remaining gates

- The suite natively on macOS against the Git adapter with Apple's `/usr/bin/git` 2.50.1 on the iMac (contract section 13, pending gate), including the macOS composition's kill of a process group, arranged by the coordinator.
- `make verify-worker-image-reproducible`, arranged by the coordinator.
- Item 18: calling `RunningWorker.workspaceSlots` around each execution; item 21: the `reclaim-failed` observation; item 38: the delegated-child half of "One handed-off workspace".
- The architect check of the unreviewed return fix `81875115`, then the archive again.
- Integration into dev by the coordinator (single pull request).
