## Why

CI ran its checks on every pull request and on pushes to `main`, defined only as separate workflow steps. The same checks take about 8 s locally against about 24 s in GitHub, and the repository had no Makefile despite ADR 0004's Makefile-driven operation. The owner decided that the checks are defined once as `make verify`, run locally before every push and in GitHub only when `dev` is promoted to `main`, that `dev` becomes the default branch, and that automatic releases from `main` stay.

## What Changes

- Add a root `Makefile` with `verify` (toolchain check, then tests, dependency inventory check, strict OpenSpec validation, package verification) and `hooks` (opt-in `core.hooksPath`).
- Add `.githooks/pre-push`, which runs `make verify`.
- Restrict the workflow to pull requests into `main`, pushes to `main`, and manual dispatch, and replace its four check steps with `make verify`.
- Describe the flow in `docs/releases.md`, `AGENTS.md`, `README.md`, and `docs/governance.md`.
- After the merge: create `dev` from `main` and make it the default branch.

## Capabilities

### New Capabilities
- `integration-flow`: Single `make verify` definition of the checks, the `dev`-to-`main` promotion flow, and releases from `main`.

### Modified Capabilities

None.

## Impact

No runtime or package impact. CI no longer runs on pull requests into `dev` or on pushes outside `main`. Branch protection is an owner gate and is not part of this change.
