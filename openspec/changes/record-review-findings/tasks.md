## 1. Format

- [x] 1.1 Add `docs/review-findings/finding.schema.json` with bounded strings and no unknown properties.
- [x] 1.2 Add the seeded category vocabulary `docs/review-findings/categories.txt`.

## 2. Script

- [x] 2.1 Add the pure rules in `scripts/review-findings.ts`: vocabulary parsing, line validation with secret-like value rejection, the index, and the checklist.
- [x] 2.2 Add `scripts/findings.ts` with `validate`, `index [--json]`, and `checklist`, and the npm scripts `findings` and `verify:findings`.
- [x] 2.3 Wire `npm run verify:findings` into `make verify`, and add `make findings ARGS=...` as the operation entry.
- [x] 2.4 Test both modules in `test/review-findings.test.ts` and `test/findings.test.ts`.

## 3. Protocol

- [x] 3.1 Update `docs/agent-task-protocol.md`: worker steps 2, 5, and 7, coordinator step 1, and the "Review findings record" section.
- [x] 3.2 Add the record to the review prompt rule in `docs/governance.md`.
- [x] 3.3 Update the `taskelith-task-protocol` skill.
- [x] 3.4 Add the `review-process` and `agent-task-protocol` requirements.
- [x] 3.5 After merging `dev` (`add-fleet-skills`), update the `taskelith-worker` handoff list and the `taskelith-coordinator` brief rule.

## 4. Verify

- [x] 4.1 Create this change's empty `findings.jsonl`.
- [x] 4.2 Run `npm run openspec -- validate record-review-findings --strict` and `make verify`.
- [x] 4.3 Review pass 1 (Codex CLI gpt-6.1-sol): fix its eight findings with regression tests, add `make findings`, and record them in `verification.md` and `findings.jsonl`.
- [ ] 4.4 Review pass 2 confirms the pass 1 fixes.
