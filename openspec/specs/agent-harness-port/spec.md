# agent-harness-port Specification

## Purpose
Define the module-owned agent harness port through which Taskelith drives an agent harness, the capabilities a harness plugin declares, the rules for turns, native requests, outcomes, and errors, and the harness-neutral conformance suite that every harness plugin passes.

## Requirements

### Requirement: Vendor-neutral harness port
The `AgentHarness` port SHALL belong to the Execution module, and no type, value, or test of the module SHALL name a harness, vendor, model, or native field; plugin results and events SHALL be plain data that the module parses, rejecting an unknown field, a missing field, an unknown value, or an accessor as `invalid`.

#### Scenario: Event with an extra field
- **WHEN** a plugin emits an event with a field the port does not define
- **THEN** the parser rejects it as `invalid`

#### Scenario: Values outside the contract's bounds
- **WHEN** a plugin returns a native session ID over 128 characters, a terminal path over 1,024 characters, or a failure message over 4,096 characters
- **THEN** the parser rejects it as `invalid`

#### Scenario: Reset time with an offset
- **WHEN** a `limit` event carries `resetsAt` with an offset such as `+00:00` instead of a final `Z`
- **THEN** the parser rejects it as `invalid`

#### Scenario: A __proto__ failure detail
- **WHEN** a failure's details hold a `__proto__` key
- **THEN** the parser keeps it as a field when its value is a string and rejects it as `invalid` otherwise

### Requirement: Malformed requests
A harness plugin SHALL reject a malformed request, one that is not an object, lacks a field, or has a field of the wrong type or outside the contract's bounds, with `invalid` before it checks any session state, and SHALL never throw for one; only an undeclared capability's `unavailable` SHALL come first.

#### Scenario: Malformed generation
- **WHEN** the host names generation 0 or 1.5 in a request for a known session
- **THEN** the call fails with `invalid`, not `precondition-failed`

#### Scenario: Null response
- **WHEN** the host responds with a null response
- **THEN** the call fails with `invalid` and does not throw

#### Scenario: Longest session ID
- **WHEN** the host starts a session with a 128-character session ID
- **THEN** the plugin returns a native session ID of at most 128 characters

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
Every permission, input, and delegation request SHALL carry a native request ID unique within its generation; the first valid response SHALL be applied, a second SHALL fail with `conflict`, a request SHALL expire when its turn or generation ends, a request of an earlier generation SHALL never be answered in a later one, and a request that cannot be classified as a harness-neutral operation SHALL match no standing rule.

#### Scenario: Second response
- **WHEN** a second response arrives for an answered request
- **THEN** it fails with `conflict` and changes nothing

#### Scenario: Response after the turn ended
- **WHEN** the host answers a request whose turn was interrupted before the answer
- **THEN** the response fails with `not-found` and is not applied

#### Scenario: Pending request after resume
- **WHEN** a session resumes after a process ended with a request pending
- **THEN** a response to that request fails with `not-found`, and the host reconciles it as unresolved

### Requirement: Generations
A session SHALL start at generation 1 exactly, a start at another generation SHALL fail with `invalid`, a resume SHALL use exactly the generation after the last one or fail with `precondition-failed`, and a request for a generation other than the session's current one SHALL fail with `precondition-failed`.

#### Scenario: Start at a later generation
- **WHEN** the host starts a session at generation 2
- **THEN** the start fails with `invalid`

#### Scenario: Resume that skips a generation
- **WHEN** the host resumes a session that ended at generation 1 at generation 3
- **THEN** the resume fails with `precondition-failed`

#### Scenario: Resume before a close
- **WHEN** the host resumes a running session and then closes it in the same tick
- **THEN** the resume fails with `precondition-failed`, and the close ends the generation

#### Scenario: Close at an earlier generation
- **WHEN** the host closes a resumed session at its earlier generation
- **THEN** the call fails with `precondition-failed`

#### Scenario: Response for an earlier process
- **WHEN** a response names an earlier generation of the session
- **THEN** it fails with `precondition-failed` and is not applied

