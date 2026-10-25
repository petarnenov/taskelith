## Why

G2 work item 26 ([docs/g2-plan.md](../../../docs/g2-plan.md)) carries out the qualification that [ADR 0007](../../../docs/decisions/0007-g0-closure.md) deferred until the worker image exists: Claude Code and Codex on Linux inside the worker image, on the architectures decision D11 selects. It depends only on item 23, whose first part, 23a, delivered `infra/installation/Dockerfile` with the digest-pinned Ubuntu 24.04 base and the Linux worker target. The work qualifies; it does not admit. Both harnesses stay `candidate`.

On 2026-10-25 the owner decided to run only the steps that need no credentials. Every scenario that calls a model needs a subscription login, and no login is authorized, so those scenarios are recorded as not run. They stay open for G3 item 35.

## What Changes

- **Image variant.** A `worker-harnesses` target in `infra/installation/Dockerfile` installs the pinned `@anthropic-ai/claude-agent-sdk@0.3.308` and `@openai/codex@0.164.0` from a tracked manifest and lockfile (`infra/installation/harnesses/`). `npm ci --ignore-scripts` checks every package against its lockfile integrity hash. The variant builds on the default `worker` target, which stays unchanged. Root owns the installed harnesses, and the variant sets `DISABLE_AUTOUPDATER=1`, Claude Code's switch. Codex reads its update check only from `CODEX_HOME`, so the run sets it there.
- **Qualification steps.** The opt-in `make qualify-harnesses OUT=<dir>` builds the variant for each platform in `PLATFORMS` (default linux/amd64 and linux/arm64) from the tracked files and runs the credential-free steps in each, without a network. A failed platform is recorded, and the others still run. The steps cover platform, absent credential files, binary hash and version, login state, the Codex app-server schema, and refused writes to the installed harnesses. They also take before-and-after listings of the harness tree and the qualification home, and `docker diff` lists the changed paths except the generated schema files. They are in `infra/installation/harnesses/qualify.sh`. The target stays outside `make verify`.
- **Pin check.** A test in `make verify` checks the manifest, the lockfile's integrity hashes and Linux platform packages, the Dockerfile stages, and that each qualification record states the locked integrity hashes.
- **Records.** `docs/qualification/claude-code.md` and `codex.md` gain the Linux worker-image evidence for linux/amd64, native on an x86_64 host. linux/arm64 is not run: its emulated build fails on this host's QEMU, and for a native run D11 names the GitHub-hosted runner `ubuntu-24.04-arm`. By the coordinator's decision, this item adds no workflow.

## Capabilities

### Modified Capabilities

- `local-installation`: the harness image variant and its opt-in qualification target.
- `harness-qualification`: Linux evidence comes from the worker image variant, and credential-free steps are separated from scenarios that need a login.

## Impact

Build files, a script, a test, and documentation. No product code, published CLI command, OpenAPI or AsyncAPI document, or root npm dependency changes. The harness lockfile is separate from the root lockfile, and only the opt-in image installs it. The commits use `build`, `test`, and `docs`.
