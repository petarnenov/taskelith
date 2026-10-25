## Why

Codex is the owner-selected second harness for G4, and ADR 0003 requires the agent port to be checked against Codex before it is frozen. The owner chose this qualification as the next task on 2026-10-24 and signed in with their ChatGPT subscription in a dedicated Codex home for it.

## What Changes

- Pin Codex to `@openai/codex@0.164.0` and record its terms, provider, credential, and security facts.
- Measure request-level egress with analytics on and off, and probe every native capability except non-permission input requests through `codex app-server`, including a pending approval across a crash, on macOS x86_64.
- Check the owner's own Codex home and binaries for writes outside the dedicated home, and record what was found.
- Add a register row, link the evidence from the candidate assessment, and update the foundation ledger.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `harness-qualification`: adds a host side-effect check, because both qualified harnesses wrote outside their dedicated directories.

## Impact

Documentation only; no runtime or package impact. The probe stays outside the repository. Codex remains `candidate`.
