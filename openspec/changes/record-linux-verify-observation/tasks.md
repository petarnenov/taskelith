## 1. Observation

- [x] 1.1 Run `make doctor`, `make setup`, and `make verify` on the Linux host from a fresh worktree of `origin/dev`.
- [x] 1.2 Run `make verify-linux-cgroup` four times.
- [x] 1.3 Record the host, the results, the timing, and finding F1 in `docs/linux-verify-observation.md`, and link it from `docs/foundation.md`.

## 2. Verification

- [x] 2.1 Run `npm run openspec -- validate record-linux-verify-observation --strict` and `make verify`.
- [ ] 2.2 Pass the independent review and record it in `verification.md`.
