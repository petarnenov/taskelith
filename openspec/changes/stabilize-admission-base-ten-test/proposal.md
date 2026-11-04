## Why

The test "a bound with a leading zero is read in base 10" of `test/installation-script.test.ts` failed intermittently under load with `ended after 9.118s, before 10`: the admission wait of `scripts/installation.sh` gave up as a timeout before its 10 s bound. The wait reads its deadline from bash's `SECONDS`, which counts whole wall-clock seconds, so its first tick can come right after the wait starts and the timeout can come up to one second before the bound. This is a product defect of the installation script, not only of the test.

## What Changes

- Product fix: `await_worker_admission` of `scripts/installation.sh` sets its deadline one second past the bound, so a wait never ends as a timeout before its whole bound has passed, and may end up to about one second later than before.
- Test: "a wait never ends before its bound, even when its clock ticks right after it starts" starts the script late in a wall-clock second and wakes its polls just past each second, which reproduces the early timeout deterministically.
- The `local-installation` requirement "Bounded admission wait of the bring-up check" and `docs/local-installation.md` state that a wait never ends as a timeout before its bound.

## Capabilities

### New Capabilities

### Modified Capabilities

- `local-installation`: MODIFIED requirement "Bounded admission wait of the bring-up check", with the new scenario "Clock tick right after the start".

## Impact

`scripts/installation.sh`, a tooling script of the repository that `make verify-installation` runs, outside the published package. A timed-out admission wait now lasts at least its bound and at most about one second longer than before; an admission within the bound is unchanged.
