## 1. Capability rule

- [x] 1.1 Write the tests for the capability rule and run them on the current code (they fail).
- [x] 1.2 Require an existing capability for active code and doc findings in `scripts/review-findings.ts`, with the `openspec/specs` directories listed by `scripts/findings.ts` for active changes only.

## 2. Record quality

- [x] 2.1 Write the tests for record findings and the record quality section and run them on the current code (they fail).
- [x] 2.2 Add `isRecordFinding`, `recordChecklist`, and `formatRecordChecklist`, and print the section after every checklist.

## 3. Documentation

- [x] 3.1 Update `docs/agent-task-protocol.md` "Review findings record" and the capability description of `docs/review-findings/finding.schema.json`.
- [x] 3.2 Update the `taskelith-task-protocol`, `taskelith-worker`, and `taskelith-coordinator` skills.
- [x] 3.3 Modify the `review-process` requirements "Review findings record" and "Findings index and checklist".

## 4. Verify

- [x] 4.1 Create this change's empty `findings.jsonl`.
- [x] 4.2 Run the findings tests with coverage, `npm run findings -- validate`, the checklist, `npm run verify:comments`, `npm run openspec -- validate require-finding-capability --strict`, and the archive in a scratch copy.
- [x] 4.3 Run `make verify`.
- [x] 4.4 Independent review.
