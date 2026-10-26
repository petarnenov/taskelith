# Control-plane and Linux worker images; scripts/installation.sh builds them
# from a git archive of the tracked files with the pins of the Makefile.
ARG BASE

FROM ${BASE} AS node-amd64
ARG NODE_VERSION
ARG NODE_SHA256_AMD64
ADD --checksum=sha256:${NODE_SHA256_AMD64} https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.gz /tmp/node.tar.gz
RUN tar -xzf /tmp/node.tar.gz -C /usr/local --strip-components=1 && rm /tmp/node.tar.gz

FROM ${BASE} AS node-arm64
ARG NODE_VERSION
ARG NODE_SHA256_ARM64
ADD --checksum=sha256:${NODE_SHA256_ARM64} https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-arm64.tar.gz /tmp/node.tar.gz
RUN tar -xzf /tmp/node.tar.gz -C /usr/local --strip-components=1 && rm /tmp/node.tar.gz

FROM node-${TARGETARCH} AS build
WORKDIR /app
COPY . .
RUN npm ci --ignore-scripts && npm run build && npm prune --omit=dev --ignore-scripts

FROM node-${TARGETARCH} AS runtime
# The data root is a named volume; Docker copies this owner and mode into it.
RUN useradd --uid 10001 --user-group --no-create-home --shell /usr/sbin/nologin taskelith \
  && install -d -o taskelith -g taskelith -m 0700 /var/lib/taskelith
COPY --from=build /app /opt/taskelith
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
USER root
RUN useradd --uid 10003 --user-group --no-create-home --shell /usr/sbin/nologin taskelith-exec
USER taskelith
ENV TASKELITH_CONTAINMENT_PARENT=/sys/fs/cgroup/executions TASKELITH_EXECUTION_UID=10003 TASKELITH_EXECUTION_GID=10003
ENTRYPOINT ["bash", "/opt/taskelith/infra/installation/worker-entrypoint.sh"]
CMD ["node", "apps/worker/dist/main.js"]

FROM node-${TARGETARCH} AS harnesses
WORKDIR /opt/harnesses
COPY infra/installation/harnesses/package.json infra/installation/harnesses/package-lock.json ./
RUN npm ci --ignore-scripts

# The worker variant with the pinned harnesses; root owns them, so a harness
# cannot update itself in place. The default worker image stays without them.
FROM worker AS worker-harnesses
COPY --from=harnesses /opt/harnesses /opt/harnesses
ENV PATH=/opt/harnesses/node_modules/.bin:${PATH} DISABLE_AUTOUPDATER=1
