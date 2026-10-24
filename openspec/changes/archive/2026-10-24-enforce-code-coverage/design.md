## Context

`make verify` runs `npm test`, the single definition of the checks (ADR 0004). Node 24's test runner reports coverage and enforces line, branch, and function thresholds, but it counts only modules that tests load; it has no option to include unloaded files.

## Goals / Non-Goals

Enforce the owner's 75% thresholds without a new dependency, and make sure no product module escapes measurement. Do not change product code or raise coverage targets beyond the owner's rule.

## Decisions

- Use Node's built-in flags in the `test` script: `--experimental-test-coverage`, `--test-coverage-include` for `dist/**/*.js` only, and `--test-coverage-lines`, `--test-coverage-branches`, and `--test-coverage-functions` at 75. Product code is measured through its compiled `dist/` output, which the tests exercise. Node applies the thresholds to the aggregate totals, so repository scripts stay outside the measured set; otherwise well-tested scripts could keep the totals above 75% while product coverage falls below it.
- Write an lcov report to `coverage/lcov.info` next to the console report, create the directory first, and ignore it in git; it is outside the npm `files` allowlist.
- Add a scope check that compares the lcov report's source files with every `src/**/*.ts` module (excluding declaration files) and fails on any missing module, because the built-in coverage cannot report unloaded files.
- Keep the thresholds inside `npm test`, so `make verify` stays the single definition.

## Risks / Trade-offs

Repository scripts are not measured by the thresholds; their tests still run. The scope check covers product modules only. The coverage flags are experimental in Node 24 and may change with the Node pin.
