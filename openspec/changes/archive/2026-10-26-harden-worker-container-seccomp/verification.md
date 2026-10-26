# Verification: harden-worker-container-seccomp (25a)

## Scope and source

G2 work item 25, first part (25a), `harden-worker-container-seccomp`, assigned by the coordinator on 2026-10-26: reproduce under the real containment the item 23b residual risk that the execution account (uid 10003) can create a user namespace and mount inside the worker container, evaluate the options, and, after the owner's decision, harden the worker container. Scope: only the private worker image and the Compose composition; excluded: product code (`apps/worker`, the supervisor adapters), contract changes, changes to `make verify-linux-cgroup` or other tooling, and the rest of item 25 (native acceptance on the other matrix entries). Sources: [docs/g2-plan.md](../../../docs/g2-plan.md) item 25; the [item 23b archive](../archive/2026-10-26-compose-installation-end-to-end/verification.md) (review finding M2 and the accepted residual risk); the [24a change](../run-g2-failure-scenarios-composition/verification.md) for the scenario and recorder style.

## Revision and environment

- Base: `origin/dev` at `3321cf2`. Branch `harden-worker-container-seccomp`. Phase 1 (reproduction and options): `535d5a8`. Phase 2 (option b1): `039ec49` (profile, derivation, Compose) and `a13894c` (scenario), with documents in `9338411` and `d8d36ca` (self-check), the head that review pass 1 reviewed. Review pass 1 fixes: `c39cf68` and `28ce9d9`, with documents in `20148db`, the head that review pass 2 reviewed. Review pass 2 fixes (unreviewed, Low only): `56a623a` (derivation guard, CLI root, upstream license) and `d900368` (exact errno probes, retried execution read), the commit both current evidence records name; the evidence runs ran on that tree, and only `results.jsonl` and the documents of the following docs commit changed after it. The records of `a13894c` and `28ce9d9` were replaced.
- Host: Apple Silicon Mac, macOS 26.6.2 (build 25G83, Darwin 25.6.0), `arm64`; Node.js 24.22.1 from `.nvmrc`, via `nvm use`.
- Engine: Docker Desktop, Docker Engine 29.6.1 (server `GitCommit 8ec5ab3`), server architecture `aarch64`, kernel 6.12.76-linuxkit, `SecurityOptions: name=seccomp,profile=builtin name=cgroupns`; Docker Compose v5.2.0. Images built for linux/arm64 by `scripts/installation.sh build` with the `make installation-build` pins (Ubuntu 24.04 digest, Node.js 24.22.1 tarball SHA-256).

## Author self-check and evidence check

