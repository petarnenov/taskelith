## 1. Change

- [x] 1.1 Create the change, save the brief's `checklist.json`, and add the empty `findings.jsonl` and `passes.jsonl`
- [x] 1.2 Write the proposal, the design, the `scm-port` delta, and this task list

## 2. Implementation and tests

- [x] 2.1 Port `0.2.0`: `RunCredential.version` and `authorization`, `confirmRunCredentialAdoption`, `RepositoryRemoteResolver.resolveRemoteUrl`, and their exports on the port entry
- [x] 2.2 `WorkspaceCredential` as a `Pick` of `RunCredential`, with a compile-time test that a run credential serves as one
- [x] 2.3 The conformance suite: the refreshed, adopted, revoked, isolation, and repository remote cases, the readers of `version`, `authorization`, and the remote URL, and the fixture's `projectRemoteUrl` and code access through `authorization`
- [x] 2.4 The in-memory SCM on the revised port with a defect per new guarantee, each test failing first against a mutant of the suite
- [x] 2.5 The source control contract: sections 1, 2 (rule 7), 3, 4.1, 7, 8, and 9

## 3. Records and checks

- [ ] 3.1 Route the change, run `make verify`, `make record`, and write `verification.md`

## 4. Review and archive

- [ ] 4.1 Review passes in order until one reports only Low findings or none, at most three, each recorded in `passes.jsonl`, `findings.jsonl`, and `verification.md`
- [ ] 4.2 Merge `origin/dev` right before the archive, and archive the change in the last commit of the branch
