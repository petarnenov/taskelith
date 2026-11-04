## 1. Change

- [x] 1.1 Create the change `fix-linux-cgroup-test-git-pin` and save the checklist

## 2. Implementation

- [x] 2.1 Record a fail-before run of `make verify-linux-crash-windows` on `dev` `163fe9e5`
- [x] 2.2 Install and check the pinned Git package in `tools/linux-cgroup/Dockerfile`
- [x] 2.3 Test that both Dockerfiles pin the same Git package and version string

## 3. Verification

- [x] 3.1 `make verify-linux-crash-windows`, `make verify-linux-g2-scenarios`, and `make verify`
- [x] 3.2 Record `verification.md`

## 4. Review and archive

- [x] 4.1 Independent review
  - [x] 4.1.1 Pass 1 (Codex `gpt-6-astra`, medium): M1 remove `skip_specs` and add the `native-worker-acceptance` delta; L1 read Dockerfile instructions in the agreement test
  - [x] 4.1.2 Pass 2 (Claude Code `claude-fable-5-1`, medium, Low only, no pass 3): L1 the dependency row; L2 the design citation; L3 the requirement wording; L4 the Git layer before Node.js
- [x] 4.2 Archive the change
