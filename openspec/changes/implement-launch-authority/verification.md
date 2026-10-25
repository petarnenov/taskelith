# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

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
  - the index: `launch-records.integration.test.ts` checks every predicate, the run from the assignment, and liveness after revocation;
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
  - follow-up (B8): item 18's cancellation of a running assignment records the attempt's cancellation as `launch-revoked`, through `revokeLaunch`, while its command says `assignment-ended`.

## Checks

`make verify` ran in the worktree with every file tracked:

- Before pass 1, at `298360b`: 951 tests passed, 0 failed; coverage 99.18% lines, 91.61% branches, 98.84% functions. The comment, boundary, coverage-scope, dependency-inventory, contract-compatibility, OpenSpec, and package checks pass.
- After the pass-1 fixes and the merge of `dev` at `c84ca71` (item 19), at `102d03b`: 990 tests passed, 0 failed; coverage 99.22% lines, 91.71% branches, 98.96% functions; every other check passes.

- After the pass-2 fixes: 992 tests passed, 0 failed; coverage 99.23% lines, 91.73% branches, 98.96% functions; every other check passes.

The merge of `dev` touched code, so the second pass reviews it too (protocol step 9). The conflicts were additive: the store port, the route table, the API services, the composition, the PostgreSQL transaction and committing adapters, and the tests gained both items' members. My migration `1792932000000` stays later than item 19's `1792931700000`.

## Independent review

The reviewer is OpenCode with model `opencode/deepseek-v4.1-flash` and variant `high`, both set in the invocation. It ran as agent `reviewer`, read-only by pattern rules, with the prompt kept outside the worktree and the coordinator's rules for simple git commands. A SHA-256 snapshot of every tracked and untracked file was taken before and after each pass.

### Pass 1

- Session `ses_e8c0969edffeArfvZLqztFubSh`, 2026-10-25 18:48 to 19:00, on `298360b`.
- Snapshot `8e54cbf8…94e4` before and after: unchanged.
- The agent ran 44 shell commands, and 3 were refused.
- Result: Critical 0, High 2, Medium 7, Low 17.

| # | Finding | Disposition |
| --- | --- | --- |
| H1 | A concurrent recorded rejection, or another write conflict, became a 500. | Fixed: a conflict is answered `unavailable`, so the repeat replays the recorded decision. A test races two rejections of one operation. In that test the loser replays the winner's record, through the serialization retry. |
| H2 | The client accepted a grant without comparing its bound values with the request. | Fixed: a grant for another operation, execution, assignment, attempt, epoch, ownership, or admission is `internal`, and tests cover two of them. |
| M1 | A missing admission was a 500, not `admission-not-current`. | Fixed: the run comes from the assignment, and a test deletes the admission. |
| M2 | `current_revisions` had no backfill, so earlier tasks would be rejected. | Fixed: the migration seeds it from the used admissions in identity order, and the migration test checks the first one wins. |
| M3 | No predicate found the grants affected by a gate added to a stage. | Fixed: the gate predicate takes a set, and a gate writer names every gate of the stage. The conformance suite reads it. |
| M4 | The race test is not deterministic and proves no order. | Recorded in the design: both sequential orders are tested deterministically, and the concurrent rounds check the invariant whatever the order. Forcing the serialization victim is not done. |
| M5 | The bulk writer test had one grant. | Fixed: two grants, two revocations, and two cancellation commands. |
| M6 | The empty predicate was not raced with an authorization. | Recorded in the design: without a changed value, the order cannot be observed, and the empty read is the same index read. |
| M7 | No shared conformance suite for the new ports. | Fixed for `LaunchRecords`: `LAUNCH_RECORDS_CONFORMANCE`, run against PostgreSQL. Recorded for the client, which has one adapter whose tests are its contract. |
| L1 | A store failure reading the worker became a recorded rejection. | Fixed: it is propagated. |
| L2 | `reportsNotStarted` was not checked in the mapping. | Fixed: a non-boolean is `invalid`. |
| L3 | A 502 or 504 was `internal`. | Fixed: `unavailable`, with tests. |
| L4 | A base URL without a trailing slash lost its path. | Fixed, with a test. |
| L5 | The current-revisions conformance comment was wrong. | Fixed. |
| L6 | `CurrentRevisions` has no update for G3. | Recorded: G3 extends the port, as its comment and the design say. |
| L7 | Task 4.2 was unchecked. | Fixed with this record. |
| L8 | Inaccurate statements in the proposal. | Fixed. |
| L9 | A three-line SQL comment. | Fixed, although `verify:comments` does not cover SQL. |
| L10 | No test of several failed checks at once. | Fixed: the first failed check wins. |
| L11 | A missing run or an unknown workflow was a 500. | Fixed: `unavailable`, and nothing is recorded. Pass 2 added the unknown workflow's test. |
| L12 | Item 18's attempt records `launch-revoked` while its command says `assignment-ended`. | Not changed: item 18's behavior is outside this scope, and B8 recorded it as a follow-up. |
| L13 | The backfill mask corrupted identifiers with a backslash. | Fixed: only the escapes `jsonb` rejects are masked. A test stores an artifact identifier with a backslash and a quote. |
| L14 | A grant's run could be null. | Fixed: it is the assignment's run, which every grant has. A backfilled grant without its assignment row keeps a null run. |
| L15 | The trust model says "active attempt", and the code marks executions. | Recorded in the design: an attempt without a grant has no execution that could run, and item 21 decides about it. |
| L16 | The helper was tested through only two predicates. | Fixed: the run, assignment, artifact, worker, and all predicates go through the helper. The gate predicate is tested as a read. |
| L17 | The other-worker test used an unenrolled worker. | Fixed: an enrolled worker B gets nothing and changes nothing of A's. |

