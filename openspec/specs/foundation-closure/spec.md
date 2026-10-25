# foundation-closure Specification

## Purpose
Records how the G0 and G1 gates are closed: the exit evidence is reproduced from a fresh clone, and every open work item is either done or deferred to a named later gate, with the decision it follows.

## Requirements

### Requirement: G0 closure
G0 SHALL be recorded as closed only when its exit evidence is reproduced from a fresh clone and every G0 work item is either done or deferred by owner decision to a named later gate, with the deferral visible in the foundation ledger.

#### Scenario: Fresh clone
- **WHEN** G0 closure is recorded
- **THEN** the verification record shows a fresh clone where `npm ci --ignore-scripts` and `make verify` pass with the pinned toolchain

#### Scenario: Deferred item
- **WHEN** a G0 work item is not done at closure
- **THEN** the foundation ledger names the later gate it moved to and the ADR that decided it

### Requirement: G1 closure
G1 SHALL be recorded as closed only when its exit evidence is reproduced from a fresh clone, every G1 work item is merged and archived, and each open item is deferred to a named later gate with the decision it follows or, where none exists, marked as the author's assignment for the owner to confirm, in the closure ADR and the foundation ledger.

#### Scenario: Fresh clone
- **WHEN** G1 closure is recorded
- **THEN** the verification record shows a fresh clone where `npm ci --ignore-scripts` and `make verify` pass with the pinned toolchain, including the tests that show the exit evidence

#### Scenario: Deferred item
- **WHEN** work in G1 scope is left open at closure
- **THEN** the closure ADR and the foundation ledger name the later gate it moved to, and the ADR names the decision it follows or marks it as the author's assignment
