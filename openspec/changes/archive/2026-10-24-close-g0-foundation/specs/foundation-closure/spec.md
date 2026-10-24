## ADDED Requirements

### Requirement: G0 closure
G0 SHALL be recorded as closed only when its exit evidence is reproduced from a fresh clone and every G0 work item is either done or deferred by owner decision to a named later gate, with the deferral visible in the foundation ledger.

#### Scenario: Fresh clone
- **WHEN** G0 closure is recorded
- **THEN** the verification record shows a fresh clone where `npm ci --ignore-scripts` and `make verify` pass with the pinned toolchain

#### Scenario: Deferred item
- **WHEN** a G0 work item is not done at closure
- **THEN** the foundation ledger names the later gate it moved to and the ADR that decided it
