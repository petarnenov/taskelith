## Why

The review of `remove-predecessor-non-null-assertion` left three follow-ups in the PostgreSQL fleet registry's predecessor sweep (`PostgresFleetRegistry.expirePredecessors`), which selects candidates by the `predecessor_valid_until` column and decides from the enrollment record: a due row without a predecessor stayed due and was locked, decoded, and skipped on every sweep; the query lacked the `enrollment IS NOT NULL` filter of the adapter's other reads, so a due row without a record failed the sweep; and the sweep trusted the column, while the in-memory registry also checks the predecessor's own `validUntil`. The coordinator assigned all three.

## What Changes

- A due row whose record holds no predecessor gets its expiry column cleared in the same sweep, so a later sweep no longer meets it; its record is kept.
- The sweep's query filters `enrollment IS NOT NULL`, as the adapter's other reads do.
- The record decides, as in the in-memory registry: a predecessor whose `validUntil` is still ahead is kept and not revoked, and the column is set back to the record's time, so it expires when its grace window ends.
- Three PostgreSQL integration tests cover the cases, and each fails without the change.
- The `installation-enrollment` requirement "Worker credentials" changes the scenario "Due row without a predecessor" and gains the scenarios "Due row without an enrollment record" and "Predecessor still in its grace window".

## Capabilities

### New Capabilities

### Modified Capabilities

- `installation-enrollment`: the requirement "Worker credentials" changes one scenario and gains two; its text and the scenario "Grace window" are unchanged.

## Impact

The PostgreSQL adapter's sweep only. The port, the in-memory registry, and the conformance suite are unchanged.
