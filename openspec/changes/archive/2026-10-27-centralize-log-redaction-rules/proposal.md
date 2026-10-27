## Why

Three places redact secrets from text, each with its own rules: the logger's `redactText` in `@taskelith/observability`, the failure-cause pipeline of `@taskelith/worker-control-plane-client`, and `redactSecrets` of the secrets adapter. They drift apart. The logger does not redact issued Taskelith secrets (`tkop_`, `tken_`, `tkwk_`), NKey seeds, NATS JWTs, or `.creds` blocks, which only the secrets adapter knows, so a log field or correlation value holding one reaches the sink. Several rules are quadratic: the URL user-information rule of both the logger and the secrets adapter takes about 2.4 s on 80,000 characters of `a.` repeated, the secrets adapter's JWT rule 1.6 s on `eyJ` repeated, and its `.creds` rule 2.1 s on 400,000 characters of begin markers without an end. Architecture section 6 names Observability the owner of redaction. Coordinator Niki assigned the centralization on 2026-10-27 with decisions Q1 to Q8 (design).

## What Changes

- **Shared rules.** `@taskelith/observability` gains `domain/redaction-rules.ts`: the one `REDACTED`, a `TextRule` type with `textRule` and `redactWith`, the key vocabularies, and every shared rule, each linear in time. Two compositions are exported: `MARKED_SECRET_RULES` (URL user information, bearer tokens, `key=value` pairs) and `SECRET_SHAPE_RULES` (issued secrets, `.creds` blocks, NKey seeds, JWTs).
- **Logger.** `redactText`, and so `redactFields` and `redactCorrelation`, applies both compositions, so a log record also loses issued secrets, NKey seeds, JWTs, and `.creds` blocks.
- **Secrets adapter.** `redactSecrets` and `redactFailure` stay its API and compose the shared rules with the same output; `SECRET_VARIABLE` and `scrubEnvironment` stay in the adapter; `REDACTED` and `SECRET_PREFIXES` are re-exported, so callers are unchanged.
- **Access.** `SECRET_PREFIXES` moves to `@taskelith/access`, beside `SecretKind`; observability depends on access to build the issued-secret rule.
- **Failure cause.** The pipeline composes its local rules (control characters, `[url]`, runs of 32 or more characters, truncation) with shared ones, with the same output; it keeps the logger's former rule set rather than the new secret shapes.
- **Tests.** A shared helper `assertLinearOnRuns` in `@taskelith/testing`; linear-time and leak tests for the logger and the secrets adapter, failing on the base code.
- **Spec.** "Logs without secrets" names the secret shapes and linear time, with two scenarios.

No contract, OpenAPI document, application, or published package changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `execution-observability`: requirement "Logs without secrets".

## Impact

- `packages/modules/observability` (new `domain/redaction-rules.ts`, `domain/redaction.ts`, index, manifest, tsconfig, logger tests).
- `packages/modules/access` (`ports/secrets.ts`, index).
- `packages/adapters/secrets` (`scrub.ts`, `node-secrets.ts`, index, manifest, tsconfig, tests).
- `packages/adapters/worker-control-plane-client/src/failure-cause.ts`.
- `packages/testing` (`linear-time.ts`, its test).
- `package-lock.json` and `docs/dependencies` for the two new workspace dependencies.
