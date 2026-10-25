## 1. Documents

- [x] 1.1 Add `execution.asyncapi.json` with the worker channels, commands, observations, confirmation, and inventory report.
- [x] 1.2 Add `execution.openapi.json` with enrollment, launch authorization, task result, and evidence operations.
- [x] 1.3 Add `docs/contracts/execution-wire-contracts.md` with the rules that the schemas cannot express.

## 2. Tooling and domain

- [x] 2.1 Generate types and validators from every contract document, failing on a schema name with two meanings or a path defined twice, and check each document's compatibility.
- [x] 2.2 Add the protocol version helpers to `@taskelith/contracts`.
- [x] 2.3 Add `protocol-not-supported` to the scheduling refusal reasons and to the capacity reservation contract.

## 3. Verification and review

- [x] 3.1 Add package and generator tests.
- [x] 3.2 Run `make verify` and record the results.
- [x] 3.3 Obtain independent review (Codex `gpt-6.1-sol`, medium, read-only) and record the results.
