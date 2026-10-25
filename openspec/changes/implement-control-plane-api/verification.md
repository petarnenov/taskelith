# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

[G2 work plan](../../../docs/g2-plan.md) item 16, assigned by the coordinating session (Niki) to the worker session Pepi, with Codex `gpt-6.1-sol` (medium) as the reviewer.
- Base revision: `9e6febd` on `dev`, with items 8, 11, 12, 13, 18, and 22 merged and archived.
- Scope: the row of item 16, plus the obligations items 12, 13, 18, and 22 left to it.
- Out of scope: launch authority (item 17) and the evidence store (item 19).

The coordinator's decisions Q1 to Q11 of 2026-10-25 are recorded in the design. They are coordinator decisions, and the coordinator reports Q1, Q4, and Q11 to the owner.

One deviation: Q2 called the SDLC events address non-breaking, but the contract compatibility check classifies the new channel parameter as breaking. So `sdlc.asyncapi.json` moves to 0.3.0, as the check requires.

## Evidence

- Environment: macOS x86_64, Node v24.22.1, npm 12.2.1, Docker with the Compose services of item 13 (NATS in operator mode with TLS, PostgreSQL 18.6, Toxiproxy).
- Dependencies: none added. The HTTP server is `node:http`, and validation is the existing `checkHttpSchema` (Ajv 8.20.0).
- Evidence check: the change adds only repository-relative links.

## Author self-check

Recorded before pass 1.

- **The plan row:**
  - the composition root and service entry;
  - the HTTP adapter for create run, submit task, read admission, and read result, with runtime validation and the D10 operator credential;
  - the submit-task use case in one transaction, with the task, its admission binding, and its outbox record.
- **Architecture section 9 step 1 and R18:** the request is authorized, the task is bound to its run and stage, and an implementation task needs its prerequisite gates (422 otherwise). The task and its outbox entry commit together.
- **Obligations closed:**
  - item 12: wire commands, validated with `checkMessageSchema`, and the redrive API with the operator credential;
  - item 13: `enrollWorker` over HTTP, the restore-quarantine stop of publication, and the periodic grace-window sweep;
  - item 18: no placement on a worker without a common protocol version;
  - item 22: one logger and metrics store for every adapter, the sampler, the lag monitor, and request logs with correlation.
- **Obligations recorded for later items:**
  - item 21: the placement loop (Q1), `requestDelegation` on the control-plane side (Q7), and the outcome facts `readTaskResult` serializes;
  - item 17: worker authentication with a lookup by hash (Q6), and `authorizeLaunch`;
  - item 19: evidence in `readTaskResult`;
  - item 20: `requestDelegation` on the worker side;
  - item 23: the image and `make` targets that run `main.ts`;
  - G3 item 26: TLS for the API.
- **Against ADR 0004:**
  - hexagonal: the modules stay free of Node and of the contracts package, the use cases depend on a store port, and the HTTP adapter is at the edge;
  - contract-first: every request is validated against the documents, and every response type in the end-to-end test;
  - coverage: see the checks.
- **Open points:** see the design's risks:
  - placement is not wired until item 21;
  - there is one instance;
  - the workflow registry is a file;
  - a repeat compares by kind, stage, work item, and planning artifacts;
  - the HTTP is plain.

## Checks

`make verify` ran in the worktree before pass 1 and after each round of fixes:

- At `583cff0`, with every file tracked: 900 tests passed, 0 failed; coverage 99.12% lines, 91.75% branches, 99.03% functions. The comment, boundary, coverage-scope, dependency-inventory, contract-compatibility, OpenSpec (52 of 52), and package checks pass.
- At `53e7eb0`, after the pass-1 fixes: 908 tests passed, 0 failed; coverage 99.11% lines, 91.90% branches, 98.82% functions; every other check passes.
- At `a9d88ba`, after the pass-2 fixes: 913 tests passed, 0 failed; coverage 99.14% lines, 91.94% branches, 98.93% functions; every other check passes.
- `npm run openspec -- validate implement-control-plane-api --strict` passed at each of these revisions.

## Independent review

