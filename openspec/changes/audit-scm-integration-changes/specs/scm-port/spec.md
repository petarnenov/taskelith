## ADDED Requirements

### Requirement: SCM integration audit
The `ScmIntegrations` store SHALL append one `ScmIntegrationAudit` row per committed creation or update, with the actor, the reason, the time, and the new revision. A creation SHALL name every supplied field and secret; an update SHALL name `label`, `allowedOrigin`, and `settings.<key>` whose value differs, and each secret it names, a secret as `secrets.<name>`. Its kind SHALL be `secret-changed` when only secrets changed, otherwise `updated`, also with no changed field.

#### Scenario: Secret sent again
- **WHEN** an update names a secret with the value already stored
- **THEN** it is audited as `secret-changed` naming that secret as `secrets.<name>`

#### Scenario: Secret named like a field
- **WHEN** an integration has a secret named `label` and an update names only that secret
- **THEN** it is audited as `secret-changed` naming `secrets.label`, not the field `label`

#### Scenario: Update that changes nothing
- **WHEN** an update at the current revision changes no field
- **THEN** it is audited as `updated` with no changed field

### Requirement: Secret values outside the audit
The store SHALL decide that a secret changed only from its name in the update, never by comparing, decrypting, or hashing a secret value, and no audit row SHALL hold a value of a setting or secret.

#### Scenario: Audit rows read back
- **WHEN** the trail is read after a creation and a secret replacement with known values
- **THEN** it names the secrets and holds neither value

## MODIFIED Requirements

### Requirement: Webhook receipt ports
The integrations module SHALL receive webhook deliveries through `ScmWebhookReceiver` over the ports `ScmIntegrationVerifiers`, which gives an integration's `WebhookVerifier` or none, `ScmWebhookDeliveries`, which records a verified event, `EventlessDeliveries`, which tells an eventless delivery by its headers, and `ScmPluginDefects`, which reports plugin defects, all outside the `./port` entry and naming no SCM. A verified event of another shape SHALL be such a defect.

#### Scenario: Event of another shape
- **WHEN** a verifier returns an event whose kind is not one of `WEBHOOK_EVENT_KINDS`
- **THEN** one plugin defect is reported, the decoy verifies the delivery, the receipt fails exactly as for a failed signature, and nothing is recorded

### Requirement: One refusal for unauthenticated deliveries
The receiver SHALL refuse an integration identifier that is not a kernel identifier, an unknown integration, a delivery that its verifier refuses with `forbidden`, and a plugin defect of `verifyWebhookDelivery` or `isEventless` with one failure: `forbidden`, reason `signature-invalid`, and one message, recording nothing. Except for a `forbidden` refusal it SHALL run a decoy verifier before it answers, which the composition SHALL give the work of its plugin's verification for the same headers.

#### Scenario: Unknown integration
- **WHEN** a delivery names an integration that the verifiers do not know
- **THEN** the decoy verifies the delivery and the receipt fails exactly as for a failed signature

#### Scenario: Invalid integration identifier
- **WHEN** a delivery names an integration identifier that is not a kernel identifier
- **THEN** the verifiers are not asked, the decoy verifies the delivery, and the receipt fails exactly as for a failed signature

#### Scenario: Plugin defect of the eventless rule
- **WHEN** `isEventless` throws or answers no boolean for a verified delivery without an event
- **THEN** one plugin defect is reported, the decoy verifies the delivery, the receipt fails exactly as for a failed signature, and nothing is recorded
