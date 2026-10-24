## MODIFIED Requirements

### Requirement: Policy-based candidate assessment
The integration candidate assessment SHALL separate architecture requirements from preferences, cite the source of each requirement, record each assessed candidate's observed release, license, and interface evidence with sources pinned to a tag, commit, or exact package version where one exists, label unversioned sources, mark unsourced claims as unverified, and give the reason for every ineligibility.

#### Scenario: Candidate fails a requirement
- **WHEN** a candidate fails an architecture requirement, such as the telemetry rule or the open-source requirement for components other than agent harnesses and the closed, hosted SCM admitted by ADR 0006
- **THEN** the assessment marks it `ineligible` and records the failing property with a source

#### Scenario: Candidate fails only a preference
- **WHEN** a candidate fails a preference, a proposed adapter criterion, or lacks a native capability, but meets every requirement
- **THEN** the assessment does not mark it `ineligible` and records the gap

#### Scenario: Open-core candidate
- **WHEN** a candidate that must be open source has a vendor that sells a proprietary edition
- **THEN** the assessment applies the same rule to every such candidate: it is ineligible only if a required feature is missing from the open-source edition, while agent harnesses, their providers, and the closed, hosted SCM fall under the closed-integration rules instead
