## Why

The owner selected Linux and macOS as the initial worker platforms and previously authorized continuation until a decision requires owner input. Record the expanded platform scope, native acceptance requirements, and Taskelith-specific storage conventions before native worker implementation.

## What Changes

- Record the owner's Linux/macOS decision in the architecture and a new ADR.
- Define separate native acceptance gates without claiming implemented worker support.
- Select isolated data-root conventions and precedence for future Linux/macOS processes.
- Keep platform versions, CPU qualification, installation mode, and native recovery evidence explicit.

## Capabilities

### New Capabilities
- `worker-platform-foundation`: Linux/macOS scope and storage/acceptance contracts.

### Modified Capabilities

None.

## Impact

Documentation and OpenSpec only. The current CLI remains stateless; no worker command, service installation, filesystem migration, or deployment is introduced. Windows remains outside the initial worker scope.
