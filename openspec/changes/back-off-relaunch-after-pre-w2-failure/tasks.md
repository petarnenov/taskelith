## 1. Contract and specification

- [x] 1.1 Worker journal contract sections 5 and 13: failure before W2
- [x] 1.2 `worker-runtime` delta: requirement "Launch failure before W2"

## 2. Tests

- [x] 2.1 An unreadable clock through `run`: event loop turns, back-off spaced, logged; failing before 3.1
- [x] 2.2 Upper bound, recovery, identifier and journal read failures, cancellation during the wait

## 3. Fix

- [x] 3.1 `Launch` backs off and retries a failure before W2

## 4. Records

- [ ] 4.1 Proposal, design, `verification.md`, empty `findings.jsonl`
- [ ] 4.2 `npm run openspec -- validate back-off-relaunch-after-pre-w2-failure --strict`, archive in a scratch copy
- [ ] 4.3 `make verify`
- [ ] 4.4 Independent review
- [ ] 4.5 Archive under worker step 7
