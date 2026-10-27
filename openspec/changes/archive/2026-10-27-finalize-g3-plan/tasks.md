## 1. Plan

- [x] 1.1 Change the status of `docs/g3-plan.md` from draft to final on the G2 closure, keeping the owner-decision history
- [x] 1.2 Correct "Starting point" to G2 as built (ADR 0015 decisions 1 to 4, foundation ledger "G2 status"), with the limits for G3 and the placement changes #344, #348, and #349
- [x] 1.3 Add "G2 closure deferrals" with every ADR 0015 decision 5 entry, its gate, and its G3 item or "Not G3"
- [x] 1.4 Attach the G3 deferrals to items 9, 10, 26, 27, and 35 and to the "Work items" introduction
- [x] 1.5 Add items 43 and 44 and update the dependency and wave tables
- [x] 1.6 Check that item 0 stays first and reflects G2 as built

## 2. Checks

- [x] 2.1 Strict OpenSpec validation, `npm run verify:links`, `npm run verify:findings`, and `verification.md`
- [x] 2.2 `make verify`, run by the worker session
- [x] 2.3 Independent review pass 1 by reviewer A, Claude Code `claude-fable-5-1`
- [x] 2.4 Independent review pass 2 by reviewer B, Codex `gpt-6.1-sol`
- [x] 2.5 Independent review pass 3 by reviewer A, if needed

## 3. Archive

- [x] 3.1 Archive the change in the last commit of the branch
