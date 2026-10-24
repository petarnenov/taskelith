## 1. Plugin SDK package

- [x] 1.1 Add `packages/plugin-sdk` (`package.json`, `tsconfig.json`) with one public export, depending on `@taskelith/kernel` and the exact-pinned `ajv@8.20.0`.
- [x] 1.2 Write the plugin manifest JSON Schema and the hand-written `PluginManifest` type.
- [x] 1.3 Implement the caret-range compatibility rule and `registerPlugin`.
- [x] 1.4 Let workspace packages ship JSON documents from `src/` through the shared TypeScript configuration.
- [x] 1.5 Add tests in `packages/plugin-sdk/test/` that import `@taskelith/plugin-sdk`.
- [x] 1.6 Add the `plugin-registration` capability.

## 2. Dependency evidence

- [x] 2.1 Update the `ajv`, `ajv-formats`, and `json-schema-to-typescript` rows of the dependency register.
- [x] 2.2 Regenerate the dependency inventory and review the new packages' licenses.

## 3. Verification and review

- [x] 3.1 Run `make verify` and record the results.
- [ ] 3.2 Obtain independent review (Claude Fable 5.1 medium, by rotation) and record results.
