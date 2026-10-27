# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

Split off from [G2 work plan](/docs/g2-plan.md) item 17 by the coordinating session (Niki), so that item 17 (`authorizeLaunch`) and item 19 (`publishEvidence`) share one worker authentication. The worker session is Pepi. The reviewer is OpenCode `opencode/deepseek-v4.1-flash` (high), next in the rotation.
- Base revision: `7d0bd7b` on `dev`.
- Scope:
  - the lookup by credential hash in `FleetRegistry`;
  - `authenticateWorkerBearer` with the grace-window and revocation rules;
  - the migration with the unique hash columns and their backfill;
  - the `workerCredential` branch of the server and route table;
  - tests.
- Out of scope: everything else of item 17, and item 19.

The coordinator's decisions A1 to A4 of 2026-10-25 are recorded in the design.

## Evidence

- Environment: macOS x86_64, Node v24.22.1, npm 12.2.1, Docker with the Compose services of item 13 (NATS in operator mode with TLS, PostgreSQL 18.6, Toxiproxy).
- Dependencies: none added.
- Contracts: no OpenAPI or wire contract changes. `execution.openapi.json` 0.2.0 already declares `workerCredential`. The installation and enrollment contract now states the bearer rule.

## Author self-check

Recorded before pass 1.

- **The scope:**
  - lookup by hash: `FleetRegistry.workerByCredentialHash`, the in-memory and PostgreSQL adapters, and a conformance case that covers the current and predecessor generations, another worker, a predecessor dropped by the sweep, a revoked worker, and an unknown hash. The registry does not read a clock, so a predecessor past its grace window and not yet swept reads as any predecessor; the service refuses it;
  - authentication: `EnrollmentService.authenticateWorkerBearer`, covering the grace window, revocation, an unknown secret, and a store failure passed through;
  - the server branch: a test route with the scheme, a valid bearer reaching the operation with its principal, 401 for a refused bearer, 503 for a store that is down, and no principal on an operator route.
- **Migration:** the backfill is tested with a record that holds a lone surrogate and NUL escape in its host name, and with a predecessor. The first run of `make verify` caught that `json`, like `jsonb`, rejects such a record. The backfill now masks escapes, as the signals migration does.
- **Against ADR 0004:**
  - hexagonal: the fleet module decides and the adapters store;
  - Clean Code: one authentication path, replacing `authenticate(workerId, secret)`;
  - coverage: see the checks.
