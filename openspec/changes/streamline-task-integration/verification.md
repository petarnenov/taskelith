# Verification: streamline-task-integration

## Scope and source

On 2026-10-26 the owner asked to streamline task integration; coordinator Niki relayed the request the same day. Scope: (A) the `pre-push` hook skips `make verify` for a push whose every ref is a deletion, with tests; (B) the worker archives its change in the last commit of its branch, so that the coordinator integrates each task with one pull request and no archive pull request, with the re-archive rule for spec conflicts and the rule for the integration gate in the archived record. Excluded: the coordinator's private integration scripts outside the repository, which the coordinator adapts, and product code.

## Revision and environment

- Base: `origin/dev` at `075352c`. Branch `streamline-task-integration`. Commits: `f14b5f5` (hook, scripts, tests), `290f849` (protocol and policy documents), `f10cf83` (this change), `348c123` (first record), reviewed in pass 1. The fixes of pass 1 are `f9b682f` (scripts and tests), `0e8b089` (documents), and the commit that adds this record's pass 1 section, the change's design, deltas, and `rearchive-demo.sh`. The coordinator merged `origin/dev` at `867d808` (PR #306, `run-g2-native-acceptance-arm64`) into the branch as `b192984`, the revision of review pass 2. The fixes of pass 2 are `164ac23` (script comment), `a607916` (documents), `ee9d5ee` (design, delta, `rearchive-demo.sh`), and the commit that adds this record's pass 2 section. The coordinator then merged `origin/dev` at `26ff102`, which only archives `run-g2-native-acceptance-arm64` and so changes the living specs `deterministic-test-harness` and `native-worker-acceptance`, into the branch as `d1e0990`, the revision of review pass 3. The unreviewed fix of pass 3 is the commit that adds this record's pass 3 section.
- Host: macOS 26.6.2 (Darwin 25.6.0), x86_64 (2020 Intel iMac); Docker engine 29.5.2; Node.js 24.22.1 from `.nvmrc`. Other worktrees ran `make verify` on the same host at the same time.

## Author self-check and evidence check

- Clean Code: the delete-only decision is one pure function, `isDeleteOnlyPush`, beside `unverifiedPushRefs`, which now share the line parsing (`pushedRefs`). The exit status that carries the decision to the hook is a named constant, `DELETE_ONLY_PUSH_STATUS`, which the hook names in its comment.
- The hook keeps the `sh` style of `.githooks/post-merge`; every comment is within two lines of 80 characters (`npm run verify:comments`).
- Makefile-driven operation: both new tests run in `npm test`, so in `make test` and `make verify`. The scripts are outside the coverage scope (`dist/**`), like the other hook helpers; their behavior is covered by the tests.
- A delete-only push skips the committed-inventory and pushed-commit checks too, because both only protect `make verify`; the `dependency-inventory` delta says so.
- Nothing assumes an active change at integration: `npm run verify:archive` passes with no active change (its requirement and test cover `openspec/changes/` holding only `archive/`), `validate --all --strict` covers the active changes and the living specs, not the archive (with this branch's change active it lists 69 items, one of them `change/streamline-task-integration`), and no script, hook, or CI workflow (`.github/workflows/release.yml` runs only `make verify`) reads an active change. A change whose evidence is written under `openspec/changes/<change>/` must write it before the archive, which moves it.
- Archived task completeness: `npm run openspec -- validate --archived --no-interactive` checks that archived changes have every task done. On `348c123` it reported 147 passed and 12 failed (159 items) and exited 1; the 12 failures are older archived changes with open tasks, for example `2026-10-26-retry-unrecorded-process-on-full-disk` (5/7). An item name does not narrow it, so worker step 7 reads only the change's own line.
- Spec requirement lengths: 449, 445, 416, 269, and 377 characters (`agent-task-protocol`), 333 (`dependency-inventory`), 307 and 406 (`integration-flow`).
- Evidence freshness after the merge `b192984`: `867d808` brought `Makefile` targets, `scripts/native-acceptance.*`, `scripts/installation*.sh`, `packages/testing/src/scenario-results.ts`, tests, and the active change `run-g2-native-acceptance-arm64`. None of this change's files is among them and the merge had no conflict, but it changes verification inputs (the `Makefile` and the test suite), so `make verify` was rerun on `ee9d5ee` (below); the results of `f10cf83` and `409de66` cover only the pre-merge tree. On `ee9d5ee`, `verify:archive` archived both active changes in a temporary copy.
- Evidence freshness after the merge `d1e0990`: `26ff102` moves `run-g2-native-acceptance-arm64` into the archive and applies its deltas to two living specs this change does not touch; it changes no code, test, script, or `Makefile`. The OpenSpec checks were rerun on `d1e0990` (below); `make verify` of `ee9d5ee` covers the code, tests, and the OpenSpec state of that tree, not the merged specs. `streamline-task-integration` is now the only active change.
- Evidence check: the change adds no external link or external fact; its source is the owner's request above.

## Checks

| Check | Result |
| --- | --- |
| `node --experimental-strip-types --test test/pre-push-checks.test.ts test/pre-push-hook.test.ts test/inventory-merge.test.ts` on `f14b5f5` | 9 tests passed |
| `npm run openspec -- validate streamline-task-integration --strict` on `f10cf83` | valid |
| `npm run verify:comments` on `f10cf83` | passed |
| `make verify` on `f10cf83`, first run, before the merge `b192984` | Failed in an unrelated test, `apps/control-plane/test/control-plane-api.integration.test.ts:417` ("the control plane did not answer"), while other worktrees ran `make verify` on the host; 1877 tests, 1874 passed, 1 failed, 2 skipped |
| `make verify` on `f10cf83`, second run, before the merge `b192984` | Passed (exit 0): 1877 tests, 1875 passed, 0 failed, 2 skipped (the Linux-only scan tests), the new pre-push tests among them; coverage of all files 99.28% lines, 92.05% branches, 99.03% functions; contract compatibility 0 breaking changes; OpenSpec 69 passed; `verify:archive` and `verify:package` passed |
| `make verify` on `409de66`, after the fixes of review pass 1, before the merge `b192984`; it does not cover the merged state | Passed (exit 0): 1879 tests, 1877 passed, 0 failed, 2 skipped (the Linux-only scan tests), the new malformed-input and failing-verify tests among them; coverage of all files 99.28% lines, 92.05% branches, 99.03% functions; contract compatibility 0 breaking changes; OpenSpec 69 passed; `verify:archive` and `verify:package` passed |
| `make verify` on `ee9d5ee`: the merge `b192984` of `origin/dev` `867d808` plus the pass 2 fixes; it covers that tree only, before the merge `d1e0990` | Passed (exit 0), first run: 1910 tests, 1908 passed, 0 failed, 2 skipped (the Linux-only scan tests); coverage of all files 99.28% lines, 92.05% branches, 99.04% functions; no undeclared contract breaking change; OpenSpec 70 passed; `verify:archive` (both active changes) and `verify:package` passed |
| `bash openspec/changes/streamline-task-integration/rearchive-demo.sh "$PWD/node_modules/.bin/openspec"` on `ee9d5ee` | exit 0; output as in "Re-archive demonstration" |
| `npm run openspec -- validate --all --strict` on `d1e0990` | 70 passed, 0 failed (70 items): the living specs and the one active change |
| `npm run verify:archive` on `d1e0990` | passed: "Every active OpenSpec change archives into strictly valid specs." (one active change) |

## Re-archive demonstration

`openspec/changes/streamline-task-integration/rearchive-demo.sh`, run on 2026-10-26 as `bash openspec/changes/streamline-task-integration/rearchive-demo.sh "$PWD/node_modules/.bin/openspec"` with the pinned OpenSpec 1.14.3, builds a scratch repository whose living spec `demo` holds the requirement "The system SHALL log each run." with the scenario `Demo`. A task branch archives a `MODIFIED` delta "log each run with its duration"; `dev` meanwhile archives "log each run and its exit status"; both keep the scenario name. Output:

1. Merging `dev` into the archived task branch conflicts in `openspec/specs/demo/spec.md`.
2. After `git revert --no-commit` of the archive commit and `git merge dev`, the living rule is `dev`'s, "log each run and its exit status".
3. Naive re-archive of the restored delta: the living rule becomes "log each run with its duration"; `git diff dev -- openspec/specs` removes `dev`'s "and its exit status". `dev`'s edit is lost without any conflict or validation error.
4. Reconciled re-archive, with the delta rewritten from `dev`'s current text: the living rule is "log each run with its duration and its exit status"; the diff against `dev` adds only the task's "with its duration"; `validate --all --strict` passes.

After review pass 2 the script runs this as its first case, "Conflicting merge", and adds a second case, "Clean merge", run on 2026-10-26 with the same command after `ee9d5ee`: the task archives "log each run with its duration", and `dev` archives an edit of the same requirement's scenario, `THEN` "it works" to "it records the run". Output:

1. `git merge --no-commit --no-ff dev` into the archived task branch is clean; the merged living rule holds both edits. Committed for the check only, `git diff "$(git merge-base HEAD dev)" dev -- openspec/specs` is empty, while `git diff "$(git merge-base <archive commit> dev)" dev -- openspec/specs` shows `dev`'s `THEN` edit. The script then resets to the archive commit, as `git merge --abort` leaves an uncommitted merge.
2. After the revert of the archive commit and `git merge dev`, the living rule is the old rule with `dev`'s `THEN` "it records the run", and the diff from the merge base of the archive commit and `dev` shows that edit.
3. Naive re-archive: the living rule is "log each run with its duration" with `THEN` "it works"; the diff against `dev` reverts `dev`'s `THEN` edit, without a conflict or a validation error.
4. Reconciled re-archive, with the delta's scenario taken from `dev`: the living rule keeps `THEN` "it records the run"; the diff against `dev` holds only the task's "with its duration"; `validate --all --strict` passes.

## Independent review

Reviewer: Codex CLI (gpt-6-astra): model `gpt-6-astra`, `model_reasoning_effort = "medium"`, sandbox `read-only`. Invocation:

```sh
codex exec -m gpt-6-astra -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>
```

### Pass 1

Session `01a179d7-cb4c-7e73-b6ba-2b421acce5eb`, revision `348c123f324c5cb3e1519aad0de5d7cb61bcf2dd`. Model confirmation: the output header names model `gpt-6-astra`, reasoning effort `medium`, and sandbox `read-only`. The SHA-256 snapshot of the worktree before and after the review was equal: `0d7ec0940605b9dc2fc435a910d1d4435404e936a0d32753b28569caf41eca80`. Findings: Critical 0, High 1, Medium 2, Low 4.

- High: re-archive could silently lose `dev`'s changes (`docs/agent-task-protocol.md:27`, `design.md:11`, delta `agent-task-protocol/spec.md:32`). The pinned OpenSpec replaces a whole `MODIFIED` block, so a restored, stale delta re-archived onto `dev`'s newer specs overwrites `dev`'s edits to the same requirement without a conflict. Resolution: after the revert and the merge, the worker reconciles every restored delta with `dev`'s current requirement text and keeps those edits; worker step 7 checks that the spec diff against the merge base holds only the change's intended edits; the assigned reviewer reviews the reconciliation and the spec diff. The rule is in protocol step 10, design decision 6, and the delta "Return and re-archive"; the demonstration above shows the naive loss and the reconciled result.
- Medium: step 6 required a complete record before step 7, whose own checks then could not be recorded (protocol `:20`, `design.md:12`, delta `:39`). Resolution: step 7 runs the checks on the archived working tree and writes their results into the moved `verification.md` in the archive commit itself, so the checked state is that commit's tree; the merge pull request records the integration checks; the coordinator still does not edit the archived record. Protocol steps 6 and 7, governance, design decision 7, and the delta "Integration gate in the archived record" say so.
- Medium: a return for an ordinary conflict let the worker commit after the archive commit (protocol `:24`). Resolution: one rule for every return, worded identically in the protocol, the skill, governance, the design, and the delta: "On any return, the worker restores the active change by reverting its archive commit, merges `dev`, reconciles each restored delta with `dev`'s current requirement text, keeping others' edits, has the assigned reviewer review the resolved diff and the reconciliation, records it, and archives again as the last commit." The separate spec-conflict step is folded into it.
- Low: malformed hook input was accepted as delete-only (`scripts/pre-push-checks.ts:27`). Resolution: every line needs exactly four fields and SHA-1 or SHA-256 hex object names, the local one all zeros; any other line refuses the bypass. A unit test covers missing and extra fields, invalid object names, and extra whitespace.
- Low: the hook tests did not show that a failing `make verify` blocks the push (`test/pre-push-hook.test.ts:82`). Resolution: the fake `make` exits with a status the test sets, and a test checks that normal, mixed, and empty input are blocked when it fails.
- Low: `AGENTS.md:31`, `docs/releases.md:8`, and the `integration-flow` requirement "Parallel development in worktrees" still required `make verify` before every push. Resolution: all three name the delete-only exception; the delta modifies that requirement (307 characters).
- Low: this record said that `validate --all --strict` checks the archive. Resolution: the self-check states its scope (active changes and living specs) and records `validate --archived` with its real result; worker step 7 reads the change's own line of it.

All seven fixes are checked by pass 2.

### Pass 2

Session `01a179ea-40fa-7062-ac61-ac9da5c564c1`, revision `b192984211304dbdad709d7bcf150b861c3e7919`, the same invocation as pass 1. Model confirmation: the output header names model `gpt-6-astra`, reasoning effort `medium`, and sandbox `read-only`. The SHA-256 snapshot of the worktree before and after the review was equal: `fab58fef3de49d9fc7edb361ca1503433860f3d1c9cfa0dd1e2aa19f50575a76`. Findings: Critical 0, High 0, Medium 2, Low 2.

Confirmation of pass 1:

| Pass 1 finding | Pass 2 status |
| --- | --- |
| High: re-archive could lose `dev`'s edits | Partly resolved: reconciliation and the spec diff check are required, but the base was wrong after a committed clean merge (Medium 1 below) |
| Medium: step 7's checks could not be recorded | Resolved |
| Medium: an ordinary conflict broke "archive is the last commit" | Resolved |
| Low: malformed input accepted as delete-only | Resolved for the reported cases |
| Low: no proof that a failing `make verify` blocks the push | Resolved |
| Low: general rules required verify for deletions | Resolved |
| Low: the scope of `validate --all --strict` was overstated | Resolved |

Findings:

- Medium: after a clean coordinator merge that invalidates the evidence, the returned branch could already carry that merge; `git merge-base HEAD origin/dev` is then `dev` itself and the reconciliation diff is empty (protocol `:45` with `:30-32`, `design.md:11-12`). Resolution: the coordinator merges with `git merge --no-commit --no-ff origin/dev`, commits only when it will integrate, and runs `git merge --abort` on any return, so a returned branch never carries a coordinator merge; worker step 10.2 takes the base as `git merge-base <archive commit> origin/dev`, which stays right even after a committed merge. The protocol, the skill, governance, design decisions 5 and 6, and the new requirement "Uncommitted coordinator merge" say so; the demonstration's clean-merge case shows that the procedure catches and keeps `dev`'s edit.
- Medium: no `make verify` was recorded on the merged branch (`verification.md:32`). Resolution: `make verify` ran on `ee9d5ee`, which contains the merge `b192984` and the pass 2 fixes; the earlier results are labelled as pre-merge.
- Low: the exception "a branch without an archive commit only needs step 7" was only in the protocol. Resolution: the return rule now reads, identically in the protocol, the skill, governance, the design, and the proposal: "On any return of a branch that carries its archive commit, the worker restores the active change by reverting that commit, merges `dev`, reconciles each restored delta with `dev`'s current requirement text, keeping others' edits, has the assigned reviewer review the resolved diff and the reconciliation, records it, and archives again as the last commit; a branch without an archive commit only needs step 7." The delta's requirement says the same with SHALL and adds the scenario "Branch without an archive commit".
- Low: the comment in `scripts/pre-push-checks.ts:31` and `design.md:7` promised verify for every invalid input, although the standard checks may refuse it first. Resolution: both now say "Invalid input never gets the delete-only bypass; the standard checks may refuse it before verify."

These fixes are checked by pass 3, the last allowed pass.

### Pass 3

Session `01a179f7-b1bd-74b2-ac95-1dea7a53e4fd`, revision `d1e0990c07165f649512f4be0298ca9d79fcdb05`, the same invocation as pass 1. Model confirmation: the output header names model `gpt-6-astra`, reasoning effort `medium`, and sandbox `read-only`. The SHA-256 snapshot of the worktree before and after the review was equal: `4c78c46755d82eb47251143c31cc8c12c3bbc73717d4fae886ea3b0399471fce`. Findings: Critical 0, High 0, Medium 0, Low 1.

Confirmation of pass 2:

| Pass 2 finding | Pass 3 status |
| --- | --- |
| Medium: wrong reconciliation base after a clean coordinator merge | Resolved: uncommitted merge and abort on return; the base comes from the archive commit |
| Medium: no `make verify` on the merged branch | Resolved for `b192984` and the fixes, by the run on `ee9d5ee`; the later merge needs the Low below |
| Low: the no-archive-commit exception only in the protocol | Resolved |
| Low: the invalid-input wording | Resolved |

Finding:

- Low: this record said that only itself and `tasks.md` changed after `ee9d5ee`, but `d1e0990` merges `26ff102`, which archives `run-g2-native-acceptance-arm64` and changes the living specs; the OpenSpec state described for the merged branch was stale, with one active change left. Resolution, an unreviewed fix of a record only, no runtime change: the merge is in the revision history and under evidence freshness, the `ee9d5ee` result is limited to the tree it checked, and `validate --all --strict` and `verify:archive` are recorded on `d1e0990`.

Under the review process, a Low-only pass is fixed without another review: no further pass follows.

## Limitations

- The hook test runs the real hook with a fake `make`, not a real `git push`; git's hook input format is reproduced from the existing tests.
- The re-archive flow is demonstrated on a scratch repository, for a conflicting and a clean merge, not exercised on a real returned task.

## Remaining gates

- Archive of this change on its branch (worker step 7).
- Integration into dev by the coordinator (single pull request).
