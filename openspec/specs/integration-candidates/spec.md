# integration-candidates Specification

## Purpose
Assess integration candidates against cited architecture requirements, separate from preferences, with capability evidence for the selected harnesses and without admitting any integration.

## Requirements

### Requirement: Policy-based candidate assessment
The integration candidate assessment SHALL separate architecture requirements from preferences, cite the source of each requirement, record each assessed candidate's observed release, license, and interface evidence with sources pinned to a tag, commit, or exact package version where one exists, label unversioned sources, mark unsourced claims as unverified, and give the reason for every ineligibility.

#### Scenario: Candidate fails a requirement
- **WHEN** a candidate fails an architecture requirement, such as the telemetry rule or the open-source requirement for non-harness components
- **THEN** the assessment marks it `ineligible` and records the failing property with a source

#### Scenario: Candidate fails only a preference
- **WHEN** a candidate fails a preference, a proposed adapter criterion, or lacks a native capability, but meets every requirement
- **THEN** the assessment does not mark it `ineligible` and records the gap

#### Scenario: Open-core candidate
- **WHEN** a candidate that must be open source has a vendor that sells a proprietary edition
- **THEN** the assessment applies the same rule to every such candidate: it is ineligible only if a required feature is missing from the open-source edition, while agent harnesses and their providers fall under the closed-harness rule instead

### Requirement: Harness capability matrix
The assessment SHALL give each selected harness a state of `verified`, `partial`, `unsupported`, or `unknown` for every native capability that the architecture requires, with a source for each state other than `unknown`.

#### Scenario: Capability not native
- **WHEN** a selected harness lacks a native capability
- **THEN** the matrix marks it `partial` or `unsupported`, the plugin does not advertise the capability, and the assessment states the consequence for that plugin

### Requirement: Assessment is not admission
The assessment SHALL reflect the owner's recorded selections and a delivery sequence with distinct harnesses for G3 and G4, without admitting, installing, or qualifying any integration.

#### Scenario: Owner-selected component
- **WHEN** the owner has selected a component
- **THEN** the component remains a candidate until version-specific qualification passes
