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

- Failing before, reproducible from this record. Against `make services-up` (its exported `TASKELITH_POSTGRES_URL` and `TASKELITH_POSTGRES_PROXY_URL`), a temporary test file in `packages/adapters/postgres/test/`, deleted afterwards, did the following:
  - Setup with the file's helpers: `url = await createMigratedDatabase()`, `role = await sentinelCredentials(url)`, then as the administrator on `url`:
    - `CREATE SCHEMA clock`
    - `CREATE TABLE clock.reading (at timestamptz NOT NULL)`
    - `INSERT INTO clock.reading VALUES ('2026-10-25T09:00:00.000000Z')`
    - `CREATE FUNCTION clock.now() RETURNS timestamptz LANGUAGE sql STABLE AS $$ SELECT at FROM clock.reading $$`
    - `GRANT USAGE ON SCHEMA clock TO <role>`, `GRANT SELECT ON clock.reading TO <role>`
    - `ALTER ROLE <role> SET search_path = clock, pg_catalog, "$user", public`
  - The test opened `database = new PostgresDatabase(role)`, appended `command('offer-1')` in `database.transaction`, stamped it through the role with `UPDATE outbox SET appended_at = now() - interval '30 seconds'`, stepped the clock back as the administrator with `UPDATE clock.reading SET at = at - interval '1977 microseconds'`, read `new PostgresControlPlaneSignals(database).read()`, and asserted the old `outboxLagSeconds >= 30`.
  - Command: `node --experimental-strip-types --test packages/adapters/postgres/test/zz-repro-clock-step.integration.test.ts`. Output: `lag 29.998023` and `AssertionError [ERR_ASSERTION]: 29.998023`.
- Passing after: `node --experimental-strip-types --test packages/adapters/postgres/test/observability.integration.test.ts`: 8 of 8 tests passed, and 0 failures in 30 consecutive runs.
- `npm run verify:comments`: every comment is within the rule.
- `npm run openspec -- validate stabilize-observability-lag-test --strict`: valid.
- `make verify` passed on `b96d8d0`: 1,929 tests, 1,927 passed, 0 failed, 2 skipped; coverage 99.28 % lines, 92.07 % branches, 99.04 % functions; strict OpenSpec validation 70 passed, 0 failed; archive dry run and package verification passed.
- After the pass-1 fixes, `make verify` passed again: 1,929 tests, 1,927 passed, 0 failed, 2 skipped; coverage 99.28 % lines, 92.08 % branches, 99.04 % functions; strict OpenSpec validation 70 passed, 0 failed; archive dry run and package verification passed.

## Independent review

- **Failed attempt, not a pass.** Claude Code (claude-opus-5-5, effort high), 2026-10-27 about 00:21-00:25 local, on `b96d8d0`, ended with `Error: No messages returned from query` and empty JSON output; no session was created and the snapshot was unchanged. As the process allows for an unavailable reviewer, the coordinator assigned Codex CLI (gpt-6.1-sol) as the replacement.
- **Pass 1 — Codex CLI, model `gpt-6.1-sol`, reasoning effort medium, read-only sandbox, session `01a17a52-073b-71c1-89a0-9d74b6b43624`, revision `b96d8d0` (diff `370fa59..b96d8d0`).** Invocation: `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`. The header confirmed the model, reasoning effort, and read-only sandbox; the snapshot was `20c53e126efba433ec71e9c4e3c32ce8cc853dec15db36821cfaf5291fae1838` before and after the pass. The reviewer confirmed the diagnosis, the isolation of the pinned-clock role and schema, the shadowing through the explicit `pg_catalog` position, the absence of an injection issue, and `skip_specs`. Findings: 0 Critical, 0 High, 0 Medium, 3 Low. Because the pass found only Low findings, they were resolved without another review pass, as the review process allows; these fixes are unreviewed:
  1. Low (`design.md`): "A second database" was inaccurate. Accepted: it now reads "A second pool with pinned-clock credentials in the same test database".
  2. Low (`verification.md`): the failing-before evidence cited a scratch test that the record did not reproduce. Accepted: the checks now give the setup SQL, the stamping, the 1977 µs step back, the read, the command, and its output.
  3. Low (`verification.md`): list the archive and the step 7 checks as remaining gates. Declined: `docs/agent-task-protocol.md` worker step 6 says that before step 7 the remaining gates name only `Integration into dev by the coordinator (single pull request)`, and step 7 adds its own checks to the moved record.

## Limitations

- The iMac's clock events were not captured; the step back is inferred from the value and reproduced by mechanism, not observed on that host.
- The two age tests read a pinned clock; the other tests of the file and the conformance suite still read the server's real clock.

## Remaining gates

- Integration into dev by the coordinator (single pull request).
