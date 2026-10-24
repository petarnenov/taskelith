## Why

G1 item 13 in the [G1 work plan](../../../docs/g1-plan.md), after items 3 (contract tooling) and 7 (task admission). Its exit evidence is the wire schemas. ADR 0004 principle 6 requires versioned OpenAPI 3.1 documents for HTTP APIs and AsyncAPI documents for messages, written before the implementation, with types and runtime validation generated from them and a failure on an unversioned breaking change. Architecture section 9 names the fields every command and event carries. The owner decided that contracts live in a `packages/contracts` package (D2 (b)) and are document-first (D3 (a)).

## What Changes

- Add the private workspace package `@taskelith/contracts` with the first AsyncAPI 3.0 document, `sdlc.asyncapi.json`: the command and event envelopes with the fields of architecture section 9, and the admission events (admitted, used, invalidated) and gate events (opened, decided, blocked, stale, reopened) of SDLC runs.
- Add the first OpenAPI 3.1 document, `sdlc.openapi.json`: create a run, submit a task to a stage for admission, and read an admission.
- Generate TypeScript types (`openapi-typescript`, `json-schema-to-typescript`) and schema bundles from the documents in the build that `make verify` runs, after validating the AsyncAPI document with `@asyncapi/parser`; the output is not committed. The package exports ajv validators over the generated bundles that return a typed value or the schema violations.
- Add `make contract-compatibility`, run by `make verify`: it compares each document with its version at the merge base with `origin/dev` (fetched when absent), with oasdiff as its digest-pinned container for OpenAPI and `@asyncapi/diff` for AsyncAPI, and fails on a breaking change that `info.version` does not declare. A document absent at the base passes.
- Install the tools at exact versions, update their dependency register rows, and regenerate the license inventory and SBOM with reviews of the new packages that ship no license file.

Excluded: transport, broker subjects and bindings, persistence, authentication, and any running service (G2); generated HTTP clients (`openapi-fetch`); document linting (`@redocly/cli`); payloads of specific commands, which arrive with the execution module.

## Capabilities

### New Capabilities
- `sdlc-wire-contracts`: the SDLC OpenAPI and AsyncAPI documents, the generated types and validators, and the breaking-change check.

### Modified Capabilities
None.

## Impact

New package `packages/contracts`, new scripts `scripts/generate-contracts.ts` and `scripts/check-contract-compatibility.ts` with tests, a `contract-compatibility` target in the `Makefile`, the generation step in the root `build` script, `skipLibCheck` in `tsconfig.check.json`, four root development dependencies and the lockfile, the dependency register, inventory, and SBOM. `make verify` now needs Docker for oasdiff. The published `taskelith` package is unchanged.
