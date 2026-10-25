# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

[G2 work plan](../../../docs/g2-plan.md) item 15, assigned by the coordinating session (Niki) to the worker session Pepi under decision D14 (a). Base revision: `78362da` on `dev`. Item 14 is not yet merged; the parts that need it are open tasks.

## Decisions

On 2026-10-25 a Claude Fable 5.1 (medium) subagent of the coordinator decided this item's mechanism questions under the owner's delegation. The owner did not make them:

- D-A: deferred to the owner, with the macOS adapter failing closed in the meantime.
- D-B (a), D-C (a), and D-C2 (a), as the design records.
- The Linux cgroup test runs from an opt-in target outside `make verify`.

## Evidence

- Environment: macOS 26.6.2 x86_64, Node v24.22.1, npm 12.2.1.
- Measured on this host: `sysctl` from the command line cannot read `kern.proc`; no suspend-inclusive clock is documented outside `mach_continuous_time`; no `flock` binary exists.
- `koffi` evidence: [koffi-qualification.md](koffi-qualification.md), from the npm registry and the upstream repository on 2026-10-25, with runtime claims marked unverified.
