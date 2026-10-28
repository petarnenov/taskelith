## Why

G3 item 9 (`define-g3-wire-contracts`, [G3 work plan](/docs/g3-plan.md) row 9) owes the wire contracts of G3 before items 10 to 44 implement them, contract-first as [ADR 0004](/docs/decisions/0004-first-class-engineering-principles.md) principle 6 requires. The coordinator split it on 2026-10-28; this change is sub-change 9c, size M: the extensions of `execution.openapi.json`. Sub-change 9a (`define-control-plane-access-contracts`) defined the browser session and the remote origin of a repository binding; 9b adds the board, session, and event stream operations to the control-plane document in parallel; 9d adds the AsyncAPI worker messages.

[ADR 0015](/docs/decisions/0015-g2-closure.md) decision 5 left to G3 the evidence retirement entry with per-project download authorization and the re-admission writer with a reconciliation queue surface. The [account pool contract](/docs/contracts/account-pool.md) sections 7 and 7.3 define the first delivery and the re-delivery of a slot credential without a wire form, and 9a left an obligation: every issue or re-delivery of a per-run SCM credential re-checks the bound remote URL against the integration's allowed origin ([control-plane wire contracts](/docs/contracts/control-plane-wire-contracts.md) section 4.1).

## What Changes

- `packages/contracts/documents/execution.openapi.json` from 0.5.0 to 0.6.0 (dev already carries 0.5.0 from G3 sub-change 26b, so the next minor version is 0.6.0):
  - `readEvidence` and `downloadEvidence` accept the browser session of the control-plane document beside the operator bearer and serve a record only to a role on its project, a breaking narrowing that the minor version declares;
  - `retireEvidence` (`DELETE /evidence/{evidenceId}`) after the 365-day retention;
  - `readDelegationResult` for the worker of the parent task;
  - `listUnknownExecutions` and `listUnrecordedProcesses`, the reconciliation queue of item 44;
  - `readmitTask`, the re-admission of item 44, by compare-and-set on the ownership generation;
  - `fetchSlotCredential`, the slot credential delivery of account pool sections 7 and 7.3, both the first fetch after the launch authorization and every re-delivery, with no credential in `LaunchGrant`;
  - `issueRunScmCredential` and `fetchRunScmCredential`, the per-run SCM credential fetched over HTTPS by version, each re-checking the bound remote URL with typed refusals.
- The control-plane schemes `browserSession` and `csrfToken` and the schemas `AuthenticationFailure`, `AccessDenial`, `CsrfRejection`, `ExternalId`, and `RemoteUrl`, copied unchanged, as the generator requires.
- Contract tests in `packages/contracts/test/execution-http-contracts.test.ts`.
- `docs/contracts/execution-wire-contracts.md` section 8, linked from the G3 plan row 9 and the account pool contract section 7.
- Spec delta: `execution-wire-contracts`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `execution-wire-contracts`: "Execution HTTP operations" names the G3 operations and the browser session; new requirements for the G3 operations, per-project evidence reads, evidence retirement, the delegation result read, the reconciliation queue reads, task re-admission, slot credential delivery, the per-run SCM credential delivery, its remote re-check, and credential deliveries that are never kept.

## Impact

The private package `@taskelith/contracts` (one document, tests) and documentation. No adapter, handler, route, or published package content; `control-plane.openapi.json`, the AsyncAPI documents, and `sdlc.openapi.json` are unchanged. Items 10, 12, 21, 38, and 44 implement the operations, and 9d's notice and response command build on them.
