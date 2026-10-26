## MODIFIED Requirements

### Requirement: Cancellation forwarding
A cancellation of an attempt SHALL stop its intent's launch; one of an execution SHALL stop only that execution, and a launch only while it runs it. Either SHALL seal an execution before its supervisor starts and write the `cancel` file of a started one. Its evidence SHALL be recorded once no launch it stops is live and every execution it names is `exited`, `not-started`, or rejected without a grant, and at once when there is none.

#### Scenario: Cancelled after W4
- **WHEN** a cancellation names an execution whose supervisor runs
- **THEN** the worker writes `cancel`, and records the evidence only after the exit is journaled

#### Scenario: Another execution of the intent
- **WHEN** a cancellation names a superseded execution of an intent whose launch runs another one
- **THEN** the running execution keeps running and gets no `cancel`, nothing is launched again, and the evidence is recorded once the named execution is settled

#### Scenario: Cancel file of the named execution only
- **WHEN** a cancellation names one of two open executions of an intent with written records and no live launch
- **THEN** only the named one gets `cancel`, and the evidence is recorded at its exit while the other still runs

#### Scenario: Attempt cancelled while an execution runs
- **WHEN** a cancellation names the attempt of an intent whose launch runs an execution
- **THEN** the launch stops and the running execution gets `cancel`
