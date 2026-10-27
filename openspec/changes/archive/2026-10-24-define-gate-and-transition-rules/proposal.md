## Why

G1 item 5 in the [G1 work plan](/docs/g1-plan.md). Its exit evidence requires domain tests that reject invalid transitions and keep structural validation and semantic approval distinct. Architecture section 6 normalizes gate states (pending, passed, failed, stale, blocked), separates automated structural validation from semantic approval, requires compare-and-set transitions, and invalidates decisions when the artifacts they judged change; invariants 11 and 12 forbid admission or completion on a prompt instruction, file existence, a checkbox, or an agent exit, and forbid carrying approvals across changed artifacts. Task admission (item 7) builds on these rules.

## What Changes

- Add a gate state machine to `@taskelith/sdlc`: the states pending, passed, failed, stale, and blocked, an explicit frozen transition table, and rejection of every transition outside it.
- Add three distinct evidence types, structural validation, semantic approval, and platform-managed records, each with its own source identity and verdicts; a gate requires one kind and accepts no other, and evidence decides a gate only when it cites exactly the gate's subject revisions.
- Add invalidation: a different revision of an artifact in a gate's subject outdates the gate, which can then be marked stale and later reopened for the new revision.
- Add stage progress over the item-4 workflow graph: stages are not started, in progress, or completed; a stage starts (or starts again for rework) only when every stage it depends on has gates that have all passed, and completes only when its own gates have all passed.
- Gates and stage progress carry a generation; every transition names the generation its writer read and is rejected with `conflict` when it is outdated.
- All values are frozen, all outcomes are kernel `Result` values, and time is passed in as kernel `Instant` arguments.

Excluded: the `SdlcFramework` port and any other port (item 6); task admission, admission invalidation, and application services (item 7); reviewer independence from the implementation attempt and attempt or assignment state machines (G2, decision D4 (a)); code-head identities; event and wire contracts (item 13); persistence and any I/O.

## Capabilities

### New Capabilities
- `sdlc-gates`: gate states and transitions, evidence kinds, invalidation by artifact revision, and stage transitions with compare-and-set generations.

### Modified Capabilities
None.

## Impact

New domain files and tests in `packages/modules/sdlc`; the native-reference parser now shares its display-text check with the two new free-text values, with unchanged behavior. No dependency is added, the lockfile is unchanged, and the published npm package is unchanged.
