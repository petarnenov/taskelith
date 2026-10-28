## 1. Contract first

- [x] 1.1 Proposal, design, spec delta `sdlc-wire-contracts`, `checklist.json`, empty `findings.jsonl` and `passes.jsonl`

## 2. Check and tests

- [x] 2.1 Fail-before tests in `test/check-contract-compatibility.test.ts`: an undeclared change under a minor bump on 0.x, a stale listed change, an entry without a bump, a malformed file; and a matching entry, ignored history, and order independence
- [x] 2.2 `packages/contracts/breaking-changes.json` with the SDLC AsyncAPI 0.4.0 history entry, its schema, and the check in `scripts/check-contract-compatibility.ts`
- [x] 2.3 `make contract-breaking-changes` and the author workflow in `docs/contracts/execution-wire-contracts.md`

## 3. Records and gates

- [x] 3.1 `npm run openspec -- validate declare-contract-breaking-changes --strict` and the checks without Docker
- [ ] 3.2 `make verify`, `make record`, and `make record-check`
- [ ] 3.3 Independent review and its records
