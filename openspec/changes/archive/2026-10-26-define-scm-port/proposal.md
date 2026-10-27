## Why

G3 item 7 in the [G3 work plan](/docs/g3-plan.md). The GitHub plugin (item 20), the Git workspace (item 6), and the integration and merge items need a reviewed SCM port to build on. ADR 0006 makes GitHub.com the first SCM and Forgejo a later second one. Until Forgejo is added, the port's SCM-neutral design rests on review and on a shared conformance suite (ADR 0006 consequences, ADR 0004 principle 2). The coordinating session (Niki) assigned the task on 2026-10-26, after the owner started the first wave of G3 contracts.

## What Changes

- Add the source control port contract (`docs/contracts/source-control.md`): credentials, change requests, statuses, merges, the review identity, webhooks, the GitHub and Forgejo mapping, and the conformance suite.
- Add the port to `@taskelith/integrations`, the "SCM / Tracker integrations" module that item 8 added, with a `./port` entry like `@taskelith/sdlc`.
- Add a draft `SourceControlProvider` port, version `0.1.0`, built from three small ports for their clients:
  - `RunCredentialIssuer`: per-run credentials limited to the project's repositories and to SCM-neutral permissions, with refresh and revocation;
  - `ChangeRequestHost`: merge protection that binds the plugin's own identity, change requests, commit statuses, and a merge that names the expected head and the project's merge method;
  - `WebhookVerifier`: verification of a delivery's signature on its raw body, yielding an event with an opaque delivery identifier.
- Add capabilities: the merge methods a plugin supports and its review evidence, where `required-status` is mandatory (G3 plan D8 (a)).
- Add an SCM-neutral conformance suite, `runSourceControlConformance`, that a plugin's tests run against a live service with the plugin's own credential. It checks, among others, that a credential without write permission cannot write, that a merge is refused while a required status is pending, and that the plugin's own identity cannot bypass merge protection.

Excluded: the GitHub plugin and its App (item 20), any SCM I/O, the Git workspace (item 6), the plugin SDK re-export of the port and the plugin API version, wire contracts, and the module's application use cases, such as webhook deduplication and merge orchestration.

## Capabilities

### New Capabilities
- `scm-port`: the draft `SourceControlProvider` port, its capabilities, and the SCM-neutral conformance suite.

### Modified Capabilities
None.

## Impact

A new contract document; new source files, tests, and a `./port` entry in the private `@taskelith/integrations` package, whose workspace entry in `package-lock.json` is unchanged from item 8; the regenerated dependency inventory. No external dependency is added, and the published npm package is unchanged.
