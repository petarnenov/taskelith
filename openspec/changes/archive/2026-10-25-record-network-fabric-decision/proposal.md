## Why

On 2026-10-25 the owner asked for an analysis of integrating Tailscale so that Taskelith can work with machines registered in a Tailscale network, then decided the outcome: connectivity to machines is a plugin/adapter capability; a plain local network is the default without Tailscale-like capabilities; a self-hosted Headscale adapter follows; the hosted Tailscale control plane comes last. [ADR 0012](../../../docs/decisions/0012-network-fabric-plugins.md) records the decision, the narrow closed-provider scope change for the hosted service, and the implementation order before any gate implements it.

## What Changes

- Add ADR 0012 with six decisions: network fabric as a plugin kind behind a vendor-neutral, capability-gated port; local direct addressing as the default; Headscale as the first mesh plugin; the hosted Tailscale control plane admitted last as an optional closed-hosted plugin; the Tailscale client as infrastructure with `tsnet` rejected; and fabric identity as an observation only.
- Add a network fabric row to the open-decisions table of architecture section 15.
- Update acceptance requirement R35 in the architecture so that the narrow closed-provider exception for the optional hosted Tailscale plugin is recorded with its evidence requirement, instead of contradicting the ADR.
- Record the three planned network fabric components in the dependency register as `candidate`, with no installation or qualification claimed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The `integration-decisions` requirement "Recorded owner integration decisions" already requires this record and its propagation, so the change is documentation only and sets `skip_specs: true`.

## Impact

Documentation only. No code, package, dependency, image, or service is added, installed, or contacted. Implementation is deferred to the gates named in the ADR: the port contract with the first bounded change that adopts it (enrollment already exists from G2 item 13), Headscale toward the G6 pilot, and hosted Tailscale last.