Assigned reviewer: Codex CLI, with `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, run from the worktree.
- The prompt named AGENTS.md, ADR 0004, the governance review process, plan row 16 with D10 and D12, architecture section 9 and R18, the trust model, the wire, enrollment, and capacity contracts, the contract documents, and the coordinator decisions Q1 to Q11.
- The prompt and log are kept outside the worktree.

- **Pass 1 — session `01a1736b-33df-7c41-ae2c-2203f4b82847`,** reviewed `git diff 9e6febd 2f422e2`. The header reports `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`. Snapshot before and after: `f1ecf3f9…a92f`, equal. The reviewer reproduced several findings against the built code. Findings: 0 Critical, 3 High, 8 Medium, 1 Low, all resolved at `53e7eb0`:
  1. High: a malformed percent-encoding threw outside the error boundary, before authentication, so one request could end the process. Parsing and matching now run inside the boundary; a malformed encoding is 400. A test sends `%ZZ` and then a good request.
  2. High: the redrive published without the quarantine guard. It now runs under the same publication fence and is 503 under quarantine; the end-to-end test covers it.
  3. High: the guard checked quarantine before the batch was published, so a quarantine entered meanwhile let up to 100 rows leave. `InstallationPublicationFence` now holds the installation record `FOR SHARE` in a READ COMMITTED transaction for the whole round. A test shows that entering quarantine waits for the round in flight, and that the next round publishes nothing.
  4. Medium: a body under 1 MiB could make an event over the broker limit, which would block its subject. The submission now fails with 400 when the encoded event exceeds the limit less header room; a test submits a body of 1,046,611 bytes.
  5. Medium: a correlation header that carried a bearer secret reached the logs. A value with a secret is now replaced by a generated one; a test sends the operator token as the correlation.
  6. Medium: the redrive sequence was not validated. A sequence that is not a positive safe integer is now 400 before the broker, and the documents bound `sequence` and `from`.
  7. Medium: success bodies were not validated at runtime. Every operation now names its response schema, and a violating body is 500. A quarantine reason is cut to the 512 characters its schema allows, and the operations declare 500 and 503.
  8. Medium: `createRun` consulted the registry before the stored run, so a repeat failed after the registry changed. The stored run now answers first; a unit test removes the workflow from the registry and repeats.
  9. Medium: a thrown start-up failure skipped the release of resources. A cleanup stack now releases everything acquired so far, newest first, on a returned or thrown failure.
  10. Medium: the loops and the signal shutdown were unsupervised. Each loop is supervised from the start and a failure stops the service; `stop` is idempotent, and the entry handles its errors.
  11. Medium: an unreadable CA file threw. It is now an `invalid` failure naming `TASKELITH_NATS_CA`; a test covers it.
  12. Low: the operational target claimed the sweep revokes within the window. It now separates the immediate refusal of the old secret from the broker revocation, which depends on the sweep's success.

- **Pass 2 — session `01a17378-b035-7c53-9d6d-575c248b5645`,** reviewed `git diff 2f422e2 cd70ea3` for the resolutions, then `git diff 9e6febd cd70ea3` as a whole. The header reports `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`. Snapshot before and after: `aed7eabf…ce9d`, equal. The reviewer confirmed pass-1 findings 1 to 4, 6 to 9, 11, and 12 fully resolved, and findings 5 and 10 in part; the gaps are findings 1, 5, and 6 below. Findings: 0 Critical, 0 High, 6 Medium, 1 Low, all resolved at `a9d88ba`:
  1. Medium: a secret with text glued in front passed the correlation check, since the patterns needed a word boundary. The secret patterns now match without one; tests put a letter or a digit in front of a bearer secret and a seed.
  2. Medium: an end or cancellation for a worker without a record failed, which kept supersession from releasing the reservation. Such a command is now not written, since no worker reads it; only an offer needs the protocol version and the epoch. A PostgreSQL test deletes the worker and supersedes.
  3. Medium: an unavailable credential store answered 401. The authentication failure now maps through the operation's statuses: forbidden is 401, unavailable 503. A unit test covers it.
  4. Medium: an enrollment could pass capacity values the integer columns cannot hold. The handler now refuses a value above 2,147,483,647 with 400 before it presents the token; a test shows that the token stays usable.
  5. Medium: a loop defect ended the process with code 0. `stopped` now settles with `failed`, and the service entry exits with 1; a unit test covers the entry.
  6. Medium: `process.once` let a repeated signal kill the process during cleanup. The handlers now stay until the stop ends; `serveUntilStopped` is tested with a process stand-in that delivers SIGTERM twice and SIGINT.
  7. Low: a malformed path made 400 on `readAdmission` and `readTaskResult`, which did not declare it. Both now declare 400.

- **Pass 3 — session `01a17384-0c58-7a13-b746-9ddfffbfa388`,** reviewed `git diff cd70ea3 9cb5855` for the resolutions, then `git diff 9e6febd 9cb5855` as a whole. The header reports `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`. Snapshot before and after: `4d978192…f5d8`, equal.
  - It confirmed all seven pass-2 findings and pass-1 finding 5 fully resolved, and pass-1 finding 10 in part; the gap is finding 1 below.
  - Findings: 0 Critical, 0 High, 1 Medium, 1 Low. This was the third pass, so the findings went to the owner through the coordinator, with options. On 2026-10-25 the owner decided, through the coordinator and not by delegation, on option (a): fix both as proposed, without another review. The fixes are **not independently reviewed**:
  1. Medium, **fixed without review by the owner's decision:** shutdown has no deadline. `stop` waits for every operation in flight before it closes anything, and the database operations take no abort signal and have no query timeout. So a round blocked in `holdForPublication` behind a lock held by another transaction keeps the API open and `stopped` unsettled. Fixed: the stop closes the API first and waits for the loops for at most 30 s. It then cancels the pool's statements (`cancelActiveStatements`, by the pool's own application name), gives the loops 5 s more, and releases everything. A loop failure after the stop began is not a defect. An integration test holds the installation row `FOR UPDATE` until a publisher round waits for it, delivers SIGTERM through `serveUntilStopped`, and sees the stop end within its deadline with `stopped` and a forced-stop log line.
  2. Low, **fixed without review by the owner's decision:** the bearer scheme is matched case-sensitively, so `bearer` or `BEARER`, which HTTP allows, gets 401. Fixed: the scheme is matched case-insensitively, and the token exactly; a unit test accepts `Bearer`, `bearer`, and `BEARER` and refuses a token in another case.

## Remaining gates

- Integration into `dev` by the coordinator, then archiving the change.
