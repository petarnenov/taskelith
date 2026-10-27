## MODIFIED Requirements

### Requirement: Subscription account slots
Taskelith SHALL manage harness accounts as slots, each bound to exactly one harness plugin, authenticated only through a subscription mechanism that plugin declares and for which Taskelith has a delivery admitted for that harness, and allowed to serve only the projects explicitly listed for it; one slot MAY serve several listed projects. Claude Code SHALL have at most one non-removed slot (ADR 0005 decision 2, amended 2026-10-27), and by D6 only the `subscription-token` delivery.

#### Scenario: Slot shared by two projects
- **WHEN** a slot lists projects A and B
- **THEN** sessions of both A and B may reserve it, and sessions of project C may not

#### Scenario: Valid subscription slot
- **WHEN** an operator adds a slot using a subscription mechanism its harness plugin declares and that has an admitted delivery for that harness
- **THEN** the slot is accepted and joins the pools of its listed projects

#### Scenario: Non-subscription credential
- **WHEN** an operator configures a slot with a credential the plugin does not declare as a subscription mechanism, such as an API key
- **THEN** the configuration is rejected

#### Scenario: Declared mechanism without an admitted delivery
- **WHEN** an operator adds a Claude Code slot whose mechanism is `device-login`, which the plugin declares but for which Claude Code has no admitted delivery
- **THEN** the configuration is rejected

#### Scenario: Second Claude Code slot
- **WHEN** an operator adds a Claude Code slot while another Claude Code slot is active or revoked
- **THEN** the configuration is rejected, and no rotation across Claude accounts can arise
