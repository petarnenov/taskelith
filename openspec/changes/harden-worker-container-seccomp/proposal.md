## Why

G2 work item 25 ([docs/g2-plan.md](../../../docs/g2-plan.md)) carries a decision deferred from item 23b: "For the worker container of item 23, decide a seccomp profile and check userns/mount under the execution account." Item 23b (`compose-installation-end-to-end`) ran the worker container as root with a `SETUID`/`SETGID`/`KILL` bounding set plus `CAP_SYS_ADMIN` and `apparmor=unconfined` for cgroup v2 delegation. Review pass 1 finding M2 recorded a residual risk, accepted by the owner's delegate "as known until item 25" (away run `20261026T142254Z-opencode-30870`): the execution account (uid 10003) can create an unprivileged user namespace and mount a tmpfs inside the worker container.

This change (phase 1, 25a) reproduces that risk under the real containment, evaluates the options that fit item 25a's scope (only the private worker image and Compose may change; no product code), and prepares the hardening. The option is the owner's to choose; this change records the evidence and a recommendation.

## What Changes

- **Reproduction evidence.** `design.md` records the exact commands and outputs showing that, for a uid-10003 execution with `CapBnd` `e0` (no `SYS_ADMIN`), `no_new_privileges=1`, and an active seccomp filter, `unshare -U` and `unshare -Urm` followed by `mount -t tmpfs` succeed, and the current seccomp/capability/`no_new_privs` state of both the worker process and an execution.
- **Options.** `design.md` evaluates each option against cost, risk, reversibility, the worker's own needs (cgroup delegation, supervisor, journal, NATS), and whether it needs product code, with the tested effect of each.
- **Recommended hardening (pending the owner's decision).** A custom seccomp profile on the Compose `worker` service that denies user-namespace and mount-namespace creation while leaving the entrypoint's cgroup remount and the worker's child spawning intact, so an execution can no longer create a user namespace or mount inside the container. The spec delta drafts this option.

## Capabilities

### Modified Capabilities

- `local-installation`: the worker container confines the execution account from creating user and mount namespaces, closing the item 23b residual risk.

## Impact

Documentation and, when the owner chooses the recommended option, the worker Compose service's `security_opt` and a tracked seccomp profile under `infra/installation/`. No product code, published CLI command, OpenAPI, AsyncAPI, or JSON schema, or npm dependency change; `apps/worker` and `apps/control-plane` are unchanged. The commits use `docs` and, for the profile, `build`.
