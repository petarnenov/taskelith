# Verification: persist-placement-rotation-cursor

## Scope and source

The coordinator (Niki) assigned this task to the worker Pepi on 2026-10-27, and it was developed in a briefed subagent. `PlacementService` kept the rotation cursor of capacity reservation section 13 only in memory, so a control-plane restart started the rotation again and could serve the same project twice in a row. [ADR 0015](/docs/decisions/0015-g2-closure.md#5-deferrals), decision 5 "Fair-order rotation", left storing the cursor as a non-blocking follow-up owned by the coordinator. The coordinator approved option (a) of [design.md](design.md): a stored cursor per installation, written in the placing transaction or once at the end of the pass.

## Revision

- Base: `origin/dev` `8aa75985`.
- Implementation and tests: `5c1dcb12` (`chore: persist the placement rotation cursor per installation`). First change documents: `ada7a475`.
- Merge of `origin/dev` `56346d92`: `cf23a546`. It brings ADR 0015 (#347) and `stop-placement-pass-at-fleet-decline` (#348), which ends a pass at its first decline for lack of fleet capacity.
  - Conflicts were in `placement-service.ts`, resolved with #348's `#offer` comment and its `break`, and in `capacity-reservation.md`, resolved with #348's "Fair order" bullet plus this change's "Durable cursor" bullet.
  - The merge commit also adapts this change to the stop rule. `RotationCursor.moving` and the `moveTo` argument are removed, because every placement of a pass now moves the cursor. The unit test for a decline after the first fleet decline, a case that no longer occurs, is retargeted to a pass that a fleet decline stops. The spec delta is rebuilt from the merged living text. The contract, proposal, design, and tasks are updated.
  - The merge needed no dependency inventory change, and `npm run verify:dependencies` passed in `make verify`.
- This record comes in the commit after `cf23a546`.

## Environment

macOS 26.6.2 (build 25G83), x86_64; Node.js 24.22.1 through `nvm use`; Docker Desktop for the PostgreSQL, NATS, and Toxiproxy services of `make verify`.

## Author self-check

- Code (`apps/control-plane/src/application/placement-service.ts`):
  - `PlacementService` reads the cursor in its `readCommitted` read (`:73`) and has no cursor field.
  - `placeMovingCursor` (`:196`) advances the cursor to the placed task's project in the placing transaction. `#offer` records that as `stored` (`:101`), and the pass ends at its first fleet capacity decline (`:106`).
  - `#storeUnstoredMove` (`:117`) writes once at the end of the pass, and only when the cursor differs from what the placements stored.
- Adapters:
  - `InMemoryPlacementRotation` (`packages/modules/scheduling/src/adapters/in-memory-placement.ts:56`) is one object per in-memory store (`apps/control-plane/test/in-memory-capacity.ts:41`), so a new service over the same store reads it.
  - `PostgresPlacementRotation` (`packages/adapters/postgres/src/capacity-repositories.ts:190`) upserts the one row of `placement_rotation`, which `packages/adapters/postgres/migrations/1792932500000_placement-rotation.sql` creates.
- Contract and spec: capacity reservation section 13, bullet "Durable cursor" (`docs/contracts/capacity-reservation.md:236`), and the requirement "Rotation cursor storage" state the same rules as the code:
  - each placement stores the cursor in its own transaction;
  - one end-of-pass transaction stores a move by declines alone, also after an outage;
  - a pass that does not move the cursor writes nothing;
  - the last writer wins.
- Spec delta:
  - "Project rotation" is MODIFIED. Its body is the merged living text, unchanged at 498 characters, with its ten scenarios unchanged and "Restart" added.
  - "Rotation cursor storage" is ADDED, with a body of 419 characters and three scenarios.
- The truncation lists of the PostgreSQL tests include `placement_rotation`. The migration tests list the new migration and hold it back where they hold back the later migrations.
- Plan checklist of [design.md](design.md):
  - code, contract, and spec agree;
  - each new placement test fails on the merged base service;
  - the PostgreSQL parts have integration tests, which ran in `make verify`;
  - `findings.jsonl` and `passes.jsonl` are empty.

## Checks and results

- **Fail-before on the merged base.** Setup: `apps/control-plane/src/application/placement-service.ts` of `origin/dev` `56346d92`, everything else of `cf23a546`, after `npm run build`. Command: `node --experimental-strip-types --test` over these four files:
  - `apps/control-plane/test/placement-rotation.test.ts`
  - `apps/control-plane/test/placement-service.test.ts`
  - `packages/modules/scheduling/test/resource-admission.test.ts`
  - `packages/modules/scheduling/test/repository-conformance.test.ts`

  Result: tests 94, pass 88, fail 6. The six failures are the new tests:
  - "after a restart the rotation continues after the stored cursor" (`placement-rotation.test.ts:77`)
  - "a placement stores the cursor in the placing transaction, before an outage stops the pass" (`placement-rotation.test.ts:87`)
  - "a new service over the same store starts after the stored cursor" (`placement-service.test.ts:530`)
  - "a move by an own-reason decline alone is stored at the end of the pass" (`placement-service.test.ts:542`)
  - "a pass that a fleet capacity decline stops does not write the unchanged cursor" (`placement-service.test.ts:556`)
  - "a failed write of a decline-only move fails the pass" (`placement-service.test.ts:570`)
- **After the change, same four files:** tests 94, pass 94, fail 0.
- **Earlier fail-before, before the merge.** Base service of `8aa75985` with `5c1dcb12`: tests 93, pass 87, fail 6.
- **`make verify` on `cf23a546`** (2026-10-27, 15:32:21 to 15:35:05 local): passed.
  - Tests 2162, pass 2160, fail 0, skipped 2; test run `duration_ms` 134131.
  - All files: 99.29% lines, 92.15% branches, 99.01% functions.
  - `placement-service.js`: 100% lines, 91.20% branches, 100% functions.
  - `capacity-repositories.js`: 100%, 97.75%, 100%.
  - `in-memory-placement.js`: 100%, 100%, 100%.
  - The PostgreSQL checks passed: the restart test "a new service over the same database continues the rotation after a restart" (`apps/control-plane/test/placement.integration.test.ts:293`), both PostgreSQL placement rotation conformance cases (`packages/adapters/postgres/test/capacity-conformance.integration.test.ts:64`), "migrations apply once, record their checksums, and create the schema", "the placement rotation down migration removes the rotation cursor" (`packages/adapters/postgres/test/migrations.integration.test.ts:404`), and the existing "two concurrent passes over one task place it once, with one charge and one offer".
  - Comment rule passed; findings 26 files and pass summaries 6 files valid; OpenSpec 70 passed, 0 failed; links conform; every active change archives into strictly valid specs; packed file allowlist and installed CLI verification passed.
- `npm run openspec -- validate persist-placement-rotation-cursor --strict`: valid.

## Independent review

Pending. No review pass has run; the coordinator has yet to assign reviewers A and B.

## Limitations

- Control-plane instances share one cursor and the last writer wins; no instance coordinates its passes with another (design D7).
- A move by declines alone is lost when its end-of-pass write fails (design D6).

## Remaining gates

- Independent review under the governance process
- Archive under worker step 7
- Integration into dev by the coordinator (single pull request)
