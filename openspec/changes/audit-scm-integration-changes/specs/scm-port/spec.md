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
