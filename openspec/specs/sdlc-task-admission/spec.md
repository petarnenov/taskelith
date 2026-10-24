# sdlc-task-admission Specification

## Purpose
Define how the SDLC module admits tasks: admission records bound to a workflow stage, work item, artifact revisions, and policy revision; the rules that admit implementation tasks only after their prerequisite gates pass and planning tasks without a spec; invalidation of unused admissions by new artifact revisions; and the admission service and repository port.

## Requirements

### Requirement: Admission record
A task admission SHALL be a frozen record that binds the task and its kind (`planning` or `implementation`), the workflow identifier and version, the stage, the work item when there is one, the artifact revisions the task works from (at most one per artifact), and the policy revision of the run binding, and SHALL carry the revisions the task created, its state, and a generation. It SHALL NOT share arrays with its inputs. The ownership generation SHALL be deferred to G2.

#### Scenario: Admitted implementation task
- **WHEN** an implementation task bound to a work item is admitted
- **THEN** the frozen record names the stage, the work item, the revisions its prerequisite gates judged, and the policy revision of the run, is `admitted`, and is at generation 1

### Requirement: Admission request validation
A request whose run binding names another workflow or version than the stage progress SHALL be rejected with `precondition-failed`, a stage the workflow does not contain with `not-found`, and an invalid admission, task, or stage identifier with `invalid` naming the field.

#### Scenario: Unknown stage
- **WHEN** a task is requested for a stage the workflow does not contain
- **THEN** the request is rejected with code `not-found` naming the stage

### Requirement: Task kind matches the stage
An implementation task SHALL be admitted only to a stage that covers the `implementation` obligation, and a planning task only to a stage that covers `intake` or `specification` and not `implementation`; any other request SHALL be rejected with `precondition-failed`.

#### Scenario: Planning task for an implementation stage
- **WHEN** a planning task is requested for a stage that covers implementation, or for a stage that covers only review and closure
- **THEN** the request is rejected with code `precondition-failed`

### Requirement: Implementation admission
An implementation task SHALL be admitted only when it is bound to a work item, its stage depends on at least one stage, and every stage it depends on has passed under the `sdlc-gates` rule. It SHALL be bound to the revisions that the gates of those stages judged, and a request whose prerequisite gates judged different revisions of one artifact SHALL be rejected with `precondition-failed` naming the artifact. Every rejected request SHALL be rejected with `precondition-failed`.

#### Scenario: Unbound implementation task
- **WHEN** an implementation task without a work item is requested while its prerequisite stages have passed
- **THEN** it is rejected with code `precondition-failed` and no admission is stored

#### Scenario: Prerequisite not passed
- **WHEN** a stage the implementation stage depends on has a pending or stale gate, or no gate
- **THEN** the request is rejected and the failure names that stage

#### Scenario: Stage without prerequisites
- **WHEN** an implementation task is requested for a stage that depends on no stage
- **THEN** the request is rejected, because no gate validated its inputs

### Requirement: Planning admission
A planning task SHALL be admitted without a specification, a work item, or a passed gate, bound to the revisions the caller says it starts from, possibly none; a request that lists two revisions of one artifact SHALL be rejected with `invalid` naming the field `artifacts`. Once its admission is used, it SHALL record each artifact revision it creates; recording a revision on an implementation admission or on an admission that is not used SHALL be rejected with `precondition-failed`.

#### Scenario: Planning task creates a missing specification
- **WHEN** a planning task is admitted without a specification, dispatched, and records the specification revision it created
- **THEN** its admission lists that revision, and an implementation task bound to a work item is admitted once a gate of the planning stage has passed for it

### Requirement: Admission states and transitions
An admission SHALL be `admitted`, `used`, or `invalidated`, and SHALL change state only from `admitted` to `used` or to `invalidated`; every other transition SHALL be rejected with `precondition-failed` naming the current and requested state. Every change SHALL take the generation its writer read, increase it by exactly one, and be rejected with `conflict`, before any other rule is checked, when that generation is not current.

#### Scenario: Every transition checked
- **WHEN** each admission state is asked to become used and to become invalidated
- **THEN** exactly the transitions from `admitted` succeed

### Requirement: Outdated admissions
A revision SHALL outdate an admission exactly when the admission is bound to a revision of the same artifact with a different digest. Invalidating an admission the revision does not outdate SHALL be rejected with `precondition-failed`, and an invalidated admission SHALL keep the revision that invalidated it.

#### Scenario: Same content read elsewhere
- **WHEN** a revision has the same artifact and digest as a bound revision but another native reference
- **THEN** it does not outdate the admission

### Requirement: Invalidation of unused admissions
When a planning task records a created revision, and on request for any revision, the service SHALL invalidate every unused admission the revision outdates and SHALL leave used admissions unchanged. The service SHALL store a created revision only after that invalidation succeeded.

#### Scenario: Specification changed before dispatch
- **WHEN** a planning task records a new revision of a specification that an unused and a used implementation admission are bound to
- **THEN** the unused admission is invalidated and the used one stays used

### Requirement: Admission service
The module SHALL provide `TaskAdmissionService` as the entry point that admits, uses, and invalidates admissions and records created revisions, over the module-owned ports `AdmissionRepository` and `Clock`. A rejected request SHALL store nothing. The domain admission rules SHALL read no clock, random source, file, or network; only the service reads the clock.

#### Scenario: Rejected request stores nothing
- **WHEN** the service rejects an unbound implementation task
- **THEN** the repository has no admission with its identifier

### Requirement: Admission repository
The `AdmissionRepository` port SHALL store a new admission only under an unused identifier (otherwise `conflict`), SHALL replace one only while it is at the expected generation (otherwise `conflict`; an unknown one is `not-found`), and SHALL list the unused admissions bound to an artifact. The module SHALL provide an in-memory implementation.

#### Scenario: Concurrent change during invalidation
- **WHEN** a concurrent writer changes an admission while the service invalidates the admissions a revision outdates
- **THEN** the service fails with `conflict`, and running it again invalidates the remaining ones

#### Scenario: Concurrent change while recording a created revision
- **WHEN** a concurrent writer changes an outdated admission while the service records a created revision
- **THEN** the service fails with `conflict` without storing the revision, and repeating the same call records it once and completes the invalidation
