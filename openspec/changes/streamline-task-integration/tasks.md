## 1. Delete-only push

- [x] 1.1 Add `isDeleteOnlyPush` and `DELETE_ONLY_PUSH_STATUS` to `scripts/pre-push-checks.ts` and use them in `scripts/check-pre-push.ts`.
- [x] 1.2 Let `.githooks/pre-push` exit 0 without `make verify` for that status.
- [x] 1.3 Add the unit test and the hook test with a fake `make`.

## 2. Archive on the task branch

- [x] 2.1 Update the worker and coordinator steps in `docs/agent-task-protocol.md`, including re-archive and the integration gate record.
- [x] 2.2 Update `.claude/skills/taskelith-task-protocol/SKILL.md`, `AGENTS.md`, `docs/governance.md`, and `docs/releases.md`.
- [x] 2.3 Check that nothing needs an active change at integration.

## 3. Specs, verification, and review

- [x] 3.1 Add the spec deltas for `integration-flow`, `dependency-inventory`, and `agent-task-protocol`.
- [ ] 3.2 Run `make verify` and strict validation, and record them.
- [ ] 3.3 Obtain the independent review and record it.
- [ ] 3.4 Archive this change on its branch under the new worker step 7.
