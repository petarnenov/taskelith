## Why

On 2026-10-24 the owner decided that GitHub.com, not Forgejo, is the first SCM integration, with Forgejo as a second SCM plugin added once Taskelith works and the GitHub integration is proven. The owner approved a GitHub App with per-run installation tokens as the credential model. This supersedes ADR 0003 decision 3 and widens the closed-service exception to a hosted SCM.

## What Changes

- Add ADR 0006 recording the first SCM, the scope change, the credential model, and Forgejo's timing.
- Update the architecture (header, scope, open-source policy and component table, closed-provider rule, plugin placeholders, G0, R35, section 15), README, the trust model, the candidate assessment, the dependency register, the foundation ledger, and ADR 0003 (a dated note).

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `integration-decisions`: adds the GitHub.com first-SCM decision and its credential rule, and widens the closed-provider scenario to the hosted SCM.
- `integration-candidates`: the open-source and open-core scenarios exempt the closed, hosted SCM.

## Impact

Documentation only; no runtime impact. GitHub.com is not qualified or implemented.
