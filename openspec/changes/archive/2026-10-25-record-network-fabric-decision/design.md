## Context

The owner's decision on 2026-10-25 fixes the direction of machine connectivity in the product: a local network by default without Tailscale-like capabilities, an adapter for the self-hosted Headscale control server next, and an adapter for the hosted Tailscale control plane last. The analysis that preceded it found that Tailscale fits the existing outbound-only worker connectivity model, that `tsnet` embedding would need a forbidden Go bridge, and that the hosted coordination server is a closed service that the technology policy admits only through an explicit owner decision.

## Goals / Non-Goals

Goals: record the decision and its order exactly; keep the closed-provider exception narrow and conditional on recorded terms and evidence; name the gates that implement each plugin; keep the dependency register honest.

Non-goals: do not define the port contract now, because the gate that first implements it owns it and ports describe actual application needs; do not qualify Headscale or the Tailscale API; do not install or contact anything; do not reopen the analysis.

## Decisions

- One vendor-neutral port, capability-gated, so that the local plugin implements only the base behavior and every Tailscale-like feature is an optional manifest capability that the core never assumes.
- The hosted Tailscale control plane is admitted as an optional plugin under the ADR 0006 rule: terms of service, data handling, API version, maintenance, and security evidence are recorded before admission, and no installation is required to use it.
- The Tailscale client runs as prebuilt infrastructure like NATS; `tsnet` is rejected because a Go bridge is forbidden for product-owned code.
- Fabric node identity is recorded as an observation and never replaces enrollment, per-worker broker credentials, or launch authorization; fabric reachability never decides execution lifecycle.
- The dependency register keeps the Headscale server, the hosted Tailscale API, and the pinned Tailscale client as `candidate` until version-specific qualification.

## Risks / Trade-offs

Headscale is community-maintained, and evidence for the 1000-machine stage is a named G7 gate; its maintenance and scale risk is recorded rather than glossed over.
Deferring the port contract risks revision when the first adoption exists; the alternative, a speculative port designed without a consumer, contradicts the architecture's rule that ports describe actual application needs.
The hosted Tailscale plugin depends on a closed provider; optionality and the two alternatives bound that risk.

## Migration Plan

No migration. The decision takes effect when a gate implements the port and a plugin; until then, deployments use whatever addressing the enrollment implementation of G2 provides.

## Open Questions

- Which bounded change first adopts the network fabric port after this decision. Enrollment already exists from G2 item 13 and is not modified by this decision.
