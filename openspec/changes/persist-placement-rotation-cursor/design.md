## Context

`PlacementService.#placeDue` read the waiting tasks after a cursor held in the field `#after`, and `#offer` moved a `RotationCursor` (`packages/modules/scheduling/src/domain/fair-order.ts`) by each offer's result: a placement or a decline for a reason of the task's own moves it. Since `stop-placement-pass-at-fleet-decline` (#348), merged into this branch, the pass ends at its first decline for lack of fleet capacity, so every offer of a pass moves the cursor. The pass then set `#after` to the cursor. A new service, for example after a control-plane restart, started from no cursor. [Capacity reservation section 13](/docs/contracts/capacity-reservation.md#13-values-and-writers-fixed-by-g2-item-18), "Fair order", and the `execution-placement` requirement "Project rotation" define the cursor.

[ADR 0015](/docs/decisions/0015-g2-closure.md#5-deferrals), decision 5 "Fair-order rotation", kept the in-memory cursor for G2 and left storing it as a non-blocking follow-up owned by the coordinator. The coordinator (Niki) approved option (a) below.

## Options

- **(a) A stored cursor, written where it moves.** One row per installation. Each placement writes the cursor in the placement's own transaction; a move by declines alone is written once at the end of the pass.
- **(b) No stored cursor; derive it from the assignments.** At startup, take the project of the last placement from the assignments. It cannot reproduce a move by declines alone, because a decline for a reason of the task's own rolls its transaction back and leaves no record, and, before #348, it could not ignore the placements after the pass's first decline for lack of fleet capacity, which did not move the cursor.
- **(c) Keep the cursor in memory.** It leaves the restart bug.
- **(a') A stored cursor, written once at the end of each pass.** A crash in the middle of a pass loses the move of placements that already committed.

Option (a) is the only one that keeps the section 13 rule exactly and survives a crash after any committed placement.

## Decisions

- **D1: the port.** `PlacementRotation` (`packages/modules/scheduling/src/ports/placement-rotation.ts`) has `read(): Promise<ProjectId | undefined>`, which answers none before the first move, and `advance(projectId): Promise<Result<void>>`, which replaces the cursor. `ControlPlaneTransaction.rotation` (`apps/control-plane/src/application/control-plane-store.ts:43`) exposes it, next to `placements`. The conformance suite `PLACEMENT_ROTATION_CONFORMANCE` (`packages/modules/scheduling/src/ports/capacity-conformance.ts:412`) runs against both adapters.
- **D2: the table.** Migration `1792932500000_placement-rotation` creates `placement_rotation (singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton), project_id text NOT NULL)`, the single-row idiom of the table `installation`. A missing row means no cursor yet, and `advance` is an upsert (`packages/adapters/postgres/src/capacity-repositories.ts:190`). The approved design suggested a seeded row with a nullable `project_id`; the upsert needs no seed, and a test that truncates the tables still gets a working cursor.
- **D3: the read.** `#placeDue` reads the cursor in the pass's `readCommitted` read, before the waiting tasks (`apps/control-plane/src/application/placement-service.ts:73`). The field `#after` is gone.
- **D4: the write in the placement transaction.** `placeMovingCursor` (`placement-service.ts:196`) places the task and, when it placed it, advances the cursor to the task's project in the same transaction. Every placement moves the cursor, because the pass ends at its first decline for lack of fleet capacity (`placement-service.ts:106`). Its result `PLACED_WITH_CURSOR` tells `#offer` that the cursor is stored (`placement-service.ts:101`). A crash after that commit keeps the move. Before #348 a placement after a fleet decline did not move the cursor, and this change had a `RotationCursor.moving` query to skip its write; the merge removed it.
- **D5: the write at the end of the pass.** `#storeUnstoredMove` (`placement-service.ts:117`) writes the cursor in a transaction of its own when it differs from the value that the pass's placements stored. Under the section 13 rule this happens only when declines alone moved it. When no offer moved the cursor, nothing is written.
- **D6: an outage.** When an outage stops the pass, the cursor holds the moves of the offers before it, as before this change, and the placements among them already stored theirs. The pass still tries the end write for a move by declines alone, which keeps the earlier in-memory behavior when the store answers again; if that write fails, the move is lost, and the pass returns the outage. When only the end write fails, the pass returns that failure, so the passes back off.
- **D7: several instances.** Every control-plane instance reads and writes the same row, and the last writer wins. No instance coordinates its passes with another. G2 runs one control-plane instance ([architecture section 12](/docs/architecture.md#12-scale-and-operations)). Concurrent placement transactions now also write the same row; under `SERIALIZABLE` the loser of such a race reruns, as for any other conflict.

## Plan checklist

- Code, contract section 13, and both requirements state the same write rules.
- Each new test fails on the code before the change.
- The PostgreSQL adapter, the migration, and the restart test have PostgreSQL integration tests.
- `findings.jsonl` and `passes.jsonl` are empty until a review pass runs.

## Risks / Trade-offs

- Every placement that moves the cursor writes one more row, and passes of several instances conflict on it. With one instance the passes run one after another.
- A move by declines alone is lost when the end-of-pass write fails. The declined tasks back off, so the next pass reads them later anyway.
