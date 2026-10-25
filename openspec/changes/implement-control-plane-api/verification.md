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

## Remaining gates

- Independent review.
- Integration into `dev` by the coordinator, then archiving the change.
