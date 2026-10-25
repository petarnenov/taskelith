## Why

`docs/releases.md` lists only `docs:`, `test:`, and `chore:` as commit types that publish no release, and the `automated-releases` specification says the same. `build:` is used throughout `dev` (G2 items 9 and 10 relied on it as a no-release type), and `ci:` is used once; the agent task protocol already names `build` among the types for private workspace work. The table and the specification should state what the release configuration does with them.

## What Changes

- Add `build:` and `ci:` to the no-release row of the commit table in `docs/releases.md`.
- Modify the `automated-releases` requirement "Automatic semantic versions" so its non-release scenario names build and ci commits.

## Capabilities

### New Capabilities

### Modified Capabilities
- `automated-releases`: the non-release scenario names build and ci commits.

## Impact

Documentation and specification only; the release configuration is unchanged.
