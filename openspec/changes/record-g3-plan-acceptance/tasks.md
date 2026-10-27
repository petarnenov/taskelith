## 1. Plan

- [x] 1.1 Record in the status of `docs/g3-plan.md`, right after the finalization sentence, that the owner accepted the plan through the away delegate on 2026-10-27

## 2. Checks

- [x] 2.1 Strict OpenSpec validation, `npm run verify:links`, `make findings ARGS="validate"`, `npm run verify:comments`, and `verification.md`
- [ ] 2.2 `make verify`, run by the worker session
- [ ] 2.3 Independent review pass 1 by reviewer A, OpenCode CLI `opencode-go/qwen3.8-max#medium`; a Low-only pass ends the review

## 3. Archive

- [ ] 3.1 Archive the change in the last commit of the branch
