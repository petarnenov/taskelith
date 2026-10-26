## MODIFIED Requirements

### Requirement: Harness-neutral slot records
The Scheduling module SHALL identify a slot by the `ProviderCredentialId` that a reservation records, SHALL treat its harness and subscription mechanism as opaque identifiers, the harness as the Execution module's `HarnessPluginId`, whose value is the harness plugin's manifest `id`, and the mechanism as its own `SubscriptionMechanismId`, whose values are validated outside the pool, and SHALL not let a slot change its harness or leave the removed state; no type, value, or test of the pool SHALL name a harness or vendor.

#### Scenario: Harness change
- **WHEN** an adapter is asked to replace a slot with one of another harness
- **THEN** the change fails with `invalid` and the stored slot is unchanged

#### Scenario: Removed slot
- **WHEN** an adapter is asked to make a removed slot active again
- **THEN** the change fails with `invalid`, and the slot stays a tombstone in no pool

#### Scenario: Shared harness identifier
- **WHEN** the pool names the harness plugin of a slot
- **THEN** it uses the Execution module's `HarnessPluginId`, whose value is the plugin's manifest `id`, and defines no harness plugin identifier type of its own
