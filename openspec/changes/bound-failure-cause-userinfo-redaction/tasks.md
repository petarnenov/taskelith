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
- [ ] 4.3 `make verify`
- [ ] 4.4 Independent review
