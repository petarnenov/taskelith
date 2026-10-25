# Test-only Ubuntu 24.04 image for the privileged cgroup v2 tests of the
# worker supervisor; the Makefile passes the digest-pinned base.
ARG BASE
FROM ${BASE}
ARG NODE_VERSION
ARG NODE_SHA256
ADD --checksum=sha256:${NODE_SHA256} https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.gz /tmp/node.tar.gz
RUN tar -xzf /tmp/node.tar.gz -C /usr/local --strip-components=1 \
  && rm /tmp/node.tar.gz \
  && useradd --uid 2000 --user-group --no-create-home --shell /usr/sbin/nologin taskelith-exec
COPY run.sh /usr/local/bin/taskelith-linux-cgroup
ENTRYPOINT ["/usr/local/bin/taskelith-linux-cgroup"]
