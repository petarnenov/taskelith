# bootstrap-governance Specification

## Purpose
Define who may propose, implement, review, accept, integrate, and release Taskelith work during bootstrap, and the evidence each lifecycle transition requires, without depending on the unbuilt runtime.

## Requirements

### Requirement: Explicit bootstrap authority
The project SHALL define proposal, implementation, verification, independent review, acceptance, integration, and release authority without depending on an unimplemented runtime.

#### Scenario: Agent completes authorized work
- **WHEN** an agent finishes an authorized repository change
- **THEN** it records author verification and outstanding gates without claiming independent review or owner acceptance

### Requirement: Traceable lifecycle evidence
Every work item SHALL bind to a selected framework version and record scope, requirements or a justified no-runtime-impact declaration, verification evidence, and remaining gates. Material changes SHALL invalidate affected review and verification claims, except unreviewed fixes that the independent review process permits, which SHALL be recorded as unreviewed.

#### Scenario: Reviewed artifacts change
- **WHEN** a requirement, policy, or implementation changes after review, and the change is not a permitted unreviewed fix
- **THEN** the affected checks and review must be refreshed against the changed revision before acceptance

#### Scenario: Permitted unreviewed fix
- **WHEN** a change is fixed after a Low-only pass, or by the owner's choice after the third pass
- **THEN** the checks are refreshed, and `verification.md` records the fix as not independently reviewed

### Requirement: Honest foundation readiness
The project SHALL distinguish completed bootstrap capabilities from remaining G0 decisions and later runtime phases, and SHALL record G0 as closed only with reproduced exit evidence and every open item deferred by owner decision to a named later gate.

#### Scenario: Integrations remain unqualified
- **WHEN** harness, SCM, or framework qualification lacks required evidence
- **THEN** the foundation checklist records the gap, and does not mark G0 complete unless the owner has deferred the gap to a named later gate recorded in the checklist
