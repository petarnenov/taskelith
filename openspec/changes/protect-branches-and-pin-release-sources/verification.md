# Verification

Date: 2026-10-24. Author verification and independent review are recorded below.

## Scope and source

Owner request on 2026-10-24: apply the prepared GitHub settings (protection for `main` and `dev`, squash merges disabled) and fix the four unpinned, unlabeled sources in `docs/releases.md`. Base revision: `3fcd6de` on `dev`. Scope: repository settings on GitHub, `docs/releases.md`, and this change.

## Applied settings

Applied with `gh api` and read back:

- `PUT repos/petarnenov/taskelith/branches/main/protection` with the approved body. Full read-back of `GET .../branches/main/protection`, URL fields removed:
  `{"allow_deletions":{"enabled":false},"allow_force_pushes":{"enabled":false},"allow_fork_syncing":{"enabled":false},"block_creations":{"enabled":false},"enforce_admins":{"enabled":true},"lock_branch":{"enabled":false},"required_conversation_resolution":{"enabled":false},"required_linear_history":{"enabled":false},"required_pull_request_reviews":{"dismiss_stale_reviews":false,"require_code_owner_reviews":false,"require_last_push_approval":false,"required_approving_review_count":0},"required_signatures":{"enabled":false},"required_status_checks":{"checks":[{"app_id":15368,"context":"verify"}],"contexts":["verify"],"strict":true}}`
- `PUT repos/petarnenov/taskelith/branches/dev/protection` with the approved body. Full read-back, URL fields removed:
  `{"allow_deletions":{"enabled":false},"allow_force_pushes":{"enabled":false},"allow_fork_syncing":{"enabled":false},"block_creations":{"enabled":false},"enforce_admins":{"enabled":false},"lock_branch":{"enabled":false},"required_conversation_resolution":{"enabled":false},"required_linear_history":{"enabled":false},"required_signatures":{"enabled":false}}`
- `PATCH repos/petarnenov/taskelith` with `allow_squash_merge=false`. Read back: `{"merge":true,"rebase":true,"squash":false}`.

No push was attempted to test the protection; the API read-back is the evidence.

## Author self-check before review

- Comparison with the approved settings, field by field:
  - `main`: required status check `verify` (bound to app 15368, GitHub Actions) with `strict: true`; `enforce_admins` enabled; required pull request reviews present with 0 approvals; no `restrictions` key, which is how the API reports `restrictions: null`; force pushes and deletion disabled. All other fields are GitHub defaults (disabled).
  - `dev`: no required status checks, no required pull request reviews, no `restrictions`, `enforce_admins` disabled; force pushes and deletion disabled; all other fields are defaults. So nothing else is set.
  - Repository: `allow_squash_merge` false; merge commits and rebase merges still allowed.
- Sources: the npm trusted-publishing page is pinned to `npm/documentation` commit `6af52f08a7345a8a96fc095c1e3c6117bbbac72c` (2026-10-24) and the npm trust command page to `npm/cli` tag `v12.2.1`; semantic-release v25.0.9 has no documentation in its repository, so its recipe and the GitHub changelog post are labeled "docs". All four URLs returned HTTP 200 on 2026-10-24.
- Evidence check on `docs/releases.md`: passed. Local link and anchor check: passed.
- Reported to the owner, not changed: with `strict` checks, every promotion leaves `dev` behind `main`; after a rebase merge their histories also diverge. `docs/releases.md` now documents the synchronization step.

## Checks

Node v24.22.1, npm 12.2.1: `make verify` passed in 9 s (19 tests passed, dependency inventory verified, strict OpenSpec validation 15 passed, package verification passed).

## Independent review

Assigned reviewer (rotation): Codex CLI with `gpt-6.1-sol`, `model_reasoning_effort = "medium"`, sandbox `read-only`; confirmed in the output header. SHA-256 snapshots before and after each pass were equal.

- **Pass 1 — session `01a16e52-2210-7721-b24f-336f6e06003d`.** Findings: 0 Critical, 0 High, 1 Medium, 2 Low. All accepted and resolved:
  1. Medium: the read-backs were partial and could not prove exact compliance. Full read-backs are recorded above with a field-by-field comparison.
  2. Low: synchronization after a promotion was undocumented. `docs/releases.md` now describes it for merge-commit and rebase promotions.
  3. Low: the design claimed a direct push would release without the check. It now says protection keeps unchecked changes out of `main`, while the release already depends on `verify`.

- **Pass 2 — session `01a16e54-b694-71d2-a74d-e54402329109`.** The Medium and the design finding were confirmed resolved; the synchronization finding was partly resolved. Findings: 0 Critical, 0 High, 0 Medium, 1 Low:
  1. Low: the synchronization commands used `origin/main` without fetching it first. Both now start with `git fetch origin`. Fixed without another pass, as the review process allows for a Low-only pass; **this fix has not been independently reviewed.**

Remaining findings: 0.

## Remaining gates

Merge into `dev`; the next promotion brings this change to `main`.
