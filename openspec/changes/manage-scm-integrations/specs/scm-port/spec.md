## ADDED Requirements

### Requirement: SCM plugin descriptor
The port entry SHALL define the draft `SourceControlPlugin`: a plugin's manifest identifier, the secret names every integration must hold, a check of the whole set of settings, a check of one secret, a provider factory over an integration's settings and secrets, a decoy verifier factory, and `isEventless`. A check SHALL fail with `invalid` and `details.setting` naming the setting or secret, never its value.

#### Scenario: GitHub settings
- **WHEN** the GitHub plugin checks settings with an unknown name, without `app-id`, or with an `app-id` that is no positive decimal number
- **THEN** each check fails with `invalid` naming that setting, and no message quotes a value

#### Scenario: GitHub secrets
- **WHEN** the GitHub plugin checks a `private-key` that Node.js cannot parse, an empty `webhook-secret`, or an unknown secret name
- **THEN** each check fails with `invalid` naming that secret only

### Requirement: SCM integration management
The integrations module SHALL create an integration only for a registered plugin, failing with `not-found` otherwise, with its allowed origin normalized as wire contracts section 4.1 requires, its settings checked whole, and every secret of the plugin present and checked. An update SHALL apply by compare-and-set on the revision, replace the settings whole when given, and replace only the named secrets. Every refusal SHALL name a setting or field, never a value.

#### Scenario: Origin normalization
- **WHEN** an integration is created with the origin `HTTPS://Git.Example.COM`
- **THEN** it stores `https://git.example.com:443`, and an origin with `http`, an IPv6 literal, user information, a path, a query, a fragment, port 0, or a normalized form over 300 characters fails with `invalid`

#### Scenario: Partial secret replacement
- **WHEN** an update at the current revision names only the webhook secret
- **THEN** the webhook secret is replaced, the other secrets are kept, and the revision moves by one

#### Scenario: Stale revision
- **WHEN** an update names a revision that another update already moved
- **THEN** it fails with `conflict` and changes nothing

### Requirement: Store-backed webhook verifiers
`StoredScmIntegrationVerifiers` SHALL give a stored integration's verifier, built by its plugin and reused only while the integration keeps its revision, and none for an unknown integration or one whose plugin is not registered or cannot build it, so that such a delivery gets the decoy and the one refusal.

#### Scenario: Changed webhook secret
- **WHEN** an integration's webhook secret is replaced and a delivery signed with the old secret arrives
- **THEN** the receiver refuses it, and a delivery signed with the new secret is verified
