## 1. Reproduction and evaluation (phase 1, 25a)

- [x] 1.1 Reproduce the residual risk under the real containment: build the worker image and run it with the item 23b security settings, then as a faithful uid-10003 execution check `unshare -U`/`-m`/`-Urm`+`mount -t tmpfs`, other namespaces, `mount --bind`, `/proc/sys/user/max_user_namespaces`, and the seccomp/capability/`no_new_privs` state
- [x] 1.2 Confirm whether Docker's default seccomp profile is in effect and whether it blocks the escape given `CAP_SYS_ADMIN`
- [x] 1.3 Evaluate options (a)-(e) with cost, risk, reversibility, effect on cgroup delegation and the worker's own needs, and whether each needs product code; test what is testable (custom profile, sysctl)
- [x] 1.4 Confirm `make installation-smoke` still passes with the recommended profile applied
- [x] 1.5 Report `make verify-linux-cgroup` feasibility on aarch64
- [x] 1.6 Record the evidence in `design.md` and `verification.md`, with a recommendation pending the owner's decision

## 2. Owner decision

- [ ] 2.1 Owner chooses the option, and for option (b) the profile shape (default-derived or deny-list)

## 3. Hardening (phase 2, after the decision)

- [ ] 3.1 Add the tracked seccomp profile under `infra/installation/` (for the chosen option)
- [ ] 3.2 Wire it into the Compose `worker` service's `security_opt`, and the `worker-harnesses` variant if in scope
- [ ] 3.3 Re-run `make installation-smoke` and confirm the escape is blocked for uid 10003
- [ ] 3.4 Update `docs/local-installation.md` to state the profile and that the user namespace is closed
- [ ] 3.5 Independent review and `verification.md`
