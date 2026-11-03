## 1. Change

- [x] 1.1 Create the change, save the brief's `checklist.json`, and add the empty `findings.jsonl` and `passes.jsonl`
- [x] 1.2 Write the proposal, the design with the fetched format evidence, the `execution-observability` and `scm-port` deltas, and this task list

## 2. Implementation and tests

- [x] 2.1 Tests in `@taskelith/observability` and `@taskelith/secrets` for stateful and stateless tokens, text glued after punctuation, near misses, a token inside a longer word or after a serialized escape, and linear time, failing before the rule
- [x] 2.2 `redactGithubInstallationTokens` in `TOKEN_SHAPE_RULES`, before the JWT rule
- [x] 2.3 The source control contract, section 3, and the installation and enrollment contract, section 8

## 3. Records and checks

- [x] 3.1 Route the change, run `make verify`, `make record`, and write `verification.md`

## 4. Review and archive

- [ ] 4.1 Review passes in order until one reports only Low findings or none, at most three, each recorded in `passes.jsonl`, `findings.jsonl`, and `verification.md`
- [ ] 4.2 Merge `origin/dev` right before the archive, and archive the change in the last commit of the branch
