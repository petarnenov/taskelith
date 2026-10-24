## Why

G1 work item 8 ([docs/g1-plan.md](../../../docs/g1-plan.md)). The OpenSpec framework adapter (item 11) must be registered through the microkernel of [ADR 0003](../../../docs/decisions/0003-first-integrations-and-plugin-kernel.md) decision 8, and architecture section 7 requires the composition root to validate compatibility before accepting work. Versioned plugin manifests and UI selection belong to G4 (architecture section 13); this change pulls forward only the minimum registration path: a validated manifest subset and a library-level registration function that rejects an incompatible plugin before admission.

## What Changes

- Add the private workspace package `@taskelith/plugin-sdk` (`packages/plugin-sdk`), depending on `@taskelith/kernel`, with one public export:
  - a JSON Schema 2020-12 document for the manifest subset of architecture section 7: identifier, package version, supported plugin API range, port, and capabilities, using only keywords shared by draft-07 and 2020-12;
  - `PLUGIN_API_VERSION`, the plugin API version the SDK implements, and `satisfiesCaretRange`, the compatibility rule;
  - `registerPlugin(manifest, host)`, which validates a manifest with ajv's `Ajv2020` and returns a kernel `Result`: an `invalid` failure for a manifest that fails the schema, `not-found` for a port the host does not offer, and `precondition-failed` for a plugin API range that excludes the SDK's version.
- Tests in `packages/plugin-sdk/test/` that import the package by name.
- Add `ajv@8.20.0` as the first runtime dependency, exact-pinned in the plugin SDK only; `ajv-formats` is not added, because the schema uses no `format` keyword. Update the `ajv`, `ajv-formats`, and `json-schema-to-typescript` rows of the [dependency register](../../../docs/dependencies.md#contract-tooling) and regenerate the dependency inventory.
- Let workspace packages ship JSON documents from `src/`: the shared `tsconfig.package.json` enables `resolveJsonModule` and includes `src/**/*.json`, and `tsconfig.check.json` enables `resolveJsonModule`.

## Capabilities

### New Capabilities
- `plugin-registration`: the plugin manifest subset and the registration rules applied before a plugin is admitted.

### Modified Capabilities

## Impact

New private workspace package and its runtime dependency tree (`ajv` and four transitive packages, MIT and BSD-3-Clause). The published `taskelith` package and CLI are unchanged: the root `files` list excludes `packages/`, and the root manifest gains no dependency. No runnable application is added. Depends on items 2 (kernel) and 3 (tooling evaluation) and on the owner's decisions D2 and D3, recorded in the plan.
