## Why

On 2026-10-25 the owner decided to promote `dev` to `main`, after the one release-triggering commit on `dev` is neutralized. `5bdf525 fix: run the boundary check when started through a symlinked path` changes `scripts/check-boundaries.ts`, which is repository tooling outside the published package, so its `fix` type would release a `taskelith` patch with no package change. `AGENTS.md` and `docs/releases.md` reserve `feat` and `fix` for the published package.

## What Changes

- A `git revert` of `5bdf525` that reverts its code and test and keeps the archived change records.
- A `chore` commit that restores the same code and test.
- The net tree change against `dev` is this change's records only.

By `docs/releases.md`, the analyzer drops a revert together with the commit it reverts when the revert names its exact header and full hash, so the pair releases nothing.

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

No code or behavior changes; release classification only.
