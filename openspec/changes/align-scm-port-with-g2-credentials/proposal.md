## Why

The item 0 revalidation of G3 item 7 (`define-scm-port`) against the G2 credential model and the G2 item 23 installation found that the source control contract, its `scm-port` requirements, and the conformance suite promise or allow more than G2 provides: a per-run secret that is "never logged or stored" with no mechanism behind it, a webhook receiver with no ingress or TLS, conformance findings that copy raw exception payloads and unknown failure codes into the report, refresh delivery to a running run that nothing owns, a Forgejo mapping that treats a code-writing scope as an allowed superset, and readers that accept empty identifiers. The coordinator (Niki) assigned this follow-up from revalidation passes 1 and 2 by Pepi.

## What Changes

- `docs/contracts/source-control.md`: the per-run secret's handling is a G3 obligation of items 20 and 21 (section 3); the webhook receiver's ingress and TLS are G3 work of items 9, 26, and 37 (sections 1 and 6); the Forgejo mapping records a code-writing scope as an admission and compatibility gate (sections 3 and 7); findings carry no raw payload of a thrown value or a malformed result (section 8); run identifiers are kernel identifiers and the other identifiers are external, non-empty, and bounded (section 2).
- `scm-port`: modifies "Opaque SCM identifiers", "Effective permissions", and "Credential refresh and revocation"; adds "Run credential secret", "Refreshed credential delivery", and "Conformance findings without payloads".
- `@taskelith/integrations` (private): a fixed-category description of thrown values (`describeThrown`), no unknown failure code and no plugin or fixture value in any finding, fixture results read as untrusted, and readers with kernel and external identifier checks; tests that fail before the fix.
- M1b, by coordinator decision (option A): `docs/g3-plan.md` rows 9, 18, 20, and 21 own the transport, adoption, delivery, and port revision for a refreshed credential, and the contract (sections 3, 9, and 10) and the added requirement "Refreshed credential delivery" name them. The H1 obligations are in rows 20 and 21.

## Capabilities

### New Capabilities

### Modified Capabilities

- `scm-port`: modifies "Opaque SCM identifiers", "Effective permissions", and "Credential refresh and revocation"; adds "Run credential secret", "Refreshed credential delivery", and "Conformance findings without payloads".

## Impact

The contract, the `scm-port` spec, the G3 plan rows of items 9, 18, 20, and 21 (no dependency or wave changes), and the private `@taskelith/integrations` package (`packages/modules/integrations/`). The published `taskelith` package, the port's types, and its version `0.1.0` are unchanged. A plugin whose conformance run relied on an exception message in a finding now sees only the error's category. No delivery path, redaction rule, receiver, or plugin is implemented here.
