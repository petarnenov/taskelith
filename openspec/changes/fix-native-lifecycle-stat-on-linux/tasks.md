## 1. Fix

- [x] 1.1 Reproduce the GNU stat output of `stat -f %Lp` on a mode 0700 directory and the three failing native lifecycle tests on Linux
- [x] 1.2 Try `stat -c %a` first in `mode_of()`, with `stat -f %Lp` as the fallback

## 2. Records

- [x] 2.1 Run the three tests and `make verify` on Linux and write `verification.md`
- [ ] 2.2 Independent review by OpenCode CLI (kimi-k2.7-code), one pass
