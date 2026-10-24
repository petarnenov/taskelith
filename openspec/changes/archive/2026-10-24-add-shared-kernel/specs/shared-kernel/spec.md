## Purpose

Define the shared kernel package `@taskelith/kernel`: the opaque identifiers, error vocabulary, result shape, and event metadata that every module shares, kept small and free of domain-specific and infrastructure code.

## ADDED Requirements

### Requirement: Small kernel
The shared kernel SHALL contain only opaque identifiers, the basic error vocabulary, the typed result shape, and stable event metadata with the time type it uses. It SHALL contain no domain-specific identifier, state machine, or rule, SHALL name no specific harness, provider, SCM, or SDLC framework, SHALL have no runtime dependency, and SHALL read no clock or random source.

#### Scenario: Deterministic kernel
- **WHEN** a test constructs identifiers, instants, and event metadata from fixed inputs
- **THEN** the results are the same on every run, because the kernel generates no identifiers and reads no time

#### Scenario: No module-specific identifier kinds
- **WHEN** the kernel's public export is inspected
- **THEN** the only identifier kinds it declares are `EventId`, `CorrelationId`, and `CausationId`, and any other kind is created through `parseIdentifier` with a kind name the caller supplies

### Requirement: Opaque identifiers
An identifier SHALL be a string branded with its kind and created only by a validating constructor that accepts 1 to 128 printable ASCII characters without whitespace and otherwise returns an `invalid` failure naming the kind.

#### Scenario: Valid identifier
- **WHEN** `parseIdentifier('TaskId', '0f8e2c1a-7b3d-4e5f-9a10-2b3c4d5e6f70')` is called
- **THEN** it returns a successful result whose value is the same text, typed as `Identifier<'TaskId'>`

#### Scenario: Invalid identifier
- **WHEN** the text is empty, longer than 128 characters, or contains whitespace or a non-ASCII character
- **THEN** the constructor returns a failure with code `invalid` and the kind in its details

### Requirement: Stable error vocabulary
The kernel SHALL define the failure codes `invalid`, `not-found`, `conflict`, `precondition-failed`, `forbidden`, `unavailable`, and `internal`. A failure SHALL be a frozen plain value with a code, a message, and string details, and SHALL NOT depend on an exception class or framework type. Renaming or removing a code SHALL be treated as a breaking change.

#### Scenario: Failure value
- **WHEN** a failure is created with a code, a message, and details
- **THEN** it is frozen, its details are a frozen copy, and callers can branch on its code

### Requirement: Typed results
Expected outcomes SHALL be expressible as `Result<T, E>`, a union of a success carrying a value and a failure carrying an error, discriminated by an `ok` flag, with the error defaulting to `Failure`.

#### Scenario: Success and failure
- **WHEN** `ok(42)` and `err(failure('not-found', 'Task not found'))` are created
- **THEN** the first has `ok` true and value 42, and the second has `ok` false and that failure as its error

### Requirement: Stable event metadata
Event metadata SHALL consist of an event identity, an event type of at most 128 characters made of at least two dot-separated segments of lowercase letters, digits, and inner hyphens, each starting with a letter, a positive integer schema version, an occurrence time as a canonical UTC instant, a correlation identity, and an optional causation identity. The metadata constructor SHALL return frozen metadata, or an `invalid` failure naming the first invalid field.

#### Scenario: Valid metadata
- **WHEN** metadata with a valid identity, type `sdlc.gate.passed`, schema version 1, time `2026-10-24T09:30:00.000Z`, and a correlation identity is constructed
- **THEN** the constructor returns frozen metadata with those values and no causation identity

#### Scenario: Invalid field
- **WHEN** any field is invalid, for example schema version 0 or a time without milliseconds
- **THEN** the constructor returns an `invalid` failure whose details name that field

### Requirement: Execution fields outside the kernel
The kernel event metadata SHALL NOT contain attempt or ownership generation, which belong to the events of the Execution module, and SHALL NOT contain a per-producer sequence until the wire envelopes decide where it belongs.

#### Scenario: Metadata fields
- **WHEN** valid metadata is constructed
- **THEN** its only fields are `eventId`, `eventType`, `schemaVersion`, `occurredAt`, `correlationId`, and, when given, `causationId`

### Requirement: Canonical instants
An instant SHALL be a UTC time in the exact form `YYYY-MM-DDTHH:mm:ss.sssZ` that names a real time, so that equal instants are equal strings.

#### Scenario: Impossible date
- **WHEN** `2026-02-30T00:00:00.000Z` is parsed
- **THEN** the result is an `invalid` failure

### Requirement: Kernel coverage
Tests SHALL import the kernel through its package name, so that coverage is measured over the compiled kernel, which `make verify` SHALL hold to the 75% line, branch, and function thresholds of ADR 0004 principle 9. A change to the kernel SHALL record its kernel coverage in its verification evidence.

#### Scenario: Coverage report
- **WHEN** `make verify` runs
- **THEN** the coverage report lists every compiled kernel module, and the run fails if coverage is below 75%
