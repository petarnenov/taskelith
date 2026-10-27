# Test-only Ubuntu 24.04 image for the Linux tests of the worker; the
# Makefile passes the digest-pinned base and the host's Node.js tarball.
ARG BASE
FROM ${BASE}
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
