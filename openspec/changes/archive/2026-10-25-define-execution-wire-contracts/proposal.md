## Why

G2 item 8 in the [G2 work plan](../../../docs/g2-plan.md). ADR 0004 principle 6 makes wire interfaces contract-first, and architecture section 13 requires compatible server and worker version windows and a worker that fails closed when it cannot execute the assigned protocol. The merged contracts for [launch authorization](../../../docs/contracts/launch-authorization.md), [supervisor identity](../../../docs/contracts/supervisor-identity.md), [worker journal](../../../docs/contracts/worker-journal.md), and [capacity reservation](../../../docs/contracts/capacity-reservation.md) leave the messages and operations to this item. So does the item 7 domain. Items 12, 13, 16, 17, 19, 20, and 21 build on them.

## What Changes

- Add `packages/contracts/documents/execution.asyncapi.json` (AsyncAPI 3.0.0, version 0.1.0). It defines the worker command channel and the worker observation channel of decision D3 (a). The commands are the assignment offer, the cancellation request, and the assignment end, carried in the shared `CommandMetadata` envelope. The observations are assignment acceptance and refusal, command rejection (an offer in an unsupported protocol version included), launch rejection, the supervisor facts, capacity and admission pressure, and an inventory report. The control plane's cumulative confirmation also travels on the command channel.
- Add `packages/contracts/documents/execution.openapi.json` (OpenAPI 3.1.0, version 0.1.0) with `enrollWorker`, `authorizeLaunch` (decision D12 (a)), `requestDelegation` (capacity reservation section 7), `readTaskResult`, `publishEvidence`, `readEvidence`, and `downloadEvidence`, and their bearer credentials.
- Add the optional `ownershipGeneration` of a used admission to the `Admission` schema of both SDLC documents, which therefore declare version 0.2.0.
- Add an execution protocol version with its compatibility window. Every command, observation, and report carries it. `VersionedCommand` is the part a worker reads first, so that it rejects a command of an unsupported version before it reads the payload. `@taskelith/contracts` exports `EXECUTION_PROTOCOL_VERSION`, `SUPPORTED_PROTOCOL_VERSIONS`, `supportsProtocolVersion`, and `commonProtocolVersion`.
- Generate the types and validators from every contract document. `scripts/generate-contracts.ts` lists the documents and merges their schemas and paths, and fails when a schema name has two meanings or a path is defined twice. The compatibility check iterates the same list.
- Add `protocol-not-supported` to the scheduling domain's `REFUSAL_REASONS`, with which the control plane refuses an offer that the worker rejected for its protocol, and a row to the capacity reservation contract's reason table.
- Add [docs/contracts/execution-wire-contracts.md](../../../docs/contracts/execution-wire-contracts.md) with the rules that the schemas cannot express.

Excluded: the transport, streams, and consumers (item 12); credential content and subject permissions (item 13); the HTTP server, the persistence of results and evidence, and the operator credential on the SDLC operations (items 11, 16, 17, and 19); the worker and reconciliation logic (items 20 and 21); what an offer executes and the harness side of delegation (G3).

## Capabilities

### New Capabilities
- `execution-wire-contracts`: the execution documents, the protocol version, and the rules above.

### Modified Capabilities
- `sdlc-wire-contracts`: the package holds several documents with one vocabulary, and generation covers all of them.
- `scheduling-model`: a refusal may carry `protocol-not-supported`.

## Impact

Two new contract documents, a new contract page, and version 0.2.0 of both SDLC documents. `@taskelith/contracts` gains a source file, exports, and tests. The generator and the compatibility check change, with tests. `@taskelith/scheduling` gains one refusal reason and a test, and the capacity reservation contract gains one row. No dependency is added, and the published npm package is unchanged.
