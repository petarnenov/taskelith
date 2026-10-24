## Purpose

Record a pinned, source-cited evaluation of the G2 infrastructure services, clients, and test tools, so that each is selected through the dependency policy before it is installed.

## ADDED Requirements

### Requirement: G2 infrastructure evaluation
`docs/g2-infrastructure.md` SHALL evaluate, for the options the owner decided in D1, D2, D4, D6, and D8, the PostgreSQL and NATS servers and their official images, the PostgreSQL driver and migration tool, the NATS JavaScript client, the SQLite bindings with their fallback, and the partition proxy, recording each one's exact version, license, security reporting route, advisories, and maintenance evidence.

#### Scenario: Decided option evaluated
- **WHEN** an owner decision names the option for a component
- **THEN** the evaluation records that option's evidence and does not reopen the decision

#### Scenario: Tool left open by a decision
- **WHEN** a decision leaves the choice of a tool open, such as the migration tool under D6
- **THEN** the evaluation compares candidates and labels its recommendation as the author's proposal

### Requirement: G2 infrastructure evidence
The evaluation SHALL cite sources pinned to a tag, commit, exact package version, or image digest, or labeled as unversioned services with the observation date, SHALL mark runtime claims that were not exercised as unverified, and SHALL name each container image it proposes by its multi-arch index digest and its `linux/amd64` and `linux/arm64` manifest digests.

#### Scenario: Image proposed
- **WHEN** the evaluation proposes a container image
- **THEN** it names the tag, the index digest, and both platform digests

#### Scenario: Claim taken from documentation
- **WHEN** a component's runtime behaviour is described only from its documentation or source
- **THEN** the evaluation marks that claim, or the section that contains it, as unverified

### Requirement: G2 infrastructure candidates
Every component the evaluation proposes SHALL appear in the dependency register's "G2 infrastructure" section with status `candidate`, exact version or digest, license, runtime, upstream, and remaining admission evidence, until a later change installs and qualifies it.

#### Scenario: Component not yet installed
- **WHEN** a proposed component has not been installed or qualified
- **THEN** the register lists it as a candidate and does not report it as accepted
