## 1. Inspection

- [x] 1.1 Count the archived links that leave their change directory and the broken document links on `dev` at `bd6108d4`, and read how `openspec archive` names the archive directory.

## 2. Record link check

- [x] 2.1 Write the checker's tests with temporary directory fixtures and run them against a stub of its interface (they fail).
- [x] 2.2 Add `scripts/check-record-links.ts` and `npm run verify:links`, and run it in the Makefile `verify-checks` target immediately before `npm run verify:archive`.
- [x] 2.3 Generate `scripts/record-links-baseline.tsv` from the failing archived links.

## 3. Documentation

- [x] 3.1 Point `docs/dependencies.md` at the archived record of `compose-minimal-local-installation-images`.
- [x] 3.2 State the record link rule in worker step 6 of `docs/agent-task-protocol.md` and in the evidence check of `docs/governance.md`.
- [x] 3.3 Add the `integration-flow`, `agent-task-protocol`, and `review-process` requirements.

## 4. Verify

- [x] 4.1 Create this change's empty `findings.jsonl`.
- [x] 4.2 Run the checker's tests with coverage, the type check, `npm run verify:links`, `npm run verify:comments`, `npm run verify:findings`, `npm run openspec -- validate --all --strict`, and `npm run verify:archive`.
- [ ] 4.3 Run `make verify`.
- [ ] 4.4 Independent review.
