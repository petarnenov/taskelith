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

- [ ] 3.1 Route the change, run `make verify`, `make record`, and write `verification.md`

## 4. Live run (later phase, after the owner's setup)

- [ ] 4.1 The live run against GitHub.com, its evidence, and the confirmed status codes
- [ ] 4.2 The long run
- [ ] 4.3 The Octokit promotion in the dependency register

## 5. Review and archive

- [ ] 5.1 Review passes in order until one reports only Low findings or none, at most three
- [ ] 5.2 Merge `origin/dev` right before the archive, and archive the change in the last commit of the branch
