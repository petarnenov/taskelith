## 1. Change

- [x] 1.1 Create the change, save the brief's `checklist.json` (`--size M`), and add the empty `findings.jsonl` and `passes.jsonl`

## 2. Tests and implementation

- [x] 2.1 The CSRF token getter of the session gateway, wired into the board gateway in `main.tsx`, and `Session.refresh`
- [x] 2.2 `submitTurn` in the board port, its control-plane adapter with the body check and the answer mapping, and the expiry routing of `BoardServices`
- [x] 2.3 The turn record store over `sessionStorage` with its in-memory fallback, cleared with the shell's session
- [x] 2.4 The composer model, hook, and sticky component with every submission state, the blocks, the length check, and the turn shown at once
- [x] 2.5 Tests committed before the implementation, with fail-before evidence for the base and targeted mutations

## 3. Records and checks

- [x] 3.1 Write the proposal, the design, the spec delta, this task list, and the README status
- [x] 3.2 Route the change, run `make verify`, and write `verification.md`

## 4. Review and archive

- [ ] 4.1 Review passes recorded in `passes.jsonl`, `findings.jsonl`, and `verification.md`
- [ ] 4.2 Architect check by the coordinator of any unreviewed fixes
- [ ] 4.3 Archive the change in the last commit of the branch
