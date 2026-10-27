## 1. Inspect

- [x] 1.1 Decide whether slot selection (G3 item 12) exists in code, with file and line evidence in `design.md`

## 2. Contracts

- [x] 2.1 Account pool contract: rule 3 serializable slot changes, section 3.2 own concurrency limit, sections 4.1, 4.2, and 4.6 pointers, new section 4.7, and the section 9 placement test
- [x] 2.2 Capacity reservation contract: the writers lists of sections 4 and 13, and section 13 "Provider credentials"
- [x] 2.3 Spec delta `account-pool-port`: three added requirements and the modified "Deterministic least-loaded order"

## 3. Checks

- [x] 3.1 Strict OpenSpec validation of the change, `npm run verify:links`, `npm run verify:comments`, and `make findings ARGS="validate"`
- [x] 3.2 `make verify` before the first review pass
- [x] 3.3 Independent review pass 1 by reviewer A, Codex CLI `gpt-6.1-sol` (effort `medium`); its Low-only result ends the review
- [x] 3.4 Restore the active change after the return, merge `origin/dev` at `99333004`, and reconcile the contract and the delta with #366
- [ ] 3.5 Reviewer A reviews the resolved diff and the reconciliation

## 4. Archive

- [ ] 4.1 Archive the change in the last commit of the branch
