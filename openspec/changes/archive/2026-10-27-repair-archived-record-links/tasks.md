## 1. Inspection

- [x] 1.1 Categorize the 332 baselined links on `dev` at `56346d92` and record the fail-before count with the baseline emptied.

## 2. Repair

- [x] 2.1 Write `rewrite-archived-links.ts` and run it from the repository root.
- [x] 2.2 Check that the archived diff changes only link destinations and leaves the `ext2/ext3` labels.

## 3. Baseline

- [x] 3.1 Remove `scripts/record-links-baseline.tsv` and the baseline code and tests of the record link check.
- [x] 3.2 Modify the `integration-flow` requirement "Record link check" and remove "Record link baseline".
- [x] 3.3 Drop the baseline sentence from worker step 6 of `docs/agent-task-protocol.md`.

## 4. Documentation

- [x] 4.1 Note decision B1 in ADR 0015 line 140 and `docs/foundation.md` line 89.
- [x] 4.2 Add the rotation cursor resolution note to ADR 0015 line 120 (coordinator's scope addition), citing #349.
- [x] 4.3 Copy the rewritten files of `2026-10-24-draft-sdlc-framework-port` into the `sdlc-openspec` mapping fixture and update its digests and README.

## 5. Verify

- [x] 5.1 Run the checker's tests, `npm run verify:links`, `npm run verify:comments`, and `npm run openspec -- validate repair-archived-record-links --strict`.
- [x] 5.2 Run `make verify`.
- [x] 5.3 Independent review.
