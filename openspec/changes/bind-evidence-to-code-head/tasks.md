## 1. Contract first

- [x] 1.1 Proposal, design with the naming decision and the review checklist, `checklist.json`
- [x] 1.2 Spec deltas: `sdlc-gates`, `sdlc-workflow-model`, `sdlc-wire-contracts`
- [x] 1.3 SDLC AsyncAPI document 0.4.0 with `CodeHeadIdentity` and the optional `codeHead`; Git workspace contract sections 5 and 14

## 2. SDLC domain and ports

- [x] 2.1 `CodeHeadIdentity`, `CodeObjectId`, `RepositoryId`, and `isSameCodeHead` in the SDLC module; the workspace module's `CodeHeadIdentity` extends them
- [x] 2.2 Head-bound gates and evidence: `codeHead`, `isGateOutdatedByCodeHead`, `markGateStaleByCodeHead`, `reopenGateAtCodeHead`, and the head check of `recordGateEvidence`
- [x] 2.3 A head-bound gate in the gate repository conformance suite
- [x] 2.4 Fail-before tests: a new head makes evidence stale, an artifact edit does not restore an approval, evidence from another head is rejected; the wire test of a head-bound gate

## 3. Records and gates

- [x] 3.1 `npm run openspec -- validate bind-evidence-to-code-head --strict` and the checks without Docker
- [x] 3.2 `make verify`, `make record`, and `make record-check`
- [ ] 3.3 Review passes and their records

## Follow-ups

Not tasks of this change:

- `align-code-head-names`: replace the execution evidence record's `codeRevision` and the integrations merge queue's `CodeHead` with the SDLC `CodeHeadIdentity` (design decision 1 (i), chosen by the coordinator); it must land before G3 item 21.
