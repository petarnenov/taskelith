## Why

Every change that touches dependencies or `package.json` regenerates `docs/dependencies/licenses.json` and `docs/dependencies/sbom.cdx.json`, so parallel branches conflict in these generated files. This has happened three times, and each time a branch went back to its worker for a hand resolution. The owner approved making these conflicts resolve themselves.

## What Changes

- `.gitattributes` routes both generated inventory files to a `dependency-inventory` merge driver that keeps the current branch's version; `make hooks` and `make setup` configure it, and `make doctor` checks it.
- A `post-merge` hook compares the merged inputs with the provenance hashes in `licenses.json`, without npm, and reports a stale inventory with the remedy.
- The `pre-push` hook refuses a push while the inventory files or their inputs have uncommitted changes, or one that updates a ref to a commit other than the checked-out one, because `make verify` checks the working tree.
- `npm run verify:dependencies` (part of `make verify`) runs the same comparison first and fails with a message that names the changed inputs and `make dependency-inventory`.
- A new `make dependency-inventory` target reinstalls the locked dependencies and regenerates both files under the pinned toolchain.
- The agent task protocol (worker step 1, coordinator step 2), the release flow, the inventory guide, and the README describe the flow.

## Capabilities

### New Capabilities

### Modified Capabilities

- `dependency-inventory`: adds the inventory merge requirement.
- `development-environment`: `make doctor` checks, and `make setup` configures, the merge driver.
- `integration-flow`: the pre-push gate refuses pushed commits other than the checked-out one.

## Impact

Repository tooling and documentation only; the published package does not change.
