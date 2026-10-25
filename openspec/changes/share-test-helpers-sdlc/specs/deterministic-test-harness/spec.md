## MODIFIED Requirements

### Requirement: Shared result helpers
The harness SHALL provide `value`, which returns the value of a successful result and fails the test with the failure as JSON otherwise, `failed`, which returns the error of a failed result and fails the test otherwise, and `id`, which parses an identifier through `parseIdentifier` and `value`. The harness SHALL depend on no workspace package but the kernel, so that the tests of every package share these helpers.

#### Scenario: Successful result
- **WHEN** a test passes a successful result to `value`
- **THEN** `value` returns the result's value

#### Scenario: Failed result
- **WHEN** a test passes a failed result to `value`, or text that the kernel rejects to `id`
- **THEN** the call throws an assertion error that contains the failure

#### Scenario: Expected failure
- **WHEN** a test passes a failed result to `failed`
- **THEN** `failed` returns the result's error, and for a successful result it throws an assertion error

#### Scenario: Tests of a module the harness serves
- **WHEN** the tests of `@taskelith/sdlc` use `value`
- **THEN** they import it from `@taskelith/testing`, whose manifest and tsconfig name no workspace package but the kernel
