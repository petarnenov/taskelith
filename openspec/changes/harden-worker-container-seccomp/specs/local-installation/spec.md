## ADDED Requirements

### Requirement: Execution namespace confinement
The worker Compose service SHALL run with a seccomp profile under which no process of the worker container, the execution account's included, can call `unshare` or `setns` or create a namespace through `clone` or `clone3`. `mount` and the other calls SHALL stay as Docker's default profile grants them to a container with `CAP_SYS_ADMIN`.

#### Scenario: Execution account refused a namespace
- **WHEN** `make scenario-worker-namespace-confinement` runs, as the execution account below the worker's `setpriv`, `unshare -U` and `unshare -Urm` with `mount -t tmpfs` in the worker container
- **THEN** both are refused with `EPERM`, and the scenario records its result with the OS, architecture, kernel, file system, and versions

#### Scenario: Delegation and executions unaffected
- **WHEN** the worker container starts with the profile
- **THEN** the entrypoint delegates the cgroup subtree, a task's execution runs in its own cgroup under `executions/` and exits 0, and `make installation-smoke` passes

### Requirement: Pinned worker seccomp profile
The worker's seccomp profile SHALL be derived from a tracked, byte-for-byte copy of Docker's default profile, pinned by upstream commit and SHA-256, with only the `CAP_SYS_ADMIN` carve-out for the namespace calls removed. `make verify` SHALL check the copy and the derivation.

#### Scenario: Profile drift
- **WHEN** the upstream copy no longer matches its pinned SHA-256, or the tracked profile differs from its derivation
- **THEN** `make verify` fails
