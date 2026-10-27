## MODIFIED Requirements

### Requirement: Worker subtree rules
The `worker/` subtree SHALL be created only by enrollment and closed to other accounts, except that a separate execution account's group SHALL only traverse `dataRoot`, `worker/`, and `worker/workspaces/` at mode `0710`; its control records SHALL be owned by the worker's account, SHALL have no symbolic link on their path from the data root, and SHALL be on a local persistent filesystem. Workspace content SHALL follow its own rules, and workspace removal SHALL never delete a control record.

#### Scenario: Group-writable control-record directory
- **WHEN** a control-record directory under `worker/` is writable by its group
- **THEN** the worker fails startup

#### Scenario: Symbolic link inside a workspace
- **WHEN** a workspace under `worker/workspaces/` contains a symbolic link
- **THEN** the worker starts normally

#### Scenario: Execution account at the subtree
- **WHEN** an execution under the separate execution account lists `worker/` or reads a control record
- **THEN** both are refused, while the account can pass through to `worker/workspaces/`
