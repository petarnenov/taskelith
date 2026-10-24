## Why

Claude Code is the owner-selected first harness for G3 (ADR 0003). Before admission, a closed harness needs recorded terms, provider dependency, and version, and its telemetry and native capabilities must be confirmed with a pinned version. The owner chose this qualification as the next G0 task on 2026-10-24 and authorized running the harness against their account.

## What Changes

- Pin Claude Code to Agent SDK 0.3.308, which bundles CLI 2.1.308, the CLI package's `stable` dist-tag.
- Record license, provider, credential, security, and maintenance terms.
- Measure network egress at request-path level with telemetry on and off, and probe each native capability, including a pending approval across a crash, on macOS x86_64, using device authentication in a dedicated configuration directory.
- Derive port-level consequences without adding harness-specific code to the kernel.
- Add a register row, link the evidence from the candidate assessment, and refresh the foundation ledger, whose governance status was stale.

## Capabilities

### New Capabilities
- `harness-qualification`: Version-pinned, reproducible evidence that a selected harness meets the telemetry rule and its declared native capabilities before admission.

### Modified Capabilities

None.

## Impact

Documentation only; no runtime or package impact. The probe, proxy, and orchestrator stay outside the repository and are run through a `make` target, so the closed SDK is not added as a dependency before admission. Claude Code remains `candidate`.
