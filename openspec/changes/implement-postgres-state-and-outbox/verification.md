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

On `1dcbc6f`: `make verify` passed: comment rule, workspace package contract and boundary checks, 484 tests (including 33 PostgreSQL integration tests), coverage 99.68% lines, 95.98% branches, 99.45% functions, contract compatibility, the dependency inventory (710 package paths), strict OpenSpec validation (43 items), the archive dry run, and package verification.

## Independent review

Assigned reviewer: Codex CLI 0.164.0 with `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> -`, the prompt on stdin; prompt and output files were kept outside the worktree.

## Limitations

- Checks ran on macOS arm64 only; Linux runs in CI.
- Failover, pool sizing under load, and expand/contract migrations are not tested.

## Remaining gates

Independent review; integration into `dev` and archive by the coordinator; promotion to `main`.