### Requirement: Delegation and terminal
A delegation's result SHALL return to the parent attempt as the single response to its native delegation request, a terminal program SHALL be given only for a running session at its current generation, and the host SHALL run it in its own session under a pseudo-terminal, offering it on macOS only once the supervisor identity contract covers the terminal's process group.

#### Scenario: Terminal on Linux
- **WHEN** the host runs a terminal program on Linux
- **THEN** the execution's cgroup containment covers the terminal's processes

#### Scenario: Terminal on macOS before item 39
- **WHEN** the supervisor identity contract does not yet record, signal, and prove the end of the terminal's process group
- **THEN** the host does not offer `terminal` on macOS

#### Scenario: Delegation outcomes by correlation
- **WHEN** the host answers four delegation requests with the outcomes `completed`, `rejected`, `failed`, and `cancelled`, each with its own delegation ID
- **THEN** each turn's output contains its own delegation ID, outcome, and summary

#### Scenario: Terminal after close
- **WHEN** the host asks for a terminal program of a closed session
- **THEN** the call fails with `precondition-failed`

### Requirement: Terminal outcomes and error mapping
Every accepted turn SHALL end with exactly one `turn-ended` event before `session-ended`, with an outcome of `completed`, `interrupted`, `turn-limit-reached`, `account-limit-reached`, or `failed`, unless the plugin is lost with the harness process, when the host reconciles the turn; a failed turn SHALL carry exactly one failure kind, every session SHALL end with exactly one `session-ended` event, and operations SHALL return kernel Results and never throw.

#### Scenario: Harness exits during a turn
- **WHEN** the harness process ends while a turn runs
- **THEN** the turn ends as `failed` with `harness-exited`, then the session ends as `exited` or `failed`

#### Scenario: Error result and exception for one turn
- **WHEN** a harness reports an error result and also raises an error for the same turn
- **THEN** the plugin reports one `turn-ended` event

### Requirement: Pinned binaries and process groups
A plugin SHALL pin each supported platform's binary by version, path in its package, and SHA-256 digest, the host SHALL refuse a binary whose digest does not match and SHALL pass the verified binary's path to every start and resume, the plugin SHALL run only that binary and disable self-update, and a macOS platform SHALL be pinned only when qualification shows that the harness keeps every process in its process group.

#### Scenario: Digest mismatch
- **WHEN** the binary on the worker does not match the declared digest
- **THEN** the host refuses to start the session

### Requirement: Harness-neutral conformance suite
The Execution module SHALL provide a conformance suite without a test runner that every harness plugin's tests run with their own prompts and probes, checking effects through the harness's output and the fixture's probes and not only result codes, with every operation and wait under a deadline; the module's tests SHALL run it against a scripted test harness with no findings.

#### Scenario: Context kept
- **WHEN** a harness answers a recall turn without the fact stated in an earlier turn of the session
- **THEN** the suite reports an `outcome` finding

#### Scenario: Broken harness
- **WHEN** a harness accepts a second response to one request
- **THEN** the suite reports an `outcome` finding

#### Scenario: Blank recalled text
- **WHEN** the fixture's `recalled` text is blank
- **THEN** the suite stops with a `fixture` finding

#### Scenario: Malformed iterator result
- **WHEN** a harness's events yield null, a non-object, a non-boolean `done`, or a throwing accessor instead of an iterator result
- **THEN** the suite reports an `event` or `threw` finding and returns its report

#### Scenario: Native IDs the suite once used
- **WHEN** a harness issues `unknown` as a native session ID and `unknown-request` as a native request ID
- **THEN** the suite picks other IDs for its unknown session and request checks and reports no finding

#### Scenario: Wrong code for a host mistake
- **WHEN** a harness answers a second start, an unknown session, a malformed generation, or a resume out of order with a code other than the contract's
- **THEN** the suite reports an `outcome` finding

#### Scenario: Denied action runs
- **WHEN** a harness runs the action of a denied permission request
- **THEN** the suite reports an `outcome` finding