- **Obligations recorded for later items:**
  - item 17 re-reads the worker inside the `authorizeLaunch` transaction, so a revocation is ordered against the authorization (the coordinator's decision B1 for item 17, 2026-10-25: a revocation that serializes first is a recorded `worker-not-authorized` rejection), and applies the contract's current-generation rule to the principal's generation;
  - item 19 re-reads the worker inside the `publishEvidence` transaction, since revocation denies observation writes at once;
  - the item that implements `requestDelegation` does the same.

## Checks

`make verify` ran in the worktree with every file tracked:

- At `f4d958e`, before pass 1: 921 tests passed, 0 failed; coverage 99.15% lines, 91.93% branches, 98.89% functions. The comment, boundary, coverage-scope, dependency-inventory, contract-compatibility, OpenSpec, and package checks pass.
- After the pass-1 fixes: 923 tests passed, 0 failed; coverage 99.14% lines, 91.93% branches, 98.89% functions; every other check passes.
- After the pass-2 fixes: 924 tests passed, 0 failed; coverage 99.15% lines, 91.93% branches, 98.89% functions; every other check passes.

## Independent review

The reviewer is OpenCode with model `opencode/deepseek-v4.1-flash` and variant `high`, both set in the invocation. It ran as agent `reviewer`, read-only by pattern rules, with the prompt kept outside the worktree. A SHA-256 snapshot of every tracked and untracked file was taken before and after each pass.

### Pass 1

- Session `ses_e8c4e47ecffe93SqPI4wfkh0X9`, 2026-10-25 17:33 to 17:43, on `f4d958e`.
- Snapshot `54749313…48ee9` before and after: unchanged.
- The agent's shell was refused, so it reviewed by reading files and searching the tree.
- Result: Critical 0, High 0, Medium 1, Low 11.

| # | Finding | Disposition |
| --- | --- | --- |
| M1 | The check is point in time. Item 19 had no re-read obligation, and item 17 had no current-generation obligation. | Fixed: the design and the obligations name the re-read for items 17 and 19 and for `requestDelegation`, and item 17's current-generation rule. The enrollment contract says that the check is point in time. |
| L1 | Authentication statuses depended on each route's table. | Fixed: fixed statuses, 401 and 503. The probe route declares none. |
| L2 | A missing or empty bearer gets a different failure than A3's. | Fixed by wording: A3 and the spec name the three credential causes. A request without a bearer keeps the server's 401 for every scheme. |
| L3 | One hash could be current for one worker and predecessor for another. | Fixed: both adapters answer `internal`, and a conformance case covers it. The targeted `ON CONFLICT` is not changed: a collision is still refused as a conflict. |
| L4 | The backfill does not set `predecessor_valid_until`. | Not changed. Item 13's `#write` has always kept that column with the record, so stored rows have it. The migration test now stores rows as item 13 writes them. The `previous!` in `expirePredecessors` is item 13 code outside this scope; recorded as a follow-up. |
| L5 | The design said no operation of the documents used the scheme. | Fixed: it now says no route of the server's table uses it, and names the contract's three operations. |
| L6 | Verification and tasks did not match the state. | Fixed: the header, the 3.2 task, and the claim about refused bearers. |
| L7 | The conformance claim "expired predecessor" was not covered. | Fixed by wording: the registry reads no clock, which the self-check now says. |
| L8 | No test of a revoked worker's current secret, and no comparison of the whole failure. | Fixed: the fleet test compares the whole failure for an unknown secret, a secret past the grace window, and a revoked current one. |
| L9 | Stale statements in documents and in a comment. | Fixed in the enrollment contract and the class comment. The trust model's G0 status line is not changed: it is outside this scope. |
| L10 | The migration test had no escaped quote or backslash, and no revoked worker. | Fixed: both are added, and the test checks that the record text is unchanged. |
| L11 | A row with a hash and no record would fail with a 500. | Fixed: the lookup requires a record. |

### Pass 2

- Session `ses_e8c3e521cffewrUmW044yAP5iS`, 2026-10-25 17:50 to 17:58, on `16ddaff`.
- Snapshot `d2af37a7…a1532` before and after: unchanged.
- The agent's shell was refused again, so it read the files directly.
- Result: Critical 0, High 0, Medium 0, Low 10.
- It found M1, L1 to L3, L5 to L8, and L10 of pass 1 fully resolved. It found L4 and L9 partly resolved and justified as dispositions, with the gaps that are its Low 2 and Low 3. It found L11 resolved, with the test gap that is its Low 4.
- Under the governance rule, these Low findings are fixed without another review. The fixes below are therefore unreviewed.

| # | Finding | Disposition (unreviewed fix) |
| --- | --- | --- |
| 1 | "Contracts: unchanged" ignored the enrollment contract's edit. | Fixed in the proposal and here. |
| 2 | Section 9 of the enrollment contract gave the worker check to item 16. | Fixed. |
| 3 | The migration test stored a revoked record with `revoked = false`. | Fixed: the column follows the record. |
| 4 | No PostgreSQL test of a row with a hash but no record, or of a duplicate in one column. | Fixed: one integration test covers both. |
| 5 | A shared hash was a 500 with an internal message. | Fixed: any authentication failure other than a refusal is a constant 503. |
| 6 | A store failure's message reached the unauthenticated caller. | Fixed by the same constant 503, which the server test checks. |
| 7 | The probe route did not prove that the fixed answers win over a route's table. | Fixed: it declares conflicting statuses. |
| 8 | `enroll` wrote only the current hash. | Fixed: it writes the predecessor's hash and grace end from the record too. |
| 9 | "Its decision B1" was not defined. | Fixed: the obligation now states the decision and its date. |
| 10 | The scope list omitted the migration. | Fixed. |

## Remaining gates

- Coordinator integration into `dev`, which reviews the merge.
- Follow-up outside this scope: `expirePredecessors` assumes with `previous!` that a row with a grace end holds a predecessor (item 13 code).
