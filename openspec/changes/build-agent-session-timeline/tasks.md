## 1. Change

- [x] 1.1 Rename the branch and worktree, drop the untracked `build-agent-session-screen` change, create the change, save the brief's `checklist.json` (`--size M`), and add the empty `findings.jsonl` and `passes.jsonl`

## 2. Tests and implementation

- [x] 2.1 `listAgentSessions`, `readAgentSession`, and `listAgentSessionTurns` in the board port and its control-plane adapter, with the body checks and the label records, and the session event types in `openEvents`
- [x] 2.2 The shared live feed extracted from the board feed, the board's tests unmodified and green
- [x] 2.3 Session feed: the last window from `lastTurnPosition`, the stream after the lowest position, earlier windows on demand, and the reconnect rules
- [x] 2.4 Session route and page, the sessions index page, the task detail session links, and the activity indicator from the task detail
- [x] 2.5 Contrast pair of a link on the page
- [x] 2.6 Tests committed before the implementation, with fail-before evidence for the base and targeted mutations

## 3. Records and checks

- [x] 3.1 Write the proposal, the design, the spec delta, this task list, and the README status
- [ ] 3.2 Route the change, run `make verify`, and write `verification.md`

## 4. Review and archive

- [ ] 4.1 Review passes recorded in `passes.jsonl`, `findings.jsonl`, and `verification.md`
- [ ] 4.2 Architect check by the coordinator of any unreviewed fixes
- [ ] 4.3 Archive the change in the last commit of the branch
