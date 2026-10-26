## Why

On 2026-10-26 the owner asked, relayed by the coordinator, to streamline task integration. Two steps cost time without adding a check: deleting a merged remote branch runs the full `make verify` in the `pre-push` hook, and every task needs a second pull request, opened by the coordinator, only to archive its change.

## What Changes

- The `pre-push` hook lets a push through without `make verify` when every pushed ref is a deletion, and says why. A mixed push, a normal push, and a push whose hook input holds no ref run `make verify` as before. The decision is a tested function in `scripts/pre-push-checks.ts`; `scripts/check-pre-push.ts` reports it to the hook through a named exit status.
- The worker archives its change in the last commit of its branch, after review and verification, so that the coordinator integrates the task with one pull request and opens no archive pull request.
- The protocol says how a branch whose merge of `dev` conflicts in the living specs or the archive is returned and archived again, and how `verification.md` records the integration gate that is still open when the change is archived.
- `docs/agent-task-protocol.md`, `.claude/skills/taskelith-task-protocol/SKILL.md`, `AGENTS.md`, `docs/governance.md` (the lifecycle table), and `docs/releases.md` (the deletion pitfall) describe the new flow.

## Capabilities

### New Capabilities

### Modified Capabilities

- `integration-flow`: the local gate before push skips `make verify` for a delete-only push.
- `dependency-inventory`: the committed-inventory check applies to a push that runs `make verify`.
- `agent-task-protocol`: the worker archives on its branch; the coordinator integrates with one pull request; re-archive after a spec conflict; the integration gate in the archived record.

## Impact

Repository tooling, tests, and documentation only; the published `taskelith` package and product behavior are unchanged. The coordinator's private integration scripts outside the repository are not changed here; the coordinator adapts them.
