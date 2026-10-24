# SpecKit 1.2.3 for native-artifact capture; run only with --network none (G1 decision D5).
FROM python@sha256:d98cc29d3266e535dd9da1099688d9cb3ca4753813571e071763d17725460962
COPY requirements.txt /tmp/requirements.txt
RUN pip install --quiet --no-cache-dir --root-user-action=ignore --require-hashes --only-binary=:all: -r /tmp/requirements.txt
WORKDIR /work
