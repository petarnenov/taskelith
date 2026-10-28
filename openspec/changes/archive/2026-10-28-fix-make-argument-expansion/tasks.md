## 1. Change

- [x] 1.1 Create the change with proposal, design, the `agent-task-protocol` spec delta, the brief's checklist, and empty `findings.jsonl` and `passes.jsonl`

## 2. Implementation

- [x] 2.1 Find the mechanism: GNU Make 4.4 exports, and so expands, the arguments for the parse-time `$(shell)` calls that run before the `unexport` line
- [x] 2.2 Move the `unexport` line before the first `$(shell)` call of the `Makefile`
- [x] 2.3 Run the two "as typed" tests under every GNU make on `PATH` (`test/gnu-makes.ts`), failing before the fix under GNU Make 4.4

## 3. Evidence

- [x] 3.1 Fail-before and pass-after under GNU Make 3.81 and 4.4.1, and the Linux repro in `debian:trixie-slim`
- [x] 3.2 `make verify` on the clean committed tree, `make record`, and `make record-check`: passed on the final clean tree after the review fixes

## 4. Review and archive

- [x] 4.1 Review pass 1 (reviewer A) and its fixes: no findings
- [x] 4.2 Review pass 2 (reviewer B) and its fixes: 2 Medium and 3 Low, all fixed
- [x] 4.3 Review pass 3 (reviewer A) and its fix: 1 Medium, fixed without review
- [x] 4.4 Archive the change
