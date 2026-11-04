## ADDED Requirements

### Requirement: Pinned Git client in the Linux test image
The Linux test image of `make verify-linux-cgroup`, in which `make verify-linux-crash-windows` and `make verify-linux-g2-scenarios` compose the worker, SHALL install the worker image's pinned Git package and fail its build unless that package and the Linux Git client pin are installed. `make verify` SHALL fail when the two images pin different packages.

#### Scenario: Crash windows on Linux
- **WHEN** `make verify-linux-crash-windows` runs on a Linux host
- **THEN** the composed worker accepts `/usr/bin/git` and no case fails with `git-client-mismatch`

#### Scenario: Pin drift
- **WHEN** `tools/linux-cgroup/Dockerfile` pins another Git package than the worker stage of `infra/installation/Dockerfile`, or drops one of its checks
- **THEN** `make verify` fails in `test/git-package-pin.test.ts`
