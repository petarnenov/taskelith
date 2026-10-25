# state-persistence Specification

## Purpose
Define the module-owned persistence ports of the control plane, their in-memory adapters, and the shared conformance suites that every adapter of a port passes.

## Requirements

### Requirement: Module-owned repository ports
The SDLC module SHALL own `WorkflowRunRepository` and `GateRepository` beside `AdmissionRepository`, the Execution module SHALL own `TaskRepository`, and the Scheduling module SHALL own `AssignmentRepository`; each SHALL offer `get`, `add`, and a `replace` that is a compare-and-set on the record's generation, and SHALL return `not-found` for an unknown record, `conflict` for an existing identifier or a stale generation, and `invalid` for a replacement that does not carry the next generation.

#### Scenario: Stale write
- **WHEN** a record is replaced at its stored generation and then replaced again at that same, now stale, generation
- **THEN** the second write fails with `conflict` and the stored record is the first replacement

#### Scenario: Concurrent writers
- **WHEN** two writers replace one record concurrently at the same expected generation
- **THEN** exactly one succeeds, the other fails with `conflict`, and the winner's record is stored

#### Scenario: Unchanged generation
- **WHEN** a record is replaced by one at the same generation as the stored record
- **THEN** the write fails with `invalid` and the stored record is unchanged

### Requirement: Workflow runs and their gates
A workflow run SHALL be its binding and progress with an identifier of kind `RunId`, compared on the progress generation, and `beginWorkflowRun` SHALL reject a binding that names another workflow or version than the definition; the gate repository SHALL keep the run each gate was added to and list a run's gates.

#### Scenario: Gates by run
- **WHEN** two gates are added to one run and one gate to another
- **THEN** listing the first run returns exactly its two gates, and listing a run without gates returns none

### Requirement: One held reservation per attempt
The assignment repository SHALL reject, with `conflict`, storing an assignment whose reservation is held while another stored assignment of the same attempt holds its reservation, and SHALL accept it once that reservation was released.

#### Scenario: Second holder
- **WHEN** a second assignment of an attempt with a held reservation is added
- **THEN** the add fails with `conflict`, and after the first assignment's reservation is released the add succeeds

### Requirement: Outbox ports
Each module that writes messages SHALL declare its own `Outbox` port, structurally identical across modules, whose `append` stores a message with event metadata, subject, and a JSON object payload, and fails with `conflict` for a known event identity and with `invalid` for a payload JSON cannot carry unchanged.

#### Scenario: Payload JSON cannot carry
- **WHEN** a message whose payload holds `NaN`, `-0`, an array with holes, or a cycle is appended
- **THEN** the append fails with `invalid` and nothing is stored

### Requirement: Inbox port
The consuming module SHALL own an `Inbox` whose `accept` returns `accepted` once per consumer and message identity and `duplicate` afterwards.

#### Scenario: Repeated delivery
- **WHEN** one consumer accepts the same message identity twice and another consumer accepts it once
- **THEN** the outcomes are `accepted`, `duplicate`, and `accepted`

### Requirement: Shared conformance suites
Each module SHALL export a conformance suite per port as cases that return problems without a test runner, built from fixed inputs, and the in-memory adapters SHALL pass them; the task suite SHALL check that a task with an authorized execution reads back with its grant's launch parameters as a `LaunchParameters` instance.

#### Scenario: In-memory adapters
- **WHEN** the module tests run every suite against the in-memory adapters
- **THEN** every case reports no problem
