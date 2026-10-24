# Verification

Date: 2026-10-24. Author verification and independent review are recorded below.

## Scope and source

The owner's decisions on 2026-10-24 in the project conversation: pools to which many subscriptions can be added per harness and project, used on a least-loaded basis; a slot may serve several explicitly allowed projects; authentication must always use a subscription; record it in a separate ADR 0005. Base revision: `aa12a38`. Scope: `docs/decisions/0005-harness-subscription-account-pools.md` (new) and related edits to `docs/architecture.md`, `docs/trust-model.md`, `docs/operational-targets.md`, `docs/dependencies.md`, `docs/qualification/claude-code.md`, `docs/decisions/0003-first-integrations-and-plugin-kernel.md` (dated note), and `docs/foundation.md`. Documentation only.

## Checks

Under the exact CI pins Node v24.22.1 and npm 12.2.1: `npm test` 19 passed, 0 failed; `npm run verify:dependencies` passed; strict OpenSpec validation 12 passed, 0 failed (re-run after the pass-1 fixes with the same results); `npm run verify:package` passed, including the packaged-link check; local link and anchor check passed; the evidence check passed; `git diff --check` passed.

## Independent review

Assigned reviewer: Codex CLI with `gpt-6.1-sol`, `model_reasoning_effort = "medium"`, and sandbox `read-only`. The model, effort, and sandbox were confirmed in the output header. SHA-256 snapshots before and after each pass showed no reviewer change. At most three passes; Low findings are recorded and carried to the next review.

- **Pass 1 — session `01a16e20-0016-7542-b41c-c1b4e1e97bf8`.** Findings: 0 Critical, 1 High, 4 Medium, 2 Low.
  1. High (resolved): author-proposed rules (selection order, cooldown, affinity, control-plane credential storage and per-run delivery) were presented as owner decisions. The author asked the owner, who approved all four on 2026-10-24; ADR 0005 now states which decisions are the owner's request and which are approved proposals.
  2. Medium (resolved): "subscription of its harness vendor" narrowed the owner's rule. Now "a subscription supported by its harness plugin's declared mechanism".
  3. Medium (resolved): the usage tie-breaker lacked a comparison contract. Usage is now a normalized fraction of the current window's limit, applied only when every tied slot reports it, with least recent use otherwise and a defined no-eligible-slot outcome.
  4. Medium (resolved): planning text still allowed account-free or unconstrained provider paths (`docs/integration-candidates.md`, `docs/dependencies.md`, `docs/qualification/claude-code.md`). All now require subscription authentication.
  5. Medium (resolved): the spec lacked core scenarios. Scenarios now cover sharing, valid and invalid credentials, each selection step, missing usage, both cooldown cases, the no-eligible-slot outcome, resume affinity, revocation, cleanup, redaction, and kernel neutrality.
  6. Low: `docs/qualification/claude-code.md` still said the trust model "requires" per-workspace provider credentials in the present tense. Resolved after pass 2: now past tense, with the current slot rule.
  7. Low: ADR 0005, the design, and the proposal generalized the tested device-login arrangement into a one-account-per-host limitation. Resolved after pass 2: they now describe the tested arrangement and mark broader limits as untested.
- **Pass 2 — session `01a16e24-a921-7a63-b110-4820a33cd90d`.** The High and all Medium resolutions were confirmed; the two Low findings were deferred under the rule then in force and excluded. Findings: 0 Critical, 0 High, 0 Medium, 0 Low.

The owner then corrected the rule: Low findings are fixed, and a pass with only Low findings does not call the reviewer again. The two pass-1 Low findings were fixed after pass 2 without another pass; **these two fixes have not been independently reviewed.** Remaining findings: 0.

## Remaining gates

Integration (commit, push, merge) and archival with owner authorization; provider-terms records per harness; implementation in G2 and G3.

## Integration and archival

The owner authorized integration and archival on 2026-10-24. Integrated into `main` at `c885568` through pull request #10 (rebase merge). The `main` workflow run 40099555219 passed verification; semantic-release found no relevant changes, so no version was released. Archived with the pinned OpenSpec CLI afterwards.
