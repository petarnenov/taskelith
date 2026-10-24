# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

G1 work plan item 14, run under the owner's authorization of 2026-10-24 to merge each completed and reviewed G1 item and start the next one; the owner decided on 2026-10-25 that G2 starts when this closure merges. Base revision: `d113b6a` on `dev`. Scope: `docs/decisions/0010-g1-closure.md` (new), `docs/foundation.md`, `docs/g1-plan.md`, `docs/g2-plan.md`, `docs/architecture.md` (sections 13 and 15), `README.md`, and, after review pass 1, `docs/sdlc-framework-mapping.md`, `docs/trust-model.md`, and `docs/qualification/claude-code.md`; plus this change. Documentation only. Prepared in a git worktree.

## G1 exit evidence

Fresh clone of `dev` at `d113b6a` into a scratch directory outside the repository, with `nvm use` (Node v24.22.1, npm 12.2.1):

- `npm ci --ignore-scripts` 3 s, exit 0; `make verify` 52 s, exit 0.
- Tests: 268 passed, 0 failed, 0 skipped. Coverage over all product packages: lines 99.63%, branches 95.68%, functions 99.27%; every product module is in the coverage report.
- Workspace and hexagonal boundary checks passed; both contract documents have 0 breaking changes against `d113b6a` (the merge base equals the checked revision, so this only shows the check runs); dependency inventory verified (681 paths, 19 reviewed gaps); strict OpenSpec validation 33 passed, 0 failed; the archive dry-run had no active change; packed file allowlist and installed CLI verification passed.
- `git status --short` was empty afterwards.
- The exit-evidence tests named in ADR 0010 decision 1 all passed in that run: the transition tables and outdated generations in `gate.test.ts`, `stage-progress.test.ts`, and `task-admission.test.ts`; the unbound and early implementation tasks in `task-admission.test.ts`; the planning task that creates the missing specification in `task-admission-service.test.ts`; and the separation of structural, platform, and semantic evidence in `gate.test.ts`.

Limit: the author's machine already had the pinned Node and npm through nvm, and Docker for the contract compatibility check.

## Author self-check before review

- Every G1 item 1 to 13 is merged into `dev` and archived under `openspec/changes/archive/`.
- Each deferral in ADR 0010 names its source decision or record; the two without a named gate are marked as the author's assignment (six after pass 1; the owner accepted all six on 2026-10-25).
- The four pre-G2 contracts stay G2 work (G2 plan items 3 to 6), and section 15 no longer lists the mapping feasibility as open.

## Checks

In the worktree, Node v24.22.1, npm 12.2.1: `make verify` passed (268 tests passed, strict OpenSpec validation 34 passed, archive dry-run of `close-g1` strictly valid, package verification passed); the relative links of the changed documents resolve. Evidence check: the only new external links are the canonical `blob/main` links to ADR 0010 in `README.md` and architecture section 15; they follow the packaging rule and resolve after the later promotion to `main`, as in the G0 closure. Re-run after the pass-1 fixes and after the pass-2 fixes with the same results.

## Independent review

Assigned reviewer (rotation; Antigravity is paused until its quota resets): Claude Code CLI, `--model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit`; the model was confirmed in the JSON output. SHA-256 snapshots of the worktree before and after each pass were equal.

- **Pass 1 — session `60bec6d4-b4c2-444c-9d19-337fb7908e03`.** The exit-evidence claims, the pre-G2 contracts, and the section 15 wording were confirmed. Findings: 0 Critical, 0 High, 7 Medium, 12 Low. All accepted and resolved:
  1. Medium: ADR 0009 does not name SpecKit's interactive gate path. It is now a separate author's assignment citing item 9.
  2. Medium: the plugin API version left by item 12 was missing. ADR 0010 records the owner's acceptance of `0.2.0` and assigns `1.0.0` to G4.
  3. Medium: the code-head identity of head-bound review had no gate. Assigned to G3.
  4. Medium: the generated manifest type's condition (item 13's generation) was not discussed. ADR 0010 explains why it still moves to G4.
  5. Medium: the requirement did not allow the author's assignment its scenario allowed. The requirement now allows it.
  6. Medium: no evidence check was recorded. Recorded in Checks, with the `blob/main` links.
  7. Medium: the SDLC framework mapping still said the port and fixtures follow. Updated with a dated note.
  8. Low: the durable adapters cited only item 7. ADR 0010 and the ledger cite G2 plan item 11.
  9. Low: `--require-spec` and the invalid-structure fixtures had no gate. Assigned to G4.
  10. Low: the missing-spec test was described too broadly. Reworded.
  11. Low: the G2 plan's starting point said items 11, 12, and 14 were open. Updated.
  12. Low: the G2 plan's status repeated the old start condition. Removed.
  13. Low: the contract check compared the revision with itself. Stated.
  14. Low: the ledger title said G0 only. Renamed "Foundation status", also in README.
  15. Low: the ledger called the Makefile and API contracts follow-up work. Only container images remain.
  16. Low: the workspace-boundaries row said exports will expand with G1 modules. Updated.
  17. Low: the trust model said G1–G3 implementation. Now G2–G3.
  18. Low: the Claude Code record put the agent port in G1. Now G3.
  19. Low: the `foundation-closure` Purpose covers only G0. Rewritten at archive (design decision 4).
- **Pass 2 — session `3c508b66-ea6e-434c-9067-55e537edc82b`.** All 19 pass-1 findings confirmed resolved, and the whole change rechecked against the pass-1 criteria. Findings: 0 Critical, 0 High, 0 Medium, 7 Low. Because the pass found only Low findings, they were fixed without another review; these fixes are unreviewed:
  1. Low: the SpecKit qualification record still put the agent steps in G3 and listed open items without a gate. Dated note and G4 reference added.
  2. Low: governance called the SDLC models G1–G4 work. G1's delivery is stated; the rest is G2–G4.
  3. Low: ADR 0010 cited item 12 as the owner's acceptance of `0.2.0`. Reworded.
  4. Low: ADR 0010 and the G1 plan counted item 14 as already merged. Reworded.
  5. Low: the design's risk still spoke of two assignments. Updated.
  6. Low: the self-check still spoke of two assignments. Updated.
  7. Low: the ledger's "this closure" became ambiguous. Now "the G0 closure (ADR 0007)".

Owner decision of 2026-10-25, after pass 2: the owner accepted the four remaining author's assignments (SpecKit interactive gate path and `--require-spec`: G4; invalid-structure fixtures: G4; code-head identity: G3; plugin API `1.0.0`: G4). ADR 0010 records them as accepted; this is a record of the decision, not a reviewed change.

## Remaining gates

Independent review; integration into `dev` and archive; promotion to `main` (later, by owner decision); the deferred items at their named gates.
