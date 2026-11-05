## ADDED Requirements

### Requirement: Account slot operations served
The control plane SHALL serve the eight account slot operations of `control-plane.openapi.json`, `listProjectAccountSlots` for a project reader and the others for an `installation-owner`, checked before the body. A command SHALL answer 404 for a removed or unknown slot and 409 when its `expectedRevision` is not the stored one. No answer, failure, or log record SHALL carry a slot credential, and every answer SHALL carry `Cache-Control: no-store`.

#### Scenario: Credential never answered
- **WHEN** an owner adds a slot or rotates its credential, also with a body that the schema refuses
- **THEN** no answer, failure, or log record holds the credential, and no answer names `credentialVersion`

#### Scenario: Project view
- **WHEN** a `project-viewer` lists the account slots of its project
- **THEN** the answer holds the project's active slots, each with `sharedWithOtherProjects`, and names no other project

#### Scenario: Moved revision
- **WHEN** an owner revokes a slot with a revision that another command moved
- **THEN** the answer is 409 `conflict` and the slot is unchanged

#### Scenario: Second Claude Code slot
- **WHEN** an owner adds a Claude Code slot while another one is not removed, or two adds race for the only one
- **THEN** one slot is stored, and the other add answers 400 `invalid`

#### Scenario: Unknown project
- **WHEN** an owner adds or updates a slot whose `allowedProjects` names a project that does not exist
- **THEN** the answer is 400 `invalid` with `details.field` `allowedProjects`, and nothing is stored

### Requirement: Worker routes only on the worker endpoint
The browser endpoint SHALL serve no confidential operation and no operation whose every `security` alternative is `workerCredential` or `enrollmentToken`; the worker endpoint SHALL serve every operation that is not browser-only.

#### Scenario: Enrollment on the browser endpoint
- **WHEN** `enrollWorker` or a worker credential operation reaches the browser endpoint
- **THEN** the answer is 404, while the worker endpoint serves it

### Requirement: Slot credential key at initialization
Installation initialization SHALL create `control-plane/slot-credential-key` with mode `0600` through the control-plane namespace when it is missing, also on a rerun, and SHALL never overwrite or output it. The start SHALL only read it, refusing with `precondition-failed` without it, naming `init`, or with a key that is not 32 bytes, naming no key byte.

#### Scenario: Missing key at start
- **WHEN** the control plane starts without the slot credential key
- **THEN** the start fails naming `slot-credential-key` and `init`, and no key is created

### Requirement: Composed slot credential sweep and default cooldown
The control plane SHALL run the slot credential sweep with the least grace age every hour, log a sweep that fails without stopping, read `TASKELITH_SLOT_DEFAULT_COOLDOWN_MINUTES` as a whole number from 1 to 1440, 60 when unset, refusing the start for another value and naming the variable, and pass that value to the limit signal.

#### Scenario: Orphan version swept
- **WHEN** a stored version that no record names is older than the grace age
- **THEN** the running control plane discards it

#### Scenario: Invalid default cooldown
- **WHEN** `TASKELITH_SLOT_DEFAULT_COOLDOWN_MINUTES` is `0`, `1441`, or `1.5`
- **THEN** the settings are refused naming the variable

## MODIFIED Requirements

### Requirement: SCM integration secret key at initialization
Installation initialization SHALL create `control-plane/scm-integration-secrets.key` with mode `0600` through the control-plane namespace when it is missing, also on a rerun, and SHALL never overwrite or output it. The service SHALL refuse to start without it, naming `init`, or with a key of another size.

#### Scenario: Missing key at start
- **WHEN** the control plane starts without the SCM integration secret key
- **THEN** the start fails with `precondition-failed`, naming `scm-integration-secrets.key` and `init`
