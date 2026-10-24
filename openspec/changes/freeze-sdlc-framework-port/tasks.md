## 1. Fixtures against both designs

- [x] 1.1 Add the test-only SpecKit normaliser and run the SpecKit mapping cases through `runSdlcFrameworkConformance`.
- [x] 1.2 Keep the OpenSpec adapter passing its mapping cases.

## 2. Revise and freeze the port

- [x] 2.1 Give the port its own plain data shapes, add `SDLC_FRAMEWORK_PORT_VERSION` `1.0.0`, and remove the draft markers.
- [x] 2.2 Add the port entry `@taskelith/sdlc/port` and allow it in the workspace package contract for modules.
- [x] 2.3 Record the freeze in ADR 0009.

## 3. Port access

- [x] 3.1 Re-export the port types type-only from the plugin SDK, record the port versions, and raise the plugin API to `0.2.0`.
- [x] 3.2 Make the OpenSpec adapter implement the SDK's port type and delete its structural copy.
- [x] 3.3 Add the plugin SDK boundary rule and its tests.

## 4. Records

- [x] 4.1 Close the item 6 open question in the spec and update contract tooling section 9 with the confirmed `archive --json` output.

## 5. Verification and review

- [x] 5.1 Dry-run the archive in a copy of `openspec/` and run `validate --all --strict` there.
- [x] 5.2 Run `make verify` and record the results.
- [x] 5.3 Obtain independent review (Codex Sol medium, read-only) and record results.
