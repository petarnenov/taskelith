## Why

G3 item 0 revalidated item 1, the [G3 dependency evaluation](/docs/g3-dependencies.md), and its pass 1 review found five Low findings, all deferred to this change ([revalidation record](/openspec/changes/archive/2026-10-27-revalidate-g3-foundations/verification.md#item-1), "Item 1", pass 1 L1 to L5). Three facts were stale by 2026-10-27, Claude Agent SDK 0.3.311 with a 36th CLI advisory, Mantine 9.7.4, and TanStack Query 5.105.0. The Vitest row omits two `@vitest/mocker` advisories, and the Vite row's "most recent" advisories leave out the newest one.

## What Changes

- Re-observe each fact the five findings name from primary sources on 2026-10-27: the npm registry, the GitHub advisory APIs, and the npm bulk advisory endpoint.
- Correct those facts in `docs/g3-dependencies.md` and in the "G3 dependencies" section of `docs/dependencies.md`, marking each one "observed 2026-10-27" and keeping the 2026-10-25 facts it does not replace.
- Record the observations, commands, and results in `verification.md`.
- No version proposal, pin, `package.json`, or lockfile changes. Choosing the version to install stays with the installing items.

## Capabilities

### New Capabilities

### Modified Capabilities

None. The edits are documentation facts under the existing requirements of `g3-dependency-evaluation` and `dependency-register`. No requirement changes, so the change has no spec delta ([design](design.md) D2).

## Impact

`docs/g3-dependencies.md`, `docs/dependencies.md`, and this change's records. No code, contract, specification, dependency, or runtime change.
