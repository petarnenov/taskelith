## 1. Change

- [x] 1.1 Create the change, save the brief's `checklist.json`, and add the empty `findings.jsonl` and `passes.jsonl`
- [x] 1.2 Write the proposal, the design, the `scm-port`, `control-plane-api`, and `postgres-state` deltas, and this task list

## 2. Implementation and tests

- [x] 2.1 The module's receipt ports and `ScmWebhookReceiver`, with tests failing before them
- [x] 2.2 The route, the raw body read with its 25 MiB limit, the handler, and the composition, with HTTP tests over the GitHub plugin's verifier failing before the route
- [x] 2.3 Migration `1792933700000_scm-webhook-deliveries`, the PostgreSQL deliveries, and their migration and concurrency tests, failing without the key
- [x] 2.4 The receiver over the emulated GitHub in the plugin's tests
- [x] 2.5 The source control contract section 6.1, the wire contract section 5, and the dependency inventory

## 3. Records and checks

- [ ] 3.1 Route the change, run `make verify`, `make record`, and write `verification.md`

## 4. Review and archive

- [ ] 4.1 Review passes in order until one reports only Low findings or none, at most three, each recorded in `passes.jsonl`, `findings.jsonl`, and `verification.md`
- [ ] 4.2 Merge `origin/dev` right before the archive, and archive the change in the last commit of the branch
