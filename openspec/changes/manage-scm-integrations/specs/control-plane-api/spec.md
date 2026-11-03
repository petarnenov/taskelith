## ADDED Requirements

### Requirement: SCM integration operations
The control plane SHALL serve `listScmIntegrations` and `readScmIntegration` to any authenticated principal, and `createScmIntegration` and `updateScmIntegration` only to an `installation-owner`, checked before the body. `createScmIntegration` SHALL answer 404 for an unregistered plugin and 400 naming an invalid origin, setting, or secret; `updateScmIntegration` SHALL answer 404 for an unknown integration and 409 for a stale revision.

#### Scenario: Concurrent updates over HTTP
- **WHEN** two `updateScmIntegration` requests at one revision arrive together
- **THEN** one answers 200, the other 409, and the revision moves once

#### Scenario: Principal without the owner role
- **WHEN** a principal without `installation-owner` creates or updates an integration
- **THEN** the answer is 403 `role-required` and nothing changes, while its list and read answer 200

### Requirement: No SCM secret in answers or logs
No response, failure, request log, or string form SHALL carry an SCM integration's secret value: a read SHALL return only `secretNames`, the names of the stored secrets.

#### Scenario: Refused secret
- **WHEN** `createScmIntegration` is refused for an invalid private key whose text holds the webhook secret
- **THEN** the 400 names `private-key`, and neither the answer nor the request log holds either value

### Requirement: SCM integration secret key at initialization
Installation initialization SHALL create `control-plane/scm-integration-secrets.key`, never the slot credential key, with mode `0600` through the control-plane namespace when it is missing, also on a rerun, and SHALL never overwrite or output it. The service SHALL refuse to start without it, naming `init`, or with a key of another size.

#### Scenario: Missing key at start
- **WHEN** the control plane starts without the SCM integration secret key
- **THEN** the start fails with `precondition-failed`, naming `scm-integration-secrets.key` and `init`

## MODIFIED Requirements

### Requirement: GitHub webhook composition
For GitHub integrations the control plane's composition SHALL give the receiver the decoy and the eventless rule of the GitHub plugin's descriptor, copying none of the plugin's headers or events, and verifiers over the stored integrations. The decoy SHALL do the plugin's verification work for the same headers, and only a delivery whose `x-github-event` header is `ping`, `installation`, or `installation_repositories` SHALL be eventless.

#### Scenario: Missing signature of an unknown integration
- **WHEN** a delivery without a signature names an unknown integration and the same delivery a known GitHub one
- **THEN** both compute the same number of HMACs and comparisons, none

#### Scenario: Verified ping over HTTP
- **WHEN** a verified GitHub `ping`, `installation`, or `installation_repositories` delivery has a JSON object body
- **THEN** the answer is 202 and nothing is recorded

#### Scenario: Stored integration
- **WHEN** an integration created through `createScmIntegration` receives a delivery signed with its webhook secret
- **THEN** the answer is 202, and after an update of that secret the old signature answers 401
