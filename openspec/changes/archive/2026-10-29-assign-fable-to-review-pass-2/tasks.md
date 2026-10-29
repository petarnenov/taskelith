## 1. Change

- [x] 1.1 Create the change `assign-fable-to-review-pass-2` and save the checklist

## 2. Contract first

- [x] 2.1 Spec delta of `review-process`: "Reviewer assignment" and "Rule routing floor" name fable for pass 2 and opus for pass 2 of a task that needs network access
- [x] 2.2 `docs/governance.md`: policy version 9, the reviewer assignment, the authorized reviewers, "Routed effort", and "Tasks during the change to version 9"

## 3. Implementation

- [x] 3.1 Rule version 3 in `scripts/review-route.ts`, versions 1 and 2 kept
- [x] 3.2 `GOVERNANCE_POLICY_VERSION` 9 in `scripts/review-run.ts`
- [x] 3.3 Tests: the version 3 table, the version 2 table kept, and the expectations of the current version

## 4. Documentation

- [x] 4.1 `AGENTS.md`, `docs/agent-task-protocol.md`, and the skills `taskelith-task-protocol` and `taskelith-coordinator`

## 5. Verification

- [x] 5.1 `npm run openspec -- validate assign-fable-to-review-pass-2 --strict` and `make verify`
- [x] 5.2 Record `verification.md`

## 6. Review and archive

- [x] 6.1 No independent review (owner decision, 2026-10-29); architect check by the coordinator
- [x] 6.2 Archive the change
