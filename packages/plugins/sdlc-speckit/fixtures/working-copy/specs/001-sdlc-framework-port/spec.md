<!-- Derived fixture: written by hand from the pinned SpecKit 1.2.3 template .specify/templates/spec-template.md, with content from the archived OpenSpec change draft-sdlc-framework-port. No harness has run SpecKit's agent steps. -->
# Feature Specification: Draft SDLC framework port

**Feature Branch**: `001-sdlc-framework-port`

**Created**: 2026-10-24

**Status**: Draft

**Input**: User description: "Draft a framework-neutral SDLC framework port with a capability declaration and a conformance suite that plugin packages run with their own fixtures."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Implement a framework plugin against one port (Priority: P1)

A plugin author implements the operations a framework plugin offers (discover work items, resolve the workflow, describe artifacts, inspect revisions, prepare stage instructions, validate structure, finalize) without depending on the module's domain types.

**Why this priority**: The adapters and the port freeze depend on a draft port.

**Independent Test**: Can be fully tested by implementing a stand-in plugin and calling each operation.

**Acceptance Scenarios**:

1. **Given** a plugin that implements every operation, **When** an operation succeeds, **Then** it resolves to a result with plain text values.
2. **Given** a request for an unknown work item, **When** the plugin handles it, **Then** it fails with `not-found`.

---

### User Story 2 - Declare what the framework supports (Priority: P2)

A plugin declares the optional operations it supports and the lifecycle obligations its native stages cover, so that the platform supplies the rest.

**Why this priority**: Frameworks differ; the platform must know which gates and records it supplies.

**Independent Test**: Can be tested by parsing valid and invalid declarations.

**Acceptance Scenarios**:

1. **Given** a declaration without `finalize`, **When** `finalize` is called, **Then** it fails with `unavailable`.

---

### User Story 3 - Check a plugin with its own fixtures (Priority: P3)

A plugin package's tests run a framework-neutral conformance suite with that package's fixtures and expected outputs.

**Why this priority**: The suite keeps every plugin to the same contract.

**Independent Test**: Can be tested by running the suite against conforming and non-conforming stand-ins.

**Acceptance Scenarios**:

1. **Given** a plugin whose result differs from the expected outcome, **When** the suite runs, **Then** it reports an outcome finding for that case.

---

### Edge Cases

- What happens when a plugin throws instead of returning a result?
- How does the suite handle a result that carries a field the port does not define?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST define the port's operations with requests and results in plain text shapes.
- **FR-002**: Every work-item operation MUST name its work item explicitly.
- **FR-003**: No operation MUST return a semantic approval or decide a gate.
- **FR-004**: System MUST parse the capability declaration and reject unknown operations and obligations.
- **FR-005**: The conformance suite MUST report findings for thrown errors, malformed results, undeclared operations, and unexpected outcomes.

### Key Entities *(include if feature involves data)*

- **Capability declaration**: the optional operations and native obligations of a framework.
- **Conformance case**: an operation, its request, and the expected outcome.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A stand-in plugin passes the suite with no findings.
- **SC-002**: Each listed defect in a stand-in plugin produces at least one finding.

## Assumptions

- Plugin output is untrusted input and is checked at run time.
- The port stays a draft until the freeze.
