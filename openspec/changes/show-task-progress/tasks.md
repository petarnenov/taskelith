## 1. Change

- [x] 1.1 Create the change `show-task-progress` and save the checklist
- [x] 1.2 Design: stages and evidence, task worktrees, hosts, cache and lock, status line, coordinator questions

## 2. Contract first

- [x] 2.1 Spec delta of `agent-task-protocol`: "Task progress view" added

## 3. Implementation

- [x] 3.1 `scripts/task-progress-stages.ts`: the stage derivation through a reader
- [x] 3.2 `scripts/task-progress-hosts.ts`: the local and SSH readers, the remote script, and the hosts file
- [x] 3.3 `scripts/task-progress.ts`: the view, the cache, and the commands; `scripts/task-progress-lock.ts`: the owner-checked lock
- [x] 3.4 `Makefile`: `make progress` and `make progress-refresh`
- [x] 3.5 `test/task-progress.test.ts` and `test/task-progress-lock.test.ts`: every stage from fixture repositories, the Low-only stop, the SSH fallback, an unreachable host, the cache, the best-effort lock, and overlapping cache writers
- [x] 3.6 Status line outside the repository, backed up first and tested with a sample input

## 4. Documentation

- [x] 4.1 `docs/agent-task-protocol.md`: "Task progress"

## 5. Verification

- [x] 5.1 `route.json` from `make findings ARGS="route --change show-task-progress"`, committed unedited
- [x] 5.2 `npm run openspec -- validate show-task-progress --strict` and `make verify`
- [x] 5.3 Record `verification.md`

## 6. Review and archive

- [ ] 6.1 Independent review passes, assigned by the coordinator
- [ ] 6.2 Archive the change
