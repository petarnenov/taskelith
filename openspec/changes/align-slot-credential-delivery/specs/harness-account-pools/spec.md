## MODIFIED Requirements

### Requirement: Subscription account slots
Taskelith SHALL manage harness accounts as slots, each bound to exactly one harness plugin, authenticated only through a subscription mechanism that plugin declares and Taskelith can deliver, and allowed to serve only the projects explicitly listed for it; any number of slots MAY be added per harness, and one slot MAY serve several listed projects. By G3 decision D6, only `subscription-token` is deliverable, unless G3 item 35 overturns D6.

#### Scenario: Slot shared by two projects
- **WHEN** a slot lists projects A and B
- **THEN** sessions of both A and B may reserve it, and sessions of project C may not

#### Scenario: Valid subscription slot
- **WHEN** an operator adds a slot using a deliverable subscription mechanism its harness plugin declares
- **THEN** the slot is accepted and joins the pools of its listed projects

#### Scenario: Non-subscription credential
- **WHEN** an operator configures a slot with a credential the plugin does not declare as a subscription mechanism, such as an API key
- **THEN** the configuration is rejected

#### Scenario: Declared but undeliverable mechanism
- **WHEN** an operator adds a slot whose mechanism is `device-login`, which its harness plugin declares
- **THEN** the configuration is rejected while D6 stands
