## Context

The architecture excluded mandatory closed providers. The owner has now made closed harnesses and their model providers admissible, and selected four harnesses, closed and open, in order, plus Forgejo. None of them is admitted (`accepted`) yet.

## Goals / Non-Goals

Record decisions faithfully with their scope limits. Do not qualify components, change dependency statuses to `accepted`, or implement plugins.

## Decisions

Keep the closed-provider exception narrow: it covers agent harnesses and their model providers only. Bound the advisory exception to the two findings in development and release tooling, ending when a fixed npm release exists. Express the microkernel as a rule set: port-only kernel dependencies, no integration names in the kernel, versioned plugin packages with manifests, and add/remove through the composition root. Startup registration stays in force. Keep license diligence light until G8, with a full license audit as a G8 gate; the automated inventory check is unchanged. Packaged documents link to repository-only files through canonical GitHub URLs.

## Risks / Trade-offs

Closed harnesses add vendor accounts, credentials, and terms of service to worker execution. Delivering Claude Code first risks shaping the port around one SDK. Codex conformance before the port freezes mitigates this.
