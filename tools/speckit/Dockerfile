# SpecKit 1.2.3 for capture, only with --network none (G1 decision D5), on
# the digest-pinned base image that the Makefile passes as SPECKIT_BASE.
ARG BASE
FROM ${BASE}
COPY requirements.txt /tmp/requirements.txt
RUN pip install --quiet --no-cache-dir --root-user-action=ignore --require-hashes --only-binary=:all: -r /tmp/requirements.txt
