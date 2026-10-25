# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

Assigned on 2026-10-25 by the session coordinating G2 (Niki) as `dedupe-migration-directory-read`: the follow-up that G2 item 11's verification recorded, that `packages/adapters/postgres/src/migrations.ts` reads the migrations directory twice. Read it once and pass the listing through, keeping behavior and the existing tests; add a test only if behavior needs one. Base revision: `87d048d` on `dev`. Scope: `packages/adapters/postgres/src/migrations.ts` and this change, with `skip_specs: true`.

## Environment

macOS (Darwin 25.6.0, x86_64), Node v24.22.1 through `nvm use`, npm 12.2.1, Docker for the integration services of `make verify`.

## Author self-check before review

- `migrate` reads the directory once, after taking the advisory lock as before, and passes the listing to `unsupportedFiles` and `migrationFiles`; each helper keeps its filter and sort unchanged, including `migrationFiles` accepting a dotfile that ends in `.sql`.
- No new test: behavior is unchanged, and `migrations.integration.test.ts` covers the refusal of a file other than SQL, the checksums, and the edited, deleted, and interrupted cases.
- No requirement changes, so `skip_specs: true`.
- Evidence check: no external link was added. Comments are within the comment length rule. Commit type `chore:`.

## Checks

In the worktree, Node v24.22.1, npm 12.2.1, on the working tree committed as the change's first commit: `npm run openspec -- validate dedupe-migration-directory-read --strict` passed; `make verify` passed (569 tests passed, 0 failed, including the PostgreSQL migration integration tests; coverage 99.18% lines, 94.35% branches, 99.24% functions, `migrations.js` 100% lines; strict OpenSpec validation 46 passed; archive dry run, dependency inventory check, and package verification passed).

## Independent review

Assigned reviewer: Codex CLI, `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, run from the worktree without network access. SHA-256 snapshots of `git ls-files -co --exclude-standard | xargs shasum -a 256 | shasum -a 256` are taken before and after each pass; prompts, outputs, and snapshots are kept outside the worktree.

- **Pass 1 — session `01a170e8-8749-7b31-bec6-8f23ef6f312f`**, at `64c0ee4`. The output header reports model `gpt-6.1-sol`, reasoning effort medium, and sandbox read-only. Snapshot before and after: `0db98f2ceee8f407d992a106b6a33070bcf03e79990adfc5ad2ef8c3625673c3`, unchanged. The reviewer found behavior unchanged for an unchanging directory and no test needed. Findings: 0 Critical, 0 High, 0 Medium, 2 Low, fixed as **unreviewed fixes** as the review process requires for a Low-only pass:
  1. Low: the design said the advisory lock gave both old reads the same listing, but a PostgreSQL lock does not freeze the filesystem. It now says the equivalence holds for an unchanging directory.
  2. Low: the proposal named the `state-persistence` specification; the migration requirement is "Migrations with checksums" of `postgres-state`. Corrected.

## Limitations

None beyond the refactor's scope.

## Remaining gates

Integration by the coordinating session (pull request into `dev`, merge); archival.
