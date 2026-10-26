## Why

G2 work item 25 ([docs/g2-plan.md](../../../docs/g2-plan.md)) carries a decision deferred from item 23b: "For the worker container of item 23, decide a seccomp profile and check userns/mount under the execution account." Item 23b (`compose-installation-end-to-end`) ran the worker container as root with a `SETUID`/`SETGID`/`KILL` bounding set plus `CAP_SYS_ADMIN` and `apparmor=unconfined` for cgroup v2 delegation. Review pass 1 finding M2 recorded a residual risk, accepted by the owner's delegate "as known until item 25" (away run `20261026T142254Z-opencode-30870`): the execution account (uid 10003) can create an unprivileged user namespace and mount a tmpfs inside the worker container.

This change (item 25a) reproduces that risk under the real containment, evaluates the options that fit item 25a's scope (only the private worker image and Compose may change; no product code), and prepares the hardening. Phase 1 recorded the evidence and a recommendation; phase 2 implements the option the owner's delegate chose.

## What Changes

- **Reproduction evidence.** `design.md` records the commands and their outputs showing that, for a uid-10003 execution with `CapBnd` `e0` (no `SYS_ADMIN`), `no_new_privileges=1`, and an active seccomp filter, `unshare -U` and `unshare -Urm` followed by `mount -t tmpfs` succeed, and the current seccomp/capability/`no_new_privs` state of both the worker process and an execution.
- **Options.** `design.md` evaluates each option against cost, risk, reversibility, the worker's own needs (cgroup delegation, supervisor, journal, NATS), and whether it needs product code, with the tested effect of each.
- **Decision.** The owner's delegate chose option b1 on 2026-10-26 (away run `20261026T170116Z-opencode-68419`).
- **Seccomp profile (phase 2).** `infra/installation/seccomp/docker-default.json`, a byte-for-byte copy of Docker Engine 29.6.1's default profile pinned by moby commit and SHA-256, and `infra/installation/seccomp/worker.json`, derived from it by `scripts/worker-seccomp-profile.ts` (`make worker-seccomp-profile`) with only the `CAP_SYS_ADMIN` carve-out of `unshare`, `setns`, `clone`, and `clone3` removed. A test in `make verify` proves the copy and the derivation. The Compose `worker` service adds `seccomp=./seccomp/worker.json`.
- **Scenario.** `make scenario-worker-namespace-confinement` checks on a fresh throwaway installation that the execution account is refused `unshare -U` and `unshare -Urm` with `mount -t tmpfs`, that the cgroup delegation and a task's execution still work, and records the result with the platform.
- **Documents.** `docs/local-installation.md` describes the profile, its pinned source, the refresh procedure, and the scenario.

## Capabilities

### Modified Capabilities

- `local-installation`: the worker container confines the execution account from creating user and mount namespaces, closing the item 23b residual risk.

## Impact

The worker Compose service, two tracked seccomp profiles, a derivation script, a scenario, `make` targets, tests, and documentation. No product code, published CLI command, OpenAPI, AsyncAPI, or JSON schema, or npm dependency changes; `apps/worker`, `apps/control-plane`, and the published package are unchanged. The commits use `docs`, `build`, and `test`.
