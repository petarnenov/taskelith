## Purpose
Make a project's auto-merge setting the integration authority, so that changes whose gates pass are merged, and conflicts resolved, without a person, within the existing review and approval safety rules.

## ADDED Requirements

### Requirement: Auto-merge setting as integration authority
Each project SHALL have an auto-merge setting, on by default and changed only by a project-maintainer; while it is on, a change whose gates have all passed SHALL be merged into the project's work branch with the project's merge method without a further human step, and the setting SHALL prevail over any conflicting integration rule.

#### Scenario: Gates passed
- **WHEN** verify, independent review, and the required approvals of a change have passed and auto-merge is on
- **THEN** the change is merged without waiting for a person, and its change is closed and its agent session stopped

#### Scenario: Auto-merge off
- **WHEN** a project-maintainer turns auto-merge off
- **THEN** changes whose gates have passed wait for a manual merge

#### Scenario: Release and deployment
- **WHEN** auto-merge merges a change
- **THEN** no release or deployment is started by auto-merge itself

### Requirement: Serial merges per target branch
Auto-merge SHALL merge at most one change into a target branch at a time.

#### Scenario: Two changes ready
- **WHEN** two changes become ready for the same target branch
- **THEN** the second waits, queued, until the first has merged or left the merge flow

### Requirement: Standing approval rules
A project-maintainer SHALL be able to record standing approval rules that Taskelith answers through the external approval client; each rule SHALL record its author, scope, and policy revision, every use SHALL be audited, and a request without a matching rule SHALL wait for a person.

#### Scenario: Push while auto-merge is on
- **WHEN** a task's harness asks to push to the task's own branch while auto-merge is on
- **THEN** the request is approved by the standing rule and the use is audited

#### Scenario: Auto-merge turned off
- **WHEN** auto-merge is turned off
- **THEN** the standing push rule no longer applies

### Requirement: Automatic merge-conflict resolution
When auto-merge meets a conflict, the task's own harness SHALL resolve it in a fresh worktree, verify SHALL run again on the new head, the task's independent reviewer SHALL review the resolved diff, and only then SHALL the change merge; the flow SHALL have a budget of three attempts.

#### Scenario: Textual conflict resolved
- **WHEN** the harness resolves a conflict and verify and the review of the resolved diff pass
- **THEN** the change merges and the earlier evidence for the old head is marked stale, not reused

#### Scenario: Spec conflict
- **WHEN** the target branch changed a contract that the task's specification depends on
- **THEN** the task returns to Specify, the harness reconciles the specification, and the later gates run again

#### Scenario: Budget spent
- **WHEN** three attempts fail, a reconciled specification fails again, or no reviewer is available after three attempts
- **THEN** the task is escalated to a project-maintainer through the "Needs you" inbox

#### Scenario: Reviewer unavailable
- **WHEN** no reviewer slot is available
- **THEN** review is never performed by the implementer
