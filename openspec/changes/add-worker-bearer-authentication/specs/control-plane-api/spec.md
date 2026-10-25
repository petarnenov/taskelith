## ADDED Requirements

### Requirement: Worker credential scheme
An operation with the `workerCredential` scheme SHALL run only after the server has authenticated the bearer as a worker, and SHALL receive that worker and generation. A refused credential SHALL be answered 401 with the same failure for every cause, and a store that cannot answer SHALL be answered 503.

#### Scenario: Refused worker bearer
- **WHEN** a worker route is called with a bearer that is not a valid worker credential
- **THEN** the answer is 401 with a `Failure` of code `forbidden`, and the operation does not run
