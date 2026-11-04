## 1. Change

- [x] 1.1 Create the change, save the brief's `checklist.json` (`--size M`), and add the empty `findings.jsonl` and `passes.jsonl`

## 2. Tests and implementation

- [x] 2.1 The `WorkersGateway` port, its control-plane adapter with the body check, and the shared read failures and expiry wrapper
- [x] 2.2 The workers screen at `/workers` with the installation-owner gate, the self-check results, `asOf` and Refresh, the empty state, and the failed states
- [x] 2.3 The contrast pair of a failed self-check on a card and the redaction test
- [x] 2.4 Tests committed before the implementation, with fail-before evidence for the base and targeted mutations

## 3. Records and checks

- [x] 3.1 Write the proposal, the design, the spec delta, this task list, and the README status
- [ ] 3.2 Route the change, run `make verify`, and write `verification.md`

## 4. Review and archive

- [ ] 4.1 Review passes recorded in `passes.jsonl`, `findings.jsonl`, and `verification.md`
- [ ] 4.2 Architect check by the coordinator of any unreviewed fixes
- [ ] 4.3 Archive the change in the last commit of the branch
