## MODIFIED Requirements

### Requirement: First-class principles govern every change
Every design, code change, test, and review of Taskelith SHALL be checked against the nine principles in ADR 0004, and a change that cannot meet one SHALL record the conflict and ask the owner instead of exempting itself.

#### Scenario: Review of a change
- **WHEN** an independent review of a Taskelith change is recorded in its `verification.md`
- **THEN** the review prompt named the ADR 0004 principles as criteria, and every finding against a principle is resolved or recorded as an owner-decided conflict

#### Scenario: A principle cannot be met
- **WHEN** a change cannot meet one of the principles
- **THEN** its `verification.md` records the conflict and the owner's decision

## ADDED Requirements

### Requirement: Code coverage threshold
`make verify` SHALL fail when automated tests cover less than 75% of lines, branches, or functions of the compiled product code in `dist/`, measured without repository scripts, or when a product module under `src/` is missing from the coverage report.

#### Scenario: Coverage below the threshold
- **WHEN** a change lowers line, branch, or function coverage below 75%
- **THEN** `make verify` fails locally and in CI

#### Scenario: Untested product module
- **WHEN** a product module under `src/` is not loaded by any test
- **THEN** the coverage scope check names the module and `make verify` fails
