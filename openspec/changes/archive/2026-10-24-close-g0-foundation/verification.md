# Verification

Date: 2026-10-24. Author verification and independent review are recorded below.

## Scope and source

The owner's request on 2026-10-24 to finish G0, and the owner's choices: the initial worker matrix (Linux x86_64 and arm64; macOS on both Intel and Apple Silicon, which the owner confirmed must both be supported), deferral of all four open work items to the gates that need them, and promotion to `main` later. Base revision: `1d7be7a` on `dev`, fast-forwarded to `4f78d29` after the parallel `document-worktree-pitfalls` change merged. Scope: `docs/decisions/0007-g0-closure.md` (new), `docs/foundation.md`, `docs/worker-platforms.md`, `docs/architecture.md`, and, after review pass 1, `README.md`, `docs/dependencies.md`, `docs/dependency-inventory.md`, dated notes in ADRs 0001, 0002, and 0006, the remaining-gate lists in `docs/qualification/*.md`, and a `bootstrap-governance` spec delta; plus this change. Documentation only. Prepared in a git worktree.

## G0 exit evidence

Fresh clone of `dev` at `1d7be7a` into a scratch directory, with `nvm use` (Node v24.22.1, npm 12.2.1):

- Clone 2 s; `npm ci --ignore-scripts` 3 s, exit 0; `make verify` 12 s, exit 0: 19 tests passed, 0 failed; dependency inventory verified (487 paths, 14 reviewed gaps); strict OpenSpec validation 15 passed, 0 failed; packed file allowlist and installed CLI verification passed.
- `make verify` includes repository-wide typechecking (`tsconfig.check.json`) and the hexagonal and Go boundary check (`scripts/check-boundaries.ts`).
- `git status --short` was empty afterwards.
- Tracked first change: every change since bootstrap is an archived OpenSpec change under `openspec/changes/archive/`.
- No reference to another product installation: tracked files outside the archive contain no local paths; the only mentions of AO Cloud are the architecture's non-goals.

Limit: the author's machine already had Node 24.22.1 with npm 12.2.1 installed through nvm; a machine without them first needs `nvm install` and the pinned npm, as `README.md` says.

## Author self-check before review

- ADR 0007 records the owner's choices; where a deferred item spans several gates (native acceptance rows, the G8 evidence categories), the split follows the architecture's gate definitions and is stated as such.
- Every deferred item remains in the ledger with its gate and ADR 0007.
- Local link and anchor check passed; the evidence check found no unpinned external link.

## Checks

In the worktree, Node v24.22.1, npm 12.2.1: `make verify` passed (19 tests passed, dependency inventory verified, strict OpenSpec validation 16 passed, package verification passed; re-run after the pass-1 fixes, after the pass-2 fixes, and after the pass-3 fixes with the same results; the link and evidence checks were re-run each time).

## Independent review

Assigned reviewer (rotation): Antigravity CLI 1.4.7, `--model gemini-4-argon-medium --effort medium --mode plan`; the model was confirmed in the CLI log. SHA-256 snapshots of the worktree before and after each pass were equal.

- **Pass 1 — conversation `6d8141d8-686d-44ae-9858-6dde7007f1be`.** Findings: 0 Critical, 5 High, 3 Medium, 2 Low. All accepted and resolved:
  1. High: the terms-review deferral said "G3 or G4" and added other gates, against the owner's "before admission in G3". ADR 0007 and the ledger now say "before admission in G3"; the other qualification gates are stated as each integration's admission gates, not G0 items; each qualification record and register row names the G3 terms review, and the Claude Code record gains the missing Anthropic terms review.
  2. High: seven statements still said G0 was open (README, foundation, architecture sections 2, 13, and 15, dependency inventory). All updated.
  3. High: statements still treated the matrix as undecided (architecture section 2 and the G0 row, ADR 0002, foundation, worker platforms). All updated; ADR 0002 gains a dated note.
  4. High: the `bootstrap-governance` spec forbade marking G0 complete with qualification gaps. A MODIFIED delta allows closure only when the owner defers each gap to a named gate recorded in the checklist.
  5. High: the ledger called the harnesses qualified, dropped operational gaps, left notice coverage and other integrations without a gate, and misstated `main` integration. All corrected.
  6. Medium: the register and ADR 0006 did not reflect the deferrals. ADR 0007 is referenced in the register, and ADR 0006 gains a dated note.
  7. Medium: deferring all native acceptance to G2 conflicted with rows that need G3 or later, and macOS does not use the worker image. Acceptance now starts in G2 (Linux with the image, macOS natively) and completes per row with the later gates.
  8. Medium: the Intel Mac scenario was not testable and omitted Linux. The scenarios now check that all four entries are recorded as targets and that no entry is called supported before its acceptance evidence.
  9. Low: the provenance of the OS versions was not stated. ADR 0007's status now states it.
  10. Low: ADR 0007 references in the ledger were unlinked, and the canonical link in packaged documents resolves only after promotion to `main`. The ledger references are linked; the canonical links follow the packaging rule and will resolve after the later promotion.

- **Pass 2 — conversation `972c9ea8-63cc-4ce4-81ce-e68b3cc55909`.** All pass-1 findings confirmed resolved. Findings: 0 Critical, 0 High, 2 Medium, 3 Low. All accepted and resolved:
  1. Medium: the proposal and tasks omitted the `bootstrap-governance` delta and the expanded scope. Updated.
  2. Medium: the Linux worker-image qualification (G2) and the G8 deferral for development tools were not annotated in the register and qualification records. Annotated.
  3. Low: the ledger named pull request #13 instead of #14 and implied this closure was already archived. Corrected.
  4. Low: architecture section 15 and the design still called native acceptance a G2 gate. Now it starts in G2 and completes per row.
  5. Low: two ADR 0007 references in the ledger were unlinked. Linked.

- **Pass 3 (final) — conversation `1a4be3cd-0ee2-4937-b7ed-26d4beaad310`.** All pass-2 findings confirmed resolved. Findings: 0 Critical, 0 High, 0 Medium, 3 Low. Because the pass found only Low findings, they were fixed without another review; these fixes are unreviewed:
  1. Low: recording pass 2 removed the `Remaining gates` heading. Restored.
  2. Low: the checks did not record a `make verify` run after the pass-2 fixes. Recorded in Checks.
  3. Low: the register's direct development tools section did not state the G8 deferral, and the runtime section's note read as covering only Node.js and npm. The direct tools section now states it, and the runtime note names Node.js and npm.

## Remaining gates

Merge into `dev`; promotion to `main` (later, by owner decision); the deferred G0 items at their named gates.
