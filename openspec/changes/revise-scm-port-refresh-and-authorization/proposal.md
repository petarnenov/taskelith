## Why

G3 item 20 ([G3 plan](/docs/g3-plan.md) row 20), sub-change 20a. The item 7 SCM port, version `0.1.0`, ends a credential's previous secret when a refresh returns, so a running run cannot work between that end and its adoption of the new secret, and a failed delivery leaves it with none ([source control contract](/docs/contracts/source-control.md) section 3). The Git workspace already expects a run credential with `authorization`, the complete `Authorization` header value ([Git workspace contract](/docs/contracts/git-workspace.md) section 14), which the port does not carry. [Control-plane wire contracts](/docs/contracts/control-plane-wire-contracts.md) section 4.1 assigns to item 20 a port operation that derives a repository's remote URL.

## What Changes

- Port `SourceControlProvider` from `0.1.0` to `0.2.0` in `@taskelith/integrations`.
- Refresh: a run credential carries its `version`, 1 at issue and one more at each refresh with the same `credentialId`; a refresh ends no earlier version.
- Adoption: `confirmRunCredentialAdoption` names the credential and the adopted version and ends every earlier version; a repeated or stale confirmation ends nothing more; a version not yet issued fails with `not-found`. A version also ends at its own expiry, and a revocation ends every version. This mirrors item 26's worker credentials, whose predecessor stays valid until its successor is confirmed or a deadline passes.
- Authorization: `RunCredential.authorization`, the complete `Authorization` header value, checked as a scheme, a space, and visible ASCII credentials; `WorkspaceCredential` of `@taskelith/workspace` becomes a `Pick` of `RunCredential`, the same shape as before.
- Remote URL: `RepositoryRemoteResolver.resolveRemoteUrl` returns a repository's HTTPS remote URL without user information, query, or fragment.
- Conformance suite: the refreshed credential case probes both versions before and after the adoption, a new adopted credential case covers several versions and stale and unissued confirmations, the revoked case revokes after a refresh, and a new repository remote case compares the URL with the fixture's `projectRemoteUrl`. The fixture's code reads and writes send `authorization`. The in-memory SCM implements the revision and gains a defect per new guarantee.
- Contract: [source control contract](/docs/contracts/source-control.md) sections 1, 2 (rule 7), 3, 4.1 (new), 7, 8, and 9.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `scm-port`: the draft port at `0.2.0`, refresh that ends no version, revocation of every version, adoption confirmation, `authorization`, the remote URL operation, and delivery of a refreshed credential under the revised port.

## Impact

Private workspace packages `@taskelith/integrations` and `@taskelith/workspace`; commit types `chore`, `test`, and `docs`. Size M. Not in 20a: the plugin SDK re-export and the plugin API version (20c), the secret shape rules (20b), any GitHub code, control-plane handlers, and the OpenAPI and AsyncAPI documents. The `git-workspace-port` capability is unchanged, because `WorkspaceCredential` keeps its fields.
