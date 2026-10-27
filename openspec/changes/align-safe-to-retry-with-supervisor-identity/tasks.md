## 1. Analysis

- [x] 1.1 Read supervisor identity contract section 6 and capacity reservation contract sections 5, 11, and 13
- [x] 1.2 Check every document, spec, and caller that states or relies on the retry allowance

## 2. Fix

- [x] 2.1 Capacity reservation contract section 13: an unknown exit is uncertain
- [x] 2.2 `resource-admission` delta: requirement "Quotas and budgets" and its unknown exit scenario
- [x] 2.3 `isSafeToRetry` uses `isCertainEnd`, sharing `classifyExit` with `automaticRetryOf`

## 3. Tests

- [x] 3.1 `a retry after a proven exit with an unknown status is uncertain`, failing before 2.3

## 4. Records

- [x] 4.1 Proposal, design, `verification.md`, empty `findings.jsonl`
- [x] 4.2 `npm run openspec -- validate align-safe-to-retry-with-supervisor-identity --strict` and `make verify`
- [x] 4.3 Independent review pass 1 (4 Low), fixed unreviewed: two renames, a comment, spec wording
- [ ] 4.4 Archive under worker step 7
