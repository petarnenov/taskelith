## 1. Contract and spec

- [x] 1.1 `docs/contracts/supervisor-identity.md` section 13: one sentence on the home cgroup layout
- [x] 1.2 Spec delta: `worker-supervisor` "Linux readers and containment" with the home layout scenario

## 2. Self-check

- [x] 2.1 `checkLinuxContainment` refuses a home at or under the containment parent before any probe, comparing whole segments
- [x] 2.2 Unit tests in `test/linux.test.ts`: home equal to and under the parent, the sibling layout, and the segment edge case
- [x] 2.3 Privileged test in `test/linux-cgroup.privileged.ts`: the refusal; the sibling layout still passes
- [x] 2.4 Admission wiring inspected; recorded as a remaining gate (design D3)

## 3. Records and checks

- [x] 3.1 proposal.md, design.md, tasks.md, verification.md
- [x] 3.2 `npm run openspec -- validate harden-worker-linux-self-check-home-layout --strict`
- [x] 3.3 `make verify`
- [x] 3.4 Independent review (pass 1, no findings)
- [ ] 3.5 `make verify-linux-cgroup` on a host with cgroup v2 (coordinator, at integration)
- [ ] 3.6 Handoff and integration by the coordinator
