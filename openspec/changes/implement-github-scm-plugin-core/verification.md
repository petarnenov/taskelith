# Verification: implement-github-scm-plugin-core

## Scope and source

G3 plan item 20 (`docs/g3-plan.md`, row 20), third change of its split, developed by a briefed subagent for the worker Zaki from `dev` `3341f8a8` (#424): the GitHub SCM plugin core on the draft `SourceControlProvider` `0.2.0` against an emulated GitHub API, the Octokit set of [G3 dependency evaluation](/docs/g3-dependencies.md) section 6, plugin API `0.3.0` with the port in the SDK's `draft` namespace (Q1), in-memory credential state (Q2), webhook signatures by `node:crypto` (Q3), the `Authorization: Basic` redaction rule (Q4), and the conformance probes of refresh and revocation of missing credentials. The coordinator's answers Q1 to Q4 come from the brief. Live conformance and its `make` target (20d), the webhook receiver and its dedupe migration (20e), and delivery to runs with `scrubEnvironment` on that path (item 21) are excluded.

## Revision

- Base: `dev` `3341f8a8`; the brief's checklist was saved with `--at 3341f8a82c2d64d60238e512e0471b25f2b456a5 --size L`.
- `6c341aaa` `chore: raise the plugin API to 0.3.0 with the draft SCM port in a draft namespace`.
- `fc35aefc` `chore: redact Basic credentials after an Authorization header name`.
- `5dbd0d68` `test: probe refresh and revocation of revoked and unknown credentials in the SCM suite`.
- `a34aa4c9` `chore: add the GitHub SCM plugin core over the pinned Octokit set` (the package, the lockfile, the register rows, section 6, and the regenerated inventory).
- `c31be6f6` `docs: specify the GitHub SCM plugin core change and update the contracts`.
- `e9a7e2a7` `docs: record the review route of the implement github scm plugin core change` (`route.json` unedited); the first `make verify` on this commit failed the comment rule (Checks).
- `646c1063` `chore: shorten two comments of the GitHub SCM plugin to the comment rule`.
- `e85955e2` `docs: route the implement github scm plugin core change again after the comment fix`: the fix changed the diff, so `route.json` was deleted and routed again; the new one differs from the first only in `generatedAt`, `headCommit`, the line count (2754, was 2757), the shadow router's probability (0.79, was 0.78) and latency, with the same route and reviewers. This is the tree that `make verify` checked; the commit after it adds this record and the `make record` output and is the head for review pass 1.

## Environment

Native Ubuntu host `hpz600`, Linux 6.8.0-147-generic x86_64; Node.js v24.22.1, the `.nvmrc` pin, for `make verify` and the focused runs.

## Author self-check

- Scope: only the brief's nine points. `git diff 3341f8a8 --stat`, without `package-lock.json` and `docs/dependencies/`, lists 53 files, 2326 insertions and 22 deletions, under the size guard (60 files, 5000 lines). No OpenAPI, wire, migration, receiver, `make` target, or published-package source change.
- Dependencies (checklist `docs`, `evidence-mismatch`): `npm ls` shows `@octokit/core@7.0.8` and `@octokit/auth-app@8.3.1` at the root and `@octokit/plugin-paginate-rest@16.0.0` under `packages/plugins/scm-github/node_modules`, because the release tooling keeps 15.0.0 at the root; the three are exact in the plugin's `package.json`. The register row quotes the lockfile integrity of each; osv.dev (`POST https://api.osv.dev/v1/query`) returned `{}` for the three and for the seven packages the install added to the lockfile; `npm audit --omit=dev` reports three moderate findings (`glob`, `minimatch`, `node-pg-migrate`), the same counts as on the base lockfile. `make dependency-inventory` reported "Generated 927 package paths; 70 with license coverage gaps (all reviewed; 4 declaration-only)". `@octokit/webhooks-methods` is not installed; the deviation and its reason are in `docs/dependencies.md` and `docs/g3-dependencies.md` section 6.
- Register status: the brief asked to move the Octokit rows to the register's accepted state. The rows stay `candidate`, installed by 20c, because the `dependency-register` requirement "Version-specific decisions" marks an installed tool without adoption, operational, upgrade, and recovery evidence as a candidate, and every installed G3 row does the same; this is reported to the coordinator as an open question.
- Plugin boundary (checklist `contract-drift`): `src/` imports only `@taskelith/kernel`, `@taskelith/plugin-sdk`, Octokit, and Node built-ins (`npm run check:boundaries` passes); no kernel or module code names GitHub. Failures carry only GitHub's status, never its message (`github-data.ts`).
- Redaction (checklist `redaction`): the rule runs last in `TOKEN_SHAPE_RULES` and continues through a `[redacted]` an earlier rule left, so a token shape glued inside the credentials leaves nothing (mutant M5 below). Near misses stay; long runs of `authorization: basic ` and `[redacted]` are linear. The tests build the credentials from a synthetic `ghs_` token at run time; the App key pair is generated per test run; no real token or key was printed or committed.
- Requirement texts: `scm-port` "GitHub plugin credentials" 399 characters, "GitHub plugin merges and webhooks" 441, "GitHub credential state in memory" 392, "Credential refresh and revocation" 448, "SCM conformance suite" 318; `plugin-registration` "Draft SCM port from the plugin SDK" 412, "Bundled plugin manifests" 276, "Compatible plugin API only" 290, "Frozen port types from the plugin SDK" 415; `execution-observability` "Logs without secrets" 477; `installation-enrollment` "Secret scrubbing" 293. Each MODIFIED delta copies the living requirement with all its scenarios.
- Commit types: the published `taskelith` package compiles only `src/` (`tsconfig.json` `rootDir` `src`; `files` `dist/`, `docs/architecture.md`, `README.md`, `LICENSE`), and `src/` imports no workspace package, so no code of this change ships in it; the commits use `chore`, `test`, and `docs`. `docs/architecture.md`, which the package ships, changes only in a `docs` commit.
- Comments: every new or changed comment is at most two lines of at most 80 characters; `npm run verify:comments` passed. No AI attribution in commits.

## Fail-before

- Redaction: the new tests `packages/modules/observability/test/basic-credentials.test.ts` and `packages/adapters/secrets/test/basic-credentials.test.ts` ran before the rule, after `npm run build`: `tests 18`, `pass 4`, `fail 14`; the four passing tests are the near-miss and linear-time tests, which assert text that stays. After the rule: `tests 18`, `pass 18`.
- Conformance probe: `packages/modules/integrations/test/source-control-unknown-credentials.test.ts` with the fake's three new defects ran before the probes: `tests 3`, `pass 0`, `fail 3`. After: `tests 3`, `pass 3`.
- Plugin, SDK, and ordering behaviour, by mutants: a scratch script applied each mutation alone to the source, rebuilt the package with `npx tsc -b`, ran the named tests or `npx tsc -p tsconfig.check.json`, and restored the source; after the last restore the 71 tests of the named files passed.

| Mutant | Result |
| --- | --- |
| M1 `PLUGIN_API_VERSION` back to `0.2.0` | 4 of 18 fail, among them "every bundled plugin manifest accepts the SDK plugin API version" |
| M2 OpenSpec range back to `^0.2.0` | "every bundled plugin manifest accepts the SDK plugin API version" fails |
| M3 no `draft` export | typecheck fails: `Module '"@taskelith/plugin-sdk"' has no exported member 'draft'` |
| M3b `SourceControlProvider` also at the root | typecheck fails: `Unused '@ts-expect-error' directive` in `draft-ports.test.ts` |
| M4 Basic rule removed | 14 of 18 fail |
| M5 Basic rule first in `TOKEN_SHAPE_RULES` | "a Basic credential with a token shape glued inside leaves no part of it" fails |
| M6 missing-credential probes removed | 3 of 3 fail |
| M7 `enforce_admins: false` | 3 of 9 fail, the conformance run among them |
| M8 `Bearer` authorization | 2 of 17 fail, the conformance run among them |
| M9 no API version hook | "every request names API version 2022-11-28" fails |
| M10 ended versions not revoked at GitHub | 6 of 17 fail, the conformance run among them |
| M11 HMAC over the decoded text | "the signature covers the raw bytes, which need not be text" fails |
| M12 token not narrowed to the repositories | 14 of 17 fail |
| M13 credential state shared across instances | "after a restart every earlier credential is unknown" fails |
| M14 refresh ignores a revocation that overtook it | "a refresh that a revocation overtakes revokes its new token" fails |
| M15 wider token kept | "a token wider than requested is revoked and not returned" fails |
| M16 signature not compared | 3 of 8 fail, the conformance run among them |

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `env -u NODE_ENV make verify` | `e9a7e2a7` | Failed in `npm run verify:comments`: `installation-tokens.ts:29: comment spans 3 lines (max 2)` and `github-emulator.ts:3: comment spans 4 lines (max 2)`; fixed in `646c1063` |
| `env -u NODE_ENV make verify` | `e85955e2`, tree `bcaa51c9` | Passed on the first run, profile full, stamp written: tests 4222, suites 49, pass 4175, fail 0, cancelled 0, skipped 47; all files 99.36 % lines, 92.62 % branches, 98.86 % functions; `scm-github` modules 90.32 to 100 % lines, 76.81 to 100 % branches, 85.71 to 100 % functions; `redaction-rules.js` and `credential-cases.js` 100 % each |
| `npm run openspec -- validate implement-github-scm-plugin-core --strict` | `c31be6f6` | `Change 'implement-github-scm-plugin-core' is valid` |
| Focused runs | `c31be6f6` | `packages/plugins/scm-github/test/*.test.ts`: 36 of 36; integrations tests and the plugin tests together: 110 of 110 |

### Route

Route (`route.json`, rule version 5): elevated (lines, files, capabilities, security, contracts, size); pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-fable-5-1#high`, pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding; the shadow router `jev-1.14.0` agrees. Reviews run at effort medium, owner decision 2026-11-02, although `route.json` recommends high for passes 1 and 2. The coordinator assigns the reviewers.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `bcaa51c9e8c2a7bf573eee93dc3ef2b787bccb97`; tests 4222, pass 4175, fail 0, skipped 47; all files 99.36% lines, 92.62% branches, 98.86% functions.
- `npm run openspec -- validate implement-github-scm-plugin-core --strict`: passed, `Change 'implement-github-scm-plugin-core' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 101 file(s); every pass summary file is valid: 81 file(s); every route file is valid: 34 file(s).`.
- Spec diff against the merge base `3341f8a82c2d` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

Not yet run; Zaki runs the passes.

## Limitations

- Credential versions live in the plugin's memory: a restart forgets every credential, whose tokens then end at GitHub's own expiry, at most an hour later (design decision 3). Durable state waits for item 21.
- The tests run against an emulated GitHub API that encodes this change's reading of GitHub; no live GitHub call was made. 20d's live conformance checks it, including narrowing a token to one of several installed repositories, which the qualification did not test.
- `ensureMergeProtection` writes the whole branch protection and drops an operator's review and push restrictions on that branch (design decision 4).
- Two refreshes within one second can return the same `expiresAt`, because GitHub's expiry has second precision.
- No composition root registers the plugin yet.

## Remaining gates

- Independent review passes 1 to 3 as governance requires, and the coordinator's architect check of any unreviewed fixes.
- The register status of the Octokit rows (open question above).
- Integration into dev by the coordinator (single pull request)
