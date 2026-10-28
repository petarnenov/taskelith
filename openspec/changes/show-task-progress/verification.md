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
- `make verify` on the clean tree of `6670b70f` passed, profile full (log `/private/tmp/claude-503/-Users-petarnenov-taskelith/9e6d2b58-9924-418b-9480-54a98f608053/scratchpad/verify-progress2.log`). An earlier run on `8cbf2f17` was stopped before it finished, to take the owner's requirement.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `a6194ae97ac73bc86244f64898833ac9072aa0cb`; tests 3535, pass 3526, fail 0, skipped 9; all files 99.43% lines, 92.67% branches, 98.92% functions.
- `npm run openspec -- validate show-task-progress --strict`: passed, `Change 'show-task-progress' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 82 file(s); every pass summary file is valid: 62 file(s); every route file is valid: 18 file(s).`.
- Spec diff against the merge base `166673998210` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Limitations

- The status line script, `/Users/petarnenov/geowealth/be/.ai/scripts/statusline-context.py`, is outside this repository and not reviewed with it.

## Remaining gates

- Independent review passes, assigned by the coordinator.
- Archive of the change.
- Integration into dev by the coordinator (single pull request).
