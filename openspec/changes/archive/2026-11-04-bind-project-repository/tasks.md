## 1. Change

- [x] 1.1 Create the change, save the brief's `checklist.json`, and add the empty `findings.jsonl` and `passes.jsonl`
- [x] 1.2 Write the proposal, the design with the coordinator decisions, the `control-plane-api`, `control-plane-wire-contracts`, `scm-port`, and `postgres-state` deltas, and this task list

## 2. Implementation and tests

- [x] 2.1 The contract break: `RepositoryBindingInput` without `remoteUrl`, `RemoteUrlCandidate` removed, the `BindingRefusal` reasons, version 0.5.0, the `breaking-changes.json` entry, and the regenerated web client, with contract tests failing before it
- [x] 2.2 The module's `RepositoryBinding`, `RepositoryBindings` port with its conformance suite, `nextBinding`, the in-memory store, and `RepositoryBindingService`, with tests failing before them
- [x] 2.3 Migration `1792934300000_project-repository-bindings` and the PostgreSQL store, with migration, conformance, and stale resolution tests failing before them
- [x] 2.4 The two routes, their handlers, and the composition, with HTTP tests of every role refusal and resolver mapping failing before them
- [x] 2.5 Control-plane wire contracts sections 4, 4.1, 11, and 12, and the source control contract section 4.1

## 3. Records and checks

- [x] 3.1 Route the change, run `make verify`, `make record`, and write `verification.md`

## 4. Review and archive

- [x] 4.1 Review passes in order until one reports only Low findings or none, at most three, each recorded in `passes.jsonl`, `findings.jsonl`, and `verification.md`
- [x] 4.2 Archive the change in the last commit of the branch
