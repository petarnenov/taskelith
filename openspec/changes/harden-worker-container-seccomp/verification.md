# Verification: harden-worker-container-seccomp (25a)

## Scope and source

G2 work item 25, first part (25a), `harden-worker-container-seccomp`, assigned by the coordinator on 2026-10-26: reproduce under the real containment the item 23b residual risk that the execution account (uid 10003) can create a user namespace and mount inside the worker container, evaluate the options, and, after the owner's decision, harden the worker container. Scope: only the private worker image and the Compose composition; excluded: product code (`apps/worker`, the supervisor adapters), contract changes, changes to `make verify-linux-cgroup` or other tooling, and the rest of item 25 (native acceptance on the other matrix entries). Sources: [docs/g2-plan.md](../../../docs/g2-plan.md) item 25; the [item 23b archive](../archive/2026-10-26-compose-installation-end-to-end/verification.md) (review finding M2 and the accepted residual risk); the [24a change](../run-g2-failure-scenarios-composition/verification.md) for the scenario and recorder style.

## Revision and environment

- Base: `origin/dev` at `3321cf2`. Branch `harden-worker-container-seccomp`. Phase 1 (reproduction and options): `535d5a8`. Phase 2 (option b1): `039ec49` (profile, derivation, Compose) and `a13894c` (scenario), the commit both evidence records name; the evidence runs ran on that tree with only `results.jsonl` and documents changed afterwards. Documents: `9338411` and this commit.
- Host: Apple Silicon Mac, macOS 26.6.2 (build 25G83, Darwin 25.6.0), `arm64`; Node.js 24.22.1 from `.nvmrc`, via `nvm use`.
- Engine: Docker Desktop, Docker Engine 29.6.1 (server `GitCommit 8ec5ab3`), server architecture `aarch64`, kernel 6.12.76-linuxkit, `SecurityOptions: name=seccomp,profile=builtin name=cgroupns`; Docker Compose v5.2.0. Images built for linux/arm64 by `scripts/installation.sh build` with the `make installation-build` pins (Ubuntu 24.04 digest, Node.js 24.22.1 tarball SHA-256).

## Author self-check and evidence check

- AGENTS.md: English only; implements only the decided option b1; no product code, OpenAPI, AsyncAPI, JSON schema, contracts document, or npm dependency change, and the published package is unchanged (`verify:package` passed). Changed: `infra/installation/compose.yaml` (one `security_opt` entry), the new `infra/installation/seccomp/` (upstream copy and derived profile), the new `scripts/worker-seccomp-profile.ts` and its test, the scenario in `scripts/installation-scenarios.sh` and `scripts/installation.sh` with stub tests, two `make` targets, `test/installation-composition.test.ts`, and `docs/local-installation.md`. Commits use `build`, `test`, and `docs` without attribution; nothing was pushed.
- Comment rule: every new or changed comment in `.ts`, `.sh`, `.yaml`, and `Makefile` files has at most two lines of at most 80 characters; `npm run verify:comments` passes. The JSON profiles carry no comments.
- ADR 0004: Clean Code and SOLID (the derivation is one small pure function with shape checks, separate from file I/O; the scenario reuses the 24a helpers); hexagonal architecture and microkernel are untouched (no product module changes); Docker (the hardening is a container setting); contract-first OpenAPI (no API change); Makefile-driven operation (`make scenario-worker-namespace-confinement`, `make worker-seccomp-profile`); SDLC through this OpenSpec change; coverage stays above 75 % (99.26 % lines, 91.88 % branches, 98.89 % functions).
- Specs touched: `local-installation`, with two added requirements, "Execution namespace confinement" and "Pinned worker seccomp profile"; the existing "Unprivileged services with volume data" and "Delegated worker containment" still hold (the scenario and the smoke check them). `npm run openspec -- validate harden-worker-container-seccomp --strict` passes, and the archive dry run of `make verify` passes.
- Docker hygiene: the runs removed only their own throwaway projects (`down --volumes`) and the two images built by hand for the phase 1 probe; no prune; no other project's container, image, or volume was touched.
- Evidence check: the change's external links are
  - `https://github.com/moby/moby/blob/8ec5ab355a34b2a0e2b3238d67bdefe77fefa982/vendor/github.com/moby/profiles/seccomp/default.json` (in `design.md`, this file, and `docs/local-installation.md`): pinned to a commit;
  - `https://github.com/moby/profiles/blob/seccomp/v0.2.3/seccomp/default.json` (same files): pinned to the tag `seccomp/v0.2.3`;
  - `https://raw.githubusercontent.com/moby/moby/8ec5ab355a34b2a0e2b3238d67bdefe77fefa982/vendor/github.com/moby/profiles/seccomp/default.json` (`UPSTREAM_URL` in `scripts/worker-seccomp-profile.ts`): pinned to a commit.
  The `http://127.0.0.1:8080` addresses in `docs/local-installation.md` predate this change and are local, not external. Every other link is relative to the repository. No link needed a fix.

