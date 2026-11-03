## 1. Change

- [x] 1.1 Create the change, save the brief's `checklist.json`, and add the empty `findings.jsonl` and `passes.jsonl`
- [x] 1.2 Write the proposal, the design, the `scm-qualification` delta, and this task list

## 2. Implementation and tests

- [x] 2.1 The environment check and the repository allowlist guard, with tests
- [x] 2.2 The native client and the live fixture
- [x] 2.3 The cleanup with its planning tests, and the `--cleanup-only` mode
- [x] 2.4 The redaction and scan of the evidence, with synthetic secrets
- [x] 2.5 The opt-in long-run case, tested over the emulated GitHub
- [x] 2.6 The `conformance-github` target and the docs

## 3. Records and checks

- [x] 3.1 Route the change, run `make verify`, `make record`, and write `verification.md`

## 4. Live run (later phase, after the owner's setup)

- [x] 4.1 The live run against GitHub.com, its evidence, and the confirmed status codes
- [x] 4.2 Fix live-run finding 1: narrow the plugin's own tokens to the route's repository
- [x] 4.3 Fix live-run finding 2 by the coordinator's option B: the propagation window in the contract, the `scm-port` delta, the suite, and the long run, with fail-before tests
- [x] 4.4 The long run
- [x] 4.5 The Octokit evidence in the dependency register; the rows stay `candidate` (coordinator decision of the pass 1 fix round)
- [x] 4.6 Rebase onto `dev` `d0d59478`, run again, route, verify, and record

## 5. Review pass 1 fix round

- [x] 5.1 Fix the 14 findings of pass 1, each behavior change with a test that failed before the fix
- [x] 5.2 Apply the coordinator's decisions: port version `0.3.0`, the Octokit rows `candidate`, the paginating root development dependencies, the qualification items, and the probe wording
- [ ] 5.3 A live run, a cleanup-only run, and a new long run after the fixes, with their evidence
- [ ] 5.4 Record the findings, route if required, verify, and record

## 6. Review and archive

- [ ] 6.1 Review passes in order until one reports only Low findings or none, at most three
- [ ] 6.2 Merge `origin/dev` right before the archive, and archive the change in the last commit of the branch
