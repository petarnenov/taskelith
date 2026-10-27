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
- [x] 4.3 Run `make verify`.
- [x] 4.4 Independent review.

## 5. Review pass 1 fixes

- [x] 5.1 Write a failing test for each Medium finding and for reference-style links, and run them against the script of `848802f7` (they fail).
- [x] 5.2 Parse links and headings with `marked` 15.0.12, exact-pinned as a development dependency, register it in `docs/dependencies.md`, and regenerate the dependency inventory.
- [x] 5.3 Apply the spec delta rule to fragment-only links, and align the requirement, proposal, and design with the checked link forms, the URI scheme exclusion, and the package impact.

## 6. Review pass 2 fixes

- [x] 6.1 Cite the current `docs/dependencies.md` line in the proposal (unreviewed Low fix).
