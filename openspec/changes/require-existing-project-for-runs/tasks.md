## 1. Change

- [x] 1.1 Create the change, save the brief's `checklist.json`, and add the empty `findings.jsonl` and `passes.jsonl`
- [x] 1.2 Write the proposal, the design with the coordinator decisions, the five deltas, and this task list

## 2. Implementation and tests

- [x] 2.1 The declarations schema's `behaviorChanges`, with a test failing before it
- [x] 2.2 The contract: `sdlc.openapi.json` 0.5.0 with the `createRun` 404, `execution.openapi.json` 0.10.0, the 403 descriptions without the bridge, and the `breaking-changes.json` entry, with contract tests failing before it
- [x] 2.3 The bridge removed from `@taskelith/access`, with a test failing before it
- [x] 2.4 The roles and refusals of the four run operations: the access rules, `ControlPlaneApi`, and the routes' 403 and 404, with tests failing before them
- [x] 2.5 `ProjectDirectory` in `RunService`, its composition, and the shared fixture, with tests failing before them
- [x] 2.6 The smoke, the scenario tool, `installation.sh`, the G2 scenario installations, and the integration tests on a project with an owner role
- [x] 2.7 Control-plane wire contracts section 2 and execution wire contracts section 7

## 3. Records and checks

- [ ] 3.1 Route the change, run `make verify`, `make record`, the installation smoke, and write `verification.md`

## 4. Review and archive

- [ ] 4.1 Review passes in order until one reports only Low findings or none, at most three, each recorded in `passes.jsonl`, `findings.jsonl`, and `verification.md`
- [ ] 4.2 Archive the change in the last commit of the branch
