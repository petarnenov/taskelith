## Why

On 2026-10-26 the owner asked, relayed by the coordinator, to streamline task integration. Two steps cost time without adding a check: deleting a merged remote branch runs the full `make verify` in the `pre-push` hook, and every task needs a second pull request, opened by the coordinator, only to archive its change.

## What Changes

- The `pre-push` hook lets a push through without `make verify` when every pushed ref is a deletion, and says why. A mixed push, a normal push, and a push whose hook input holds no ref run `make verify` as before. The decision is a tested function in `scripts/pre-push-checks.ts`; `scripts/check-pre-push.ts` reports it to the hook through a named exit status.
- The worker archives its change in the last commit of its branch, after review and verification, so that the coordinator integrates the task with one pull request and opens no archive pull request.
- One rule for every returned task: On any return, the worker restores the active change by reverting its archive commit, merges `dev`, reconciles each restored delta with `dev`'s current requirement text, keeping others' edits, has the assigned reviewer review the resolved diff and the reconciliation, records it, and archives again as the last commit. The protocol also says how `verification.md` records the checks of the archived tree and the integration gate that is still open when the change is archived.
- `docs/agent-task-protocol.md`, `.claude/skills/taskelith-task-protocol/SKILL.md`, `AGENTS.md`, `docs/governance.md` (the lifecycle table), and `docs/releases.md` (the branch flow and the deletion pitfall) describe the new flow.

## Capabilities

### New Capabilities

### Modified Capabilities

- `integration-flow`: the local gate before push and the worktree requirement exempt a delete-only push from `make verify`.
- `dependency-inventory`: the committed-inventory check applies to a push that runs `make verify`.
- `agent-task-protocol`: the worker archives on its branch; the coordinator integrates with one pull request; return and re-archive with reconciled deltas; the integration gate in the archived record.

## Impact

Repository tooling, tests, and documentation only; the published `taskelith` package and product behavior are unchanged. The coordinator's private integration scripts outside the repository are not changed here; the coordinator adapts them.
