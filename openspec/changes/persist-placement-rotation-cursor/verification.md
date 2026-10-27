# Verification: persist-placement-rotation-cursor

## Scope and source

A worker task that the coordinator (Niki) assigned to the worker Pepi on 2026-10-27, developed in a briefed subagent. `PlacementService` kept the rotation cursor of capacity reservation section 13 only in memory, so a control-plane restart started the rotation again and could serve the same project twice in a row. The coordinator approved option (a) of [design.md](design.md): a stored cursor per installation, written in the placing transaction or once at the end of the pass.

## Revision

- Base: `origin/dev` `8aa75985`.
- Implementation and tests: `5c1dcb12` (`chore: persist the placement rotation cursor per installation`).
- Contract and change documents: the commit after it, which holds this record.

## Environment

macOS 26.6.2 (build 25G83), x86_64; Node.js 24.22.1 through `nvm use`. Docker was not used: the shared Docker slot was taken, so no PostgreSQL integration test ran.

## Author self-check

- Code: `PlacementService` reads the cursor in its `readCommitted` read (`apps/control-plane/src/application/placement-service.ts:73`) and has no cursor field. `placeMovingCursor` (`:197`) advances the cursor in the placing transaction while `RotationCursor.moving` holds (`:98`, `packages/modules/scheduling/src/domain/fair-order.ts:54`). `#storeUnstoredMove` (`:117`) writes once at the end of the pass only when the cursor differs from what the placements stored.
- Adapters: `InMemoryPlacementRotation` (`packages/modules/scheduling/src/adapters/in-memory-placement.ts:56`) is one object per in-memory store (`apps/control-plane/test/in-memory-capacity.ts:41`), so a new service over the same store reads it. `PostgresPlacementRotation` (`packages/adapters/postgres/src/capacity-repositories.ts:190`) upserts the one row of `placement_rotation`, created by `packages/adapters/postgres/migrations/1792932500000_placement-rotation.sql`.
- Contract and spec: capacity reservation section 13, bullet "Durable cursor" (`docs/contracts/capacity-reservation.md:236`), and the requirement "Rotation cursor storage" state the same rules as the code: the placing transaction stores a move by a placement, one end-of-pass transaction stores a move by declines alone, also after an outage, a pass that does not move the cursor writes nothing, and the last writer wins.
- Spec delta: "Project rotation" MODIFIED, body 473 characters, nine scenarios, eight of them copied unchanged and "Restart" added; "Rotation cursor storage" ADDED, body 387 characters, three scenarios.
- The truncation lists of the PostgreSQL tests (`packages/adapters/postgres/test/test-database.ts` and the placement, inventory, and observation integration tests of `apps/control-plane`) include `placement_rotation`, so no cursor leaks from one test into the next. The migration tests list the new migration and hold it back where they hold back the later migrations.
- Plan checklist of [design.md](design.md): code, contract, and spec agree; each new placement test fails on the base service; the PostgreSQL parts have integration tests, not run here; `findings.jsonl` and `passes.jsonl` are empty.

## Checks and results

- Fail-before: with `apps/control-plane/src/application/placement-service.ts` of `8aa75985` and everything else of `5c1dcb12`, after `npm run build`, `node --experimental-strip-types --test` over `apps/control-plane/test/placement-rotation.test.ts`, `apps/control-plane/test/placement-service.test.ts`, `packages/modules/scheduling/test/resource-admission.test.ts`, and `packages/modules/scheduling/test/repository-conformance.test.ts` gave tests 93, pass 87, fail 6. The six failures are the new tests "after a restart the rotation continues after the stored cursor" and "a placement stores the cursor in the placing transaction, before an outage stops the pass" (`placement-rotation.test.ts:77` and `:87`), and "a new service over the same store starts after the stored cursor", "a move by an own-reason decline alone is stored at the end of the pass", "a decline after the first fleet capacity decline neither moves nor writes the cursor", and "a failed write of a decline-only move fails the pass" (`placement-service.test.ts:506`, `:518`, `:532`, and `:547`).
- After the change, the same four files: tests 93, pass 93, fail 0.
- `npm run build` and `npm run check:boundaries`: passed; "Workspace and hexagonal boundary checks passed."
- Every test file except `*.integration.test.ts`, with coverage of `apps/control-plane/dist` and `packages/modules/scheduling/dist`: tests 1663, pass 1661, fail 0, skipped 2. `placement-service.js` 95.79% lines, 91.15% branches, 93.10% functions; `in-memory-placement.js` 100%, 100%, 100%; `fair-order.js` 100%, 96.55%, 100%; `capacity-conformance.js` 100%, 98.67%, 100%; the two packages together 76.16% lines, 85.64% branches, 79.52% functions, without the integration tests that `make verify` adds.
- `npm run openspec -- validate persist-placement-rotation-cursor --strict`: valid.
- `npm run openspec -- validate --all --strict --no-interactive`: 70 passed, 0 failed.
- `npm run verify:archive`: every active OpenSpec change archives into strictly valid specs.
- `npm run verify:comments`: every comment is within the comment length rule.
- `npm run verify:links`: every checked link conforms.
- `make findings ARGS="validate"`: every findings file is valid (24 files), and every pass summary file is valid (4 files).
- `npm run verify:dependencies`: verified, no inventory change.
- Not run: `make verify`, and with it every PostgreSQL integration test, among them the new "a new service over the same database continues the rotation after a restart" (`apps/control-plane/test/placement.integration.test.ts:270`), the PostgreSQL run of `PLACEMENT_ROTATION_CONFORMANCE` (`packages/adapters/postgres/test/capacity-conformance.integration.test.ts:64`), the migration test "the placement rotation down migration removes the rotation cursor" (`packages/adapters/postgres/test/migrations.integration.test.ts:404`), and the edited migration and truncation lists.

## Independent review

Pending. No review pass has run; reviewers A and B are to be assigned by the coordinator.

## Limitations

- The PostgreSQL adapter, the migration, and the PostgreSQL restart test have not run; `make verify` must pass before the first review pass.
- Control-plane instances share one cursor and the last writer wins; no instance coordinates its passes with another (design D7).
- A move by declines alone is lost when its end-of-pass write fails (design D6).

## Remaining gates

- `make verify`, with Docker, before the first review pass
- Independent review under the governance process
- Archive under worker step 7
- Integration into dev by the coordinator (single pull request)
