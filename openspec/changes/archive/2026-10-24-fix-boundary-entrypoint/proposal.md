## Why

`scripts/check-boundaries.ts` runs its checks only when `resolve(process.argv[1])` equals `fileURLToPath(import.meta.url)`. Node resolves the module URL to the real path, so when the script is started through a symlinked path, for example a checkout under macOS `/tmp` or `/var/folders`, the comparison is false and the script exits 0 without checking anything. `npm test` and `make verify` then pass with no boundary check. The task was delegated by the coordinating session Niki with owner approval.

## What Changes

- Compare the real path of `process.argv[1]` with the module path, so the CLI runs regardless of symlinks in the invocation path.
- Add a regression test that starts the CLI through a symlinked directory against a violating fixture and asserts that it fails with the violation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `trust-and-operational-foundation`: the boundary checker also runs when started through a symlinked path.

## Impact

Development script and its test only. `scripts/check-coverage-scope.ts` (same fix on the unmerged branch `enforce-code-coverage`) is out of scope. No product runtime behavior, published CLI surface, dependency, or tarball change.
