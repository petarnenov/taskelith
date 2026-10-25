# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

G2 work item 11 in [docs/g2-plan.md](../../../docs/g2-plan.md), assigned by the coordinator under the agent task protocol. The branch was created from `origin/dev` at `78362da`, which contains items 7, 9, and 10. Scope: the module ports, in-memory adapters, and conformance suites of SDLC, Execution, and Scheduling; the private adapter package `packages/adapters/postgres` (`@taskelith/postgres`) with its migration, migration runner, repositories, outbox, inbox, relay, transaction primitive, crash points, and integration tests; `integrationEndpoint` in `@taskelith/testing`; and the dependency register and inventory. The change adds the `state-persistence` and `postgres-state` capabilities.

The coordinator decided the design questions before implementation: the minimal workflow run record with gates stored per run (Q1 a), an `Outbox` port per writing module with the `Inbox` on the consuming side (Q2), and the proposed defaults (package name, node-pg-migrate with a checksum table, JSON records rebuilt through `parseLaunchParameters`, the task-row aggregate, the partial unique index, the SERIALIZABLE transaction with bounded retries, the conformance suites, the structural crash hook, and the Toxiproxy test). Its two additions are met: the no-op hook `NO_CRASH_POINTS` lives in the adapter, and the retry bound and backoff are named constants with a test that forces a serialization conflict between two real transactions.

## Author self-check before review

Checked against the ADR 0004 principles:

- Clean Code: one port per file, a generic `AggregateStore` for the compare-and-set storage the repositories share, a transaction runner that separates connection, work, commit, and outcome classification, and comments only for rationale and contracts.
- SOLID and hexagonal architecture: ports stay in their modules; the adapter depends on the modules and `pg`, never the reverse; the boundary check passes; product code does not import `@taskelith/testing`.
- Microkernel: no harness, provider, SCM, or SDLC framework is named; the frozen `SdlcFramework` port is untouched, and the G1 tests pass unchanged.
- Docker and Makefile: integration tests run against the digest-pinned PostgreSQL and Toxiproxy of the item 9 and 10 Compose project through `make test` and `make verify`.
- OpenAPI: no wire contract changes; outbox messages carry the kernel's event metadata.
- OpenSpec: this change tracks the work; strict validation passes.
- Coverage: the adapter's modules have 99–100% line coverage and 87–100% branch coverage; all files 99.68% lines, 95.98% branches, 99.45% functions.
- Dependencies: `pg@8.23.1` and `node-pg-migrate@9.0.0` exact-pinned as decision D6 (a) and the coordinator's brief state; no other new npm dependency. `npm audit` reports two findings, both in the npm copy bundled inside `@semantic-release/npm` (`ip-address`, `undici`), which this change does not touch.

Evidence check: node-pg-migrate's `runner` options, its `schema_migrations` table layout, and its SQL migration markers were read from the installed 9.0.0 bundle; the checksum gap is the one [docs/g2-infrastructure.md](../../../docs/g2-infrastructure.md) records.

## Checks

Environment: macOS (Darwin 25.6.0, arm64), Node v24.22.1, npm 12.2.1 (through `make verify`), Docker Engine 29.6.1, Docker Compose v5.2.0, PostgreSQL 18.6 from the pinned image.

On `1dcbc6f`, before review: `make verify` passed: comment rule, workspace package contract and boundary checks, 484 tests (including 33 PostgreSQL integration tests), coverage 99.68% lines, 95.98% branches, 99.45% functions, contract compatibility, the dependency inventory (710 package paths), strict OpenSpec validation (43 items), the archive dry run, and package verification.

On `1b9a04b`, after the pass 1 fixes: `make verify` passed with 496 tests (45 PostgreSQL adapter tests, of which 43 are integration tests) and coverage 99.70% lines, 96.48% branches, 99.06% functions. The adapter and harness integration tests passed three runs in a row (46 tests each) against fresh Compose projects.

