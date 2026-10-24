## Why

On 2026-10-24 the owner set a rule for code comments and marked it important: a comment is at most two lines of at most 80 characters each. ADR 0004 principle 1 already limits comments to rationale and contracts; the rule bounds their length.

## What Changes

- Add the rule to `AGENTS.md`, which every harness reads, for every comment a change adds or edits; longer existing comments are shortened when touched.
- Name the rule in worker step 3 of `docs/agent-task-protocol.md`.
- Add a requirement to the `engineering-principles` capability.

## Capabilities

### New Capabilities

### Modified Capabilities
- `engineering-principles`: adds a bound on code comment length.

## Impact

Documentation only. No existing comment changes in this change: about 60 existing comments in about 20 files exceed the bound, several in modules that open branches are changing, so shortening them is left to the changes that touch them or to a separate cleanup. No automated check is added.
