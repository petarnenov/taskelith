## Why

The test "a bound with a leading zero is read in base 10" of `test/installation-script.test.ts` failed intermittently under load with `ended after 9.118s, before 10`: the admission wait of `scripts/installation.sh` gave up as a timeout before its 10 s bound. The wait reads its deadline from bash's `SECONDS`, which counts whole wall-clock seconds, so its first tick can come right after the wait starts and the timeout can come up to one second before the bound. This is a product defect of the installation script, not only of the test.

## What Changes

- Product fix: `await_worker_admission` of `scripts/installation.sh` measures its bound in milliseconds through new reusable clock and deadline functions, `EPOCHREALTIME` of bash 5 or else `node`. A wait never ends as a timeout before its bound, an admission decided after the bound is a timeout, and no sleep of the wait runs past the bound.
- Tests: a test-only clock seam, `TASKELITH_TEST_CLOCK`, runs the script on a fake clock that moves only by the test's fake `sleep` and `node`, so the tests of a hung read, a capped poll, and decisions 1 ms before and after the bound do not depend on the scheduler. A test checks the `node` clock of a shell without `EPOCHREALTIME`.
- The `local-installation` requirement "Bounded admission wait of the bring-up check" and `docs/local-installation.md` state that the bound is measured in milliseconds and that a wait never ends as a timeout before it nor sleeps past it.

## Capabilities

### New Capabilities

### Modified Capabilities

- `local-installation`: MODIFIED requirement "Bounded admission wait of the bring-up check", with the new scenarios "Clock tick right after the start" and "Decision just after the bound".

## Impact

`scripts/installation.sh`, a tooling script of the repository that `make verify-installation` runs, outside the published package. A timed-out admission wait now lasts at least its bound; it ends at the bound when it times out between reads, and later only by a running read's next check (at most about one second) or a running decision. An admission decided within the bound, measured in milliseconds, is admitted. `await_served_certificates` and `await_contact_since` keep their whole-second deadlines (follow-up in `design.md`).
