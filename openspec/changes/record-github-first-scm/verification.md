# Verification

Date: 2026-10-24. Author verification and independent review are recorded below.

## Scope and source

The owner's decisions on 2026-10-24 in the project conversation: GitHub.com (the hosted service, not GitHub Enterprise Server) is the first SCM; Forgejo stays selected as the second SCM plugin and is added "once the project works and everything is fine with GitHub"; credentials use a GitHub App with per-run installation tokens limited to the project's repositories (approved by the owner from the author's options). Base revision: `05aa1e8` on `dev`. Scope: `docs/decisions/0006-github-first-scm.md` (new), and related edits to `docs/architecture.md`, `docs/decisions/0003-first-integrations-and-plugin-kernel.md` (dated note), `docs/trust-model.md`, `docs/integration-candidates.md`, `docs/dependencies.md`, `docs/foundation.md`, and, after review pass 1, `README.md` and spec deltas for `integration-decisions` and `integration-candidates`. Documentation only.

## Author self-check before review

- Each decision in ADR 0006 maps to an owner statement, an owner-approved option, or a stated elaboration of ADR 0003 decision 2 (the evidence terms).
- Every Forgejo-as-first-SCM statement outside ADR 0003's superseded decision now reflects ADR 0006; the candidate assessment says its SCM table predates the change.
- Closed-provider rules in the architecture (policy text, the baseline rule, R35) include the SCM exception.
- Evidence check on the new ADR: passed; local link and anchor check: passed.

## Checks

Node v24.22.1, npm 12.2.1: `make verify` passed in 9 s (19 tests passed, dependency inventory verified, strict OpenSpec validation 15 passed (re-run after the pass-1 fixes), package verification passed).

## Independent review

Assigned reviewer (rotation): Antigravity CLI 1.4.7, `--model gemini-4-argon-medium --effort medium --mode plan`; the model was confirmed in the CLI log. SHA-256 snapshots before and after each pass were equal.

- **Pass 1 — conversation `c21b5057-4351-4645-b50a-b753bb9d1e98`.** Findings: 0 Critical, 0 High, 2 Medium, 3 Low. All accepted and resolved:
  1. Medium: the main `integration-decisions` spec still limited closed components to harnesses. A MODIFIED delta widens the scenario to the hosted SCM.
  2. Medium: the architecture header, scope bullet, component table, and README listed only harnesses as closed plugins. All updated; the table gains an SCM row.
  3. Low: the candidate assessment's open-core row and its spec still exempted only harnesses. Both updated (the spec through a MODIFIED delta).
  4. Low: ADR 0006 did not state "not GitHub Enterprise Server". Added.
  5. Low: webhook and status identity was an author rule presented as decided, and the self-check overstated faithfulness. The sentence was removed, the ADR status distinguishes the elaboration and the owner-chosen option, and the self-check is corrected.

- **Pass 2 — conversation `01ddef40-3b0d-4881-92f2-2f6b332218b7`.** All pass-1 findings confirmed resolved; the evidence terms and qualification targets judged faithful elaborations. Findings: 0 Critical, 0 High, 0 Medium, 0 Low.

Remaining findings: 0.

## Remaining gates

Merge into `dev`; promotion to `main`; qualification of GitHub.com.
