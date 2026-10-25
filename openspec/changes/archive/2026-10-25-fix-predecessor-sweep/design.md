## Context

The sweep selects rows by `predecessor_valid_until <= now` and rewrites a row with `#write`, which sets the column and the hash columns from the record (`previous?.validUntil ?? null`). The in-memory registry decides from the record alone: `previous === undefined || validUntil > now` skips.

## Goals / Non-Goals

Make the PostgreSQL sweep follow the record, stop selecting rows it cannot act on, and keep the column consistent with the record. Do not change the port, the in-memory registry's behavior, or any other method.

## Decisions

- **One rule: the record decides.** Both registries now expire a predecessor exactly when the record holds one whose `validUntil` has passed, through the domain predicate `expiredPredecessor`, so the rule lives in one place. The column only finds candidates.
- **Repair through `#write`.** When the record says "not due", the sweep writes the unchanged record back, which clears the column if there is no predecessor and sets it to the predecessor's `validUntil` otherwise. The same helper keeps the column and the hash columns derived from the record in one place.
- **Filter rows without a record.** Rows without an enrollment record are not workers the fleet registry manages; the filter matches `#read` and the hash lookup.
- **Tests in the adapter, not the conformance suite.** The suite already covers `expirePredecessors` through the port, including "not yet" inside the grace window, which both registries pass. A column that disagrees with its record cannot be produced through the port, so the three cases are PostgreSQL integration tests that set the column directly.

## Risks / Trade-offs

A due row with no record keeps its column and is filtered out on every sweep; it costs one more condition in the query, not a lock or a decode.
