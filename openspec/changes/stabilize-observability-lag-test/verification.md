# Verification: stabilize-observability-lag-test

## Scope and source

Assigned on 2026-10-27 by the coordinator (Niki) under B6. Source: on a loaded 2020 Intel iMac, `packages/adapters/postgres/test/observability.integration.test.ts:61` failed with `AssertionError: 29.998023` on `read.outboxLagSeconds >= 30`. Base revision: `370fa59` on `dev`. Prepared in the git worktree `../taskelith-worktrees/stabilize-observability-lag-test` on branch `stabilize-observability-lag-test`. Scope: the test file, its helper `packages/adapters/postgres/test/test-database.ts`, and this change. No product code changes and the requirement is unchanged, so `.openspec.yaml` sets `skip_specs: true`. Commit type `test`; the package is private.

## Environment

macOS 26.6.2 (Darwin 25.6.0, arm64), Node.js v24.22.1, PostgreSQL 18.6 in Docker as `make services-up` and `make verify` start it. The failure itself was on the 2020 Intel iMac (macOS x86_64) and was not reproduced there; it was reproduced by its mechanism here (below).

## Author self-check

- Against the requirement "Control-plane snapshot from PostgreSQL": the scenario "A snapshot of waiting work" is asserted with a lag of exactly 30 seconds and an age of exactly 90 seconds, which satisfies "at least 30" and "at least 90"; "A later position appended earlier" reads exactly 60 seconds; both ages are read on the database's `now()`, since the pinned clock replaces only that function.
- Against the coordinator's brief: the adapter was checked for mixed clocks and uses only the server's `now()` for the outbox lag and assignment age (`packages/adapters/postgres/src/control-plane-signals.ts:19-30`), so the fix is in the test; no bound was lowered, no tolerance, retry, or timeout was added.
- Evidence check: no external link; the results below come from the commands listed.

## Diagnosis

The snapshot runs in one transaction, so its `now()` is that transaction's start, `T_read`. The old test stamped `now() - interval '30 seconds'` in an earlier, awaited transaction starting at `T_stamp`. The reading is `30 + (T_read - T_stamp)` seconds, both instants from the server's wall clock; the host clock takes no part. `29.998023` therefore means `T_read - T_stamp = -1.977 ms`: the server's wall clock stepped back by at least that much between the two transactions. A wall clock may step, so the old lower bound was not guaranteed for any implementation that reads the database clock.

Reproduction (scratch file, not committed): a role whose `search_path` puts a schema `clock` before `pg_catalog`, with `clock.now()` reading a settable table; the row was stamped through that role with `now() - interval '30 seconds'`, the clock was moved back by `1977 microseconds`, and `PostgresControlPlaneSignals.read` returned `outboxLagSeconds` `29.998023`, failing the old assertion with exactly `AssertionError [ERR_ASSERTION]: 29.998023`.

## Checks

- Failing before: the reproduction above, run as `node --experimental-strip-types --test <scratch test>` against `make services-up`, printed `lag 29.998023` and the assertion failure.
- Passing after: `node --experimental-strip-types --test packages/adapters/postgres/test/observability.integration.test.ts`: 8 of 8 tests passed, and 0 failures in 30 consecutive runs.
- `npm run verify:comments`: every comment is within the rule.
- `npm run openspec -- validate stabilize-observability-lag-test --strict`: valid.
- `make verify` passed: 1,929 tests, 1,927 passed, 0 failed, 2 skipped; coverage 99.28 % lines, 92.07 % branches, 99.04 % functions; strict OpenSpec validation 70 passed, 0 failed; archive dry run and package verification passed.

## Independent review

Pending.

## Limitations

- The iMac's clock events were not captured; the step back is inferred from the value and reproduced by mechanism, not observed on that host.
- The two age tests read a pinned clock; the other tests of the file and the conformance suite still read the server's real clock.

## Remaining gates

- Independent review (pending).
- Integration into dev by the coordinator (single pull request).
