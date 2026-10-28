## Why

The owner decided on 2026-10-28 that the coordinator sees a dynamic progress
bar per worker task, from the brief to the landing. The protocol already
creates every record that marks a stage: the checklist, code commits, the
verify stamp, `route.json`, `passes.jsonl`, the archive commit, the
coordinator's integration queue, and the merge into `origin/dev`. No tool
reads them together, so the coordinator asks each worker for its state.

## What Changes

- `scripts/task-progress.ts` with `scripts/task-progress-stages.ts` and
  `scripts/task-progress-hosts.ts` derive the stage, 1 brief to 11 landed,
  of every task worktree on this host and on the SSH hosts of
  `~/.config/taskelith/progress-hosts.json`, a file outside the repository.
  A host whose clone has the script runs it; otherwise plain git and shell
  commands are read over SSH. An unreachable host is reported, never fatal.
- `make progress` prints the detailed view; `make progress-refresh` writes
  it atomically to `~/.config/taskelith/progress.json` with a timestamp,
  with a best-effort lock that de-duplicates refreshes.
- `docs/agent-task-protocol.md` gets a short "Task progress" section.
- Outside the repository, the coordinator's status line shows one bar per
  active task from the cache and starts a detached refresh when the cache
  is older than 60 seconds.
- No worker step, review rule, or `scripts/integrate.sh` changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-task-protocol`: "Task progress view" added.

## Impact

- `scripts/task-progress.ts`, `scripts/task-progress-stages.ts`,
  `scripts/task-progress-hosts.ts`, `scripts/task-progress-lock.ts`,
  `test/task-progress.test.ts`, `test/task-progress-lock.test.ts`, `Makefile`,
  and `docs/agent-task-protocol.md`.
- Out of scope: worker steps, review rules, and `scripts/integrate.sh`.
