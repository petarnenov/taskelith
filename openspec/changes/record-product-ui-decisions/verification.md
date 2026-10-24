# Verification: record-product-ui-decisions

## Scope and source

The owner's decisions of 2026-10-24, made while reviewing the UI proof of concept, and the owner's request the same day: "1. Нека да може да се избира СДД фреймворк и за тасклит но дефолтно да е опенСпек. … 3. Добави ги в АДР и ОпенСпек" (let the SDLC framework be selectable for Taskelith too, with OpenSpec as the default; add them to an ADR and OpenSpec). Earlier owner statements recorded in ADR 0008 include "ауто мърдж побеждава всичко" (auto-merge wins over everything), the conflict flow with three attempts, automatic worker admission, intake with write-back, and new capabilities as microkernel plugins or adapters. Base revision: `41787eb` on `dev`. Prepared in a git worktree. Scope: ADR 0008 (new); amendments to ADR 0003 and ADR 0004; `docs/governance.md`, `docs/architecture.md`, `docs/foundation.md`, `AGENTS.md`, `README.md`; the `## Purpose` of `openspec/specs/engineering-principles/spec.md`, which archiving does not update; this change. Rebased onto `6df3ce5` on `dev` before the pass-1 fixes.

## Author self-check before review

- Every rule that conflicted with the decisions now points to ADR 0008: governance authority and lifecycle binding, ADR 0003 decision 11, architecture section 7, and ADR 0004 principle 8. A search for "mandatory OpenSpec", "requires OpenSpec", and "only through OpenSpec" outside archived changes finds no remaining current statement; ADR 0001's dated note and archived changes are historical records and stay unchanged.
- No product code, dependency, or runtime behaviour is added. This repository keeps using OpenSpec.
- The verify-before-review order follows governance's lifecycle table; the conflict flow follows it.
- The UI proof of concept is not stored in the repository and is not cited as evidence.

## Checks

In the worktree, Node v24.22.1, npm 12.2.1: `make verify` passed (tests, coverage thresholds, strict OpenSpec validation 19 passed, package verification). After the rebase and the pass-1 fixes: `make verify` passed with 34 tests and 21 strict validations. `npm run openspec -- validate record-product-ui-decisions --strict` passed. A script checked every relative link and every `blob/main` repository link with its anchor in the edited documents: 0 missing files or anchors. The edited documents add no external links.

## Independent review

Assigned reviewer (rotation): Antigravity CLI with Gemini 4 Argon, effort medium, `--mode plan` (read-only); the log shows the model override `Gemini 4 Argon (Medium)` for every request. Before pass 1 a SHA-256 snapshot of the worktree was taken; after it, `git status` showed no modified or untracked file before the rebase. Before and after pass 2 the SHA-256 snapshots were equal.

- **Pass 1 — conversation `4ff76f53-8f0d-4650-8658-41077f77b92d`, on commit `c391b7b`.** Findings: 0 Critical, 0 High, 3 Medium, 4 Low. All accepted and resolved:
  1. Medium: the living `engineering-principles` spec's `## Purpose` still kept OpenSpec mandatory, and archiving does not update it. Edited directly.
  2. Medium: ADR 0008 said both "in the task's worktree" and "each attempt starts from a fresh worktree", and the fresh worktree was not an owner decision. The fresh-worktree wording is removed from the ADR and the spec.
  3. Medium: the `product-ui` spec required first-run setup steps the ADR does not record, omitted resolving the source on merge, delegated spec approval, and the screens. The first-run scenario now only requires guided setup (also stated in the ADR); the other three are added.
  4. Low: the standing-rule requirement's text did not contain the push rule its scenarios test. Added.
  5. Low: architecture section 16 still said Taskelith's repository uses OpenSpec without the default and selection. Updated.
  6. Low: the governance authority sentence covered merging but not pushing. Added.
  7. Low: ADR 0003's status line did not note the amendment. Added.
- **Pass 2 — conversation `b34d0dea-d1fb-40a3-bf10-11118e60894e`, on `f01971a` (base `6df3ce5`).** All seven pass-1 resolutions confirmed. Findings: 0 Critical, 0 High, 0 Medium, 0 Low.

## Remaining gates

None for this documentation change. The decisions are implemented in the gates named in ADR 0008; this change claims no implementation.
