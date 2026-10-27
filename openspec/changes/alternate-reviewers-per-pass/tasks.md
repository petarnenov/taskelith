## 1. Rule text

- [x] 1.1 Replace "One reviewer per task" in `docs/governance.md` with "Two alternating reviewers per task" and the transition rule, bump the policy to version 5, and update "Rotation", "Unavailable reviewer", "External facts", and the "Close" row.
- [x] 1.2 Update `docs/agent-task-protocol.md`: worker steps 5, 6, and 10, coordinator step 1, the unavailable-reviewer paragraph, and the review prompt.
- [x] 1.3 Update the `taskelith-task-protocol`, `taskelith-worker`, and `taskelith-coordinator` skills and the review line of `AGENTS.md`.
- [x] 1.4 Write the `review-process` delta: rename and modify "Authorized single-reviewer review", modify "Unavailable reviewer" and "Rotation order", and add "Changes under the one-reviewer rule".

## 2. Tooling

- [x] 2.1 Check `scripts/findings.ts`, `scripts/review-findings.ts`, `docs/review-findings/finding.schema.json`, and their tests for an assumption of one reviewer per change, and record the result in `design.md`.

## 3. Verify

- [x] 3.1 Create this change's empty `findings.jsonl`.
- [x] 3.2 Run `npm run openspec -- validate alternate-reviewers-per-pass --strict`, `npm run verify:comments`, `npm run findings -- validate`, and an archive of the change in a scratch copy with `validate --all --strict`.
- [ ] 3.3 Run `make verify`.
- [ ] 3.4 Independent review: pass 1 by reviewer A, pass 2 by reviewer B if needed, pass 3 by reviewer A if needed.
