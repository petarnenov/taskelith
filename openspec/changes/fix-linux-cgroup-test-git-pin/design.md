## Context

The worker image installs and checks the Linux Git pin in its worker stage (`infra/installation/Dockerfile:58-67`). The Linux test image (`tools/linux-cgroup/Dockerfile`) installs only Node.js. The scenario harnesses compose a real worker in that image, and since #409 that worker checks `/usr/bin/git` against `GIT_CLIENT_PINS.linux` before it starts.

## Decisions

- **Same package, same checks.** The test image copies the worker stage's `ARG GIT_PACKAGE_VERSION=1:2.43.0-1ubuntu7.4`, the `git=${GIT_PACKAGE_VERSION}` install without recommended packages, and the `dpkg-query` and `/usr/bin/git --version` checks, and removes the apt lists. It builds on the same digest-pinned `UBUNTU_BASE`, Ubuntu 24.04 (noble), so the package resolves the same way. The worker stage's `SOURCE_DATE_EPOCH` clamping is left out: the test image is not reproducible today and is never published.
- **One pin, checked by a test.** No mechanism shares a Dockerfile pin today: the `Makefile` passes only the base and the Node.js pins as build arguments, and the worker image is also built by `scripts/installation.sh` and other scripts that would all need a new argument. A test is the smaller mechanism: `test/git-package-pin.test.ts` reads both Dockerfiles and requires the same `GIT_PACKAGE_VERSION` default and a `git --version` check against `GIT_CLIENT_PINS.linux.version` in each. A later change can move the pin into the `Makefile` and pass it to both builds.

## Risks / Trade-offs

- The image build now needs the Ubuntu mirror; a withdrawn package revision fails the build, as it already does for the worker image.
