## ADDED Requirements

### Requirement: Named fleet roles
The repository SHALL keep a fleet roster in `docs/fleet.md`, linked from the protocol, that names each session, its role, and its machine, with exactly one coordinator, and the owner's procedure to change the coordinator with a handover note; the `taskelith-coordinator` and `taskelith-worker` skills SHALL take a name, check it against the roster, and announce it.

#### Scenario: Session starts as a named worker
- **WHEN** the owner runs `/taskelith-worker <Name>` and the roster lists `<Name>` as a worker
- **THEN** the session sends `<Name> ready` to the roster's coordinator and waits for a brief

#### Scenario: Name conflicts with the roster
- **WHEN** the owner runs `/taskelith-coordinator <Name>` and the roster names another coordinator
- **THEN** the session stops and asks the owner

#### Scenario: Coordinator changes
- **WHEN** the owner names a new coordinator in the roster
- **THEN** the outgoing coordinator finishes running integrations and writes a handover note, and the new coordinator reads it and broadcasts its name to every worker
