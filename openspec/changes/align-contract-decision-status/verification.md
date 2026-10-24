# Verification: align-contract-decision-status

Date: 2026-10-24.

## Scope and source

The owner explicitly asked for this correction on 2026-10-24, after a peer session (Desi) reported that `docs/contract-tooling.md` and the "Contract tooling" section of `docs/dependencies.md` still described D2 and D3 as open. Base revision: `2890be6` on `dev`. Scope: those two documents and this change. Prepared in a git worktree. The change has no spec delta (`skip_specs: true`): it brings the records in line with the decisions already recorded in `docs/g1-plan.md` under the existing `contract-tooling` and `dependency-register` requirements.

## Author self-check before review

- Searched `docs/` for D2 and D3: the only passages that presented them as open were the five edited in `docs/contract-tooling.md` (status paragraph, section 8 "Owner action" row, remaining-work bullet) and `docs/dependencies.md` (section introduction and the four code-first rows). The "(D3 b only)" role labels stay, because they describe what each tool serves.
- No register status changed: the code-first rows stay `candidate` and are marked not to be installed.
- The evaluation keeps its original date and says that the decisions came after it.
- Evidence check: the change adds one internal link, `g1-plan.md#owner-decisions`, to an existing heading, and no external link.

## Checks

Node v24.22.1, npm 12.2.1, in the worktree: `make verify` passed (tests with coverage, boundary and coverage-scope checks, dependency inventory, strict OpenSpec validation 27 passed, package verification), and again after the pass-1 fixes.

## Independent review

Assigned reviewer (rotation): Codex with `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> -`. The prompt named AGENTS.md, the review process, the register's status rules, and consistency with the G1 plan and both specs as criteria. SHA-256 snapshots of the files in `git ls-files -co --exclude-standard` before and after each pass were equal.

- **Pass 1 — session `01a16f67-eddf-7a62-9b2e-a1d2b47de878`.** The reviewer confirmed that D2 (b) and D3 (a) match the plan, that no passage in `docs/` still presents them as open, and that no register status changed. Findings: 0 Critical, 0 High, 1 Medium, 1 Low. Both accepted and resolved:
  1. Medium: this `verification.md` was missing. Added.
  2. Low: the proposal quoted the owner's Bulgarian words, against the English-only rule for repository content. Replaced with an English statement.
