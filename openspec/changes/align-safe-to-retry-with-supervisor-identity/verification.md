# Verification

Date: 2026-10-27. The author's verification, review pass 1 with its unreviewed fixes, and the checks after them are recorded below; the archive checks are pending.

## Scope and source

Follow-up of defect L1 (`stop-automatic-retry-of-unknown-exit`, pull request #332), whose design left as an open question, and whose remaining gates named, this change: capacity reservation contract section 13 and the `resource-admission` requirement "Quotas and budgets" gave an automatic retry its allowance after any `exited` outcome with a proven start, an unknown status included, while supervisor identity contract section 6 keeps an unknown exit uncertain with a retry budget of `0`. The coordinator, Niki, assigned the task; it was developed in a briefed subagent ([subagent execution](../../../docs/agent-task-protocol.md#subagent-execution)) in worktree `taskelith-worktrees/align-safe-to-retry-with-supervisor-identity` on branch `align-safe-to-retry-with-supervisor-identity`.

- **Base revision:** `d3e9e636` (`origin/dev`, merge of pull request #340).
- **Revision verified:** `be44f48e`: the proposal and delta (`017dd403`), the contract (`6de6a5a9`), the fix (`2df41e03`), and the test (`be44f48e`); review pass 1 reviewed `3834e328`, and its fixes (`fdf0bb4d`, `2aa4cfc7`) were checked with the findings record at the revision of the checks after them.
- **Scope:** capacity reservation contract section 13, the `resource-admission` delta, `isSafeToRetry` and `automatic-retry.ts`, and one scheduling unit test file.
- **Out of scope:** whether an earlier attempt's side effects make a retry safe, which section 13 leaves to a later policy item; `automaticRetryOf`'s decisions, which do not change.

## Author self-check

- **Contracts agree.** Capacity reservation contract section 13, bullet "Automatic retries" (`docs/contracts/capacity-reservation.md:242`), now requires a known status (an exit code or a signal) and names an unknown exit as uncertain, citing supervisor identity contract section 6 (`docs/contracts/supervisor-identity.md:74`, the paragraph at `:107`).
- **Code agrees.** `isSafeToRetry` (`packages/modules/scheduling/src/application/capacity-operations.ts:269`) calls `isCertainEnd` (`packages/modules/scheduling/src/domain/automatic-retry.ts:15`). The one exhaustive `ExitStatus` switch is `classifyExit` (`automatic-retry.ts:28`), formerly `isFailedExit`; `isRetryableOutcome` (`:20`) and `isCertainEnd` both use it, and no other copy exists.
- **Behavior kept.** `automaticRetryOf` gives the same answer for every outcome: its predicate is unchanged apart from comparing `classifyExit` with `failed`. A proven exit with code 0 stays certain for the allowance (design D3).
- **Other statements checked**, by `grep` for "safe to retry", "counts as safe", "proven exit", "proven start", "retry budget", and `retry-budget-exhausted` over `docs/`, `openspec/specs/`, and the code, outside `docs/qualification/` and archived changes:
  - Changed: capacity reservation contract section 13 and the `resource-admission` requirement "Quotas and budgets" (`openspec/specs/resource-admission/spec.md:31`), the only two that contradicted section 6.
  - Agree and unchanged: capacity reservation contract section 5 (`docs/contracts/capacity-reservation.md:91`) and the section 11 reason table (`:197`); the operational targets (`docs/operational-targets.md:21`); the `capacity-reservation` requirement "Bounded automatic retry" (`openspec/specs/capacity-reservation/spec.md:98`); the `observation-consumption` requirement "Automatic retry" (`openspec/specs/observation-consumption/spec.md:114`), which already opens no retry after an unknown exit; `docs/contracts/worker-journal.md:192`, which is about safely resending a command, not a retry.
  - Callers: `retryStanding` (`capacity-operations.ts:198`) is the only caller of `isSafeToRetry`; placements name `automaticRetryOf` from `apps/control-plane/src/application/placement-service.ts:274`, after `followAttemptEnd` (`apps/control-plane/src/application/task-ending.ts:10`) opened the retry through `automaticRetryOf`.
- **Requirement length.** The modified requirement is 477 characters at `be44f48e` and 499 after the pass 1 fix (finding 4), within the strict limit of 500 (`MAX_REQUIREMENT_TEXT_LENGTH` of the pinned OpenSpec). `openspec archive` of this change in a scratch copy of `openspec/`, then `openspec validate --specs --strict`: 69 passed, 0 failed, at `be44f48e` and again at `2aa4cfc7`.
- New comments are at most two lines of at most 80 characters; `npm run verify:comments` passes within `make verify`.
- Commit types are `docs`, `chore`, and `test`; only the private `@taskelith/scheduling` package and documents change.

## Evidence check

- **Fails before the fix.** With the new test and the scheduling sources of `d3e9e636` (`git stash push -- packages/modules/scheduling/src`), after `npm run build`, `node --experimental-strip-types --test packages/modules/scheduling/test/automatic-retry-placement.test.ts`: 2 tests, 1 pass, 1 fail; `a retry after a proven exit with an unknown status is uncertain` failed with `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal`, actual `'placed'`, expected `'rejected:retry-budget-exhausted'`. The positive case `a retry after a proven exit with a known status is placed` passed, so the fixture places and only the retry check differs. The sources were restored with `git stash pop` and rebuilt.
- **Passes after the fix.** The same file at `be44f48e`: 2 tests, 2 pass, 0 fail.
- **Links.** The link added to section 13 is relative (`supervisor-identity.md`); the records link only within the repository.
- **Citations.** Every file and line cited above was checked against the files at `be44f48e`.

## Checks

- `npm run openspec -- validate align-safe-to-retry-with-supervisor-identity --strict`: valid.
- `make findings ARGS="checklist --capability resource-admission,capacity-reservation,supervisor-identity --files packages/modules/scheduling/**"`: the most frequent categories are docs, naming, and contract-drift; this record addresses them in the self-check above.
- `make verify` at `be44f48e`: exit 0; 2101 tests, 2054 pass, 0 fail, 47 skipped; coverage lines 99.22%, branches 92.10%, functions 98.86%; `validate --all --strict` 70 passed; package verification passed. The PostgreSQL test `an automatic retry needs a certain, released earlier attempt and stays within two retries` passed in it.

Environment: Linux (`Linux 7.0.0-38-generic`, x86_64), Node from `.nvmrc`, Docker test services started by the make targets, `TMPDIR` set to a directory on disk outside `/tmp` (`~/.cache/taskelith-tmp`) because of the stray `/tmp/.git` directory on this host recorded by `stop-automatic-retry-of-unknown-exit`.

## Independent review

### Review pass 1

- **Reviewer:** A, OpenCode CLI, model `opencode-go/deepseek-v4-pro`, variant `high`, agent `reviewer`, read-only, assigned and run by the coordinator from the worktree, 2026-10-27T10:59:20Z to 11:09:21Z.
- **Invocation:** `opencode run --standalone --agent reviewer -m 'opencode-go/deepseek-v4-pro#high' --format json --title align-safe-to-retry-with-supervisor-identity "$(cat <prompt-file>)" < /dev/null > <log>`, with the prompt and the log kept outside the worktree.
- **Revision:** `3834e328`.
- **Model confirmation:** the stored assistant messages (`session_message`) record provider `opencode-go`, model `deepseek-v4-pro`, variant `high`, agent `reviewer`; session `ses_e82fc49cbffecPIXuIlGP4BFMd`.
- **Snapshot:** `ad592e6b860a4a8e7657152098770b48a9912c39de8e6378b0fcb75c7de1bef1` before and after; unchanged.
- **Confirmed:** every citation of this record, the fail-before evidence, the comment rule, and that no contract drift remains.
- **Findings:** 0 Critical, 0 High, 0 Medium, 4 Low. A Low-only pass, so the review ends and the fixes need no further pass ([review process](../../../docs/governance.md#independent-review-process), "Two alternating reviewers per task" and "Low findings are fixed"); all four are **fixed, unreviewed**, and `findings.jsonl` holds one line for each.
  1. **L1 (naming):** the predicate `endedWithoutUncertainty` had no `is` prefix. **Fixed, unreviewed** (`fdf0bb4d`, `2aa4cfc7`): renamed `isCertainEnd`, in `automatic-retry.ts:15`, its caller `capacity-operations.ts:271`, and the change records.
  2. **L2 (naming):** the function `exitVerdict` was a noun. **Fixed, unreviewed** (`fdf0bb4d`, `2aa4cfc7`): renamed `classifyExit` (`automatic-retry.ts:28`); the type `ExitVerdict` keeps its name.
  3. **L3 (docs):** the predicate comment (`automatic-retry.ts:13`) and the design called an `operator-resolved` outcome uncertain. **Fixed, unreviewed** (`fdf0bb4d`, `2aa4cfc7`): both say it is not certain enough for an automatic retry.
  4. **L4 (spec wording):** the requirement said "a known status" without naming it as section 13 does. **Fixed, unreviewed** (`2aa4cfc7`): "a known status (exit code or signal)", 499 characters (self-check, requirement length).

Passes 2 and 3 were not run: a Low-only pass 1 ends the review, so reviewer B (Claude Code, model `claude-opus-5-5`, effort `high`) was not used.

## Limitations

- The test sets the earlier attempt's `exited` outcome directly on the task instead of recording it through a launch, because no domain path records an exit with a proven start without a full launch; the control-plane path to the same outcome is covered by `an exit with an unknown status after a proven start opens no retry` (`apps/control-plane/test/observation.integration.test.ts:602`).
- No reachable path in this revision places a retry of an unknown exit, so the fix changes no observed behavior today; it closes the contract conflict and guards later callers.

## Remaining gates

- Archive under worker step 7, with its checks recorded here.
- Integration into dev by the coordinator (single pull request).
