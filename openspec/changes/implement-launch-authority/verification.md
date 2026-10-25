# Verification

Date: 2026-10-25. Author verification is recorded below, and the independent review as far as it has run.

## Scope and source

[G2 work plan](../../../docs/g2-plan.md) item 17. The coordinating session (Niki) assigned it to the worker session Pepi. The reviewer is OpenCode `opencode/deepseek-v4.1-flash` (high), the next one in the rotation.
- Base revision: `603731b` on `dev`, with `add-worker-bearer-authentication` merged and archived.
- Scope: the row of item 17, and the obligations that items 16 and `add-worker-bearer-authentication` left to it:
  - worker authentication with an in-transaction re-read at the current generation;
  - the `authorizeLaunch` HTTP operation.
- Out of scope:
  - the evidence store (item 19);
  - the worker runtime (item 20);
  - reconciliation and the placement loop (item 21).

The coordinator's decisions B1 to B9 of 2026-10-25 are recorded in the design. They are coordinator decisions, and the coordinator reports B2 to the owner.

## Evidence

- Environment: macOS x86_64, Node v24.22.1, npm 12.2.1, Docker with the Compose services of item 13 (NATS in operator mode with TLS, PostgreSQL 18.6, Toxiproxy).
- Dependencies: no third-party package added. The new workspace package `@taskelith/worker-control-plane-client` is private and worker-only. The regenerated inventory differs only by it.
- Contracts: no OpenAPI or AsyncAPI changes. The launch authorization contract gains section 11.

## Author self-check

Recorded before pass 1.

- **The plan row:**
  - the launch-authority service and its operation under the item 3 contract;
  - the authorization record and its crash points;
  - the worker's client;
  - invalidation after authorization, which becomes a cancellation request and, for a revoked worker, a reconciliation request.
- **Contract section 10, covered here:**
  - lookups, mismatches, and other workers: `launch-authority.integration.test.ts` checks each check's reason in order, a final rejection, a retryable one not recorded, quarantine and an old epoch granting nothing, a changed request under the same operation, and another worker's replay that gets nothing and changes nothing;
  - the lost first response: the crash point after the commit gives the same grant and issue time, and the one before the commit decides anew;
  - expiry: a replay after the deadline is `expired` and changes nothing stored;
  - invalidation raced with the authorization: six rounds, each with a fresh worker and a staggered revocation. The revocation lands on either side. No grant outlives it, and each revoked grant is cancelled once;
  - writers: a bulk run predicate, an empty predicate, and a worker revocation that also marks the execution uncertain;
  - ownership: re-authorization of an unspawned execution, and `execution-conflict` for another one;
  - the index: `launch-records.integration.test.ts` checks every predicate, the run from the admission, and liveness after revocation;
  - the migrations: the backfill of stored grants;
  - the HTTP operation: through the running control plane (`control-plane-api.integration.test.ts`), with the worker bearer, the operator refused, and a 400;
  - the wire mapping of all four outcomes (`api-server.test.ts`);
  - the client (`http-launch-authority-client.test.ts`).
- **Contract section 10, left to later items:**
  - the worker's monotonic deadline and spawn decisions, and the suspend cases: item 20, with `workerLaunchDeadline`;
  - start observations, `unauthorized-start`, and reconciliation: item 21;
  - the gate cases of an implementation admission: the item 7 domain tests already cover them. G2 has no gate writer, so G3 wires them;
  - the failure scenarios: item 24.
- **Against ADR 0004:**
  - hexagonal: the decision stays in the domain, the use case depends on the store port, and the adapters store;
  - microkernel: the client is an adapter of an Execution port;
  - contract-first: requests and answers are validated against `execution.openapi.json` on both sides;
  - coverage: see the checks.
- **Obligations recorded for later items:**
  - G3: a writer of artifact revisions that updates `current_revisions` and calls `invalidateLaunches`; writers of gates and policy revisions likewise;
  - G6: the restore quarantine's entry, likewise;
  - item 20: the retry loop, the journal steps W2 and W3, and the deadline;
  - item 21: start observations through the `launchAuthId` lookup, and reconciliation of uncertain executions;
  - follow-up: item 18's cancellation keeps `assignment-ended` (B8).

## Checks

`make verify` ran in the worktree with every file tracked:

- Before pass 1: 951 tests passed, 0 failed; coverage 99.18% lines, 91.61% branches, 98.84% functions. The comment, boundary, coverage-scope, dependency-inventory, contract-compatibility, OpenSpec, and package checks pass.

## Independent review

Pending.
