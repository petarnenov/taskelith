# Verification: align-board-stage-names

## Scope and source

The owner's request on 2026-10-24: "направи ревю за синхронизация на дзайн с код + документация , ако разминавания ги оправи" (review whether the design is in sync with the code and documentation, and fix any mismatch). A read-only review of the UI proof of concept against `dev` at `1bdf5b5` found mismatches; those in the proof of concept were fixed there, and the two inside the repository documents are fixed here. Base revision: `9f42dc5` on `dev`. Prepared in a git worktree. Scope: `docs/decisions/0008-product-ui-and-integration-authority.md`, `docs/architecture.md` (lifecycle illustration), and this change.

## Author self-check before review

- No decision or stage changes; only labels are mapped and an illustration's order follows governance.
- The same review found that `docs/dependencies.md` and `docs/contract-tooling.md` still describe owner decisions D2 and D3 as open although `docs/g1-plan.md` records them as decided. That belongs to the G1 work stream and was handed to its owner session instead of being changed here.

## Checks

In the worktree, Node v24.22.1, npm 12.2.1: `make verify` passed. `npm run openspec -- validate align-board-stage-names --strict` passed. The edited documents' links resolve (the new governance link uses an existing anchor).

## Independent review

Assigned reviewer (rotation): Codex CLI, model `gpt-6.1-sol` with `model_reasoning_effort = "medium"`, sandbox `read-only` (confirmed in the session header). SHA-256 snapshots of the worktree before and after the pass were equal.

- **Pass 1 — session `01a16f60-4462-7802-8d14-81e2ce75e1c7`, on `ccaf7b3`.** Findings: 0 Critical, 0 High, 0 Medium, 2 Low. Low-only pass, so both were fixed without another review (recorded as unreviewed fixes):
  1. Low: the new governance link in the architecture pointed at `main` without a pin. Now a relative link to `governance.md` in the same revision.
  2. Low: task 2.1 was unchecked although `verification.md` reports the checks. Checked.

## Remaining gates

None for this documentation change.
