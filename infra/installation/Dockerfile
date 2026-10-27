# Control-plane and Linux worker images; scripts/installation.sh builds them
# from a git archive of the tracked files with the pins of the Makefile.
ARG BASE

# Each RUN clamps the mtimes it changes, but not those of the RUN mounts, to
# SOURCE_DATE_EPOCH, the commit time: one commit gives the same layers.
FROM ${BASE} AS node-amd64
ARG NODE_VERSION
ARG NODE_SHA256_AMD64
ARG SOURCE_DATE_EPOCH
ADD --checksum=sha256:${NODE_SHA256_AMD64} https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.gz /tmp/node.tar.gz
RUN mkdir /node && tar -xzf /tmp/node.tar.gz -C /node --strip-components=1 \
  && find /node -newermt "@${SOURCE_DATE_EPOCH:?}" -exec touch -h -d "@${SOURCE_DATE_EPOCH}" {} +

FROM ${BASE} AS node-arm64
ARG NODE_VERSION
ARG NODE_SHA256_ARM64
ARG SOURCE_DATE_EPOCH
ADD --checksum=sha256:${NODE_SHA256_ARM64} https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-arm64.tar.gz /tmp/node.tar.gz
RUN mkdir /node && tar -xzf /tmp/node.tar.gz -C /node --strip-components=1 \
  && find /node -newermt "@${SOURCE_DATE_EPOCH:?}" -exec touch -h -d "@${SOURCE_DATE_EPOCH}" {} +

# The images get the unpacked Node.js only, without a layer of the tarball.
FROM node-${TARGETARCH} AS node-files
FROM ${BASE} AS node
COPY --from=node-files /node /usr/local

FROM node AS build
ARG SOURCE_DATE_EPOCH
WORKDIR /opt/taskelith
COPY . .
RUN npm ci --ignore-scripts && npm run build && npm prune --omit=dev --ignore-scripts \
  && find /opt -newermt "@${SOURCE_DATE_EPOCH:?}" -exec touch -h -d "@${SOURCE_DATE_EPOCH}" {} +

FROM node AS runtime
ARG SOURCE_DATE_EPOCH
# The data root is a named volume; Docker copies this owner and mode into it.
RUN useradd --uid 10001 --user-group --no-create-home --shell /usr/sbin/nologin taskelith \
  && install -d -o taskelith -g taskelith -m 0700 /var/lib/taskelith \
  && find /etc /var \( -path /etc/hosts -o -path /etc/hostname -o -path /etc/resolv.conf \) -prune \
    -o -newermt "@${SOURCE_DATE_EPOCH:?}" -exec touch -h -d "@${SOURCE_DATE_EPOCH}" {} +
COPY --from=build /opt /opt
WORKDIR /opt/taskelith
ENV NODE_ENV=production TASKELITH_DATA_DIR=/var/lib/taskelith
USER taskelith

FROM runtime AS control-plane
ENV TASKELITH_API_HOST=0.0.0.0
EXPOSE 8080
CMD ["node", "apps/control-plane/dist/main.js"]

# Each execution runs as taskelith-exec, which owns no cgroup of the worker;
# the entrypoint needs root (compose.yaml) and keeps three capabilities.
FROM runtime AS worker
ARG SOURCE_DATE_EPOCH
USER root
RUN useradd --uid 10003 --user-group --no-create-home --shell /usr/sbin/nologin taskelith-exec \
  && find /etc \( -path /etc/hosts -o -path /etc/hostname -o -path /etc/resolv.conf \) -prune \
    -o -newermt "@${SOURCE_DATE_EPOCH:?}" -exec touch -h -d "@${SOURCE_DATE_EPOCH}" {} +
USER taskelith
ENV TASKELITH_CONTAINMENT_PARENT=/sys/fs/cgroup/executions TASKELITH_EXECUTION_UID=10003 TASKELITH_EXECUTION_GID=10003
ENTRYPOINT ["bash", "/opt/taskelith/infra/installation/worker-entrypoint.sh"]
CMD ["node", "apps/worker/dist/main.js"]

FROM node AS harnesses
WORKDIR /opt/harnesses
COPY infra/installation/harnesses/package.json infra/installation/harnesses/package-lock.json ./
RUN npm ci --ignore-scripts

# The worker variant with the pinned harnesses; root owns them, so a harness
# cannot update itself in place. The default worker image stays without them.
FROM worker AS worker-harnesses
COPY --from=harnesses /opt/harnesses /opt/harnesses
ENV PATH=/opt/harnesses/node_modules/.bin:${PATH} DISABLE_AUTOUPDATER=1
