## Why

The review of the archived change `align-comment-rule-text` found that `scripts/check-comment-length.ts` also checks `.mts`, `.cts`, `.mjs`, and `.cjs` files, and the repository tracks one such file, `packages/plugins/sdlc-openspec/test/fixed-archive-date.mjs`. The `engineering-principles` requirement "Comment length scope" names only `*.ts` and `*.js`, and the comment rule in `AGENTS.md` follows it, so the written scope is narrower than the enforced one.

## What Changes

- Modify the requirement "Comment length scope" to name every file kind the check covers: `*.ts`, `*.mts`, `*.cts`, `*.js`, `*.mjs`, `*.cjs`, `*.sh`, `*.yml`, and `*.yaml` files, files named `Makefile` or `Dockerfile`, and extensionless scripts.
- Name the same file kinds in the comment rule of `AGENTS.md`.
- Keep the exemptions, the scenarios, the bound, and the check unchanged.

## Capabilities

### New Capabilities

### Modified Capabilities

- `engineering-principles`: the requirement "Comment length scope" names the `.mts`, `.cts`, `.mjs`, and `.cjs` file kinds.

## Impact

Documentation and specification only. The check already covers these file kinds, so no file's status changes.
