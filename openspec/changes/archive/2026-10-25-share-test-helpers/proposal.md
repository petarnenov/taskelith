## Why

Pass 3 of the `implement-resource-admission` review (finding 12) reported that the `value`, `must`, and `id` test helpers are repeated across test files, and left a shared helper in `@taskelith/testing` as a follow-up. Repeated helpers drift: the copies already differ in their failure messages.

## What Changes

- Add `value` and `id` to `@taskelith/testing`: `value` returns the value of a result that a test expects to succeed and fails the test otherwise; `id` parses an identifier through `value`.
- Replace the local copies in the tests of `@taskelith/postgres` and `@taskelith/scheduling`, the packages the finding names, with imports from `@taskelith/testing`, and add the harness as a development dependency of `@taskelith/scheduling`.

## Capabilities

### New Capabilities

### Modified Capabilities

- `deterministic-test-harness`: adds the requirement "Shared result helpers". The existing requirement "Test-only harness package" already allows tests to import the harness and limits it to the kernel and Node built-ins, which the helpers use.

## Impact

Test code and the private test harness only. No product behavior changes; a failing helper now reports the whole failure as JSON in every moved call site.
