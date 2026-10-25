## ADDED Requirements

### Requirement: Linux qualification in the worker image
A harness qualification on Linux SHALL run inside the worker image's harness variant on each architecture of the worker matrix that the qualification host or an authorized runner provides. It SHALL record every architecture of the matrix as native, emulated, or not run, with the reason, and SHALL list each architecture without native evidence among the gates before admission.

#### Scenario: Emulated architecture
- **WHEN** an architecture runs only under emulation on the qualification host
- **THEN** its results are labeled emulated, and native evidence for it stays open

### Requirement: Credential-gated qualification scenarios
A harness qualification SHALL separate the steps that need no credentials from the scenarios that need a provider login. A scenario that needs a login SHALL run only with credentials that the owner has authorized; otherwise the record marks it as not run and lists it among the gates before admission. No credential SHALL be built into an image.

#### Scenario: No authorized login
- **WHEN** no provider login is authorized for a qualification run
- **THEN** only the credential-free steps run, and every scenario that needs a login is recorded as not run with that reason
