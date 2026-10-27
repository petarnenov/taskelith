## 1. Records

- [x] 1.1 Add `docs/review-findings/pass.schema.json` and the finding schema's `missedBy` and `$defs/role`.
- [x] 1.2 Add `scripts/review-passes.ts`: summary parsing with the finding line checks, and the consistency checks against `findings.jsonl`.
- [x] 1.3 Check in `scripts/review-findings.ts` that a `missedBy` pass is earlier than the finding's pass.
- [x] 1.4 Load and validate `passes.jsonl` in `scripts/findings.ts`, required in active changes only.

## 2. Statistics

- [x] 2.1 Add `scripts/reviewer-statistics.ts` and the `reviewers [--json]` command, with derived passes for archived changes without `passes.jsonl`.

## 3. Tests

- [x] 3.1 Add tests for summary validation, `missedBy`, the consistency checks, and the `reviewers` command, including an archived change without summaries and `--json`, and check that they fail on the base code.

## 4. Documentation

- [x] 4.1 Update `docs/agent-task-protocol.md` worker steps 2, 5, 6, and 7 and "Review findings record", the governance sentence on the role records, and the `taskelith-task-protocol` and `taskelith-worker` skills.
- [x] 4.2 Write the `review-process` and `agent-task-protocol` deltas.

## 5. Verify

- [x] 5.1 Create this change's empty `findings.jsonl` and `passes.jsonl`.
- [x] 5.2 Run `npm run openspec -- validate review-pass-statistics --strict` and `make verify`.
- [ ] 5.3 Independent review: pass 1 by reviewer A, pass 2 by reviewer B if needed, pass 3 by reviewer A if needed.