On `4c66f0a`, after the pass 2 fixes: `make verify` passed with 500 tests and coverage 99.66% lines, 96.39% branches, 99.47% functions; the adapter and harness tests passed (75 tests) against a fresh Compose project.

On `d684860`, after the pass 3 fixes: `make verify` passed with 502 tests and coverage 99.66% lines, 96.40% branches, 99.48% functions.

## Independent review

Assigned reviewer: Codex CLI 0.164.0 with `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> -`, the prompt on stdin; prompt and output files were kept outside the worktree. The prompt named `AGENTS.md`, ADR 0004, the governance review process, the plan row and decision D6, the architecture and contract sections the change serves, and the specifications it touches, and asked for every instance of a problem with severity, file, line, and fix.

- **Pass 1 — session `01a170ab-c5f9-7440-a0bb-ec6d62f1b460`, reviewed `66f26fa` (diff `78362da...HEAD`).** The output header confirms model `gpt-6.1-sol`, reasoning effort medium, and the read-only sandbox. The author's SHA-256 snapshots of `git ls-files -co --exclude-standard` before and after the pass were equal (`8a6e7080…1e91e`); the reviewer could not take its own first snapshot in the sandbox and reported its later snapshots and `git status` unchanged. It ran strict validation, the boundary and comment checks, and the 20 tests that need no services. Findings: 0 Critical, 3 High, 9 Medium, 2 Low. Resolutions, in `1b9a04b`:
  1. High: an applied migration could stay without a checksum when a later file of the run failed. Checksums of pending files are now recorded before any file runs, an applied migration without a checksum fails the run, and tests cover an interrupted run with an edited applied file, a fixed pending file, and a deleted checksum.
  2. High: a COMMIT answered with `ROLLBACK` counted as success. The command tag is checked; the result is `internal` with `outcome: rolled-back`, no `.after` point is reached, and a test catches a failed statement inside the work.
  3. High: a failed rollback returned the connection to the pool. An unconfirmed rollback destroys it, also when the work returned an `Err`, whose result is kept; a test black-holes a rollback on a one-connection pool and then commits on a new connection.
  4. Medium: `replace` accepted an unchanged or older generation. `checkNextGeneration` requires the next one in every adapter, after the existence and stored-generation checks that keep G1's codes, and every suite checks it.
  5. Medium: `EPIPE` matched the SQLSTATE pattern. Only a `pg.DatabaseError` has an SQLSTATE; a unit test covers socket codes and server codes.
  6. Medium: the identity column gives append order, not commit order. Design, specification, and proposal now promise append order, and the design explains why the relay still misses no late commit.
  7. Medium: payloads could hold values JSON changes, and the comparator hid it. Payloads are `JsonObject`, both outboxes reject other values with `invalid` (a shared case), and the comparator compares numbers exactly and arrays and keys strictly, treating only `undefined` fields as absent.
  8. Medium: Toxiproxy test files interfered in parallel. The harness adds `acquireProcessLock`, keyed by the Toxiproxy port, which both Toxiproxy test files hold, with its own tests.
  9. Medium: the race tests relied on coarse predicate locks. Each writer now reads both rows and inserts one, a write skew SERIALIZABLE must break, and the exhaustion test checks what committed.
  10. Medium: `integer` generation columns were narrower than the domain. They are `bigint`, and the admission suite stores a generation beyond 2^31.
  11. Medium: the transaction-scoped assignment `replace` threw on the held-reservation index. It checks first and returns `conflict`, and the assignment suite replaces a released assignment back to held.
  12. Medium: suites could skip a failed read and did not check race losers or final records. `expectRead` and `expectOneWinner` require both.
  13. Low: Execution and Scheduling exported no outbox suite. Both re-export the shared `OUTBOX_CONFORMANCE`, since their ports are structurally identical.
  14. Low: crash and barrier tests could hang. Barriers have a ten-second deadline, child processes are killed after thirty seconds and must write nothing to stderr, and the lock has a deadline.

