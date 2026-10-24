## Why

The archived change `enforce-comment-length` modified the `engineering-principles` requirements "Comment length bound", "Comment length scope", and "Comment length check": the bound now covers every comment in scope, fixture copies of captures are exempt, and `make verify` enforces it. The comment rule in `AGENTS.md` and worker step 3 of `docs/agent-task-protocol.md` still limit it to comments a diff adds or edits and do not name the fixture exemption or the check. On 2026-10-25 the owner chose a separate small docs change to align both texts with the specification.

## What Changes

- Reword the scope and exemption sentences of the comment rule in `AGENTS.md` to match the requirement "Comment length scope", and name the check of the requirement "Comment length check".
- Reword the comment sentence of worker step 3 in `docs/agent-task-protocol.md` the same way.
- Keep the bound itself, its counting rules, and the attribution "(owner rule, 2026-10-24)" unchanged.

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

Documentation only. No requirement changes.
