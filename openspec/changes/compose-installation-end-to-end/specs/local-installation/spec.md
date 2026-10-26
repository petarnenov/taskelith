## ADDED Requirements

### Requirement: Delegated worker containment
The worker container SHALL run in a private cgroup v2 namespace whose root holds no process: the worker SHALL sit in the leaf `init/` and executions under the sibling `executions/`. The worker image SHALL always set `TASKELITH_CONTAINMENT_PARENT` to that sibling and name an execution account that owns no cgroup of the worker.

#### Scenario: Worker start
- **WHEN** the worker container starts
- **THEN** the worker runs in `init/`, its containment parent exists outside its own cgroup, and the execution account can write no `cgroup.procs` of the worker, which `make installation-smoke` checks

#### Scenario: No delegation
- **WHEN** the container cannot be delegated, such as without root or without cgroup v2
- **THEN** the entrypoint fails and names the cause, and the worker does not start

### Requirement: Opt-in end-to-end smoke
`make installation-smoke` SHALL build, bootstrap, start, and enroll a throwaway installation with random secrets, then create a run of a test-only workflow and submit an admitted task through the API. It SHALL pass only when the Linux worker container executes the test-only scripted process through the supervisor and the control plane stores an ended result that exited with code 0.

#### Scenario: Successful smoke
- **WHEN** `make installation-smoke` runs on a Docker host
- **THEN** the stored task result is ended with exit code 0, and the throwaway project is removed with its volumes and images

#### Scenario: Failed smoke
- **WHEN** a step fails or the task does not end within two minutes
- **THEN** the control-plane and worker logs are printed, the target fails, and the throwaway project is removed

## MODIFIED Requirements

### Requirement: Unprivileged services with volume data
The control plane and NATS SHALL run as non-root users. The worker container SHALL start as root only for its entrypoint, and the worker SHALL then run with no capability but `SETUID`, `SETGID`, and `KILL`, so that a child under the execution account has none. The data of PostgreSQL, NATS, the control plane, and the worker SHALL live on named volumes. The images SHALL contain no credentials and no data-root state, and SHALL be built only from tracked files.

#### Scenario: Fresh image
- **WHEN** the control-plane or worker image is built
- **THEN** it runs as `taskelith`, its data root is empty, and an untracked file of the checkout is absent

#### Scenario: Worker privileges
- **WHEN** the composition starts the worker
- **THEN** the service drops every capability but those its entrypoint needs, sets `no-new-privileges`, and the entrypoint runs the worker with `SETUID`, `SETGID`, and `KILL` only

### Requirement: Harness image variant
The worker image SHALL have a separate `worker-harnesses` variant that adds the agent harness packages pinned in the qualification records, installed from a tracked lockfile with every package checked against its integrity hash and no install scripts run. The default worker image SHALL stay without harnesses. Root SHALL own the installed harnesses, so that the execution account cannot change them, and the variant SHALL set every self-update switch that a harness reads from the environment.

#### Scenario: Default worker image
- **WHEN** the default `worker` target is built
- **THEN** it contains no harness package
