## 1. Analysis

- [x] 1.1 Measure the rule on pathological runs and confirm the redaction runs before any cut

## 2. Tests

- [x] 2.1 `a long run without a user-information end is redacted in linear time`, failing on the base code
- [x] 2.2 `user information is redacted after leading colons, at any length, and after another`

## 3. Fix

- [x] 3.1 Anchor the rule at the start of a run of user-information characters
- [x] 3.2 Compare the old and new rule on random strings
- [x] 3.3 `worker-runtime` delta: the scenario "Pathological cause message"

## 4. Records

- [x] 4.1 Proposal, design, `verification.md`, empty `findings.jsonl`
- [x] 4.2 `npm run openspec -- validate bound-failure-cause-userinfo-redaction --strict` and a scratch archive
- [x] 4.3 `make verify` on `071822b` before review pass 1
- [x] 4.4 Review pass 1 (Codex gpt-6.1-sol): 0 Critical, 0 High, 2 Medium, 1 Low, all fixed

## 5. Review pass 1 fixes

- [x] 5.1 `a long run without a URL or JWT end is redacted in linear time`, failing before the fix, and `a URL and a JWT are redacted after a prefix of their run, which is kept`
- [x] 5.2 Anchor the URL and JWT rules at the start of a run, compared exhaustively and randomly with the old rules
- [x] 5.3 Measure every failure-cause rule and the logger's `redactText` on pathological runs
- [x] 5.4 Scenario, proposal, design, `verification.md`, and `findings.jsonl` for pass 1
- [ ] 5.5 `make verify` after the fixes
- [ ] 5.6 Review pass 2, because pass 1 had Medium findings
