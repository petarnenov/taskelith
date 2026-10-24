# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

G1 work plan item 14, run under the owner's authorization of 2026-10-24 to merge each completed and reviewed G1 item and start the next one; the owner decided on 2026-10-25 that G2 starts when this closure merges. Base revision: `d113b6a` on `dev`. Scope: `docs/decisions/0010-g1-closure.md` (new), `docs/foundation.md`, `docs/g1-plan.md`, `docs/g2-plan.md`, `docs/architecture.md` (sections 13 and 15), `README.md`, and this change. Documentation only. Prepared in a git worktree.

## G1 exit evidence

Fresh clone of `dev` at `d113b6a` into a scratch directory outside the repository, with `nvm use` (Node v24.22.1, npm 12.2.1):

- `npm ci --ignore-scripts` 3 s, exit 0; `make verify` 52 s, exit 0.
- Tests: 268 passed, 0 failed, 0 skipped. Coverage over all product packages: lines 99.63%, branches 95.68%, functions 99.27%; every product module is in the coverage report.
- Workspace and hexagonal boundary checks passed; both contract documents have 0 breaking changes against `d113b6a`; dependency inventory verified (681 paths, 19 reviewed gaps); strict OpenSpec validation 33 passed, 0 failed; the archive dry-run had no active change; packed file allowlist and installed CLI verification passed.
- `git status --short` was empty afterwards.
- The exit-evidence tests named in ADR 0010 decision 1 all passed in that run: the transition tables and outdated generations in `gate.test.ts`, `stage-progress.test.ts`, and `task-admission.test.ts`; the unbound and early implementation tasks in `task-admission.test.ts`; the planning task that creates the missing specification in `task-admission-service.test.ts`; and the separation of structural, platform, and semantic evidence in `gate.test.ts`.

Limit: the author's machine already had the pinned Node and npm through nvm, and Docker for the contract compatibility check.

## Author self-check before review

- Every G1 item 1 to 13 is merged into `dev` and archived under `openspec/changes/archive/`.
- Each deferral in ADR 0010 names its source decision or record; the two without a named gate are marked as the author's assignment.
- The four pre-G2 contracts stay G2 work (G2 plan items 3 to 6), and section 15 no longer lists the mapping feasibility as open.

## Checks

In the worktree, Node v24.22.1, npm 12.2.1: `make verify` passed (268 tests passed, strict OpenSpec validation 34 passed, archive dry-run of `close-g1` strictly valid, package verification passed); the relative links of the changed documents resolve.

## Independent review

Assigned reviewer (rotation): Claude Code, `claude-fable-5-1`, effort medium, plan mode. Pending.

## Remaining gates

Independent review; integration into `dev` and archive; promotion to `main` (later, by owner decision); the deferred items at their named gates.
