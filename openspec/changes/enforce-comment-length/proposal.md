## Why

The comment length rule of `AGENTS.md` (change `limit-comment-length`, 2026-10-24) applied only to comments that a change adds or edits, with no automated check, so it depended on authors and reviewers, and existing comments still broke it. On 2026-10-25 the owner approved shortening every existing comment and enforcing the rule in `make verify`.

## What Changes

- Shorten every existing comment that breaks the rule in the tracked files within its scope, keeping each comment's meaning and changing no behaviour.
- Add `scripts/check-comment-length.ts`, run as `npm run verify:comments` from `make verify`, which fails on any violation and names the file, the line, and the reason, with unit tests in `test/check-comment-length.test.ts`.
- Update the `engineering-principles` requirements: the bound now applies to every comment in scope, `make verify` enforces it, and the scaffold copy of the SpecKit capture in the plugin fixtures is exempt like the capture itself.

## Capabilities

### New Capabilities

### Modified Capabilities
- `engineering-principles`: the comment length bound covers every comment in scope and is checked by `make verify`.

## Impact

Comments in 39 files, `Makefile`, `package.json`, a new script and test. No product behaviour changes and no dependency is added: the check uses the TypeScript compiler that the repository already pins.