- AGENTS.md: English only; implements only the decided option b1; no product code, OpenAPI, AsyncAPI, JSON schema, contracts document, or npm dependency change, and the published package is unchanged (`verify:package` passed). Changed: `infra/installation/compose.yaml` (one `security_opt` entry), the new `infra/installation/seccomp/` (upstream copy, its Apache-2.0 `LICENSE`, and the derived profile), a register row in `docs/dependencies.md`, the new `scripts/worker-seccomp-profile.ts` and its test, the scenario in `scripts/installation-scenarios.sh` and `scripts/installation.sh` with stub tests, two `make` targets, `test/installation-composition.test.ts`, and `docs/local-installation.md`. Commits use `build`, `test`, and `docs` without attribution; nothing was pushed.
- Comment rule: every new or changed comment in `.ts`, `.sh`, `.yaml`, and `Makefile` files has at most two lines of at most 80 characters; `npm run verify:comments` passes. The JSON profiles carry no comments.
- ADR 0004: Clean Code and SOLID (the derivation is one small pure function with shape checks, separate from file I/O; the scenario reuses the 24a helpers); hexagonal architecture and microkernel are untouched (no product module changes); Docker (the hardening is a container setting); contract-first OpenAPI (no API change); Makefile-driven operation (`make scenario-worker-namespace-confinement`, `make worker-seccomp-profile`); SDLC through this OpenSpec change; coverage stays above 75 % (the figures of the `make verify` gate below, on the final tree).
- Specs touched: `local-installation`, with two added requirements, "Execution namespace confinement" and "Pinned worker seccomp profile"; the existing "Unprivileged services with volume data" and "Delegated worker containment" still hold (the scenario and the smoke check them). `npm run openspec -- validate harden-worker-container-seccomp --strict` passes, and the archive dry run of `make verify` passes.
- Docker hygiene: the runs removed only their own throwaway projects (`down --volumes`) and the two images built by hand for the phase 1 probe; no prune; no other project's container, image, or volume was touched.
- Evidence check: the change's external links are
  - `https://github.com/moby/moby/blob/8ec5ab355a34b2a0e2b3238d67bdefe77fefa982/vendor/github.com/moby/profiles/seccomp/default.json` (in `design.md`, this file, `docs/local-installation.md`, and the register row in `docs/dependencies.md`): pinned to a commit;
  - `https://github.com/moby/profiles/blob/seccomp/v0.2.3/seccomp/default.json` (same files): pinned to the tag `seccomp/v0.2.3`;
  - `https://raw.githubusercontent.com/moby/moby/8ec5ab355a34b2a0e2b3238d67bdefe77fefa982/vendor/github.com/moby/profiles/seccomp/default.json` (`UPSTREAM_URL` in `scripts/worker-seccomp-profile.ts`): pinned to a commit.
  The `http://127.0.0.1:8080` addresses in `docs/local-installation.md` predate this change and are local, not external. Every other link is relative to the repository. No link needed a fix.

## Phase 1: reproduction commands and outputs

The worker container ran with the item 23b security settings (`--cap-drop ALL`, `--cap-add CHOWN,DAC_OVERRIDE,KILL,SETGID,SETPCAP,SETUID,SYS_ADMIN`, `--security-opt apparmor=unconfined --security-opt no-new-privileges=true`, `--cgroupns private`, `--init`). A faithful execution was reproduced as a child of the worker's `setpriv`:

```
docker exec rr-worker setpriv --bounding-set=-all,+setuid,+setgid,+kill --reuid=10003 --regid=10003 --clear-groups -- bash -c '<commands>'
```

