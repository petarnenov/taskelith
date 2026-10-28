## 1. Change

- [x] 1.1 Create the change `continue-after-context-warning` and save the checklist
- [x] 1.2 Design: where the rule is stated, the worker bullet, the coordinator skill, and the unchanged hook

## 2. Implementation

- [x] 2.1 Spec delta of `agent-task-protocol`: modify "Context size warning"
- [x] 2.2 `docs/agent-task-protocol.md` "Context size": continue without waiting, and the worker keeps its task going
- [x] 2.3 `AGENTS.md`, the `taskelith-task-protocol` skill, and the `taskelith-coordinator` skill: continue without waiting

## 3. Verification

- [x] 3.1 `route.json` from `make findings ARGS="route --change continue-after-context-warning"`, committed unedited
- [x] 3.2 `npm run openspec -- validate continue-after-context-warning --strict` and `make verify`
- [x] 3.3 Record `verification.md`

## 4. Review and archive

- [ ] 4.1 Independent review passes, assigned by the coordinator
- [ ] 4.2 Archive the change
