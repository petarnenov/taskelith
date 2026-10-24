## Why

On 2026-10-24 the owner made a code coverage of at least 75% a first-class principle and chose to record it and enforce it in `make verify` for lines, branches, and functions over all product files.

## What Changes

- Add principle 9 to ADR 0004 and update the principle lists in the architecture, README, AGENTS.md, and the release documentation.
- Run the tests with Node's built-in coverage and thresholds of 75% for lines, branches, and functions, writing an lcov report to the ignored `coverage/` directory.
- Add `scripts/check-coverage-scope.ts`, with tests, which fails when a product module under `src/` is missing from the coverage report.
- Refresh the dependency inventory, whose root manifest hash changed with `package.json`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `engineering-principles`: nine principles, and an added coverage threshold requirement.

## Impact

`make verify` and CI fail below the thresholds. No runtime or package content change, and no new dependency.
