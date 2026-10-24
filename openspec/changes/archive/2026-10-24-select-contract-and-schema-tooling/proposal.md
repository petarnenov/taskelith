## Why

ADR 0004 principle 6 requires contract-first OpenAPI 3.1 and AsyncAPI documents with generated types, runtime validators, and a breaking-change gate, and its consequences call for selecting generators and a breaking-change checker through the dependency policy. The G1 plan (item 3, `select-contract-and-schema-tooling`) makes that selection a documentation-only evaluation that items 8 and 13 depend on, and that informs owner decisions D2, D3, and D6.

## What Changes

- Add `docs/contract-tooling.md`: the JSON Schema dialects of OpenAPI 3.1 and AsyncAPI 3 and options for sharing schemas between them; evaluation of runtime validators, type generators, AsyncAPI parsing, document linters, and breaking-change checkers for both D3 options; the OpenSpec `--json` outputs an adapter would use; the author's proposals, labeled as such.
- Add a "Contract tooling" section to `docs/dependencies.md` listing each proposed tool as `candidate` with exact version, license, engine, upstream, and remaining admission evidence.
- Add the `contract-tooling` capability.

## Capabilities

### New Capabilities
- `contract-tooling`: a pinned, source-cited evaluation of the tools for contract-first OpenAPI and AsyncAPI documents, with each proposed tool registered as a candidate.

### Modified Capabilities

None.

## Impact

Documentation only. No tool is installed, no `package.json` or lockfile change, no code, CI, or package impact. The owner decides D2 and D3; the evaluation does not decide them.
