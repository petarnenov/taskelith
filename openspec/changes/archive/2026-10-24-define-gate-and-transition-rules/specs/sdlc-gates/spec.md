## Purpose

Define the gate and stage transition rules of the SDLC module: gate states and their allowed transitions, distinct evidence kinds for structural validation, semantic approval, and platform-managed records, invalidation of gates by new artifact revisions, and stage transitions over the workflow graph with compare-and-set generations.

## ADDED Requirements

### Requirement: Gate states
A gate SHALL be in one of the states `pending`, `passed`, `failed`, `stale`, and `blocked`. A new gate SHALL be `pending` at generation 1. Gates and every transition result SHALL be frozen values.

#### Scenario: New gate
- **WHEN** a gate is opened for a valid subject
- **THEN** it is a frozen pending gate

### Requirement: Gate transitions
A gate SHALL change state only along these transitions: `pending` to `passed`, `failed`, `blocked`, or `stale`; `passed` to `stale`; `failed` to `pending` or `stale`; `stale` to `pending`; and `blocked` to `pending` or `stale`. Every other transition SHALL be rejected with a `precondition-failed` failure whose details name the gate, the current state, and the requested state.

#### Scenario: Passed gate cannot fail
- **WHEN** failing evidence is recorded for a passed gate
- **THEN** the transition is rejected with code `precondition-failed` and the gate stays passed

#### Scenario: Every transition checked
- **WHEN** each of the 25 pairs of current and requested state is attempted
- **THEN** exactly the listed transitions succeed and all others are rejected

#### Scenario: Reopening a gate
- **WHEN** a failed, stale, or blocked gate is reopened with a subject
- **THEN** it becomes pending for that subject without its previous decision or block reason

### Requirement: Gate subject
A gate SHALL judge a subject of one or more artifact revisions with at most one revision per artifact, and SHALL NOT share the subject array with its input.

#### Scenario: Same artifact twice
- **WHEN** a gate subject lists two revisions of the same artifact
- **THEN** opening the gate fails with code `invalid` and the field `subject`

### Requirement: Distinct evidence kinds
The model SHALL define the evidence kinds `structural-validation`, `semantic-approval`, and `platform-record` as separate types, each with its own source identity, its own verdicts (`valid` or `invalid`; `approved` or `rejected`; `satisfied` or `unsatisfied`), a subject, the instant it was recorded, and a reference to where it is kept.

#### Scenario: Verdict of another kind
- **WHEN** a semantic approval is parsed with the verdict `valid`
- **THEN** parsing fails with code `invalid` and the field `verdict`

### Requirement: Gate requires one evidence kind
A gate SHALL require exactly one evidence kind, and recording evidence of another kind SHALL be rejected with `precondition-failed`. Only the passing verdict of the required kind SHALL pass a gate, and only its failing verdict SHALL fail it.

#### Scenario: Structural check for a semantic gate
- **WHEN** a passing structural validation or a satisfied platform record is recorded for a gate that requires semantic approval
- **THEN** the gate is not passed and the failure names the required and the provided kinds

### Requirement: Evidence bound to exact revisions
Evidence SHALL decide a gate only when its subject is the same set of artifact revisions as the gate's subject, compared by artifact identifier and digest in any order; otherwise recording it SHALL be rejected with `precondition-failed`. A passed or failed gate SHALL keep the evidence that decided it.

#### Scenario: Approval of a previous revision
- **WHEN** an approval cites a revision of the specification other than the one in the gate's subject
- **THEN** the gate is not passed

### Requirement: Invalidation by a new artifact revision
A revision SHALL outdate a gate exactly when the gate's subject contains a revision of the same artifact with a different digest. Marking a gate stale SHALL be rejected with `precondition-failed` when the revision does not outdate it, and a stale gate SHALL keep the decision it had.

#### Scenario: Specification changed after approval
- **WHEN** a new revision of an artifact in a passed gate's subject is reported and the gate is marked stale
- **THEN** the gate is stale, keeps the superseded approval, and passes again only after it is reopened for the new subject and decided by new evidence

#### Scenario: Same content read elsewhere
- **WHEN** a revision has the same artifact identifier and digest as the subject revision but another native reference
- **THEN** it does not outdate the gate

### Requirement: Stage states and transitions
Stage progress SHALL record for each stage of a workflow definition one of the states `not-started`, `in-progress`, and `completed`, and SHALL allow only the transitions `not-started` to `in-progress`, `in-progress` to `completed`, and `completed` to `in-progress`, rejecting every other one with `precondition-failed`. A transition of a stage the definition does not contain SHALL fail with `not-found`.

#### Scenario: Rework loop
- **WHEN** a completed stage is started again while its dependencies have passed
- **THEN** it is in progress again

### Requirement: Stage transitions gated by passed stages
A stage SHALL have passed exactly when it has at least one gate and all of its gates have passed. A stage SHALL become `in-progress` only when every stage it depends on has passed, and SHALL become `completed` only when it has passed; otherwise the transition SHALL be rejected with `precondition-failed` naming the unmet stages.

#### Scenario: Dependency not passed
- **WHEN** a stage is started while a stage it depends on has a gate that is not passed, or has no gate
- **THEN** the start is rejected and the failure names that dependency

#### Scenario: Completed dependency with a stale gate
- **WHEN** a dependency stage is completed but one of its gates has become stale
- **THEN** a stage depending on it cannot start

### Requirement: Compare-and-set generations
Gates and stage progress SHALL each carry a generation that starts at 1 and increases by exactly one with every accepted transition. Every transition SHALL take the generation its writer read and SHALL be rejected with `conflict`, before any other rule is checked, when that generation differs from the current one.

#### Scenario: Stale writer
- **WHEN** two writers read a gate at the same generation and the first one's transition is accepted
- **THEN** the second writer's transition, still naming the old generation, is rejected with code `conflict`

### Requirement: Pure transition rules
The gate and stage rules SHALL read no clock, random source, file, or network; the time of each change SHALL be an `Instant` argument, and the same inputs SHALL always give the same result.

#### Scenario: Deterministic transition
- **WHEN** the same transition is applied twice to the same gate with the same arguments
- **THEN** both results are equal
