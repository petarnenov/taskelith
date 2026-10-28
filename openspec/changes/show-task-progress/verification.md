# Verification

Date: 2026-10-28. The author's verification and `make verify` are recorded below; the review passes follow.

## Scope and source

The coordinator's brief of 2026-10-28 (Niki) for the change `show-task-progress`, size S-M, commit type `chore`, from the owner's decision of 2026-10-28: a dynamic progress bar per worker task, from the brief to the landing, derived from records the protocol already creates, with no new worker step. Scope items 1 to 7 of the brief, with the owner's follow-up requirement of the same day that the bars stack one task per line in `make progress` and the status line, as [design.md](design.md) D1 to D6 implement them. Out of scope: worker steps, review rules, and `scripts/integrate.sh`.

- **Base revision:** `16667399` (`origin/dev`, merge of pull request #405).
- **Checklist:** saved with the brief's invocation, `--at 1666739982106ec3e9663978b4f86cdd2fb72f1f --size S-M`.

## Environment

macOS (Darwin 25.6.0), Node.js from `.nvmrc` through nvm; Zaki's host `hpz600` reached over SSH.

## Implementation and route

- `c205b488`: the scripts, tests, `Makefile`, protocol section, and this change's records with `checklist.json`.
- `8cbf2f17` committed `route.json` unedited. The coordinator then relayed the owner's requirement that the bars stack one task per line; `a7da6d8d` implements it in `make progress` and its tests. Because that changed the diff, the first `route.json` was deleted and `6670b70f` commits a new unedited one from `make findings ARGS="route --change show-task-progress"`: tier `elevated` (trigger `lines`), rule version 2, recommending `codex gpt-6-astra#high` for pass 1. The brief's reviewers and efforts stand (governance "Routed effort").

## Author self-check

- **Scope.** No worker step, review rule, or `scripts/integrate.sh` changes. The hosts file, cache, and lock live in `~/.config/taskelith/`, never in the repository. No command prints environment values; no token is read.
- **Tests.** `test/task-progress.test.ts` builds fixture repositories with fixed commit times and checks every stage 1 to 11, the Low-only stop, the SSH fallback against a real shell, the remote script path and its failures, an unreachable host, an invalid hosts file, the atomic cache and its age, the lock, and the stacked rows: 21 of 21 pass. Scripts sit outside the coverage scope of `npm test`, which measures `dist/**`.
- **Real run.** `make progress` on the iMac showed the local worktrees and Zaki's `wire-git-workspace-into-worker` over SSH through the fallback reader, since Zaki's clone has no `scripts/task-progress.ts` yet.
- **Status line.** Backed up to `/private/tmp/claude-503/-Users-petarnenov-taskelith/9e6d2b58-9924-418b-9480-54a98f608053/scratchpad/statusline-context.py.pre-progress.bak`, then tested with a sample status line input: one stacked row per task under the context line in about 40 ms, "stale" at a 200 s old cache, a detached refresh that rewrote the cache within seconds and released the lock, and no segment outside a `taskelith` directory.
- New comments are at most two lines of at most 80 characters; commit types are `chore` and `docs`, without attribution.

## Checks

- `node --experimental-strip-types --test test/task-progress.test.ts`: 21 of 21 passed.
- `npm run openspec -- validate show-task-progress --strict`: `Change 'show-task-progress' is valid`.
- `make verify` on the clean tree of `6670b70f` passed, profile full (log `/private/tmp/claude-503/-Users-petarnenov-taskelith/9e6d2b58-9924-418b-9480-54a98f608053/scratchpad/verify-progress2.log`). An earlier run on `8cbf2f17` was stopped before it finished, to take the owner's requirement. After the pass 1 fixes, `make verify` on the clean tree of `b3d19168` passed, profile full (log `/private/tmp/claude-503/-Users-petarnenov-taskelith/9e6d2b58-9924-418b-9480-54a98f608053/scratchpad/verify-progress3.log`); the generated checks below record that run.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `ef2a230a903c78b9b55364033acdca557d4458ea`; tests 3545, pass 3536, fail 0, skipped 9; all files 99.43% lines, 92.66% branches, 98.92% functions.
- `npm run openspec -- validate show-task-progress --strict`: passed, `Change 'show-task-progress' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 82 file(s); every pass summary file is valid: 62 file(s); every route file is valid: 18 file(s).`.
- Spec diff against the merge base `166673998210` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a1842b-9887-7de0-ad44-779dc8e6a1d5` | 0 | 0 | 7 | 1 |
<!-- make record: end -->

## Review

### Pass 1

Reviewer A: Codex CLI, `codex gpt-6-astra#medium`, the brief's reviewer of pass 1, on `8e1cad1f`, run by the coordinator with `make review`, session `01a1842b-9887-7de0-ad44-779dc8e6a1d5`; the worktree snapshot was unchanged by the pass. Counts: Critical 0, High 0, Medium 7, Low 1, recorded in `passes.jsonl` and `findings.jsonl`. The pass has Medium findings, so pass 2 follows under governance "Review sequence" and reviews these fixes; until then they are `fixed-unreviewed`.

1. **Medium, error-handling.** `scripts/task-progress-hosts.ts:119` accepted any JSON array from an SSH host. Fixed in `df6a2f60`: `isTaskProgress` checks every field and the stage range; an invalid answer is an error of that host only.
2. **Medium, error-handling.** `scripts/task-progress-hosts.ts:146`: transport failures after the root lookup became missing data. Fixed in `df6a2f60`: the SSH reader throws `TransportError` on exit 255, and the host is reported unreachable.
3. **Medium, error-handling** (the reviewer's "correctness", which `categories.txt` lacks). `scripts/task-progress-stages.ts:140`: another active change won over the branch's archived change. Fixed in `df6a2f60`: exact matches first, another change only when it is the worktree's only one.
4. **Medium, concurrency-race.** `scripts/task-progress.ts:145`: the lock was stolen by age and removed unconditionally. Fixed in `df6a2f60`: `scripts/task-progress-lock.ts`, an owner-checked lock (pid and token, hard-linked whole, moved aside and checked before removal), taken over only from a dead process or, unreadable, after 300 s; a test runs eight concurrent processes.
5. **Medium, error-handling.** `scripts/task-progress.ts:133`: an incomplete cache counted as fresh and a future one blocked refreshes. Fixed in `df6a2f60`: `readCache` validates the shape, and an invalid cache or one more than 60 s ahead is due; the status line follows.
6. **Medium, error-handling.** `scripts/task-progress-stages.ts:181`: a `null` pass line crashed, `{}` counted as Low-only. Fixed in `df6a2f60`: only records with four counts count; other lines are named on the task's row.
7. **Medium, contract-drift.** The spec delta lacked one row per task and the background refresh. Fixed in `df6a2f60`: requirements "Stacked task progress rows" and "Progress cache refresh" with scenarios.
8. **Low, test-flakiness.** `test/task-progress.test.ts:291` depended on the host's time zone. Fixed in `df6a2f60`: `TZ=UTC` and the exact time.

Fail-before: the new and changed tests run against the scripts of `8e1cad1f` (log `/private/tmp/claude-503/-Users-petarnenov-taskelith/9e6d2b58-9924-418b-9480-54a98f608053/scratchpad/progress-fail-before.log`): 27 tests, 8 failed, among them findings 1 to 6's tests, and `test/task-progress-lock.test.ts` failed to load on the missing module. Finding 4's refresh test shows the old age-based steal: a refresh at a later clock wrote the cache over a live lock. With `df6a2f60` the two files pass 31 of 31.

## Limitations

- The status line script, `/Users/petarnenov/geowealth/be/.ai/scripts/statusline-context.py`, is outside this repository and not reviewed with it.

## Remaining gates

- Review pass 2 of the fixes of pass 1, and pass 3 if pass 2 has a Medium or worse finding.
- Archive of the change.
- Integration into dev by the coordinator (single pull request).
