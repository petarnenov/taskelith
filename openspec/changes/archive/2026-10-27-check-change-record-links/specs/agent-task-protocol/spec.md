## ADDED Requirements

### Requirement: Record link rule
A change's records SHALL link to another repository file only inside the change directory or root-relative, a spec delta only root-relative, and never into an active change, because archiving moves the change directory and copies a delta's text into `openspec/specs/`. Worker step 6 of the protocol SHALL state the rule.

#### Scenario: Link to a document
- **WHEN** a change's `verification.md` links `docs/governance.md`
- **THEN** it writes `/docs/governance.md`, not a path with `../`

#### Scenario: Link to the change's own file
- **WHEN** a change's `design.md` links the same change's `proposal.md` or `specs/<capability>/spec.md`
- **THEN** it writes that path relative to the change directory

#### Scenario: Link from a spec delta
- **WHEN** a spec delta links a document
- **THEN** it writes a root-relative link
