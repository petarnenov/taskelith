## 1. Owner decision on D15 and ADR 0005 decision 2 (part A)

- [x] 1.1 Save the brief's checklist as `checklist.json` and paste it into `design.md`.
- [x] 1.2 Amend ADR 0005 decision 2 and its status line.
- [x] 1.3 Apply the amendment in the account pool contract section 7.1 and its required tests, and modify "Subscription account slots" of `harness-account-pools` and "Admitted credential deliveries only" of `account-pool-port`.
- [x] 1.4 Record the amendment in D15 of the G3 work plan, add scope notes to items 12, 19, 33, and 35, and add item 45 without planning.
- [x] 1.5 Point the open question of the Claude Code qualification at the decision.

## 2. ADR 0008 editorial note (part B)

- [x] 2.1 Merge `origin/dev` with `align-product-ports-with-g2-lifecycle` (#372) and add the editorial note to ADR 0008 in the terms of its design D1 (design D4).

## 3. Stale rows (part C)

- [x] 3.1 Refresh the Claude Code release in `docs/integration-candidates.md` and the package row of `docs/qualification/claude-code.md` from the npm dist-tags of 2026-10-27.
- [x] 3.2 State the `list` order of `docs/contracts/git-workspace.md` as UTF-16 code unit order.

## 4. Verification and review

- [x] 4.1 Run strict validation of this change and of all changes, `make findings ARGS="validate"`, and `make verify`.
- [x] 4.2 Review pass 1 by reviewer A, recorded in `verification.md`, `passes.jsonl`, and `findings.jsonl`.
- [x] 4.2.1 Fix the pass 1 findings 1 to 8 and defer finding 9.
- [x] 4.3 Review pass 2 by reviewer B, unless pass 1 is Low-only.
- [x] 4.3.1 Fix the six pass 2 Low findings without another review.
- [x] 4.4 Review pass 3 by reviewer A, if pass 2 leaves fixes to confirm: not run, pass 2 was Low-only.

## 5. Archive

- [x] 5.1 Archive the change in the last commit of the branch and record the archive checks.
