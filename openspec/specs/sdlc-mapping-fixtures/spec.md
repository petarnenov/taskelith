# sdlc-mapping-fixtures Specification

## Purpose
Shared mapping fixtures for the SDLC framework port: feature, fix, and documentation work items for OpenSpec and SpecKit, stored in each framework's plugin package, with expected normalized outputs that the framework-neutral conformance suite checks before the port freezes.

## Requirements

### Requirement: Fixtures per framework package
Each supported SDLC framework SHALL have feature, fix, and documentation fixtures stored in that framework's plugin package, and the framework-neutral conformance suite SHALL NOT contain framework-specific fixtures.

#### Scenario: Fixture packages
- **WHEN** the OpenSpec and SpecKit fixtures are listed
- **THEN** each package has one feature, one fix, and one documentation work item, and the SDLC module contains none of them

### Requirement: Fixture provenance
OpenSpec fixtures SHALL be copies of changes in this repository's archive, and SpecKit fixtures SHALL consist of the pinned scaffold capture and features derived from the pinned templates, each labelled as derived while no harness has run SpecKit's agent steps.

#### Scenario: Fixture drifts from its source
- **WHEN** an OpenSpec fixture change differs from its archived change, or the SpecKit scaffold differs from the capture
- **THEN** the fixture tests fail

#### Scenario: Derived SpecKit artifact
- **WHEN** a SpecKit feature artifact is read
- **THEN** it carries a label naming its pinned template and source change and stating that no harness has run SpecKit's agent steps

### Requirement: Expected normalized outputs
Each fixture set SHALL express its expected normalized outputs as cases of the conformance suite in the port's result shapes, and its tests SHALL check that the suite reports no findings for them and that every expected digest is the digest of its source.

#### Scenario: Expected outputs checked without an adapter
- **WHEN** the fixture tests run the conformance suite with a stand-in that replays the expected outcomes
- **THEN** the suite reports no findings, and every artifact revision and workflow digest matches its fixture or pinned source file

#### Scenario: Expected OpenSpec outputs against the pinned CLI
- **WHEN** the OpenSpec fixture tests run the pinned CLI in the fixture working copy
- **THEN** its change list, artifact status, instruction texts, and strict validation agree with the expected outputs
