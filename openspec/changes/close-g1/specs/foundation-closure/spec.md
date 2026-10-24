## ADDED Requirements

### Requirement: G1 closure
G1 SHALL be recorded as closed only when its exit evidence is reproduced from a fresh clone, every G1 work item is merged and archived, and each open item is deferred to a named later gate with the decision it follows, in the closure ADR and the foundation ledger.

#### Scenario: Fresh clone
- **WHEN** G1 closure is recorded
- **THEN** the verification record shows a fresh clone where `npm ci --ignore-scripts` and `make verify` pass with the pinned toolchain, including the tests that show the exit evidence

#### Scenario: Deferred item
- **WHEN** work in G1 scope is left open at closure
- **THEN** the closure ADR and the foundation ledger name the later gate it moved to, and the ADR names the decision it follows or marks it as the author's assignment
