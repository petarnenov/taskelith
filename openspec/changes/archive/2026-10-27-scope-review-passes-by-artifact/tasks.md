## 1. Records and tooling

- [x] 1.1 Add the optional `artifact` property to the finding and pass schemas.
- [x] 1.2 Key duplicate summaries, the finding-to-summary match, the counts, and `missedBy` by artifact and pass in `scripts/review-passes.ts`, naming the artifact in messages.
- [x] 1.3 Attribute passes and misses per artifact and pass in `scripts/reviewer-statistics.ts`, also for passes derived from findings.

## 2. Tests

- [x] 2.1 Schema acceptance and rejection of `artifact`; uniqueness per artifact and pass; consistency, counts, and `missedBy` per artifact; the `validate` command over a multi-artifact change.
- [x] 2.2 Reviewer statistics across artifacts, summarized and derived.

## 3. Documentation and spec

- [x] 3.1 Describe the optional key in `docs/agent-task-protocol.md`, "Review findings record".
- [x] 3.2 Modify the `review-process` requirements "Review pass summaries", "Pass summary consistency", "Missed finding attribution", and "Reviewer statistics"; validate strictly, also after an archive in a scratch copy.

## 4. Verify

- [x] 4.1 Run `npm run openspec -- validate scope-review-passes-by-artifact --strict`, the findings tests with coverage, `npm run verify:comments`, `npm run verify:findings`, and `npm run verify:links`, and record them in `verification.md`.
- [x] 4.2 Run `make verify` and record it in `verification.md` (on `c474a3a3`, before pass 1).
- [x] 4.3 Review pass 1 by reviewer A, Codex CLI, model `gpt-6.1-sol`.
- [x] 4.4 Review pass 2 by reviewer B, OpenCode CLI, model `opencode-go/qwen3.8-max#medium` (not run: pass 1 was Low-only).
- [x] 4.5 Review pass 3 by reviewer A, if pass 2 has findings above Low (not run: pass 1 was Low-only).
- [x] 4.6 Run `make verify` after the pass 1 fix and record it in `verification.md`.
