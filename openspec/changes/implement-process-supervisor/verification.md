# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

[G2 work plan](../../../docs/g2-plan.md) item 15, assigned by the coordinating session (Niki) to the worker session Pepi under decision D14 (a). Base revision: `78362da` on `dev`, with `origin/dev` at `a286c5b` merged after item 14 (`implement-worker-journal`) landed, so the file store and the lock use item 14's helpers.

## Decisions

On 2026-10-25 a Claude Fable 5.1 (medium) subagent of the coordinator decided this item's mechanism questions under the owner's delegation. The owner did not make them:

- D-A: deferred to the owner, with the macOS adapter failing closed in the meantime.
- D-B (a), D-C (a), and D-C2 (a), as the design records.
- The Linux cgroup test runs from an opt-in target outside `make verify`.

Commit types: by the coordinator's rules for this item, every commit uses `chore`, `test`, `build`, or `docs`. The package is private and not part of the published `taskelith` package, so no release follows from it (pass-1 finding L8).

## Evidence

- Environment: macOS 26.6.2 x86_64, Node v24.22.1, npm 12.2.1.
- Measured on this host: `sysctl` from the command line cannot read `kern.proc`; no suspend-inclusive clock is documented outside `mach_continuous_time`; no `flock` binary exists.
- `koffi` evidence: [koffi-qualification.md](koffi-qualification.md), from the npm registry and the upstream repository on 2026-10-25, with runtime claims marked unverified.

## Author self-check

Recorded before pass 1.

- The plan row: launch by stable execution identity (`intent`, claim, a spawn in a new session and group), adoption (`adoptExecution`, recovery by identity and containment), exit observation (`exit` only for an empty process set), cancellation of the process tree (`cgroup.kill`; macOS group signals while unreaped), uncertainty (`decideRecovery`), Linux and macOS (macOS fails closed under D-A), and the crash points around launch and handle persistence (CP2, CP4, CP5 to CP9, CP11).
- Contract section 12, item 15 obligations, and how each is met:
  - The supervisor and the adopting supervisor: done.
  - The per-OS readers: Linux done; macOS fails closed pending D-A.
  - The Linux containment with the denial mechanism (an execution account, D-C (a)) and the self-check: done.
  - The namespace incarnation: done. The proof of an old namespace's end is not provided under D-C2 (a).
  - The single-instant macOS listing: pending D-A.
  - The crash points: done.
- Contract section 13, required tests: covered here, by unit tests with fakes and by `make verify-linux-cgroup` with real processes:
  - each supervisor crash point;
  - the seal race;
  - a paused or late supervisor that does not spawn;
  - a deleted record that is `uncertain`;
  - a reused process ID;
  - a worker restart;
  - a supervisor and then its adopter killed;
  - the CP8 to CP9 window on Linux;
  - an escaping descendant;
  - a child denied leaving its containment, and the self-check;
  - a spawn failure;
  - a suspend past the deadline, with the simulated host;
  - a corrupt or newer record.
- Contract section 13, required tests left to items 24 and 25:
  - every macOS row, which waits for D-A;
  - a machine reboot and a container replacement on real hosts; the decisions are unit-tested;
  - a real suspend;
  - a worker of the next version reading the previous record format, which needs a second format to exist.
- Against ADR 0004 and architecture section 6: ports and adapters with a pure decision core; worker-only package under the boundary rule; Docker for the privileged Linux tests; a `make` target; no new npm dependency; coverage above 75%.
- Every requirement of the spec delta is under 500 characters, and the new capability starts with a `## Purpose`.

## Checks

- `make verify` passed at `a932271`: 632 tests passed, 0 failed; coverage 99.22% lines, 92.90% branches, 98.91% functions; the comment, boundary, coverage-scope, archive, and package checks passed.
- `make verify-linux-cgroup` passed 13 of 13 tests in each of eight runs, after the test fix that the design records.
- `npm run openspec -- validate implement-process-supervisor --strict` passed.
