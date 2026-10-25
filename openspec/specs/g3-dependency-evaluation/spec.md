# g3-dependency-evaluation Specification

## Purpose
Record a source-cited evaluation of the G3 libraries and tools, so that each is selected through the dependency policy before a later item installs it.

## Requirements

### Requirement: G3 dependency evaluation
`docs/g3-dependencies.md` SHALL evaluate, at their latest versions and for the options the owner decided in D1, D2, D3, D5, D17, and D18, the SPA libraries and Mantine, the password-hashing and session building blocks, the `git` CLI, the pinned Claude Agent SDK with its bundled CLI, the GitHub API client, and xterm.js and node-pty, recording each one's exact version, license, security reporting route, advisories, and maintenance evidence.

#### Scenario: Decided option evaluated
- **WHEN** an owner decision names the option for a component
- **THEN** the evaluation records that option's evidence and does not reopen the decision

#### Scenario: Decided option unsuitable
- **WHEN** the evidence shows a decided option unsuitable through its license, an unfixed advisory, or abandonment
- **THEN** the evaluation records the finding and leaves the replacement to the owner

#### Scenario: Tool left open by a decision
- **WHEN** a decision leaves the choice of a tool open, such as the GitHub API client
- **THEN** the evaluation compares candidates and labels its recommendation as the author's proposal

### Requirement: G3 dependency evidence
The evaluation SHALL cite each fact's source, pinned to a tag, commit, or exact package version where one exists, or labeled as an unversioned service, with the access date, and SHALL mark runtime claims that were not exercised as unverified.

#### Scenario: Claim taken from documentation
- **WHEN** a component's runtime behaviour is described only from its documentation or source
- **THEN** the evaluation marks that claim, or the section that contains it, as unverified

### Requirement: G3 dependency candidates
Every component the evaluation proposes SHALL appear in the dependency register's "G3 dependencies" section with status `candidate`, exact version, license, runtime, upstream, and remaining admission evidence, and SHALL NOT be added to a package manifest or lockfile by the evaluation.

#### Scenario: Component not yet installed
- **WHEN** a proposed component has not been installed or qualified
- **THEN** the register lists it as a candidate and does not report it as accepted
