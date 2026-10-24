## Why

Three times an archive failed strict validation after merge although `openspec validate <change> --strict` had passed: two changes created capabilities without a `## Purpose`, so the archive wrote a placeholder, and one requirement grew past 500 characters once applied to the main spec. The worker cannot see these failures before handoff, so the coordinator fixes them while archiving.

## What Changes

- New check `npm run verify:archive` (`scripts/check-archive-dry-run.ts`): it copies `openspec/` to a temporary directory, archives every active change there with the pinned OpenSpec CLI, validates the copy with `validate --all --strict`, and fails with the change name and the validator's message. No active change passes; nothing in the repository changes.
- `make verify` runs the check after the strict validation of the OpenSpec artifacts.
- The coordinator's Purpose fix in the archive step of `docs/agent-task-protocol.md` is removed, because the check now fails such a change before handoff.

## Capabilities

### New Capabilities

### Modified Capabilities
- `integration-flow`: `make verify` runs the archive dry run, which the new requirement defines.

## Impact

`scripts/check-archive-dry-run.ts`, `test/check-archive-dry-run.test.ts`, `package.json` with its provenance hash in `docs/dependencies/licenses.json`, `Makefile`, and `docs/agent-task-protocol.md`. No new dependency.
