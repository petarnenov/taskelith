## 1. Supervisor core

- [x] 1.1 Define the versioned record files and the framed event log.
- [x] 1.2 Implement the first supervisor's launch sequence, the adopting supervisor, cancellation, and termination evidence against ports.
- [x] 1.3 Implement the worker's steps, the recovery table of contract section 6, and record removal.

## 2. Platforms

- [x] 2.1 Implement the Linux `/proc` readers, the deadline clock, the cgroup v2 containment, and the self-check.
- [x] 2.2 Implement the fail-closed macOS platform and record the `koffi` qualification proposal for decision D-A.
- [x] 2.3 Amend the supervisor identity contract with the delegated decisions.

## 3. Integration with item 14

- [ ] 3.1 Implement the `RecordStore` and `ExecutionLock` adapters on item 14's durable file helpers and `ExclusiveFileLock`.
- [ ] 3.2 Add the supervisor program and real-process tests of the crash windows.
- [x] 3.3 Add the opt-in Linux cgroup target and record whether it is reliable enough for CI.

## 4. Verification and review

- [ ] 4.1 Run `make verify` and record the results.
- [ ] 4.2 Obtain independent review (Claude `claude-fable-5-1`, medium, plan mode) and record the results.
