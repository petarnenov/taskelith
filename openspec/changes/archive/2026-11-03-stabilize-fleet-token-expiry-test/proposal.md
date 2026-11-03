## Why

On the loaded 2020 Intel iMac, the test "a token that expires while its use waits for the row lock enrolls nothing" in `packages/adapters/postgres/test/fleet-conformance.integration.test.ts` failed intermittently with `actual: false, expected: 'token-expired'`: the enrollment succeeded. It failed in the integrations of #419 and #420 and twice in a row for `build-web-spa-shell`, and it blocks integration.

The adapter compares the expiry with the database clock: `CommittingFleetRegistry.enroll` runs `PostgresFleetRepository.enroll` (`packages/adapters/postgres/src/fleet-repositories.ts:75-83`), whose `UPDATE ... RETURNING expires_at <= clock_timestamp()` reads `clock_timestamp()` after the row lock. The test set the expiry from the host clock (`Date.now() + 1000`) and released the lock after a fixed host sleep of 1500 ms. The server runs in Docker Desktop's Linux VM, whose clock is corrected to the host's and can lag it; with a lag above about half a second, the database reads the expiry as not yet passed when the lock is released, and the enrollment succeeds. The adapter is correct; the test mixed two clocks.

## What Changes

- A test helper, `steppedClockCredentials`, creates sentinel credentials whose sessions resolve an unqualified `clock_timestamp()` to a function that returns a fixed instant plus the value of a sequence, placed before `pg_catalog` in the role's `search_path`. A step sets the sequence, which every session sees at once, also inside a running transaction.
- The test enrolls through a database opened with those credentials. The clock stands at `2099-01-01T00:00:00.000Z`, and the token expires one second later.
- It waits until `pg_stat_activity` shows the enrollment's `UPDATE enrollment_tokens` waiting on a lock, steps the clock two seconds ahead, and only then releases the lock. No host clock or host timer takes part.
- A `finally` block ends both test connections, which also releases the lock, and waits for the enrollment, so a failed step cannot block later tests.
- No product code changes.

## Capabilities

### New Capabilities

### Modified Capabilities

None. The `installation-enrollment` requirement "Single-use enrollment" is unchanged; the change makes its lock-wait expiry test deterministic, so it sets `skip_specs: true`.

## Impact

Test reliability of `make verify`. `@taskelith/postgres` is a private workspace package, and its behavior is unchanged.
