## MODIFIED Requirements

### Requirement: Traceable lifecycle evidence
Every work item SHALL bind to a selected framework version and record scope, requirements or a justified no-runtime-impact declaration, verification evidence, and remaining gates. Material changes SHALL invalidate affected review and verification claims, except unreviewed fixes that the independent review process permits, which SHALL be recorded as unreviewed.

#### Scenario: Reviewed artifacts change
- **WHEN** a requirement, policy, or implementation changes after review, and the change is not a permitted unreviewed fix
- **THEN** the affected checks and review must be refreshed against the changed revision before acceptance

#### Scenario: Permitted unreviewed fix
- **WHEN** a change is fixed after a Low-only pass, or by the owner's choice after the third pass
- **THEN** the checks are refreshed, and `verification.md` records the fix as not independently reviewed
