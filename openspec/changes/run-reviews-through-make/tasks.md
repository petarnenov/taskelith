## 1. Contract and spec

- [x] 1.1 Save the brief's checklist as `checklist.json`; add the `review-process` requirements "Review command", "Review route gate", and "Reviewer environment"; validate the change strictly.

## 2. Tests first

- [x] 2.1 `test/reviewer-invocations.test.ts`: the command table per reviewer key, the environment allowlist, and the session and model read from captured outputs.
- [x] 2.2 `test/review-run.test.ts`: the route gate (missing route, stale route, no stamp, dirty tree, routing on a stamped tree, failed route), a planted secret absent in the stub reviewer, the pass line, a repeated pass, failed attempts, the arguments, and `make review` passing them unexpanded.

## 3. Implementation

- [x] 3.1 `scripts/reviewer-invocations.ts` and `scripts/review-run.ts`.
- [x] 3.2 The `make review` target.

## 4. Documents

- [x] 4.1 `docs/agent-task-protocol.md` worker step 5 and "Reviewer invocations"; the skills `taskelith-task-protocol` and `taskelith-worker`.

## 5. Checks and review

- [x] 5.1 `make verify`, `make record`, and `make record-check`.
- [ ] 5.2 Review pass 1 by reviewer A, then the further passes that governance requires.
