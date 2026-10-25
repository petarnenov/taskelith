## Why

In the PostgreSQL fleet registry, `expirePredecessors` selects the workers whose `predecessor_valid_until` column is due and reads `worker.credentials.previous!`. The column and the enrollment record are written together, but no constraint ties them, so a row whose column is set while its record holds no predecessor would throw a `TypeError` inside the sweep's transaction instead of being handled. A follow-up from G2 item 13 (reported by Pepi) asked to make that case explicit.

## What Changes

- `PostgresFleetRegistry.expirePredecessors` checks for an absent predecessor and skips the row, as the in-memory registry already does, and returns the number of predecessors it actually expired instead of the number of rows it selected.
- A PostgreSQL integration test covers a due row whose record holds no predecessor next to a worker whose predecessor really expires: only the real predecessor expires and counts, the skipped row and its expiry column are unchanged, and only the real predecessor's broker user is recorded for revocation.
- The `installation-enrollment` requirement "Worker credentials" gains the scenario "Due row without a predecessor".

## Capabilities

### New Capabilities

### Modified Capabilities

- `installation-enrollment`: the requirement "Worker credentials" gains the scenario "Due row without a predecessor"; its text and its scenario "Grace window" are unchanged.

## Impact

The PostgreSQL adapter's sweep no longer throws on such a row. No contract, port, or other adapter changes.
