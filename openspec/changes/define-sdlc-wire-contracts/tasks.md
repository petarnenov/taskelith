## 1. Contracts

- [x] 1.1 Add the `@taskelith/contracts` package with the SDLC AsyncAPI 3.0 document (command and event envelopes, admission and gate events) and the SDLC OpenAPI 3.1 document (create run, submit task, read admission).
- [x] 1.2 Generate types and schema bundles from the documents in the build, and export ajv validators over them.

## 2. Compatibility and tooling

- [x] 2.1 Add `make contract-compatibility` to `make verify`, comparing each document with its version at the merge base with `origin/dev`.
- [x] 2.2 Install the tools at exact versions, update the dependency register, and regenerate the inventory and SBOM with license reviews.

## 3. Verification and review

- [x] 3.1 Run `make verify` and record the results.
- [ ] 3.2 Obtain independent review (Codex Sol medium, by rotation) and record results.
