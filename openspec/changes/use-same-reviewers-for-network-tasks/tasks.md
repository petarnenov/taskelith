## 1. Change

- [x] 1.1 Create the change `use-same-reviewers-for-network-tasks` and save the checklist

## 2. Contract first

- [x] 2.1 Spec delta of `review-process`: "Authorized review sequence", "Reviewer assignment", and "Rule routing floor" give a change with external facts the reviewers of every change
- [x] 2.2 `docs/governance.md`: policy version 11, the reviewer assignment, the network task paragraph, "External facts", the authorized reviewers, and "Tasks during the change to version 11"

## 3. Implementation

- [x] 3.1 Rule version 5 in `scripts/review-route.ts`, versions 1 to 4 kept
- [x] 3.2 `GOVERNANCE_POLICY_VERSION` 11 in `scripts/review-run.ts`
- [x] 3.3 Tests: the version 5 table for a networked change, the version 4 table kept, and the expectations of the current version

## 4. Documentation

- [x] 4.1 `AGENTS.md`, `docs/agent-task-protocol.md` (also the expired reviewer pauses), and the skills `taskelith-task-protocol` and `taskelith-coordinator`

## 5. Verification

- [x] 5.1 `npm run openspec -- validate use-same-reviewers-for-network-tasks --strict` and `make verify`
- [x] 5.2 Record `verification.md`

## 6. Review and archive

- [ ] 6.1 No independent review (owner decision, 2026-11-02); architect check by the coordinator
- [ ] 6.2 Archive the change