- **Pass 2 — session `01a170b9-0ca6-71e1-b813-365bde305e37`, reviewed `19cecbd` (diff `78362da...HEAD`).** Header: `gpt-6.1-sol`, medium, read-only. Author snapshots before and after were equal (`06dc6877…a55fe`), as were the reviewer's own. The prompt named pass 1's session and asked for each resolution first: findings 1 to 5, 9, 10, and 13 were confirmed resolved; 6, 7, 8, 11, 12, and 14 partly, with the remainders reported again below. It reran strict validation, the boundary and comment checks, and 23 tests that need no services, and reproduced findings 1, 3, and 7 below. Findings: 0 Critical, 0 High, 7 Medium, 1 Low. Resolutions, in `4c66f0a`:
  1. Medium: the payload check accepted `-0` and array holes, which JSON changes, and threw on a cycle. It rejects all three with `invalid`; the outbox suite and unit tests cover them.
  2. Medium: `jsonb` rejects NUL and unpaired surrogates, which payloads and domain strings accept. Records and messages are stored as JSON text, and the outbox suite carries NUL and an unpaired surrogate, the admission suite an unpaired surrogate in a native reference. The unused outbox `subject` column, which could not hold NUL, is dropped.
  3. Medium: the PostgreSQL assignment `replace` checked the held reservation before existence and generations. It checks them in the in-memory order, and the assignment suite covers the combinations.
  4. Medium: the file lock's stale takeover could admit two holders. The lock is now an exclusive listen on a loopback port derived from its name, which is atomic and freed by the operating system when a holder dies; tests cover three waiters, a killed holder, and a timeout.
  5. Medium: a child killed at its deadline could pass as a crash. The deadline marks a timeout, which fails the test.
  6. Medium: race cases wrote identical records, so a loser's write was invisible. They race two distinct candidates and require the winner's record, and of two competing adds the loser's record must not exist.
  7. Medium: array comparison skipped holes in one direction. It compares every index and its presence; unit tests cover both directions.
  8. Low: two comments still promised commit order. They say append order.

- **Pass 3, the last allowed pass — session `01a170c1-32cf-7660-8b15-55e74f41d5ad`, reviewed `9c00615` (diff `78362da...HEAD`).** Header: `gpt-6.1-sol`, medium, read-only. Author snapshots before and after were equal (`60949056…ab319`), as were the reviewer's own. The reviewer confirmed all eight pass 2 resolutions, reran strict validation, the boundary and comment checks, and 26 tests that need no services. Findings: 0 Critical, 0 High, 2 Medium, 1 Low. All three are fixed in `d684860`; **these fixes have not been independently reviewed**, and because Medium findings remain after the third pass, the governance process sends them to the owner through the coordinator:
  1. Medium: the PostgreSQL inbox stored the consumer as UTF-8 text, which cannot hold NUL and maps two different unpaired surrogates to the same bytes. The consumer is stored as JSON text, and the inbox suite accepts NUL and two different unpaired surrogates as distinct consumers.
  2. Medium: node-pg-migrate would also run JavaScript or TypeScript migrations, which the checksums do not cover. A directory with any file other than `.sql` (dotfiles aside) fails with `precondition-failed` before anything is applied, with a test.
  3. Low: an exit code of `-0`, which `parseExitStatus` accepted, did not round-trip through JSON. `parseExitStatus` records it as `0`, with a unit test.

  The reviewer also noted that the contracts' invalidating writers need predicates (non-terminal executions by artifact, gate, run, assignment, or worker; occupancy by quota scope) and a database clock that this change does not add; design non-goals and risks leave them to items 17, 18, and 21, which add the columns and queries with their use cases.

## Limitations

- Checks ran on macOS arm64 only; Linux runs in CI.
- Failover, pool sizing under load, and expand/contract migrations are not tested.

## Remaining gates

The owner's decision on the pass 3 findings and their unreviewed fixes (governance: findings left after the third pass); integration into `dev` and archive by the coordinator; promotion to `main`.
