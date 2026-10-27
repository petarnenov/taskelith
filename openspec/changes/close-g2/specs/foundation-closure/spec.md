## ADDED Requirements

### Requirement: G2 closure
G2 SHALL be recorded as closed only when its exit evidence is reproduced from a fresh clone through `make verify`, the installation smoke, and the native acceptance targets, every G2 work item is merged and archived, each native acceptance entry and row left open is named, and each open item is deferred to a named later gate with the decision it follows or marked as the author's assignment for the owner to confirm, in the closure ADR and the foundation ledger.

#### Scenario: Fresh clone
- **WHEN** G2 closure is recorded
- **THEN** the verification record shows a fresh clone where `make setup`, `make verify`, the installation smoke, and the native acceptance targets pass with the pinned toolchain, or names each proof that failed or did not run

#### Scenario: Deferred item
- **WHEN** work in G2 scope, or a native acceptance row of a G2 matrix entry, is left open at closure
- **THEN** the closure ADR and the foundation ledger name the later gate it moved to, and the ADR names the decision it follows or marks it as the author's assignment

#### Scenario: Placeholder left
- **WHEN** the closure ADR still holds a placeholder
- **THEN** its status stays Proposed and G2 is not recorded as closed
