## ADDED Requirements

### Requirement: Execution namespace confinement
The worker Compose service SHALL apply a seccomp profile that denies the creation of user and mount namespaces (`unshare`, `setns`, and `clone`/`clone3` with namespace flags) to every process of the worker container, so that the execution account cannot create a user namespace and mount inside the container. The profile SHALL leave the entrypoint's `/sys/fs/cgroup` remount and the worker's child spawning working, so that `make installation-smoke` still passes.

#### Scenario: Execution cannot create a namespace
- **WHEN** the execution account (uid 10003) runs `unshare -U` or `unshare -Urm` and `mount -t tmpfs` inside the worker container
- **THEN** the call fails with "Operation not permitted", and the worker still delegates its cgroup subtree and runs executions, which `make installation-smoke` checks

#### Scenario: Default profile rejected
- **WHEN** the worker container runs with `CAP_SYS_ADMIN` under Docker's default seccomp profile and no namespace-denying profile
- **THEN** the execution account can create a user namespace and mount a tmpfs, which this requirement forbids
