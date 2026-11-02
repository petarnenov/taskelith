## Why

G3 plan item 20 ([G3 plan](/docs/g3-plan.md) row 20), second change of its split. The [source control contract](/docs/contracts/source-control.md) section 3 obliges item 20 to add the per-run SCM credential's secret shape to the shared `SECRET_SHAPE_RULES` of `@taskelith/observability`, which log redaction and `@taskelith/secrets` both use. The GitHub plugin's per-run secret is a GitHub App installation token, and until now no rule matched a bare one outside marked positions such as `Bearer` or URL user information.

## What Changes

- `redactGithubInstallationTokens` in `packages/modules/observability/src/domain/redaction-rules.ts`: `ghs_` followed by at least 36 characters of `A-Za-z0-9._-`, GitHub's own pattern for both of its installation token formats, placed in `TOKEN_SHAPE_RULES` before the JWT rule, so that it reaches `SECRET_SHAPE_RULES`, log redaction, and the `@taskelith/secrets` scrub alike ([design](design.md)).
- Tests in both users: the logger of `@taskelith/observability` and `redactSecrets`, `redactFailure`, and `scrubEnvironment` of `@taskelith/secrets`, each with near misses and a linear-time run.
- Contract: [source control contract](/docs/contracts/source-control.md) section 3 records the obligation as met; the `scrubEnvironment` obligation of item 21 stays open.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `execution-observability`: requirement "Logs without secrets" names GitHub App installation tokens, with a near-miss scenario.
- `scm-port`: requirement "Run credential secret" states the shape rule as a requirement instead of an open obligation, with a scenario for the token in text.

## Impact

Private workspace packages `@taskelith/observability` and `@taskelith/secrets`; the published `taskelith` package compiles only `src/` and bundles neither, so the commit types are `chore`, `test`, and `docs`. Size S. Not in this change: the GitHub plugin, Octokit, and `PLUGIN_API_VERSION` (item 20c), `scrubEnvironment` on the delivery path (item 21), and any wire, OpenAPI, or migration change. Other GitHub token types (`ghp_`, `gho_`, `ghu_`, `ghr_`, `github_pat_`) are not added: GitHub documents their prefixes but not their length or character set ([design](design.md)).
