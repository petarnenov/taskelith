## 1. Change

- [x] 1.1 Create the change `fix-linux-cgroup-test-git-pin` and save the checklist

## 2. Implementation

- [x] 2.1 Record a fail-before run of `make verify-linux-crash-windows` on `dev` `163fe9e5`
- [x] 2.2 Install and check the pinned Git package in `tools/linux-cgroup/Dockerfile`
- [x] 2.3 Test that both Dockerfiles pin the same Git package and version string

## 3. Verification

- [ ] 3.1 `make verify-linux-crash-windows`, `make verify-linux-g2-scenarios`, and `make verify`
- [ ] 3.2 Record `verification.md`

## 4. Review and archive

- [ ] 4.1 Independent review
- [ ] 4.2 Archive the change
