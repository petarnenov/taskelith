## Why

The `share-test-helpers-remaining` change left the `@taskelith/sdlc` tests with their own `value` helpers, because `@taskelith/testing` had a development dependency and a tsconfig reference on `@taskelith/sdlc`, so the reverse dependency would have formed a project-reference cycle. The dependency existed only for `import type { Clock }` in one harness test.

## What Changes

- Remove the development dependency and the tsconfig reference of `@taskelith/testing` on `@taskelith/sdlc`.
- Move the test that checks the simulated wall clock against the SDLC module's `Clock` port from `packages/testing/test/simulated-host.test.ts` to `packages/modules/sdlc/test/clock.test.ts`, so that it keeps checking the real port type.
- Make the boundary check reject a workspace dependency of the harness other than the kernel, in any dependency field of its manifest; the workspace contract already makes its tsconfig references equal those dependencies.
- Replace the local `value` helpers of the `@taskelith/sdlc` tests with the harness's, and add the harness as a development dependency of `@taskelith/sdlc`.

## Capabilities

### New Capabilities

### Modified Capabilities

- `deterministic-test-harness`: the requirement "Shared result helpers" requires the harness to depend on no workspace package but the kernel, so that every package's tests can use the helpers, and the boundary check enforces it.

## Impact

Test code, the private test harness's manifest, the boundary check script, and the dependency inventory only. No product behavior changes.