## Phase 1: reproduction commands and outputs

The worker container ran with the item 23b security settings (`--cap-drop ALL`, `--cap-add CHOWN,DAC_OVERRIDE,KILL,SETGID,SETPCAP,SETUID,SYS_ADMIN`, `--security-opt apparmor=unconfined --security-opt no-new-privileges=true`, `--cgroupns private`, `--init`). A faithful execution was reproduced as a child of the worker's `setpriv`:

```
setpriv --bounding-set=-all,+setuid,+setgid,+kill --reuid=10003 --regid=10003 --clear-groups -- bash -c '…'
```

Execution state: `Uid 10003`, `CapBnd 00000000000000e0`, `CapEff 0`, `NoNewPrivs 1`, `Seccomp 2`, `Seccomp_filters 1`.

```
cat /proc/sys/user/max_user_namespaces   → 31337
unshare -U true                          → rc=0
unshare -m true                          → Operation not permitted (rc=1)
unshare -Urm 'mount -t tmpfs none /mnt'  → MOUNTED; tmpfs on /mnt (rc=0)
unshare -UrmpniC --fork …                → all namespaces + tmpfs ok (rc=0)
mount --bind /tmp /mnt                   → must be superuser (rc=32)
```

Result: the escape reproduces (user namespace + tmpfs mount) despite no capabilities, `no_new_privs=1`, and an active seccomp filter. Docker's default profile (option a) is in effect and does not block it while the container holds `CAP_SYS_ADMIN`.

## Phase 1: options tested

- (a) Default: reproduced `MOUNTED`.
- (b) Custom seccomp profile, phase 1 test form (allow by default, deny `unshare`/`setns` EPERM, `clone3` ENOSYS): the container came up, cgroup delegation produced `executions/`, `node` spawned children, and the uid-10003 execution's `unshare -U`/`-Urm`+`mount` failed with `Operation not permitted`. `make installation-smoke` with the profile on the `worker` service passed end to end (enrolled, `check_containment` passed, execution exited 0, result stored).
- (c) `--sysctl user.max_user_namespaces=0`: rejected by `docker run`; `/proc/sys/user/max_user_namespaces` read-only inside the container. Unavailable under Docker Desktop.
- (d) `SYS_ADMIN` drop: the worker already has `CapBnd e0` yet the escape reproduces (seccomp fixed at container start).

See `design.md` for the full options table.

## Decision

On 2026-10-26 the owner's delegate decided option b1, on behalf of the owner (away run `20261026T170116Z-opencode-68419`): a pinned copy of Docker's default seccomp profile with only the `CAP_SYS_ADMIN` namespace carve-out removed, attached to the Compose `worker` service.

## Phase 2: the profile

