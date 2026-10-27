## Context

G3 item 0 (`revalidate-g3-foundations`) re-reviews item 7 against the G2 credential model and the G2 item 23 installation (`/docs/g3-plan.md`, item 0). Passes 1 and 2 by Pepi found six problems, which the coordinator's brief names H1, M1, H1b, M1b, M2, and L1. G2 facts that the decisions rest on:

- `@taskelith/secrets` redacts with `SECRET_SHAPE_RULES` (`packages/modules/observability/src/domain/redaction-rules.ts:88`): Taskelith's issued tokens, `.creds` blocks, NKey seeds, and JWTs. No production code calls `scrubEnvironment` (`packages/adapters/secrets/src/scrub.ts:24`); only its own test does.
- The installation publishes the API on `127.0.0.1` over plain HTTP (`infra/installation/compose.yaml:70`, `/docs/local-installation.md` lines 28 and 99).
- Kernel identifiers are 1 to 128 printable ASCII characters without whitespace (`packages/kernel/src/identifier.ts:10-22`).

## Decisions

1. **H1, an obligation, not a mechanism.** The contract (section 3) and the new requirement "Run credential secret" keep the rule and say that G2 has no mechanism for it. Item 20 (`implement-github-scm-plugin`), which issues the credential, adds its secret to the redaction of `@taskelith/secrets`; item 21 (`implement-review-and-verification-stages`), which with item 23 owns the module's credential delivery to a run (contract section 10), scrubs it on that path. The rule leaves "Credential refresh and revocation", whose body is now only refresh and revocation, so each requirement stays short.
2. **M1, owners for the receiver's reachability.** Section 6 says that the receiver needs an ingress and TLS, which G2 lacks, and names item 9 (its HTTP operation), item 26 (TLS of D11 (b)), and item 37 (the G3 installation). The section 1 table points there. The spec is unchanged: "Webhooks verified on the raw body" is about verification, which holds.
3. **H1b, no raw payload in a finding.** `describeThrown` (`untrusted-shapes.ts`) names a thrown value by a fixed category: one of the eight built-in error classes, matched by prototype identity, "an Error of another class", or "a value that is not an Error". It reads no property of the value, so neither a message, a `name`, a stack, nor a getter reaches the report, and a throwing `getPrototypeOf` falls back to the last category. Every site that described an exception uses it: the case body, plugin operations, fixture steps, the capabilities getter, field reads, failure details, and the result value. An unknown failure code is reported by path and problem only. A scrubber was rejected: an SCM secret has no shape a rule can match, and a scrubber that misses one leaks it; a fixed category is total. The value describer that remains, `describeValue`, prints only checked values in outcome findings, such as permissions; it no longer handles errors.
4. **L1, two kinds of identifier.** A run identifier is the module's own, so the reader checks it with kernel `parseIdentifier`, not the local non-empty check, which is renamed `nonEmptyText` and now reads only the secret. Repositories, change requests, commits, credential identifiers, and delivery identifiers are external: the reader requires a non-empty string of at most 1024 characters. The bound is the module's, not a service's; it leaves room for long repository paths and keeps a finding's field bounded. Branch names, contexts, URLs, and methods are not identifiers and keep their readers. `credentialId`, `id`, `headCommit`, `mergeCommit`, and `deliveryId` were non-empty already and gain only the bound.
5. **M2, a gate, not a mapping.** Section 3 states the consequence of the `write-code` rule for a service without a narrower permission, and section 7 records Forgejo's assumed `write:repository` as an admission and compatibility gate: Forgejo's admission must show a narrower mechanism at its pinned version, or revise the port. The credential cases already refuse such a grant (`checkGrant` and the `write-code` probe); a comment on the requests without `write-code` names the gate, and the existing test "an effective grant beyond the request is allowed, but not write-code" shows the finding for the change request and status case. The modified "Effective permissions" requirement adds the consequence and a scenario.
6. **M1b, not decided here.** No G3 plan row clearly owns the transport of a refreshed secret to a running run, its adoption by the run, or the gap between the old secret's end and the new one's adoption. The coordinator decides; `verification.md` lists the options.

## Plan checklist

Verbatim from the coordinator's brief:

```
Review checklist (capabilities scm-port; files docs/contracts/source-control.md, packages/modules/integrations/**): no archived findings match.

Record quality (archived findings under openspec/changes/), most frequent finding categories first:
1. evidence-mismatch (31) 2. docs (29) 3. stale-citation (16) 4. spec-wording (14) 5. contract-drift (6) 6. process (3)
```
