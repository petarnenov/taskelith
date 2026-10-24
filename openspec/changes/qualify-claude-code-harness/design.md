## Context

ADR 0003 makes closed harnesses admissible with recorded terms (decision 2), allows opt-out telemetry confirmed by an egress test (decision 4), accepts non-telemetry vendor traffic until G8 (decision 10), and requires external approvals (decision 11). Architecture section 7 lists the native capabilities the first harness must specify. The owner's first-class principles (Clean Code, Docker, OpenAPI, SOLID, hexagonal, microkernel, Makefile, mandatory OpenSpec) govern the design; they are not yet recorded in an ADR.

## Goals / Non-Goals

Produce reproducible evidence for one platform and derive port-level consequences. Do not write plugin or port code, change the kernel, admit the harness, or claim Linux support.

## Decisions

- Pin the SDK version matching the CLI's `stable` dist-tag, consistent with the architecture's preference for stable supported releases, and record the binary hash.
- Isolate every run: an allowlisted harness environment, a dedicated `CLAUDE_CONFIG_DIR` for the device login (stored in the macOS Keychain under a directory-specific entry), no setting sources, no MCP servers, one tool, and a fresh working directory per run. Known gap in series `s2`: the auto-updater was not disabled and wrote outside the configuration directory; later runs must set `DISABLE_AUTOUPDATER=1`.
- Measure egress with a TLS-terminating proxy that logs method, host, and path, plus a sampler of every TCP and UDP socket of the probe process tree; record the blind spots.
- State consequences in port terms (turn ID, native request ID, terminal outcomes), so the microkernel stays harness-neutral and Codex can be checked against the same scenarios. A manifest-declared egress list is only a proposal.
- Run every scenario once with the final scripts through `make`, and write script hashes, environment, and timestamps into each run's metadata.
- Keep the probe outside the repository until the agent port and a conformance suite exist; then it becomes a plugin conformance test run through `make`.

## Risks / Trade-offs

Each scenario ran once on one platform with one provider, so the evidence is a minimum. Request bodies were not inspected. Fast releases make the pin stale quickly. The runs used the owner's subscription quota. Device authentication is per host, which conflicts with per-workspace credential scoping until the owner decides. The harness's self-update can change host-wide installations.
