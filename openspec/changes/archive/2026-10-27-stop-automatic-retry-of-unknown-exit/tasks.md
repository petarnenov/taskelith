## 1. Analysis

- [x] 1.1 Read supervisor identity contract section 6, the operational targets, and `ExitStatus`
- [x] 1.2 Check every caller of `automaticRetryOf` and each outcome kind and status

## 2. Fix

- [x] 2.1 `observation-consumption` delta: retryable statuses and the unknown exit scenario
- [x] 2.2 `automaticRetryOf` does not retry an exit with an unknown status

## 3. Tests

- [x] 3.1 `an exit with an unknown status gets no automatic retry`, failing before 2.2
- [x] 3.2 Linux CP9 no longer expects defect L1; `make verify-linux-crash-windows` passes

## 4. Records

- [x] 4.1 Proposal, design, `verification.md`, empty `findings.jsonl`
- [x] 4.2 `npm run openspec -- validate stop-automatic-retry-of-unknown-exit --strict` and `make verify`
- [x] 4.3 Independent review pass 1 (3 Low), fixed unreviewed: wording, integration test, follow-up
- [x] 4.4 Archive under worker step 7
