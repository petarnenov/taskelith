## 1. Change

- [x] 1.1 Create the change, save the brief's `checklist.json` (`--size M`), and add the empty `findings.jsonl` and `passes.jsonl`

## 2. Tests and implementation

- [x] 2.1 The four token operations of the `WorkersGateway` port, their adapter with the body checks and the CSRF getter, and `readPages` lifted to `api/`
- [x] 2.2 The enrollment tokens section of `/workers`: the list of every page with the truncation note, the issue form, the confirmations, the status region, and the link of the workers' empty state
- [x] 2.3 The one-time reveal with its copy, its close step, and the redaction tests of every close path
- [x] 2.4 Tests committed before the implementation, with fail-before evidence for the base and targeted mutations

## 3. Records and checks

- [x] 3.1 Write the proposal, the design, the spec delta, this task list, and the README status
- [ ] 3.2 Route the change, run `make verify`, and write `verification.md`

## 4. Review and archive

- [ ] 4.1 Review passes recorded in `passes.jsonl`, `findings.jsonl`, and `verification.md`
- [ ] 4.2 Architect check by the coordinator of any unreviewed fixes
- [ ] 4.3 Archive the change in the last commit of the branch
