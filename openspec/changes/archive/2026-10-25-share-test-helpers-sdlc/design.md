## Context

`packages/testing/test/simulated-host.test.ts` imported the type `Clock` from `@taskelith/sdlc` to check the "Simulated host clocks" requirement that the wall clock matches the SDLC module's `Clock` port. The kernel has no `Clock` type. The workspace contract makes tsconfig references equal workspace dependencies, so the harness's dependency on `@taskelith/sdlc` blocked the reverse one.

## Goals / Non-Goals

Remove the harness's dependency on `@taskelith/sdlc` and use the shared helpers in its tests, without changing what any test checks. Out of scope: the `code` helpers, the local `instant` helpers (`value(parseInstant(text))` under another name, left as in `@taskelith/scheduling`), the inline `assert.ok(result.ok)` checks, and other refactors.

## Decisions

- The `Clock` port test moves to the `@taskelith/sdlc` tests instead of declaring a structural type in the harness test. A structural copy of `Clock` would only check the harness against itself; in `@taskelith/sdlc` the test still checks the real port, which the "Simulated host clocks" requirement names.
- The `@taskelith/sdlc` tests define no local `id` or `failed`, so only `value` is replaced.
- `scripts/check-boundaries.ts` checks the harness manifest's dependency fields (rule R03), because the import rules allow type-only imports that a manifest dependency could still back. Checking the manifest also covers tsconfig, which the workspace contract keeps equal to it.

## Risks / Trade-offs

A later harness dependency on a module would bring the cycle back; the boundary check now rejects it.
