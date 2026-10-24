# Verification

Date: 2026-10-24. Author verification and independent review are recorded separately below.

## Scope and source

Owner request: continue the remaining G0 work autonomously until an owner decision is required, with independent review by the owner-authorized reviewers. Base revision: `77b1450d49669da58cac9a486469428031a3acc2`. The working tree also contains five earlier, separately reviewed G0 changes. This change's scope:

- `docs/dependencies/license-reviews.json` (new): reviews of the 14 gap paths.
- `scripts/dependency-inventory.ts`: `parseLicenseReviews` and `checkLicenseReviews`.
- `scripts/inventory-dependencies.ts`: enforces reviews in generation and check mode.
- `test/dependency-inventory.test.ts`: review matching and malformed-input tests.
- `docs/dependency-inventory.md`, `docs/dependencies.md`, `docs/foundation.md`: coverage and remediation records.
- `docs/dependencies/licenses.json`: regenerated; only the provenance hashes of the two inventory scripts changed.

No dependency version, lockfile, product runtime behavior, published CLI surface, or tarball allowlist changed.

## Investigation

- Downloaded and listed the published npm tarball of each of the 13 distinct gap package versions. None contains a LICENSE, COPYING, or NOTICE file, so every gap reflects the published package rather than the local installation.
- Read the registry `gitHead` for each version. Inspected upstream trees at that commit, at the release tag (proxy-agent-negotiate), or by license-file history when no `gitHead` exists (pnpm/components, java-properties). Used `raw.githubusercontent.com` and partial clones in a temporary directory, because the unauthenticated GitHub API rate limit was exhausted. The temporary directory is outside the repository.
- Advisories: compared the `ip-address` and `undici` versions bundled in published tarballs of npm 11.21.1, npm 12.2.1 (the current `latest`), and the plugin's dependency ranges for `@semantic-release/npm` 13.x and 14.0.0-beta.2. Recorded the registry publication dates of the first fixed versions. GitHub advisory metadata could not be re-fetched because of the API rate limit; the existing register links are unchanged.

## Checks

All checks ran under the exact CI pins Node v24.22.1 and npm 12.2.1, via `npm exec --yes --package=node@24.22.1 --package=npm@12.2.1 --`:

- `npm test` (build, `check:boundaries`, all suites): 19 tests passed, 0 failed. Re-run after the review fixes with the same result.
- `npm run inventory:dependencies` then `npm run verify:dependencies`: passed; "Verified 487 package paths; 14 with license coverage gaps (all reviewed; 3 declaration-only)".
- `OPENSPEC_TELEMETRY=0 npm run openspec -- validate --all --strict --no-interactive`: 8 passed, 0 failed.
- `npm run verify:package`: tarball allowlist, packaged link checks, and installed CLI passed.
- `git diff --check`: passed.

Tests run on macOS only. Native Linux CI execution is not claimed.

## Independent review

Both reviewers were explicitly authorized by the owner on 2026-10-24 and ran read-only. A SHA-256 snapshot of all tracked and untracked repository files taken before pass 2 showed no reviewer modification; the only later differences were author edits belonging to `assess-first-integration-candidates` (new files and the "First integrations" row of `docs/foundation.md`).

- **Pass 1 — Codex CLI 0.164.0, model `gpt-6.1-sol`, `model_reasoning_effort = "medium"`, sandbox `read-only` (set on the command line, overriding the local default), session `01a16d9e-f9fd-7330-9e1d-fd179a386701`.** Findings: 0 Critical, 0 High, 2 Medium, 0 Low.
  1. Medium (`scripts/dependency-inventory.ts:73`): no runtime validation of the parsed review JSON; malformed findings or evidence could pass. Resolved by `parseLicenseReviews`, which validates untrusted input field by field, plus malformed-input regression tests.
  2. Medium (`tasks.md:9`): no `verification.md`. Resolved by this record.
  Limitation: no network access, so external claims were not verified in this pass.
- **Pass 2 — same reviewer configuration, session `01a16da2-44d4-7e32-937f-5de00a5d7abe`.** Both findings resolved, no regressions: 0 findings. Same network limitation.
- **Cross-review — Antigravity CLI 1.4.7, model `gemini-4-argon-medium` (Gemini 4 Argon, Medium), `--effort medium`, `--mode plan`, conversation `8072721a-375f-4b73-a89f-3e76c9076342`.** The model was set on the command line because the local default is Argon Low; the CLI log confirms `gemini-4-argon-medium`. With network access, it verified the registry metadata, published tarballs, upstream commits and trees, and advisory ranges for all 14 reviews and the remediation assessment. Result: 0 findings, no unverified claims.

Remaining findings: 0.

## Remaining gates

Owner decisions: whether `notice-only` and `declaration-only` evidence suffices for development tooling, and how to treat the advisories until npm ships a fixed bundle. Integration (commit, push, merge) and archival remain pending.

## Integration

The owner authorized integration and archival on 2026-10-24. Integrated into `main` at `55866cfcf3e9e1c6c740ba63de556412354f5689` through pull request #3 (rebase merge). The `main` workflow run 40092893183 passed verification; semantic-release found no relevant changes, so no version was released. Archived with the pinned OpenSpec CLI afterwards.
