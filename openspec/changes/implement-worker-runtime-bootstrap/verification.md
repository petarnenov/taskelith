# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

[G2 work plan](../../../docs/g2-plan.md) item 20, first of the five changes the coordinator split it into (20a). The coordinating session (Niki) assigned it to the worker session Pepi. The reviewer is Claude Fable 5.1 (medium), by rotation after OpenCode; Antigravity is paused.
- Base revision: `f83e36d` on `dev`.
- Scope: the worker application's settings, composition root, and start sequence, with enrollment on the first start.
- Item 13's obligation met here: the worker's storage of its credentials under `worker/` with the identity's credential generation, and the use of `connectWorkerTransport` with them.
- Out of scope: 20b to 20e, as the design's Non-Goals list.

The coordinator's decisions (the split, and Q1 to Q5 of 2026-10-25) are recorded in the design as coordinator decisions.

## Evidence

- Environment: macOS x86_64, Node v24.22.1, npm 12.2.1, Docker with the Compose services of item 13 (NATS in operator mode with TLS, PostgreSQL 18.6, Toxiproxy).
- Dependencies: no third-party package added. `apps/worker` gains workspace dependencies, and `apps/control-plane` gains `@taskelith/worker` as a development dependency for its integration test. The regenerated inventory differs only by these.
- Contracts: no OpenAPI or AsyncAPI change. The installation and enrollment contract gains section 10, and the worker journal contract's section 2 gains the `worker/credentials/` row and the write order.

## Author self-check

Recorded before pass 1.

- **The plan row's part for 20a:** the worker application with outbound connections only. `worker-start.test.ts` checks that a started worker holds no listening TCP server.
- **Item 13's obligation:** the credential files, their modes, the identity's generation and references, and the safe read (`worker-root.test.ts`). The broker connection uses the stored `.creds` text and the worker's inbox prefix (`worker-start.test.ts`). The real control plane enrolls a worker started with a token, and the worker connects to the real broker with the stored credential, then again on a later start without the token (`control-plane-api.integration.test.ts`).
- **Failure paths:** no token, a refused token, a malformed installation identifier (no root is created), a journal fault (no request and no connection), a failed broker connection (the root is released), and a repeated stop.
- **Against ADR 0004:**
  - hexagonal: the worker's use case depends on the Fleet port `EnrollmentClient` and on the transport function it is given; the HTTP adapter and the journal adapter hold the I/O;
  - contract-first: the enrollment request and answer are checked against `execution.openapi.json`;
  - Clean Code: the HTTP POST and status mapping are shared by both clients instead of duplicated;
  - coverage: see the checks.
- **Obligations recorded for later changes:**
  - 20b to 20e as planned, with item 12's, 16's, 17's, and 18's obligations;
  - storing a rotated credential generation on the worker has no owner yet; reported to the coordinator.

## Checks

`make verify` ran in the worktree with every file tracked:

- Before pass 1, at `41f2de5`: 1016 tests passed, 0 failed; coverage 99.23% lines, 91.79% branches, 98.89% functions. The comment, boundary, coverage-scope, dependency-inventory, contract-compatibility, OpenSpec, archive, and package checks pass.
- After the pass-1 fixes: 1019 tests passed, 0 failed; coverage 99.20% lines, 91.78% branches, 98.89% functions; every other check passes.

## Independent review

The reviewer is Claude Code with model `claude-fable-5-1` and effort `medium`, set in the invocation, in plan permission mode with `Edit`, `Write`, and `NotebookEdit` disallowed. The prompt is kept outside the worktree. A SHA-256 snapshot of every tracked and untracked file is taken before and after each pass.

### Pass 1

- Session `bdfbca64-bd91-4d62-ab50-f783ae295a98`, 2026-10-25, on `41f2de5`; `claude-fable-5-1` in `modelUsage`.
- Snapshot `e6e940a6…3fc2d` before and after: unchanged. The reviewer reports that it copied a temporary script into `apps/worker/` for a few seconds to reproduce H1 and removed it at once, which the read-only rule does not allow. The snapshot and `git status` show no change left behind.
- Result: Critical 0, High 1, Medium 1, Low 5.

| # | Finding | Disposition |
| --- | --- | --- |
| H1 | A `worker/` without an identity made the first start spend the token before `enrollWorkerRoot` refused the subtree, and the first start asked the control plane without the root lock. | Fixed: `claimWorkerRoot` refuses an existing `worker/` and takes the root lock before the request; the start test creates such a subtree and sees no request. |
| M1 | Every local precondition of the root was checked only after the token was spent. | Fixed with H1: the claim runs the checkout, volume, and path checks first; the start test with an unsupported volume sees no request. Section 10 of the contract states the remaining window. |
| L1 | A failing close at shutdown became an unhandled rejection. | Fixed: the signal handler drops the rejection, `stopped` still settles, and a test closes with an error. |
| L2 | The journal fault test accepted any failure. | Fixed: it expects reason `flush-failure`. |
| L3 | The contract said a later start never reads the token, while the settings read it. | Fixed: "never redeems the token". |
| L4 | The `EnrollmentRequest` description in `execution.openapi.json` says the worker created its journal first. | Not changed: the wire contracts change only with the coordinator's approval. Recorded in the design and reported to the coordinator. |
| L5 | Task 4.1 was unchecked. | Fixed. |
