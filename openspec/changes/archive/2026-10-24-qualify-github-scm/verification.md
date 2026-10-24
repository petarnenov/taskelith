# Verification

Date: 2026-10-24. Author verification and independent review are recorded below.

## Scope and source

Owner request on 2026-10-24: qualify GitHub.com as the first SCM (ADR 0006), guided step by step, in the `taskelith` repository instead of a sandbox. The owner created the GitHub App, generated its private key under Credentials → Key pairs, and installed it on `petarnenov/taskelith` only. Base revision: `5d36150` on `dev`. Scope: `docs/qualification/github.md` (new), the "SCM integrations" section of `docs/dependencies.md`, the "First integrations" row of `docs/foundation.md`, and this change, including a new `scm-qualification` capability. Documentation only.

## Qualification runs

The App was confirmed through `GET /app` with a JWT: App ID 5456916, permissions administration, contents, pull requests, and statuses (write) and metadata (read), events `pull_request`, `pull_request_review`, `push`, `status`. The installation (174871289) had repository selection `selected`.

Runs used `make run` from a scratch directory; each holds `meta.json` (probe SHA-256, Node version, start time), `requests.jsonl` (method, path, status, rate limit; no tokens or bodies), and `report.json`.

- `g1` (probe `9a7d0cf4…`): ran through the merge step, then stopped during webhook processing, before signature verification and redelivery, and attempted cleanup, which succeeded. The protection used `enforce_admins: false`, and the App merged pull request #22 while the status was `pending`; the webhook detail request returned 404 because the delivery ID was rounded. Used only for these two findings.
- `g2` (probe `56358a1e…`): fixed both problems; token for `petarnenov/taskelith` only; write to `petarnenov/hexa-lab` 403; narrowed token tested with an invalid commit SHA (403); pull request #23; `pending` status blocked the merge (405) with `enforce_admins: true`; one webhook signature checked. Superseded after review pass 1.
- `g3` (probe `69293fa8…`, the recorded run): token for `petarnenov/taskelith` only, advertised expiry 60 minutes; write to `petarnenov/hexa-lab` 403; narrowed token refused branch creation at the valid base commit and reading the temporary branch's existing protection (403, "Resource not accessible by integration"), while the broad token created branches (201) and read the protection (200); bot-authored commit; pull request #24 opened by the App; comment review 200, self-approval 422; `pending` blocked the merge (405), `success` allowed it (200); all nine deliveries attributed by installation, repository, and time in the inspection snapshot (before the redelivery and cleanup) had matching signatures and `qual/scm-*` refs; redelivery 202 and listed; cleanup steps attempted independently: protection 204, pull request closed 200, branches 204, never-created narrowed branch 422.

After every run, `git fetch --prune` showed no `qual/*` branch, and `gh run list` showed no workflow run for the temporary branches or pull requests.

## Author self-check before review

- Every result names its run and the request statuses behind it; the review limitation, the untested within-installation narrowing, the untested failure-path cleanup, and the retained public records are stated.
- The terms are linked to a pinned commit of `github/docs` and recorded as not yet reviewed.
- No secret appears in the repository or in the logs.
- Evidence check on `docs/qualification/github.md`: passed (after fixing the author's check to accept `/tree/<sha>` links); local link and anchor check: passed.

## Checks

Node v24.22.1, npm 12.2.1: `make verify` passed (19 tests passed, dependency inventory verified, strict OpenSpec validation 15 passed, package verification passed).

## Independent review

Assigned reviewer (rotation): Codex CLI with `gpt-6.1-sol`, `model_reasoning_effort = "medium"`, sandbox `read-only`, with read-only access to a copy of the run evidence (secrets excluded); confirmed in the output header. SHA-256 snapshots before and after each pass were equal.

- **Pass 1 — session `01a16ecc-e4e0-7963-9e8b-c93d268eacaf`** (reviewed `g1` and `g2`). Findings: 0 Critical, 0 High, 6 Medium, 2 Low. All accepted and resolved, with a new run `g3`:
  1. Medium: denial was shown only outside the installation. The record says so, and narrowing within an installation is a remaining gate; the requirement now covers mutations and non-public reads and accepts public reads.
  2. Medium: the narrowed-token test used an invalid commit and had no control. `g3` uses the valid base commit and an existing protection, with broad-token controls.
  3. Medium: cleanup was not independent per step. Every step is now attempted on its own, every attempted branch is tracked, and the record limits the claim to the success path.
  4. Medium: the cleanup contract claimed removal of pull requests. Pull requests are closed or merged, and retained public records are disclosed.
  5. Medium: only one signature was inspected. `g3` verifies all nine deliveries attributed by installation, repository, and time.
  6. Medium: admission gates were missing. Security reporting, maintenance, and recovery and upgrade behaviour are added.
  7. Low: `g1` was described as complete. Corrected.
  8. Low: advertised expiry was described as observed. Corrected.

- **Pass 2 — session `01a16ed1-f854-76b3-9876-e80f204745e1`** (reviewed `g3`). Pass-1 findings 1–4, 6, and 8 confirmed resolved; 5 and 7 partly. Findings: 0 Critical, 0 High, 1 Medium, 1 Low. Both accepted and resolved in the documents, without a new run:
  1. Medium: the redelivery and cleanup-generated deliveries were not verified, contrary to the new requirement. The record states the inspection snapshot and its boundary, the requirement now covers deliveries within a recorded window, and full coverage is a remaining gate.
  2. Low: `g1` was still described as running every step. Corrected.

- **Pass 3 (final) — session `01a16ed4-48b7-73b3-ad92-6bf6ffe2cc83`.** Findings: 0 Critical, 0 High, 0 Medium, 0 Low.

Remaining findings: 0.

## Remaining gates

Merge into `dev`; promotion to `main`; the gates in the qualification record. The owner decided to keep the App's permissions unchanged.

## Integration and archival

The owner authorized integration and archival on 2026-10-24. Integrated into `dev` at `2edf5cf` through pull request #25 (rebase merge); no workflow ran for the pull request or the push to `dev`. It reaches `main` with the next promotion. Archived with the pinned OpenSpec CLI afterwards, in a separate git worktree.
