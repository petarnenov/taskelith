## Why

G3 item 9 (`define-g3-wire-contracts`, [G3 work plan](/docs/g3-plan.md) row 9) owes the wire contracts of G3 before items 10 to 44 implement them, contract-first as [ADR 0004](/docs/decisions/0004-first-class-engineering-principles.md) principle 6 requires. The coordinator split it on 2026-10-28; this change is sub-change 9d, size M: the AsyncAPI messages that deliver turns, approval responses, and the notice of a refreshed per-run SCM credential to a worker and carry session observations and the worker's adoption confirmation back, and the terminal WebSocket. 9a and 9b defined the control-plane document with the session operations whose schemas 9d reuses, and 9c the HTTPS fetch of a per-run SCM credential and the delegation result read that 9d's notice and response command build on.

## What Changes

- `packages/contracts/documents/execution.asyncapi.json` from 0.7.0 to 0.8.0, execution protocol version 2:
  - commands `session.turn.deliver`, `session.response.deliver`, `session.delegation-result.deliver`, and the notice `execution.scm-credential.refreshed`;
  - observations `session.generation.started`, `session.generation.ended`, `session.turn.delivered`, `session.turn.not-delivered`, `session.turn.ended`, `session.request.recorded`, `session.response.delivery-reported`, `session.output.appended`, `session.limit.signaled`, `execution.scm-credential.adopted`, and `execution.scm-credential.not-adopted`;
  - the session schemas of 9b, `DelegationResult` and `DelegationSummary` of 9c, and `ExternalId`, copied unchanged.
- New `packages/contracts/documents/terminal.asyncapi.json` 0.1.0: the browser terminal frames and the worker relay frames, registered with the generator.
- `control-plane.openapi.json` from 0.2.0 to 0.3.0: `openTerminal`, the terminal WebSocket upgrade, with `TerminalRefusal`.
- `execution.openapi.json` from 0.6.0 to 0.7.0: `openWorkerRelay`, the worker relay upgrade, with `RelayRefusal`.
- `SESSION_PROTOCOL_VERSION` (2) exported by `@taskelith/contracts`; `EXECUTION_PROTOCOL_VERSION` stays 1.
- `packages/contracts/breaking-changes.json`: the 80 additions that the asyncapi diff lists for `execution.asyncapi.json` 0.8.0.
- Contract tests `worker-session-messages.test.ts` and `terminal-contracts.test.ts`, and updated document versions and shared names in the existing tests.
- New contract page `docs/contracts/worker-messages-and-terminal.md`, linked from the execution and control-plane wire contract pages; the refreshed credential wording fixed in the G3 plan row 9 and the source control contract.
- Spec deltas: `execution-wire-contracts`, `control-plane-wire-contracts`, and `scm-port`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `execution-wire-contracts`: "Worker channels", "Protocol version", and "G3 execution operations" name the session messages, `SESSION_PROTOCOL_VERSION`, and `openWorkerRelay`; new requirements for session work at protocol version 2, the session commands and their outcomes, responses from an approver, the delegation result response command, the refreshed SCM credential notice and its adoption confirmation, the session observations, the worker relay, the terminal frames document, and no secret on the worker wire.
- `control-plane-wire-contracts`: "Operation roles" names the terminal; new requirements for the terminal upgrade, its refusals, the attach with the CSRF token, its lifetime, its connection end, and its frame bounds.
- `scm-port`: "Refreshed credential delivery" says that item 9 defines a notice without a secret and an HTTPS fetch, not a message that carries the credential.

## Impact

The private package `@taskelith/contracts` (documents, one exported constant, tests), the contract generator's document list, and documentation. No adapter, handler, route, runtime, or published package content; the worker and control plane keep protocol version 1 until items 18 and 13 execute version 2. Items 13, 18, 21, 38, 39, and 40 implement the contract.
