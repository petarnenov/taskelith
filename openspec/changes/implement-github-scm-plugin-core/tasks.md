## 1. Change

- [x] 1.1 Create the change, save the brief's `checklist.json`, and add the empty `findings.jsonl` and `passes.jsonl`
- [x] 1.2 Write the proposal, the design, the `scm-port`, `plugin-registration`, `execution-observability`, and `installation-enrollment` deltas, and this task list

## 2. Implementation and tests

- [x] 2.1 Plugin API `0.3.0`, the `draft` namespace, the OpenSpec manifest range, and the bundled-manifest test
- [x] 2.2 The Basic credential rule with tests in `@taskelith/observability` and `@taskelith/secrets`, failing before the rule
- [x] 2.3 The conformance probes of missing credentials with the fake's defects, failing before the probes
- [x] 2.4 The `@taskelith/scm-github` package with the Octokit set, its emulated GitHub, the conformance run, and unit tests
- [x] 2.5 The dependency register, section 6 of the G3 dependency evaluation, the inventory, and the contracts

## 3. Records and checks

- [x] 3.1 Route the change, run `make verify`, `make record`, and write `verification.md`

## 4. Review and archive

- [ ] 4.1 Review passes in order until one reports only Low findings or none, at most three, each recorded in `passes.jsonl`, `findings.jsonl`, and `verification.md`
- [ ] 4.2 Merge `origin/dev` right before the archive, and archive the change in the last commit of the branch
