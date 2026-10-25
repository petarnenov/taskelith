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

`make verify` ran in the worktree before pass 1:

- At `583cff0`, with every file tracked: 900 tests passed, 0 failed; coverage 99.12% lines, 91.75% branches, 99.03% functions. The comment, boundary, coverage-scope, dependency-inventory, contract-compatibility, OpenSpec (52 of 52), and package checks pass.
- `npm run openspec -- validate implement-control-plane-api --strict` passed.

## Independent review

(to be recorded)

## Remaining gates

- Independent review.
- Integration into `dev` by the coordinator, then archiving the change.
