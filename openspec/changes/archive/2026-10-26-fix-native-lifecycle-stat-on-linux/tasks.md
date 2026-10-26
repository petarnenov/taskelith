## 1. Fix

- [x] 1.1 Reproduce the GNU stat output of `stat -f %Lp` on a mode 0700 directory and the three failing native lifecycle tests on Linux
- [x] 1.2 Try `stat -c %a` first in `mode_of()`, with `stat -f %Lp` as the fallback

## 2. Records

- [x] 2.1 Run the three tests and `make verify` on Linux and write `verification.md`
- [x] 2.2 Independent review by OpenCode CLI (kimi-k2.7-code), pass 1: 0 Critical, 0 High, 0 Medium, 2 Low
- [x] 2.3 Resolve the Low findings without another review: L1 unchanged, L2 fixed (`native_identity()` prefers `sha256sum`)
- [x] 2.4 Merge `origin/dev`, rerun the tests and `make verify`, and archive the change
