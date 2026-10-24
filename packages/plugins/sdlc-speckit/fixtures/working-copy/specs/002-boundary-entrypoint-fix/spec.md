<!-- Derived fixture: written by hand from the pinned SpecKit 1.2.3 template .specify/templates/spec-template.md, with content from the archived OpenSpec change fix-boundary-entrypoint. No harness has run SpecKit's agent steps. -->
# Feature Specification: Run the boundary check through symlinked paths

**Feature Branch**: `002-boundary-entrypoint-fix`

**Created**: 2026-10-24

**Status**: Draft

**Input**: User description: "The boundary checker exits 0 without checking anything when it is started through a symlinked path. Make it run its checks regardless of symlinks."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Boundary violations fail from any checkout path (Priority: P1)

A developer whose checkout path contains a symlink, such as a temporary directory on macOS, runs the repository checks and a boundary violation fails them.

**Why this priority**: A silent skip lets violations reach the default branch.

**Independent Test**: Can be fully tested by starting the checker through a symlinked directory in a workspace with a violation.

**Acceptance Scenarios**:

1. **Given** a workspace with a boundary violation, **When** the checker is started through a symlinked path, **Then** it fails with the violation.
2. **Given** a workspace without violations, **When** the checker is started through a symlinked path, **Then** it passes after running its checks.

---

### Edge Cases

- What happens when the checker is imported by a test instead of started as a script?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The boundary checker MUST run its checks whenever it is started as a script, including through a symlinked path.
- **FR-002**: The checks, their messages, and the exit code policy MUST stay unchanged.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A regression test that starts the checker through a symlinked directory fails on a violating fixture.

## Assumptions

- No script in the repository starts Node with `--preserve-symlinks-main`.
