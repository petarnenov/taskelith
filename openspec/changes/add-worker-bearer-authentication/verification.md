# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

Split off from [G2 work plan](../../../docs/g2-plan.md) item 17 by the coordinating session (Niki), so that item 17 (`authorizeLaunch`) and item 19 (`publishEvidence`) share one worker authentication. The worker session is Pepi. The reviewer is OpenCode `opencode/deepseek-v4.1-flash` (high), next in the rotation.
- Base revision: `7d0bd7b` on `dev`.
- Scope:
  - the lookup by credential hash in `FleetRegistry`;
  - `authenticateWorkerBearer` with the grace-window and revocation rules;
  - the `workerCredential` branch of the server and route table;
  - tests.
- Out of scope: everything else of item 17, and item 19.

The coordinator's decisions A1 to A4 of 2026-10-25 are recorded in the design.

## Evidence

- Environment: macOS x86_64, Node v24.22.1, npm 12.2.1, Docker with the Compose services of item 13 (NATS in operator mode with TLS, PostgreSQL 18.6, Toxiproxy).
- Dependencies: none added.
- Contracts: unchanged. `execution.openapi.json` 0.2.0 already declares `workerCredential`.

## Author self-check

Recorded before pass 1.

- **The scope:**
  - lookup by hash: `FleetRegistry.workerByCredentialHash`, the in-memory and PostgreSQL adapters, and a conformance case that covers the current and predecessor generations, another worker, an expired predecessor, a revoked worker, and an unknown hash;
  - authentication: `EnrollmentService.authenticateWorkerBearer`, covering the grace window, revocation, an unknown secret, and a store failure passed through;
  - the server branch: a test route with the scheme, a valid bearer reaching the operation with its principal, the same 401 for each refused bearer, 503 for a store that is down, and no principal on an operator route.
- **Migration:** the backfill is tested with a record that holds a lone surrogate and NUL escape in its host name, and with a predecessor. The first run of `make verify` caught that `json`, like `jsonb`, rejects such a record. The backfill now masks escapes, as the signals migration does.
- **Against ADR 0004:**
  - hexagonal: the fleet module decides and the adapters store;
  - Clean Code: one authentication path, replacing `authenticate(workerId, secret)`;
  - coverage: see the checks.
- **Obligations recorded for later items:**
  - item 17 re-reads the worker inside the `authorizeLaunch` transaction, so a revocation is ordered against the authorization (its decision B1);
  - item 19 uses the principal for `publishEvidence`.

## Checks

`make verify` ran in the worktree before pass 1, with every file tracked: 921 tests passed, 0 failed; coverage 99.15% lines, 91.93% branches, 98.89% functions. The comment, boundary, coverage-scope, dependency-inventory, contract-compatibility, OpenSpec, and package checks pass.

## Independent review

Pending.