### Pass 2

- Session `ses_e8bf21d95ffeqUwyPirDwQ4Fh0`, 2026-10-25 19:13 to 19:22, on `6352497`, including the merge `102d03b`.
- Snapshot `1c3bfce4…79c0c` before and after: unchanged.
- The agent ran 25 shell commands, and none was refused.
- Result: Critical 0, High 0, Medium 3, Low 10.
- Status of pass 1:
  - fully resolved: H1, H2, M1, M2, M3, M5, M7, L1 to L5, L7, L9, L10, L13, L16, and L17;
  - justified as recorded: M6, L6, L12, L14, and L15;
  - partly resolved: M4, L8, and L11, which are its F4, F8, and F10.
- It found the merge additive, with nothing of item 19 dropped.

| # | Finding | Disposition |
| --- | --- | --- |
| F1 | After M1, the run came from the assignment without checking that it is the admission's run. | Fixed: an admission bound to another run is `admission-not-current`, with a test. |
| F2 | The administration's `revoke-worker` was not tested with a grant. | Fixed: the administration test grants a launch through the shared fixture, runs `revoke-worker`, and finds the grant revoked, the execution uncertain, and one cancellation command. |
| F3 | An internal failure of `authorizeLaunch` was a 500, which the contract does not declare. | Fixed: the route answers `internal` with 503, with a server test. |
| F4 | The record of M4 claimed a deterministic test of the order "before". | Fixed: a test revokes the worker before its first authorization, and the text says which outcomes occur depends on timing. |
| F5 | The index's run was described as the admission's. | Fixed: it is the assignment's. |
| F6 | The design said a masked `nativeReference` fails closed. | Fixed: revisions compare by identifier and digest, so it changes no decision. |
| F7 | The revisions backfill was described as `submitTask`'s order. | Fixed: the choice is arbitrary but fixed, and another digest fails closed, as the design and the migration comment say. |
| F8 | The proposal named `execution.openapi.json` 0.2.0, which is 0.2.1 after the merge. | Fixed: 0.2.x. |
| F9 | A backfilled grant without its assignment keeps a null run. | Recorded in the design: no G2 path stores such a grant, and every other predicate finds it. |
| F10 | The unknown workflow had no test. | Fixed: a test with an empty registry gives `unavailable`. |
| F11 | The B8 follow-up was described too broadly. | Fixed: the follow-up names the exact mismatch. |
| F12 | The mask's comment was narrower than the mask, and it depended on `standard_conforming_strings`. | Fixed: `E''` strings, and the comment says that pairs are masked too. |
| F13 | The trust model and a fleet comment spoke of active attempts. | Fixed: trust model section 4 says which executions become uncertain, and the comment names item 17's registry. |
