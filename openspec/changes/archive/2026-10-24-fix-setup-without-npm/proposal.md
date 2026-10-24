## Why

The first review pass of `fix-doctor-node-remedy` found that with the pinned Node.js active but no npm on `PATH`, `make doctor` advises `make setup` for the npm and dependency checks, and setup then runs `npm install --global npm@<pin>`, which fails because it needs npm. Setup cannot install the npm that a Node.js release ships with, so the remedy sends the contributor to a step that cannot work.

## What Changes

- With the pinned Node.js active and no npm, the npm check's remedy names a reinstall of the pinned Node.js, which includes npm, and the dependency check's remedy says to fix the npm check first.
- In that case setup skips the npm install and dependency install steps, still enables the hook when it can, and reports the checks as before.
- The checks still pass and fail on the same facts.

## Capabilities

### New Capabilities

### Modified Capabilities
- `development-environment`: the remedies and setup steps for a pinned Node.js without npm.

## Impact

`scripts/environment-checks.ts`, `scripts/setup.ts`, and `test/environment-checks.test.ts`. No new dependency.
