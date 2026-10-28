## 1. Change

- [x] 1.1 Create the change with empty `findings.jsonl` and `passes.jsonl`, save the brief's checklist as `checklist.json`, and summarize it in `design.md`

## 2. Contract

- [x] 2.1 Extend `execution.asyncapi.json` to 0.8.0 with the protocol version 2 session commands, notice, and observations
- [x] 2.2 Add `terminal.asyncapi.json` 0.1.0 with the browser terminal and worker relay frames, and register it with the generator
- [x] 2.3 Add `openTerminal` to `control-plane.openapi.json` 0.3.0 and `openWorkerRelay` to `execution.openapi.json` 0.7.0
- [x] 2.4 Export `SESSION_PROTOCOL_VERSION` and declare the computed breaking changes in `packages/contracts/breaking-changes.json`
- [x] 2.5 Write `docs/contracts/worker-messages-and-terminal.md`, link it from the wire contract pages, and fix the refreshed credential wording in the G3 plan row 9 and the source control contract
- [x] 2.6 Write the `execution-wire-contracts`, `control-plane-wire-contracts`, and `scm-port` spec deltas

## 3. Tests

- [x] 3.1 Add `worker-session-messages.test.ts` and `terminal-contracts.test.ts`, with their fail-before, and update the document versions and shared names in the existing tests

## 4. Verification and review

- [ ] 4.1 Route the change, run `make verify`, and record `verification.md` with `make record` and `make record-check`
- [ ] 4.2 Review pass 1 by reviewer A
- [ ] 4.3 Review pass 2 by reviewer B, unless pass 1 is Low-only
- [ ] 4.4 Review pass 3 by reviewer A, if governance "Conditional third pass" requires it

## 5. Archive

- [ ] 5.1 Archive the change in the last commit of the branch and record the archive checks
