## Context

The archived change `2026-10-26-qualify-harnesses-in-worker-image` added the `worker-harnesses` variant of `infra/installation/Dockerfile`, the credential-free steps in `infra/installation/harnesses/qualify.sh`, and the opt-in `make qualify-harnesses` target. Its run on an x86_64 macOS host passed on linux/amd64. linux/arm64 failed to build under QEMU, and its records name a native run "on D11's runner `ubuntu-24.04-arm` or an Apple Silicon host" as a remaining gate. This host is Apple Silicon with a linux/arm64 Docker engine.

## Goals / Non-Goals

**Goals:**
- One native linux/arm64 run of the unchanged target, with its evidence recorded beside the linux/amd64 results.
- Remove native linux/arm64 from the open gates where the run supports it.

**Non-Goals:**
- Any change to the image, the scripts, the steps, or the pin test.
- A login, a subscription, or a model call; the scenarios that need them stay not run.
- An emulated linux/amd64 run on this host, or a new emulated linux/arm64 run.
- A CI workflow on D11's runner.

## Decisions

- **No spec delta.** The `harness-qualification` requirement already demands a result for every architecture and a gate for each without native evidence; no requirement text names linux/arm64 as not run. The change sets `skip_specs: true`.
- **Same steps, own table.** Each record gets a "Results on linux/arm64" table with the same rows as the linux/amd64 table, so the two architectures compare row by row.
- **Emulated entry unchanged.** It records what happened on the x86_64 host, which this run does not alter.

## Risks / Trade-offs

- One run on one host → recorded as a single native run; repeated runs stay an open gate as before.
- The Docker engine runs in a Linux VM on macOS → it executes arm64 code natively without emulation; the record names the host and the engine.
