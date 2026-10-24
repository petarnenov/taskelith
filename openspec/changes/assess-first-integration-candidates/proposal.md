## Why

The owner asked to continue the remaining G0 work until an owner decision is required. G0 requires a first agent harness and an SCM integration, and G4 requires a second harness. The owner needed a current, source-backed comparison against the architecture's policy. After the owner's decisions in ADR 0003, the assessment must reflect the new rules and give capability evidence for the selected harnesses.

## What Changes

- Separate architecture requirements from preferences, with a source for each requirement.
- Assess the selected harnesses (Claude Code, Codex, Antigravity CLI, OpenCode) with a native-capability matrix, and the harnesses not selected with consistent eligibility states.
- Apply one open-core rule and the required SCM features to every SCM candidate.
- State the G3/G4 delivery sequence and the qualification tests that must follow.
- Cite sources pinned to a tag, commit, or exact package version where one exists.
- Link the assessment from the G0 foundation ledger.

## Capabilities

### New Capabilities
- `integration-candidates`: Source-backed assessment of the first integrations and capability evidence for the owner-selected harnesses, without admission.

### Modified Capabilities

None.

## Impact

Documentation only; no runtime impact. No integration is admitted, installed, or contacted. Qualification remains open.
