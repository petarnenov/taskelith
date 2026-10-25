## ADDED Requirements

### Requirement: Shared result helpers
The harness SHALL provide `value`, which returns the value of a successful result and fails the test with the failure as JSON otherwise, and `id`, which parses an identifier through the kernel's `parseIdentifier` and `value`, so that tests share these helpers instead of defining their own copies.

#### Scenario: Successful result
- **WHEN** a test passes a successful result to `value`
- **THEN** `value` returns the result's value

#### Scenario: Failed result
- **WHEN** a test passes a failed result to `value`, or text that the kernel rejects to `id`
- **THEN** the call throws an assertion error that contains the failure