- Upstream: Docker Engine 29.6.1 (`docker version`: `GitCommit 8ec5ab3`), moby tag `docker-v29.6.1`, commit `8ec5ab355a34b2a0e2b3238d67bdefe77fefa982`, file [`vendor/github.com/moby/profiles/seccomp/default.json`](https://github.com/moby/moby/blob/8ec5ab355a34b2a0e2b3238d67bdefe77fefa982/vendor/github.com/moby/profiles/seccomp/default.json) (`vendor/modules.txt`: `github.com/moby/profiles/seccomp v0.2.3`); [the module's file at tag `seccomp/v0.2.3`](https://github.com/moby/profiles/blob/seccomp/v0.2.3/seccomp/default.json) has the same SHA-256, `536529b665dd0972c37bfb569f5d4ac8a53592e7b00752bc39ff063ca9864c74`.
- `infra/installation/seccomp/docker-default.json` is that file unchanged; `infra/installation/seccomp/worker.json` (SHA-256 `10f28c01259a05ec7fc2cd61eeada3f6e9e28a3cb5be1aea4e2e4ce6e0e13c36`) comes from `make worker-seccomp-profile`. `diff -u` of the two shows only: `clone`, `clone3`, `setns`, and `unshare` removed from the `CAP_SYS_ADMIN` allowance, and the `CAP_SYS_ADMIN` exclusion removed from the two `clone` rules without namespace flags and from the `clone3` `ENOSYS` rule.
- Compose resolves `seccomp=./seccomp/worker.json` against `infra/installation/`: a probe service with `cap_add: [SYS_ADMIN]` and that relative path, run with `docker compose -f <dir>/compose.yaml run` from `/` as uid 10003, printed `Seccomp: 2` and `unshare: unshare failed: Operation not permitted`.

## Phase 2: commands and results

Each scenario ran at commit `a13894c` on 2026-10-26 with `TASKELITH_SCENARIO_RESULTS=openspec/changes/harden-worker-container-seccomp/results.jsonl`, on a fresh throwaway project that it removed before it recorded the pass; both exited 0. The records are in [results.jsonl](results.jsonl).

| Command | Seed | Result |
|---|---|---|
| `make scenario-worker-namespace-confinement` | 1907525133 | passed |
| `make scenario-fresh-composition` (runs `make installation-smoke` with the profile) | 2972196964 | passed |

Native acceptance row of the confinement scenario, as recorded: OS Docker Desktop (host Darwin 25.6.0, arm64); architecture aarch64; kernel 6.12.76-linuxkit; file system `ext2/ext3` (the worker data root, as `stat -f -c %T` names the ext family's magic number), storage driver overlay2; Docker engine 29.6.1; worker image `sha256:f05cd6248b954f52e4ba8a2ee780b43b48d6504e8c03c7484ce04e44bc51b129`; seccomp profile SHA-256 `10f28c01…0e13c36`. As uid 10003 with status `Uid: 10003 10003 10003 10003 CapEff: 0000000000000000 CapBnd: 00000000000000e0 NoNewPrivs: 1 Seccomp: 2`:

```
unshare -U true                           → unshare: unshare failed: Operation not permitted
unshare -Urm mount -t tmpfs none /mnt     → unshare: unshare failed: Operation not permitted
```

The worker kept `KILL`, `SETGID`, and `SETUID` only (`check_containment`), `executions/` existed and took a cgroup write, and a task's execution ran in `0::/executions/bed986a0-db70-4951-837e-55f4721eb7e6` and exited 0. The fresh composition stored the smoke task as ended, exited with code 0 and a proven start. Afterwards no container, image, or volume of either project remained.

## Gates

- `npm run openspec -- validate harden-worker-container-seccomp --strict`: PASS.
- `make verify`: PASS on 2026-10-26, on the tree of this documentation commit (code at `a13894c` plus these documents): 1802 tests, 1800 passed, 0 failed, 2 skipped (the existing Linux-only skips); coverage 99.26 % lines, 91.88 % branches, 98.89 % functions; the comment rule, the archive dry run, and the package check passed.
- `make scenario-worker-namespace-confinement` and `make scenario-fresh-composition`: PASS (above).
- `make verify-linux-cgroup`: N/A on this host — the target requires an `x86_64` Docker host (its guard, and the `tools/linux-cgroup` image pins linux-x64 Node); this host is aarch64, and the tooling is unchanged. The coordinator runs it on the x86_64 iMac. It starts its own `--privileged` container without Compose, which disables seccomp, so it covers the supervisor's cgroup code, not the worker profile; on x86_64 the profile is checked by `make scenario-worker-namespace-confinement`.

## Remaining gates / open items

- `make verify-linux-cgroup` and, for the profile on x86_64, `make scenario-worker-namespace-confinement` on the x86_64 iMac (coordinator).
- Independent review: pending.
- An `x86_64` Linux host with AppArmor or SELinux is not yet observed (Docker Desktop aarch64 only).
- The profile follows the engine; a newer engine's default profile is adopted by the refresh procedure in `docs/local-installation.md`.

## Independent review

Pending.
