## ADDED Requirements

### Requirement: Credential rotation on the worker
On a rotation notice for its next generation a worker SHALL store a new NKey and `tkwk_` secret before it acknowledges the notice, renew with its current bearer, adopt the answer while keeping the previous generation, reconnect to the broker with the new user, and confirm with the new bearer only after that connection succeeded. A refused renewal or confirmation SHALL end the attempt with a log line; an unavailable one SHALL be retried after 5 s doubling to 60 s with jitter.

#### Scenario: Rotation
- **WHEN** a connected worker receives the notice for its next generation
- **THEN** it renews, connects with the new broker user, confirms, and its launch authorizations then carry the new bearer

#### Scenario: Notice for another generation
- **WHEN** a worker receives a notice for its current or an older generation
- **THEN** it acknowledges the notice and changes no file

### Requirement: Rotation resumed at every start
Every worker start SHALL resume a rotation from its files: a stored generation that is not adopted SHALL be renewed, and an adopted generation that is not confirmed SHALL be confirmed once the broker connection uses it.

#### Scenario: Crash between adoption and confirmation
- **WHEN** a worker stops after it adopted the new generation and before it confirmed it, and starts again
- **THEN** it connects with the new generation and confirms it, and the previous generation's files are removed

### Requirement: Expired broker credentials
When the broker rejects a worker's credentials, the worker SHALL try every generation it holds; after 3 consecutive rounds in which every generation was rejected it SHALL stop with code `forbidden` and reason `credentials-expired` and name re-enrollment. Other broker failures SHALL keep the endless retry.

#### Scenario: Revoked worker
- **WHEN** every broker credential of a worker is rejected 3 times in a row
- **THEN** the worker stops with reason `credentials-expired`, and its exit status is 1

#### Scenario: Broker outage
- **WHEN** the broker is unreachable for many attempts
- **THEN** the worker keeps trying and does not stop
