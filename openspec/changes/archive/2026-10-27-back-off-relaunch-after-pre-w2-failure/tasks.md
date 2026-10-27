## 1. Contract and specification

- [x] 1.1 Worker journal contract sections 5 and 13: failure before W2
- [x] 1.2 `worker-runtime` delta: requirement "Launch failure before W2"
- [x] 1.3 Scope widened (Niki, 2026-10-27): the failed W2 commit in the contract and the delta

## 2. Tests

- [x] 2.1 An unreadable clock through `run`: event loop turns, back-off spaced, logged; failing before 3.1
- [x] 2.2 Upper bound, recovery, identifier and journal read failures, cancellation during the wait
- [x] 2.3 A failed W2 commit through `run`, a W2 commit that stops the journal, adapter stop reasons; failing before 3.2

## 3. Fix

- [x] 3.1 `Launch` backs off and retries a failure before W2
- [x] 3.2 `Launch` backs off and retries a failed W2 commit that rolled back; `isJournalStop`

## 4. Records

- [x] 4.1 Proposal, design, `verification.md`, empty `findings.jsonl`
- [x] 4.2 `npm run openspec -- validate back-off-relaunch-after-pre-w2-failure --strict`, archive in a scratch copy
- [x] 4.3 `make verify`
- [x] 4.4 Independent review: pass 1, one Low fixed unreviewed (`a6241671`, `d8a3a535`)
- [x] 4.5 Archive under worker step 7
