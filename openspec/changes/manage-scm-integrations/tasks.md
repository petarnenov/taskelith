## 1. Change

- [x] 1.1 Create the change, save the brief's `checklist.json`, and add the empty `findings.jsonl` and `passes.jsonl`
- [x] 1.2 Write the proposal, the design with the proposed setting and secret names, the `scm-port`, `control-plane-api`, `postgres-state`, and `plugin-registration` deltas, and this task list

## 2. Implementation and tests

- [x] 2.1 The module's origin normalization, secrets, store port, service, store-backed verifiers, in-memory store, and draft plugin descriptor, with tests failing before them
- [x] 2.2 Plugin API `0.4.0`, both manifests at `^0.4.0`, and the GitHub plugin's descriptor with its decoy and eventless rule, with tests failing before them
- [x] 2.3 Migration `1792934000000_scm-integrations`, the PostgreSQL store with sealed secrets, the SCM secret cipher, and the key file, with migration, store, and concurrency tests failing before them
- [x] 2.4 The four routes and handlers, the composition with store-backed verifiers, the key at initialization and start, with HTTP, start, and initialization tests failing before them
- [x] 2.5 The source control contract sections 2, 6.1, 6.2, and 10, the wire contracts section 4, the installation contract's key table, the G3 plan rows 11, 15, and 20, and the dependency inventory

## 3. Records and checks

- [x] 3.1 Route the change, run `make verify`, `make record`, and write `verification.md`

## 4. Review and archive

- [ ] 4.1 Review passes in order until one reports only Low findings or none, at most three, each recorded in `passes.jsonl`, `findings.jsonl`, and `verification.md`
- [ ] 4.2 Archive the change in the last commit of the branch
