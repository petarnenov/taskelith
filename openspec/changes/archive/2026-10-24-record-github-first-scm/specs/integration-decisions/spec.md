## ADDED Requirements

### Requirement: GitHub.com as the first SCM
The first SCM integration SHALL be a GitHub.com plugin on the microkernel, admitted only after its terms of service, data-handling terms, API version, maintenance, and security evidence are recorded; it SHALL obtain a GitHub App installation token limited to the project's repositories for each run and deliver it only to that run; and Forgejo SHALL remain the second SCM plugin, added after the GitHub integration is proven.

#### Scenario: Run needs repository access
- **WHEN** a run for a project needs GitHub access
- **THEN** it receives an installation token limited to that project's repositories, and no token for another project's repositories

#### Scenario: Kernel neutrality
- **WHEN** kernel or module code, types, schemas, or tests are checked
- **THEN** none of them names GitHub; GitHub specifics live only in the SCM plugin

#### Scenario: Admission
- **WHEN** the GitHub.com plugin is proposed for admission
- **THEN** its recorded terms, data-handling terms, API version, maintenance, and security evidence exist in the dependency register

## MODIFIED Requirements

### Requirement: Recorded owner integration decisions
The repository SHALL record the owner's integration, scope, telemetry, open-core, license-evidence, advisory, microkernel, license-diligence, vendor-traffic, external-approval, and first-SCM decisions in an ADR, and propagate them consistently to the architecture and dependency documentation without claiming qualification.

#### Scenario: Selected harness is not yet qualified
- **WHEN** a harness is owner-selected
- **THEN** the dependency register keeps it `candidate` until version-specific qualification passes

#### Scenario: Closed-provider exception stays narrow
- **WHEN** a closed or proprietary component is proposed
- **THEN** it is admissible only as an agent harness or its model provider, or as the closed, hosted SCM admitted by ADR 0006, with recorded license or terms, provider, data-handling, version, maintenance, and security evidence, and any other closed integration requires an explicit owner scope change

#### Scenario: Opt-out telemetry
- **WHEN** a component has telemetry on by default
- **THEN** it is admissible only if configuration disables the telemetry and a network-egress test confirms that

#### Scenario: Open-core component
- **WHEN** a component's vendor also sells a proprietary edition
- **THEN** it is admissible only if every feature Taskelith requires is in the open-source edition

#### Scenario: Advisory exception ends
- **WHEN** an npm release that bundles fixed `ip-address` and `undici` versions is available
- **THEN** the time-bounded exception ends and remediation becomes a tracked change

#### Scenario: License evidence during development
- **WHEN** a candidate or dependency is assessed before G8
- **THEN** a license name and one official source suffice, the automated inventory check still runs, and G8 requires a full license audit

#### Scenario: Non-telemetry vendor traffic during development
- **WHEN** a harness sends documented non-telemetry traffic to its vendor before G8
- **THEN** the traffic is acceptable and the egress test records each destination, and G8 decides whether it stays acceptable

#### Scenario: Harness without external approvals
- **WHEN** a harness cannot answer native permission requests from an external client
- **THEN** pre-set policy alone is not accepted, the plugin does not advertise approvals, and its qualification must find an external approval mechanism
