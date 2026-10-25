## Why

`docs/releases.md` lists only `docs:`, `test:`, and `chore:` as commit types that publish no release, and the `automated-releases` specification says the same. `build:` is used throughout `dev` (G2 items 9 and 10 relied on it as a no-release type), and `ci:` is used once; the agent task protocol already names `build` among the types for private workspace work. The table and the specification should state what the release configuration does with them.

## What Changes

- Add `build:` and `ci:` to the no-release row of the commit table in `docs/releases.md`.
- Modify the `automated-releases` requirement "Automatic semantic versions" so its non-release scenario names build and ci commits.
- Add `test:`, `build:`, and `ci:` messages to the release classification cases in `test/release.test.ts`, which run the analyzer with `release.config.js` on the table's rows.

## Capabilities

### New Capabilities

### Modified Capabilities
- `automated-releases`: the non-release scenario names build and ci commits.

## Impact

Documentation, specification, and test cases only; the release configuration is unchanged.
