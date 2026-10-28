## 1. Change

- [x] 1.1 Create the change `record-the-review-sequence` and save the checklist
- [x] 1.2 Design: the coordinator decisions Q1 to Q6 and the Jev criterion change

## 2. Contract first

- [x] 2.1 Spec delta of `review-process`: rename and modify "Authorized alternating reviewers" and "Conditional third pass", modify the assignment, replacement, cap, route, route effect, and review command requirements, add "Architect check of unreviewed fixes"
- [x] 2.2 `docs/review-findings/route.schema.json`: the rule's pass plans by rule version, version 1 records kept valid
- [x] 2.3 `docs/governance.md`: policy version 8, "Review sequence", "Reviewer assignment", "Routed effort", "Rotation", "Unavailable reviewer", "Architect check of unreviewed fixes", "External facts", and the cap; history rows kept

## 3. Implementation

- [x] 3.1 `scripts/reviewer-invocations.ts`: the key `claude claude-opus-5-5#medium`, `#high` kept
- [x] 3.2 Rule version 2: the three-pass reviewer table with the networked reviewers of passes 1 and 3 and efforts per pass
- [x] 3.3 `make review`: `ROLE` defaults from `PASS`, a given one validated; the route recommendation by pass number
- [x] 3.4 `scripts/review-route-jev.ts`: the criteria and the context of the review sequence; threshold 0.4, shadow only
- [x] 3.5 Tests that fail before the change: the opus key, the version 2 table, the default role, the Jev criteria, and a version 1 record that stays valid

## 4. Documentation

- [x] 4.1 `docs/agent-task-protocol.md`: worker steps 5, 6, and 10, coordinator step 1, the review findings record, and the reviewer invocations
- [x] 4.2 `AGENTS.md` and the skills `taskelith-task-protocol`, `taskelith-worker`, and `taskelith-coordinator`
- [x] 4.3 No stale alternating-reviewer or conditional third pass wording outside history

## 5. Verification

- [x] 5.1 `route.json` from `make findings ARGS="route --change record-the-review-sequence"`, committed unedited
- [x] 5.2 `npm run openspec -- validate record-the-review-sequence --strict` and `make verify`
- [x] 5.3 Record `verification.md`

## 6. Review and archive

- [x] 6.1 Independent review passes of the review sequence, assigned by the coordinator
- [ ] 6.2 Archive the change
