## Purpose

Define the module-owned agent harness port through which Taskelith drives an agent harness, the capabilities a harness plugin declares, the rules for turns, native requests, outcomes, and errors, and the harness-neutral conformance suite that every harness plugin passes.

## ADDED Requirements

### Requirement: Vendor-neutral harness port
The `AgentHarness` port SHALL belong to the Execution module, and no type, value, or test of the module SHALL name a harness, vendor, model, or native field; plugin results and events SHALL be plain data that the module parses, rejecting an unknown field, a missing field, an unknown value, or an accessor as `invalid`.

#### Scenario: Event with an extra field
- **WHEN** a plugin emits an event with a field the port does not define
- **THEN** the parser rejects it as `invalid`

### Requirement: Declared capabilities
A harness plugin SHALL declare its supported capabilities, including at least chat, prompt correlation, permission requests, interruption, and exit observation, its subscription mechanisms, its account signals, and one pinned binary per supported platform; an operation of an undeclared capability SHALL fail with `unavailable`, and an event of an undeclared request kind or signal SHALL be rejected.

#### Scenario: Terminal not declared
- **WHEN** the host asks a plugin that does not declare `terminal` for a terminal program
- **THEN** the call fails with `unavailable`

#### Scenario: Required capability missing
- **WHEN** a declaration omits permission requests
- **THEN** the declaration is rejected as `invalid`

### Requirement: Host-generated turn IDs
Every turn SHALL carry a host-generated turn ID that the plugin maps to its native correlation, every turn event SHALL name that turn ID, turns SHALL be serialized within a session, and a turn ID the native session has seen SHALL fail with `conflict` without being sent again.

#### Scenario: Repeated turn ID
- **WHEN** the host submits a turn ID the session has already seen
- **THEN** the call fails with `conflict` and the harness receives nothing

#### Scenario: Turn while one runs
- **WHEN** the host submits a turn while another turn of the session runs
- **THEN** the call fails with `precondition-failed`

### Requirement: Native requests with a single response
Every permission, input, and delegation request SHALL carry a native request ID unique within its generation; the first valid response SHALL be applied, a second SHALL fail with `conflict`, a request of an earlier generation SHALL never be answered in a later one, and a request that cannot be classified as a harness-neutral operation SHALL match no standing rule.

#### Scenario: Second response
- **WHEN** a second response arrives for an answered request
- **THEN** it fails with `conflict` and changes nothing

#### Scenario: Pending request after resume
- **WHEN** a session resumes after a process ended with a request pending
- **THEN** a response to that request fails with `not-found`, and the host reconciles it as unresolved

### Requirement: Generations
Each start or resume of a session SHALL use the next generation, and a request for a generation other than the session's current one SHALL fail with `precondition-failed`.

#### Scenario: Response for an earlier process
- **WHEN** a response names an earlier generation of the session
- **THEN** it fails with `precondition-failed` and is not applied

### Requirement: Delegation and terminal
A delegation's result SHALL return to the parent attempt as the single response to its native delegation request, and a terminal program SHALL be given only for a running session at its current generation.

#### Scenario: Terminal after close
- **WHEN** the host asks for a terminal program of a closed session
- **THEN** the call fails with `precondition-failed`

### Requirement: Terminal outcomes and error mapping
Every accepted turn SHALL end with exactly one outcome of `completed`, `interrupted`, `turn-limit-reached`, `account-limit-reached`, or `failed`, a failed turn SHALL carry exactly one failure kind, every session SHALL end with exactly one `session-ended` event, and operations SHALL return kernel Results and never throw.

#### Scenario: Error result and exception for one turn
- **WHEN** a harness reports an error result and also raises an error for the same turn
- **THEN** the plugin reports one `turn-ended` event

### Requirement: Pinned binaries and process groups
A plugin SHALL pin each supported platform's binary by version and SHA-256 digest, the host SHALL refuse a binary whose digest does not match, the plugin SHALL disable self-update, and a macOS platform SHALL be pinned only when qualification shows that the harness keeps every process in its process group.

#### Scenario: Digest mismatch
- **WHEN** the binary on the worker does not match the declared digest
- **THEN** the host refuses to start the session

### Requirement: Harness-neutral conformance suite
The Execution module SHALL provide a conformance suite without a test runner that every harness plugin's tests run with their own prompts, covering chat with prompt correlation, serialized turns and interruption, a permission request with a single response, and, when declared, input requests, delegation, resume, and the terminal, and the module's tests SHALL run it against a scripted test harness with no findings.

#### Scenario: Broken harness
- **WHEN** a harness accepts a second response to one request
- **THEN** the suite reports an `outcome` finding