`rr-worker` was the probe container. Execution state: `Uid 10003`, `CapBnd 00000000000000e0`, `CapEff 0`, `NoNewPrivs 1`, `Seccomp 2`, `Seccomp_filters 1`. The commands, run in that one `bash -c`, and their outputs in summary; [design.md](design.md#reproduction-2026-10-26-apple-silicon-macos-docker-desktop) records each output in full.

| Command | Output |
| --- | --- |
| `cat /proc/sys/user/max_user_namespaces` | `31337` |
| `unshare -U true 2>&1; echo "rc=$?"` | `rc=0` |
| `unshare -m true 2>&1; echo "rc=$?"` | `unshare: unshare failed: Operation not permitted`, `rc=1` |
| `unshare -Urm bash -c "mount -t tmpfs none /mnt && echo MOUNTED && mount \| grep /mnt" 2>&1; echo "rc=$?"` | `MOUNTED`, `none on /mnt type tmpfs (rw,relatime,uid=10003,gid=10003)`, `rc=0` |
| `unshare -UrmpniC --fork bash -c "echo ALLNS-ok; mount -t tmpfs none /mnt && echo tmpfs-ok" 2>&1; echo "rc=$?"` | `ALLNS-ok`, `tmpfs-ok`, `rc=0` |
| `mount --bind /tmp /mnt 2>&1; echo "rc=$?"` | `mount: /mnt: must be superuser to use mount.`, `rc=32` |

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

Each scenario ran at commit `d900368` on 2026-10-26 with `TASKELITH_SCENARIO_RESULTS=openspec/changes/harden-worker-container-seccomp/results.jsonl`, on a fresh throwaway project that it removed before it recorded the pass; both exited 0. The records are in [results.jsonl](results.jsonl); they replace the records of `a13894c` (seeds 1907525133 and 2972196964) and of `28ce9d9` (seeds 3630930604 and 3458861485), all passed, made before the review fixes.

| Command | Seed | Result |
|---|---|---|
| `make scenario-worker-namespace-confinement` | 1126321871 | passed |
| `make scenario-fresh-composition` (runs `make installation-smoke` with the profile) | 469271394 | passed |

Native acceptance row of the confinement scenario, as recorded: OS Docker Desktop (host Darwin 25.6.0, arm64); architecture aarch64; kernel 6.12.76-linuxkit; file system `ext2/ext3` (the worker data root, as `stat -f -c %T` names the ext family's magic number), storage driver overlay2; Docker engine 29.6.1; Docker Compose 5.2.0; worker image `sha256:17c78246ceb7fd32b6976d020e1860321012043235a63084b9b0a31d520088bc`; applied seccomp profile SHA-256 `4c5d107dfd1a29cc77b7121dfd324c217e44edf7c63779da3d4c65fde006aed1`, the `seccomp=` value of the worker container's `HostConfig.SecurityOpt`, equal to `worker.json` (it is the SHA-256 of `worker.json` in compact form, as Docker's CLI sends it).

The execution `045d0fdd-6ac7-45f9-88a8-8477c5937ce1`, as the control plane held it, ran in `0::/executions/045d0fdd-6ac7-45f9-88a8-8477c5937ce1` with status `Uid: 10003 10003 10003 10003 CapEff: 0000000000000000 CapBnd: 00000000000000e0 NoNewPrivs: 1 Seccomp: 2 Seccomp_filters: 1` and exited 0. The probes ran as the execution account in `docker compose exec` processes started through a `setpriv` equal to the worker's, whose status fields equalled the execution's, each as `docker compose exec -T worker setpriv --bounding-set=-all,+setuid,+setgid,+kill --inh-caps=-all --reuid=10003 --regid=10003 --clear-groups -- <command>`; the errno probes must print exactly the expected line:

| Command | Output |
| --- | --- |
| `unshare -U true` | `unshare: unshare failed: Operation not permitted` |
| `unshare -Urm mount -t tmpfs none /mnt` | `unshare: unshare failed: Operation not permitted` |
| `perl -e "$SYSCALL_PROBE" 435 0 0` (`clone3`) | `errno 38` |
| `perl -e "$SYSCALL_PROBE" 220 268435473 0 0 0 0` (`clone`, `CLONE_NEWUSER \| SIGCHLD`) | `errno 1` |
| `nsenter --user=/proc/self/ns/user true` (`setns`) | `nsenter: reassociate to namespace 'ns/user' failed: Operation not permitted` |

`SYSCALL_PROBE` is the Perl program in `scripts/installation-scenarios.sh`. The worker kept `KILL`, `SETGID`, and `SETUID` only (`check_containment`), and `executions/` existed and took a cgroup write. The fresh composition stored the smoke task as ended, exited with code 0 and a proven start. Afterwards no container, image, or volume of either project remained.

Discrimination, checked before the reruns with a probe container of the base image (`cap_add: [SETUID, SETGID, KILL, SETPCAP, SYS_ADMIN]`, `apparmor=unconfined`, `no-new-privileges=true`) as uid 10003 below the same `setpriv`, with the worker profile and then with Docker's default profile:

| Probe | With `worker.json` | Docker default |
| --- | --- | --- |
| `clone3` (435) | `errno 38` | `errno 22` |
| `clone` with `CLONE_NEWUSER` | `errno 1` | `created` |
| `nsenter --user=/proc/self/ns/user true` | `nsenter: reassociate to namespace 'ns/user' failed: Operation not permitted` | `nsenter: reassociate to namespace 'ns/user' failed: Invalid argument` |
| `unshare -U true` | `unshare failed: Operation not permitted` | succeeds |
| `clone` with `SIGCHLD` only | `created` | `created` |

## Gates

- `npm run openspec -- validate harden-worker-container-seccomp --strict`: PASS.
- `make verify`: PASS on 2026-10-26, run on the working tree of `d900368` with the documents and `results.jsonl` of the docs commit that follows it, in which only this result line was filled in afterwards: 1820 tests, 1818 passed, 0 failed, 2 skipped (the existing Linux-only skips); coverage 99.26 % lines, 91.88 % branches, 98.89 % functions; the comment rule, the archive dry run, and the package check passed. Earlier passes: on the tree of `9338411` before review pass 1 (1802 tests, 1800 passed, 2 skipped) and on `28ce9d9` with the documents of `20148db` before review pass 2 (1811 tests, 1809 passed, 2 skipped).
- `make scenario-worker-namespace-confinement` and `make scenario-fresh-composition`: PASS (above).
- `make verify-linux-cgroup`: N/A on this host — the target requires an `x86_64` Docker host (its guard, and the `tools/linux-cgroup` image pins linux-x64 Node); this host is aarch64, and the tooling is unchanged. The coordinator runs it on the x86_64 iMac. It starts its own `--privileged` container without Compose, which disables seccomp, so it covers the supervisor's cgroup code, not the worker profile; on x86_64 the profile is checked by `make scenario-worker-namespace-confinement`.

## Remaining gates / open items

- `make verify-linux-cgroup` on the x86_64 iMac (coordinator); for the profile on x86_64, `make scenario-worker-namespace-confinement` there as well.
- Coordinator run on the x86_64 iMac (macOS 26 Intel, Docker Desktop 29.5.2), integration merge 16747e8 of this branch with `origin/dev` 62d324e: `make verify-linux-cgroup` passed 14/14; `make scenario-worker-namespace-confinement` passed and `make scenario-fresh-composition` passed with the profile attached, both recorded in `results.jsonl` with `arch` `x64`.
- Integration into `dev` and the archive of this change (coordinator).

Known limits, not gates of this change: an `x86_64` Linux host with AppArmor or SELinux is not yet observed (Docker Desktop aarch64 only); the profile follows the engine, and a newer engine's default profile is adopted by the refresh procedure in `docs/local-installation.md`.

## Independent review

### Pass 1

Claude Code, model `claude-opus-5-5` (confirmed in `modelUsage`), effort high, permission mode `plan`, editing tools disallowed. Session `788ca58c-86d8-480b-baae-23d86aa9fb68`, reviewed HEAD `d8d36ca`. The SHA-256 snapshot before and after was `1c52c8bc4ed9cf9f2b09b8604d4d498fc79a3b1d6f9ad051885010ede9ac2e3f`, unchanged. Invocation: `claude -p "<prompt>" --model claude-opus-5-5 --effort high --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json < /dev/null`.

The reviewer confirmed the pin (both upstream SHA-256 values match), that the derivation differs from upstream only by the carve-out, and that nothing the worker needs is newly refused. Findings: 0 Critical, 0 High, 3 Medium, 11 Low. All were fixed in `c39cf68`, `28ce9d9`, and the following docs commit; the fixes are unreviewed until pass 2.

| ID | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| M1 | Medium | The scenario could pass when the profile is not what refuses: `unshare -U` gives `EPERM` on hosts with `unprivileged_userns_clone=0` or an LSM policy even if Compose ignored `security_opt`; `profile_digest` hashed the working-tree file, not the applied profile. | `applied_profile` reads `docker inspect --format '{{json .HostConfig.SecurityOpt}}'` of the worker container, and `appliedProfileDigest` in `scripts/worker-seccomp-profile.ts` requires exactly one `seccomp=` value equal to `worker.json` and returns the SHA-256 of the applied text, which the record carries. As uid 10003, `clone3` must answer `ENOSYS`. The `unshare` probes match `unshare failed: Operation not permitted`. |
| M2 | Medium | The spec claims `setns` and `clone`/`clone3` namespace creation are refused, but only `unshare(2)` was probed. | `probe_namespaces` adds `clone3` (Perl `syscall(435, 0, 0)`, `errno 38`), `clone` with `CLONE_NEWUSER \| SIGCHLD` (220 on aarch64, 56 on x86_64, `errno 1`), and `setns` (`nsenter --user=/proc/self/ns/user true`, `Operation not permitted`; without seccomp `Invalid argument`). The spec delta adds the scenarios "Every namespace call refused by the profile" and "Profile not applied". |
| M3 | Medium | Nothing guarded against a refreshed upstream that adds an unconditional `clone` allowance. | `workerProfile` throws `ProfileShapeError` when any `SCMP_ACT_ALLOW` rule without `args` still names a namespace call, whatever its `includes`; the test lists `clone` with `clone3`, `setns`, and `unshare`, and a new test feeds an unconditional `clone` allowance. |
| L1 | Low | `design.md`: the mask is `0x7E020000` (2114060288, with `CLONE_NEWNS`), not `0x7E000000`. | Corrected, with the flags it covers. |
| L2 | Low | `design.md`: `clone3` missing from the calls `SYS_ADMIN` unlocks. | Added. |
| L3 | Low | `proposal.md` promised "the exact commands and outputs", but `design.md` showed outputs the commands shown do not produce, and `verification.md` abbreviated commands with "…". | `design.md` and `verification.md` now give the exact commands of the phase 1 block with their full outputs, and the phase 2 probes with their commands; `proposal.md` says "the commands and their outputs". |
| L4 | Low | The probe's status was compared with a constant, not with the real execution. | The scenario reads the running execution's `Uid`, `CapEff`, `CapBnd`, `NoNewPrivs`, `Seccomp`, and `Seccomp_filters` from `/proc/<pid>/status` and requires the probe's to equal them, and still requires uid 10003 with no effective capability. |
| L5 | Low | Any `0::/executions/?*` cgroup was accepted. | The cgroup must equal `0::/executions/<executionId>` with the execution ID from `task_executions`. |
| L6 | Low | No stub case had the first probe refused and `-Urm` succeed; `NO_DELEGATION` also failed `test -d`, so the cgroup write branch was never reached. | Stub tests now let each probe succeed (`ESCAPE`) or fail otherwise (`OTHER`), with a case for a refused user namespace and a succeeding `-Urm`; `NO_PARENT` and `NO_CGROUP_WRITE` are separate. Added cases for a missing profile, unequal and non-execution statuses, a wrong cgroup, x86_64, and an unknown architecture. |
| L7 | Low | The CLI `check` mode was unused. | Removed; the CLI has `write` (`make worker-seccomp-profile`) and `applied`, which the scenario uses. |
| L8 | Low | `docs/local-installation.md` lost the note that x86_64 Linux hosts with AppArmor or SELinux remain open. | Restored in the seccomp section. |
| L9 | Low | `verification.md` did not name the exact revision `make verify` ran at. | The gate names it. |
| L10 | Low | The profile will refuse a harness's own user-namespace sandbox (for example bubblewrap) in the `worker-harnesses` variant. | Recorded as an open question in `design.md`. |
| L11 | Low | The recorded row lacked the Compose version. | `platform` adds `docker compose version --short`. |

### Pass 2

Claude Code `claude-opus-5-5` (confirmed in `modelUsage`), effort high, permission mode `plan`, editing tools disallowed, the same invocation as pass 1. Session `bbc83239-0304-4a67-bb93-956196146c21`, reviewed HEAD `20148db`. The SHA-256 snapshot before and after was `c947e737e64a51414192c9f3e726d898d5bc579af564e77f8f001d813f590ba3`, unchanged.

The reviewer confirmed all 14 pass 1 findings as fixed (M1 at `scripts/installation-scenarios.sh:287-292` and in `scripts/worker-seccomp-profile.ts`; M2 at `:271-285` and in `spec.md`; M3 in `scripts/worker-seccomp-profile.ts` and its test; L1-L11 at the cited places). New findings: 0 Critical, 0 High, 0 Medium, 13 Low. As the [review process](../../../docs/governance.md#independent-review-process) provides for Low-only findings, all 13 were fixed without another pass, in `56a623a`, `d900368`, and the following docs commit; these fixes are **unreviewed**, and no pass 3 follows.

| # | Finding | Unreviewed fix |
| --- | --- | --- |
| 1 | `expect_refused` matched a substring, so `errno 1` also matched `errno 11`, `12`, or `13`, and an LSM `EACCES` (13) would pass as `EPERM`. | `refused_probe` takes a matcher; `expect_errno` compares the output with exactly `errno N`, used by the `clone3` and `clone` probes. Stub test: `errno 13` fails the `errno 1` probe. |
| 2 | `spec.md`: `EPERM` for `clone(CLONE_NEWUSER)` is something `unprivileged_userns_clone=0` also gives. | The scenario now says that `clone3` with `ENOSYS` and `setns` with `EPERM` instead of `EINVAL` tell the profile apart, while `clone` with `EPERM` only proves the refusal. |
| 3 | `design.md`: the same claim. | Corrected the same way. |
| 4 | "as the execution account below the worker's `setpriv`" is inaccurate: the probes are `docker compose exec` processes through a separate `setpriv` equal to the worker's, proven equivalent by the status fields. | Reworded in `spec.md`, `docs/local-installation.md`, `design.md`, and the `as_execution` comment. |
| 5 | `design.md`: seccomp can express "deny if any namespace flag is set" with one `SCMP_ACT_ERRNO` rule per flag. | The note now says the phase 1 test profile simply had no such rule, and that b1 is better because it keeps the default's other restrictions. |
| 6 | `verification.md`: the discrimination table's "Without" column contradicted "Docker's default profile with `SYS_ADMIN`". | "then with Docker's default profile", column "Docker default". |
| 7 | `verification.md`: the self-check's coverage differed from the gate's. | The self-check refers to the gate's figures. |
| 8 | `refuseUnconditionalNamespaceAllowance` missed `"args": []` and `SCMP_ACT_LOG`. | It treats a rule without a non-empty `args` and with `SCMP_ACT_ALLOW` or `SCMP_ACT_LOG` as unconditional; tests for both, and one that a rule with an argument check is kept. |
| 9 | `write` and `applied` read files relative to `process.cwd()`. | The CLI resolves the repository from `import.meta.dirname`; `write` takes an optional root. |
| 10 | No CLI tests. | `spawnSync` tests from a foreign directory: `applied` with a valid and an invalid `SecurityOpt`, no arguments (usage, exit 1, stderr), and `write` into a temporary root. |
| 11 | The `pgrep` stub reimplemented the formatting, so the real `execution_identity` pipeline was never tested. | Fixed with 12: the stub returns raw fake `/proc` content. |
| 12 | `execution_identity` duplicated `one_line` in the remote script. | The container returns the raw status lines and cgroup; `execution_identity` formats them locally with `one_line`. |
| 13 | `docs/dependencies.md` had no row for the vendored moby `default.json` (Apache-2.0). | Added a row under "G2 infrastructure" with the license, both pins, the SHA-256, and that `worker.json` is a modified derivative; the upstream `LICENSE` (no `NOTICE` upstream) is shipped as `infra/installation/seccomp/LICENSE`, and `docs/local-installation.md` names the license. No inventory tool reads the register. |
| — | Reviewer's note without a finding: the execution was read once, and it lives ten seconds. | `capture_identity` retries the read with `await_condition` and the 60-second start deadline, starting right after the submission; a stub test fails the first read and passes. The stub tests' deadline is 12 seconds for a read of about one second. |
