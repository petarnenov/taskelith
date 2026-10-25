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
- After the pass-1 fixes, `make verify` passed at `03770ca`: 641 tests passed, 0 failed; coverage 99.23% lines, 92.95% branches, 99.01% functions. `make verify-linux-cgroup` passed 13 of 13 tests in each of four runs.

## Independent review

Assigned reviewer: Claude Code with `claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`, run from the worktree. The prompt named AGENTS.md, ADR 0004, the governance review process, the plan row and decision D7 (c), the delegated decisions, the supervisor identity contract and its spec, the worker journal contract sections 2, 4, and 9, item 14's adapter, and the test harness. It asked for every instance of a problem with severity, file, line, and fix. SHA-256 snapshots of the files in `git ls-files -co --exclude-standard` were taken before and after each pass.

- **Pass 1 — session `7b225525-fb9c-4b89-9c96-d5ecabfa2ad0`,** reviewed revision `16cd032`; the JSON `modelUsage` reports only `claude-fable-5-1`. Snapshot before and after: `75fb42c0…f158`, equal. Findings: 0 Critical, 2 High, 5 Medium, 10 Low. All accepted and resolved except L8, answered:
  1. High H1: the results of entering and leaving the containment were ignored, so a child could be born outside it and give a false `exited`. A failed entry now ends with a spawn failure and no spawn; leaving is retried until it succeeds, before the supervisor watches or proves anything. Tests cover both.
  2. High H2: `startDetachedSupervisor` returned success before the spawn and left a spawn error uncaught. It now resolves on the `spawn` or `error` event, and the worker's start port is asynchronous; a test starts a missing program.
  3. Medium M1: a failed `cgroup.kill` was recorded as done and not retried. Only a successful kill is recorded, and a failed one is retried on the next poll; a test injects two failures.
  4. Medium M2: a Linux intent without its namespace incarnation counted as the current namespace. It now proves no namespace current, so recovery is `uncertain`; a test covers it.
  5. Medium M3: a containment that stayed unreadable made a supervisor wait for ever while holding the lock. After `unreadablePolls` unreadable polls the launch and adopt paths end with `containment-unreadable` and release the lock, so recovery decides; tests cover both.
  6. Medium M4: removal deleted files in directory order, `lock` included, and left temporary files. Removal now ends with `intent`, the lock files, and the launch record, and the store removes temporary files before the directory. The contract's remaining window is recorded: a supervisor that takes a new `lock` meanwhile finds no `intent` and exits, and its lock file makes the removal fail and be retried. Tests check the order.
  7. Medium M5: this record said item 14 was not merged, task 4.1 was unchecked, and the design claimed contract amendments for the new seal reasons that were missing. The scope now names the merge, 4.1 is checked, and contract steps CP4 to CP6 state the seal reasons and the write failure.
  8. Low L1: the unused `@taskelith/sdlc` dependency is removed.
  9. Low L2: write failures before the spawn were reported as `launch-exists` or `identity-unreadable`. They are now `write-failed` with the file; tests cover the claim, the seal, and the supervisor record.
  10. Low L3: a containment created at CP6 stayed after a lost claim or a failed spawn. Both paths remove it; a test covers the lost claim.
  11. Low L4: the Linux listing could throw and read the boot identity per process. It returns a failure and reads the boot identity once.
  12. Low L5: no test showed that cancellation signals nothing after the reap, or no kill after an exit during the grace period. Both are tested.
  13. Low L6: the recursion after a lost seal reset the bounded liveness retry. It is passed on.
  14. Low L7: the contract's CP4 said the supervisor gets only its directory, and section 8 did not note Node's immediate reap. Both are amended.
  15. Low L8, **answered without a change:** product code is committed as `chore`. The coordinator's rules for this item allow only `chore`, `test`, `build`, and `docs`, and the private package triggers no release; the scope section records this.
  16. Low L9: `intent` could be replaced after a supervisor started. Replacement is refused once a supervisor record exists; a test covers it.
  17. Low L10: a stale self-check probe made the check report a missing delegation. A stale probe is removed first; the test leaves one in place.
