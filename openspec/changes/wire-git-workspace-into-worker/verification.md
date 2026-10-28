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
| `make verify` | `3a6784fe` | Failed at `npm run verify:comments` (one comment of 3 lines), fixed in `624112b7` |
| `make verify` | `38d39dda`, after the pass 1 fixes, tree `1fb8f298` (log `16e-verify-2.log` in the session scratchpad) | Passed, profile full, stamp written: tests 3567, suites 46, pass 3520, fail 0, cancelled 0, skipped 47; all files 99.37 % lines, 92.77 % branches, 98.76 % functions. `make record` of this run is under "Generated checks" |
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
- Section 3, step 6 (review pass 1, finding 1): the worker owes the capacity declaration of a reclaim in its journal, so that a later reclaim or the next start journals it after a journal failure or a crash. No architect answer names this sentence (`design.md`, "Open Questions").
- Section 3, step 7 (review pass 1, finding 2): a fault that interrupts the kill, proof, or removal still fails with `reclaim-failed`, and a later `reclaim` finishes the cleanup without the program, killing through the recorded cgroup's `cgroup.kill` on Linux and only proving a recorded process group on macOS. No architect answer names this sentence either.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `1fb8f298a2af5c8b1b27b89e4e1f241a68eba040`; tests 3567, pass 3520, fail 0, skipped 47; all files 99.37% lines, 92.77% branches, 98.76% functions.
- `npm run openspec -- validate wire-git-workspace-into-worker --strict`: passed, `Change 'wire-git-workspace-into-worker' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 82 file(s); every pass summary file is valid: 62 file(s); every route file is valid: 18 file(s).`.
- Spec diff against the merge base `166673998210` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a18418-c2ef-7430-8b47-0d49b8341c30` | 0 | 1 | 3 | 1 |
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

## Limitations

- A whole worker started through the worker image's entrypoint was not run: the entrypoint's group is tested with its fakes, the umask and the hard-link reader through the injected `WorkspaceHost`, and the real `/proc/sys/fs/protected_hardlinks` read is untested; the slot service's real hand-off and reclaim are tested only through the adapter's own suites.
- A crash between the hand-off record's removal and the capacity declaration is simulated by a fake workspace that throws after removing the record; the real adapter's crash points are not combined with the worker's journal.
- The intake's `handedOff` wiring in `worker-start.ts` is exercised through `CommandIntake` directly; the start test's broker has no consumer.
- The delegated-child scenario moved to worker-runtime "Slot held by a handed-off workspace" is item 38's test.
- Residual risk (Q9): on macOS a recorded process group identifier can be reused by an unrelated group after the program's group ended; the proof then reads it as populated, which only delays the reclaim to the proof's bound and reports the workspace, and never releases one early. The kill after the run bound signals a group only while Node has not reaped its leader, so it never kills a reused group.
- Until item 21, a failed reclaim is visible only as the log line `worker.workspace.reclaim-failed` and the held slot (Q5; `design.md`, "Obligations and residual risks").

## Remaining gates

- Review pass 2 by reviewer B (required: pass 1 found a High finding and its fixes change code), and pass 3 by reviewer A if governance "Conditional third pass" requires it.
- The coordinator's confirmation of the two contract sentences of the pass 1 fixes that no architect answer names ("Contract amendments").
- The suite natively on macOS against the Git adapter with Apple's `/usr/bin/git` 2.50.1 on the iMac (contract section 13, pending gate), including the macOS composition's kill of a process group, arranged by the coordinator.
- `make verify-worker-image-reproducible`, arranged by the coordinator.
- Item 18: calling `RunningWorker.workspaceSlots` around each execution; item 21: the `reclaim-failed` observation; item 38: the delegated-child half of "One handed-off workspace".
- Integration into dev by the coordinator (single pull request).
