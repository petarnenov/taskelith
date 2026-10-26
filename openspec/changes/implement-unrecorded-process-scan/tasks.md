## 1. Contract and journal

- [x] 1.1 docs/contracts/worker-journal.md section 6 and docs/contracts/execution-wire-contracts.md section 5: identity of `execution.unrecorded-process`
- [x] 1.2 `@taskelith/execution`: the `unrecorded-process` fact and `recordUnrecordedProcess`
- [x] 1.3 `@taskelith/worker-journal`: identity rule; no new entry while one with the same identity waits
- [x] 1.4 Journal tests

## 2. Scan

- [x] 2.1 `@taskelith/worker-supervisor`: `LinuxContainmentScan`, `LinuxProcessInspector.entry`, tests with a fake cgroup tree and `/proc`
- [x] 2.2 `apps/worker`: `ContainmentScan` port, Linux adapter, none on macOS
- [x] 2.3 Orchestrator: scan once after the record listing; leftovers unchanged
- [x] 2.4 Launch host wiring in `main.ts` and `worker-start.ts`
- [x] 2.5 Wire mapping with the AsyncAPI schema check
- [x] 2.6 Tests: the observation, one identity per journal incarnation, leftovers unchanged, failures, no scan on macOS

## 3. Records and checks

- [x] 3.1 proposal.md, design.md, spec delta (worker-journal)
- [x] 3.2 `npm run openspec -- validate implement-unrecorded-process-scan --strict`
- [x] 3.3 `make verify`
- [x] 3.4 Independent review pass 1 (Claude Code Fable); findings M1 and L1 to L6 fixed
- [ ] 3.5 verification.md review passes and handoff
