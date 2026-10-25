## Why

The `share-test-helpers` change moved the `value` and `id` test helpers of `@taskelith/postgres` and `@taskelith/scheduling` into `@taskelith/testing` and left identical copies in other packages as a follow-up. The tests of `@taskelith/execution` and `@taskelith/worker-journal` still define their own `value` and `id`, and the same failure helper twice, as `failureOf` and `failed`.

## What Changes

- Add `failed` to `@taskelith/testing`: it returns the error of a result that a test expects to fail and fails the test otherwise.
- Replace the local `value`, `id`, `failed`, and `failureOf` of the `@taskelith/execution` and `@taskelith/worker-journal` tests with imports from `@taskelith/testing`; `failureOf` call sites use `failed`.
- Add the harness as a development dependency of `@taskelith/execution`.

## Capabilities

### New Capabilities

### Modified Capabilities

- `deterministic-test-harness`: the requirement "Shared result helpers" adds `failed`.

## Impact

Test code and the private test harness only. No product behavior changes. The `@taskelith/sdlc` tests keep their helpers: `@taskelith/testing` depends on `@taskelith/sdlc` for a type in its own test, so the reverse dependency would form a cycle.
