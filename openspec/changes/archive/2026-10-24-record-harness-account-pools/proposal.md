## Why

On 2026-10-24 the owner asked for pools to which many subscriptions can be added per harness and project, each used on a least-loaded basis, with subscription authentication only and a slot allowed to serve several explicitly listed projects. In the Claude Code qualification, a device login was bound to a configuration directory on one host, which conflicted with the trust model's per-workspace credential scoping and needs a manual login per account and host.

## What Changes

- Add ADR 0005 recording the owner's request and the author-proposed, owner-approved rules: account pools, subscription-only authentication, least-loaded selection, cooldown, session affinity, credential handling, the trust-model change, and the harness-neutral kernel boundary, with the unverified provider-terms risk.
- Update the architecture (plugin contracts, credentials, resource admission), trust model, operational targets, dependency register, Claude Code qualification record, ADR 0003 (dated note), and foundation ledger.

## Capabilities

### New Capabilities
- `harness-account-pools`: Owner-decided pools of subscription accounts per harness with least-loaded selection and per-slot credential scoping.

### Modified Capabilities

None.

## Impact

Documentation only; no runtime impact. Implementation belongs to G2 and G3. Provider terms are not verified.
