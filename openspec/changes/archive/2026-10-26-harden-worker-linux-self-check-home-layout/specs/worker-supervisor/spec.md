## MODIFIED Requirements

### Requirement: Linux readers and containment
On Linux, the adapter SHALL read the boot identity, process start time, parent, and group from `/proc`, and the deadline clock from `/proc/uptime`. It SHALL run each execution in a cgroup v2 containment that the child is born in. A self-check SHALL prove cgroup v2 delegation, a kill control, and that the execution account cannot write any cgroup of the worker. The self-check SHALL fail when the worker's home cgroup is at or under the containment parent, comparing whole path segments.

#### Scenario: Writable cgroup
- **WHEN** the execution account can write a `cgroup.procs` file of the worker
- **THEN** the self-check fails and names the file

#### Scenario: Home cgroup at or under the containment parent
- **WHEN** the worker's home cgroup is the containment parent or a cgroup under it
- **THEN** the self-check fails, names both cgroups, and creates no probe cgroup
- **AND** a home beside the parent, such as `init/` beside `executions/`, or one whose name only starts with the parent's name, such as `executions-home/`, is not refused for its layout
