## Why

On 2026-10-24 the owner set a rule for code comments and marked it important: a comment is at most two lines of at most 80 characters each. ADR 0004 principle 1 already limits comments to rationale and contracts; the rule bounds their length.

## What Changes

- Add the rule to `AGENTS.md`, which every harness reads, next to the first-class principles: how lines and characters are counted, which files it covers, and which are exempt. It applies to every comment whose lines a change's diff adds or edits.
- Name the rule in worker step 3 of `docs/agent-task-protocol.md`.
- Add two requirements to the `engineering-principles` capability: the bound and its scope.

## Capabilities

### New Capabilities

### Modified Capabilities
- `engineering-principles`: adds a bound on code comment length.

## Impact

Documentation only. No existing comment changes in this change: 65 existing comment lines or blocks in 37 files exceed the bound, several in modules that open branches are changing, so shortening them is left to the changes that touch them or to a separate cleanup. No automated check is added.
