## ADDED Requirements

### Requirement: Explicit bootstrap authority
The project SHALL define proposal, implementation, verification, independent review, acceptance, integration, and release authority without depending on an unimplemented runtime.

#### Scenario: Agent completes authorized work
- **WHEN** an agent finishes an authorized repository change
- **THEN** it records author verification and outstanding gates without claiming independent review or owner acceptance

### Requirement: Traceable lifecycle evidence
Every work item SHALL bind to a selected framework version and record scope, requirements or a justified no-runtime-impact declaration, verification evidence, and remaining gates. Material changes SHALL invalidate affected review and verification claims.

#### Scenario: Reviewed artifacts change
- **WHEN** a requirement, policy, or implementation changes after review
- **THEN** the affected checks and review must be refreshed against the changed revision before acceptance

### Requirement: Honest foundation readiness
The project SHALL distinguish completed bootstrap capabilities from remaining G0 decisions and later runtime phases.

#### Scenario: Integrations remain unqualified
- **WHEN** harness, SCM, or framework qualification lacks required evidence
- **THEN** the foundation checklist records the gap and does not mark G0 complete
