## ADDED Requirements

### Requirement: Shared harness plugin identifier
The Scheduling module SHALL name a slot's harness with the Execution module's `HarnessPluginId`, whose value is the harness plugin's manifest `id`, and SHALL define no harness plugin identifier type of its own; it SHALL keep a slot's mechanism its own opaque `SubscriptionMechanismId`, whose values come from the mechanisms the plugin declares through the agent harness port and are validated outside the pool.

#### Scenario: Harness identifier from Execution
- **WHEN** the pool names the harness plugin of a slot
- **THEN** it uses the `HarnessPluginId` that `@taskelith/execution` exports, with the plugin's manifest `id` as its value

#### Scenario: Mechanism stays opaque
- **WHEN** the pool stores a slot's subscription mechanism
- **THEN** it stores a `SubscriptionMechanismId` without importing the agent harness port's mechanism type, and the "Harness-neutral slot records" requirement still holds
