# Test-only Ubuntu 24.04 image for the Linux tests of the worker; the
# Makefile passes the digest-pinned base and the host's Node.js tarball.
ARG BASE
FROM ${BASE}
# The worker's pinned Git client, as in infra/installation/Dockerfile;
# test/git-package-pin.test.ts keeps the two pins equal.
ARG GIT_PACKAGE_VERSION=1:2.43.0-1ubuntu7.4
RUN apt-get update \
  && apt-get install --yes --no-install-recommends "git=${GIT_PACKAGE_VERSION}" \
  && test "$(dpkg-query --show --showformat='${Version}' git)" = "${GIT_PACKAGE_VERSION}" \
  && test "$(/usr/bin/git --version)" = "git version 2.43.0" \
  && rm -rf /var/lib/apt/lists/*
ARG NODE_VERSION
ARG NODE_ARCH
ARG NODE_SHA256
ADD --checksum=sha256:${NODE_SHA256} https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.gz /tmp/node.tar.gz
RUN tar -xzf /tmp/node.tar.gz -C /usr/local --strip-components=1 \
  && rm /tmp/node.tar.gz \
  && useradd --uid 2000 --user-group --no-create-home --shell /usr/sbin/nologin taskelith-exec
COPY cgroup-layout.sh /usr/local/lib/taskelith/cgroup-layout.sh
COPY run.sh /usr/local/bin/taskelith-linux-cgroup
COPY crash-windows.sh /usr/local/bin/taskelith-linux-crash-windows
ENTRYPOINT ["/usr/local/bin/taskelith-linux-cgroup"]
