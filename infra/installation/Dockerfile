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

FROM runtime AS worker
CMD ["node", "apps/worker/dist/main.js"]
