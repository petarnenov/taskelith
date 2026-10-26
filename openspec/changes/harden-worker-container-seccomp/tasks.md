## 1. Reproduction and evaluation (phase 1, 25a)

- [x] 1.1 Reproduce the residual risk under the real containment: build the worker image and run it with the item 23b security settings, then as a faithful uid-10003 execution check `unshare -U`/`-m`/`-Urm`+`mount -t tmpfs`, other namespaces, `mount --bind`, `/proc/sys/user/max_user_namespaces`, and the seccomp/capability/`no_new_privs` state
- [x] 1.2 Confirm whether Docker's default seccomp profile is in effect and whether it blocks the escape given `CAP_SYS_ADMIN`
- [x] 1.3 Evaluate options (a)-(e) with cost, risk, reversibility, effect on cgroup delegation and the worker's own needs, and whether each needs product code; test what is testable (custom profile, sysctl)
- [x] 1.4 Confirm `make installation-smoke` still passes with the recommended profile applied
- [x] 1.5 Report `make verify-linux-cgroup` feasibility on aarch64
- [x] 1.6 Record the evidence in `design.md` and `verification.md`, with a recommendation pending the owner's decision

## 2. Owner decision

- [x] 2.1 The owner's delegate chose option b1, the default-derived profile (away run `20261026T170116Z-opencode-68419`)

## 3. Hardening (phase 2)

- [x] 3.1 Add the pinned upstream copy `infra/installation/seccomp/docker-default.json` (moby `8ec5ab355a34`, `github.com/moby/profiles/seccomp` v0.2.3) and the derived `infra/installation/seccomp/worker.json`
- [x] 3.2 Add `scripts/worker-seccomp-profile.ts`, `make worker-seccomp-profile`, and `test/worker-seccomp-profile.test.ts`, which proves the copy and the derivation
- [x] 3.3 Wire the profile into the Compose `worker` service's `security_opt` and pin it in `test/installation-composition.test.ts`
- [x] 3.4 Add `make scenario-worker-namespace-confinement` with stub tests
- [x] 3.5 Run the scenario and `make scenario-fresh-composition` (the smoke) with the results recorder
- [x] 3.6 Update `docs/local-installation.md`: the profile, its pinned source, the refresh procedure, and the scenario
- [x] 3.7 Run `make verify`
- [ ] 3.8 `make verify-linux-cgroup` on the x86_64 iMac (coordinator)
- [ ] 3.9 Independent review
