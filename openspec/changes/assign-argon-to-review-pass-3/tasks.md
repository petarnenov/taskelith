## 1. Change

- [x] 1.1 Create the change `assign-argon-to-review-pass-3` and save the checklist

## 2. Contract first

- [x] 2.1 Spec delta of `review-process`: "Reviewer assignment" and "Rule routing floor" name argon for pass 3, also of a task that needs network access
- [x] 2.2 `docs/governance.md`: policy version 10, the reviewer assignment, the network task exception, the authorized reviewers, "Review sequence", "Routed effort", and "Tasks during the change to version 10"

## 3. Implementation

- [x] 3.1 Rule version 4 in `scripts/review-route.ts`, versions 1 to 3 kept
- [x] 3.2 `GOVERNANCE_POLICY_VERSION` 10 in `scripts/review-run.ts`
- [x] 3.3 Tests: the version 4 table, the version 3 table kept, and the expectations of the current version

## 4. Documentation

- [x] 4.1 `AGENTS.md`, `docs/agent-task-protocol.md`, and the skills `taskelith-task-protocol` and `taskelith-coordinator`

## 5. Verification

- [ ] 5.1 `npm run openspec -- validate assign-argon-to-review-pass-3 --strict` and `make verify`
- [ ] 5.2 Record `verification.md`

## 6. Review and archive

- [ ] 6.1 No independent review (owner decision, 2026-11-02); architect check by the coordinator
- [ ] 6.2 Archive the change
