# ADR 0006: GitHub.com as the first SCM

Date: 2026-10-24
Status: Decided by the owner on 2026-10-24 in the project conversation; decision 2's evidence terms elaborate ADR 0003 decision 2, and decision 3 is the credential option the owner chose from the author's proposals. Supersedes decision 3 of [ADR 0003](0003-first-integrations-and-plugin-kernel.md). Recorded; not implemented or qualified.

## Context

ADR 0003 selected Forgejo, a self-hosted open-source forge, as the first SCM integration, because the open-source policy admitted closed services only for agent harnesses and their providers. The owner then decided that the first SCM is GitHub.com, and that Forgejo follows later as a second SCM plugin.

## Decisions

1. **First SCM.** GitHub.com, the hosted service (not GitHub Enterprise Server), is the first SCM integration. It is a plugin on the microkernel (ADR 0003 decision 8); no kernel or module code, type, schema, or test names it.
2. **Scope change.** A closed, hosted SCM is admissible as a full SCM plugin, on the same terms as closed harnesses in ADR 0003 decision 2: its terms of service, data-handling terms, API version, maintenance, and security evidence are recorded before admission. Self-hosting of the control plane, storage, and messaging is unchanged. When a project uses the GitHub plugin, its repositories are hosted by GitHub, outside the Taskelith installation.
3. **Credentials.** Each Taskelith installation uses its own GitHub App. For every run, the control plane obtains an installation access token limited to the project's repositories and delivers it only to that run. This meets the trust model's per-project scoping for SCM credentials.
4. **Forgejo.** Forgejo stays selected as the second SCM plugin. It is added once Taskelith works and the GitHub integration is proven, not at a fixed delivery gate. The [candidate assessment](../integration-candidates.md) remains the record of its evaluation.

## Consequences

The architecture, the trust model, the candidate assessment, the dependency register, the foundation ledger, and ADR 0003 (a dated note) are updated to match. The G0 SCM qualification target becomes GitHub.com: the GitHub App's permissions, installation-token scoping and expiry, pull request, review, commit-status, and branch-protection APIs, signed webhooks, and the recorded terms. (Note, 2026-10-24: [ADR 0007](0007-g0-closure.md) deferred the terms review to before admission in G3.) Until Forgejo is added, the SCM port is exercised by one plugin only, so its harness-neutral design rests on review and the conformance suite rather than on a second implementation.
