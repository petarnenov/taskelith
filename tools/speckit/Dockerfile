# SpecKit 1.2.3 for native-artifact capture; run only with --network none (G1 decision D5).
# The Makefile passes the digest-pinned base image (SPECKIT_BASE).
ARG BASE
FROM ${BASE}
COPY requirements.txt /tmp/requirements.txt
RUN pip install --quiet --no-cache-dir --root-user-action=ignore --require-hashes --only-binary=:all: -r /tmp/requirements.txt
