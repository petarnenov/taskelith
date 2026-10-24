# Verification: define-supervisor-identity-contract

## Scope and source

G2 work plan item 4, assigned by the coordinator on 2026-10-25: a reviewed protocol contract and spec for the stable execution identity and its creation before spawn, adoption after a worker or supervisor restart, PID reuse, process groups and descendants, each crash window around launch and handle persistence, what survives a worker service restart or upgrade, and the native evidence each OS must supply. It serves the pre-G2 contract "supervisor identity and adoption", invariant 8, and R06. The coordinator also asked that the contract name the two obligations of the launch authorization contract (item 3) as "launch record" and "seal", and use the execution states `authorized`, `started`, `exited`, and `not-started`. Base revision: `d6beeaf` on `dev`; `origin/dev` at `7850c70` merged in after review pass 1. Prepared in a git worktree. Scope: `docs/contracts/supervisor-identity.md` and this change. Documentation and specification only.

## Self-check

- The contract follows decisions D4, D5, D7 (c), D11, and D12 of the G2 plan, the storage layout's `worker/` subtree, the trust model's trusted-host boundary, and the worker platform matrix of ADR 0007.
- Item 3's draft (`docs/contracts/launch-authorization.md` on its branch, not merged) was read for its obligations on this item: the single spawn per execution identity across grants (section 5 here) and the seal before `not-started` (sections 5 and 6 here). Items 3, 5, and 6 are cross-referenced by item name.
- Every requirement is under 500 characters (the longest is 343).
- The OS facts used are named with their source in section 10 of the contract; how they are read from TypeScript is left to item 15 as a qualification.

## Checks

Node v24.22.1, npm 12.2.1, in the worktree: `make verify` passed at `a326635`; `npm run openspec -- validate define-supervisor-identity-contract --strict` passed.

## Independent review

Assigned reviewer: Codex CLI with `gpt-6.1-sol`, reasoning effort medium, sandbox `read-only`, all confirmed in the output header. Item 3's draft contract, outside this worktree, was shared as external evidence and included in the snapshots. SHA-256 snapshots before and after each pass were equal.

- **Pass 1 at `a326635` — session `01a1701b-1e75-71e2-afb2-f40ae128c286`.** 0 Critical, 8 High, 5 Medium, 0 Low.
  1. High: the worker could report `not-started` after losing the seal race. The loser now reads the winning launch record and decides again; `not-started` needs a durable seal read back.
  2. High: a missing record was treated as proof that nothing spawned. The worker now journals that the record exists before starting the supervisor (CP3); a missing or damaged record after that is `uncertain`.
  3. High: ownership was released when only the child had exited. `exited` now requires the whole process set to be proven empty; otherwise `termination-unproven` keeps ownership.
  4. High: observed descendants did not prove the tree complete. Linux now uses a cgroup v2 containment per execution; macOS signals the group only while the child is unreaped, and a harness supported on macOS must keep its processes in its group.
  5. High: a marker scan cannot prove absence. The marker scan is removed; Linux proves absence from the containment, and macOS reports `uncertain`.
  6. High: a marker scan could record a descendant as the child. Removed with the scan.
  7. High: signals by a verified process ID raced with reuse. Linux kills through `cgroup.kill`; macOS signals only a group whose leader it holds unreaped, and an adopting macOS supervisor only observes.
  8. High: the spawn deadline did not survive a suspend. The deadline clock is now `CLOCK_BOOTTIME` on Linux and `mach_continuous_time` on macOS, and a supervisor that cannot read it seals.
  9. Medium: close-on-exec does not stop a forked child from holding `lock` before it executes. Liveness now needs both the lock and the identity in the highest supervisor record, with a bounded retry before `uncertain`.
  10. Medium: repeated adoption had no current-owner rule. Numbered `supervisor.<n>` records, created exclusively after taking the lock, name the current supervisor.
  11. Medium: `kinfo_proc` gives no numeric session ID. The contract no longer relies on the session ID; it uses the process group (`e_pgid`).
  12. Medium: a failed spawn had no transition. `handle` records the spawn failure, and the execution ends with `exited` and the failure.
  13. Medium: this record was missing before pass 1. Added.

## Remaining gates

Further review passes, then merge into `dev` and archive by the coordinator. The per-OS mechanisms of section 10, the Linux cgroup delegation, the container init, and the launchd behavior are qualification obligations of items 15 and 25 and G6.
