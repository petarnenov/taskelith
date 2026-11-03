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
- `039d6820` `docs: record the verification of the implement github scm plugin core change`: the head that review pass 1 reviewed.
- `4c2d8fdb` `docs: record review pass 1 of the implement github scm plugin core change` (`passes.jsonl` and the eight findings, before any fix).
- `ec971227` `chore: harden GitHub SCM plugin tokens, protection, and logging after review pass 1`: the fixes of the eight pass 1 findings and coordinator decision D2, with their tests and the emulator's new native means.
- `76fde79b` `docs: specify the GitHub plugin's protection refusal, refresh expiry, and register status`: the `scm-port` delta, design, proposal, source control contract sections 2 and 4, and coordinator decision D1 in `docs/dependencies.md` and `docs/g3-dependencies.md` section 6.
- `f1492055` `docs: resolve the review pass 1 findings of the implement github scm plugin core change`: the tree that the second `make verify` checked; the commit after it adds this record.

## Environment

Native Ubuntu host `hpz600`, Linux 6.8.0-147-generic x86_64; Node.js v24.22.1, the `.nvmrc` pin, for `make verify` and the focused runs.

## Author self-check

- Scope: only the brief's nine points. `git diff 3341f8a8 --stat`, without `package-lock.json` and `docs/dependencies/`, lists 53 files, 2326 insertions and 22 deletions, under the size guard (60 files, 5000 lines); after the pass 1 fixes at `f1492055`, 56 files, 2966 insertions and 24 deletions. No OpenAPI, wire, migration, receiver, `make` target, or published-package source change.
- Dependencies (checklist `docs`, `evidence-mismatch`): `npm ls` shows `@octokit/core@7.0.8` and `@octokit/auth-app@8.3.1` at the root and `@octokit/plugin-paginate-rest@16.0.0` under `packages/plugins/scm-github/node_modules`, because the release tooling keeps 15.0.0 at the root; the three are exact in the plugin's `package.json`. The register row quotes the lockfile integrity of each; osv.dev (`POST https://api.osv.dev/v1/query`) returned `{}` for the three and for the seven packages the install added to the lockfile; `npm audit --omit=dev` reports three moderate findings (`glob`, `minimatch`, `node-pg-migrate`), the same counts as on the base lockfile. `make dependency-inventory` reported "Generated 927 package paths; 70 with license coverage gaps (all reviewed; 4 declaration-only)". `@octokit/webhooks-methods` is not installed; the deviation and its reason are in `docs/dependencies.md` and `docs/g3-dependencies.md` section 6.
- Register status: the brief asked to move the Octokit rows to the register's accepted state. The rows stay `candidate`, because the `dependency-register` requirement "Version-specific decisions" marks an installed tool without adoption, operational, upgrade, and recovery evidence as a candidate. The coordinator decided (D1, 2026-11-03) that the register rules win over the brief: the rows stay `candidate`, marked as installed by `implement-github-scm-plugin-core`, and are promoted after 20d's live conformance; `docs/dependencies.md` and `docs/g3-dependencies.md` section 6 say so.
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

### Fail-before of the pass 1 fixes

The new tests (the emulator's new native means first, in `test/github-emulator.ts`) ran against the source of `039d6820` with only them added, after `npx tsc -b` in `packages/plugins/scm-github`: `node --experimental-strip-types --test --test-reporter=spec packages/plugins/scm-github/test/*.test.ts` gave `tests 57`, `pass 39`, `fail 18`. The 18 failing tests, by finding:

| Finding | Failing before the fix |
| --- | --- |
| 1 Octokit logs | "GitHub messages in the App clock skew retry reach no console" (`a secret reached the console`) |
| 2 overtaken refresh | "a refresh overtaken by a revocation whose cleanup fails is retried" |
| 3 rejected grant | "a rejected grant whose revocation fails is revoked by the next call", "a token answer without an expiry is revoked" |
| 4 protection (D2) | "a branch whose protection has …" for `required_pull_request_reviews`, `restrictions`, `required_status_checks.strict`, `required_status_checks.contexts`, and `required_linear_history`, and "every conflicting setting is named" |
| 5 extra permissions | "a token granted {"statuses":"write"} …" and "… {"administration":"write"} beyond the request is revoked" |
| 6 later expiry | "a refresh within the same second as its version fails and leaves no token", "of two concurrent refreshes in one second only one succeeds" |
| 7 revocation codes | "an unconfirmed revocation with status 403 / 404 / 422 is unavailable and kept" (500 already passed) |
| 8 remote URL | "a remote URL outside the contract is refused" |

D2's other two cases, "a branch without protection gets the required contexts" and "a branch with only this protection is protected again", passed before and after, as they should. The existing test "protection requires the contexts and binds administrators" now asks for both contexts in its second call, because a context that is not requested is refused (D2). After the fixes (`ec971227`): `tests 57`, `pass 57`. The overtaken refresh test holds the token request with a barrier (`holdNext`), and the same-second tests stop the emulator's clock (`mintClockStepMs: 0`), so no test depends on timing.

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `env -u NODE_ENV make verify` | `e9a7e2a7` | Failed in `npm run verify:comments`: `installation-tokens.ts:29: comment spans 3 lines (max 2)` and `github-emulator.ts:3: comment spans 4 lines (max 2)`; fixed in `646c1063` |
| `env -u NODE_ENV make verify` | `e85955e2`, tree `bcaa51c9` | Passed on the first run, profile full, stamp written: tests 4222, suites 49, pass 4175, fail 0, cancelled 0, skipped 47; all files 99.36 % lines, 92.62 % branches, 98.86 % functions; `scm-github` modules 90.32 to 100 % lines, 76.81 to 100 % branches, 85.71 to 100 % functions; `redaction-rules.js` and `credential-cases.js` 100 % each |
| `env -u NODE_ENV make verify` | `f1492055`, tree `8b8382bc` | Passed on the first run, profile full, stamp written: tests 4243, suites 49, pass 4196, fail 0, cancelled 0, skipped 47; all files 99.36 % lines, 92.65 % branches, 98.88 % functions; `scm-github` modules 96.77 to 100 % lines, 80.95 to 100 % branches, 100 % functions; no known flake recurred |
| `npm run openspec -- validate implement-github-scm-plugin-core --strict` | `c31be6f6` | `Change 'implement-github-scm-plugin-core' is valid` |
| Focused runs | `c31be6f6` | `packages/plugins/scm-github/test/*.test.ts`: 36 of 36; integrations tests and the plugin tests together: 110 of 110 |

### Route

Route (`route.json`, rule version 5): elevated (lines, files, capabilities, security, contracts, size); pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-fable-5-1#high`, pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding; the shadow router `jev-1.14.0` agrees. Reviews run at effort medium, owner decision 2026-11-02, although `route.json` recommends high for passes 1 and 2. The coordinator assigns the reviewers.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `8b8382bcefc3faa47afa807e01b7b36ecde27d06`; tests 4243, pass 4196, fail 0, skipped 47; all files 99.36% lines, 92.65% branches, 98.88% functions.
- `npm run openspec -- validate implement-github-scm-plugin-core --strict`: passed, `Change 'implement-github-scm-plugin-core' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 101 file(s); every pass summary file is valid: 81 file(s); every route file is valid: 34 file(s).`.
- Spec diff against the merge base `3341f8a82c2d` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a19f35-9548-7090-b974-933d2f545f61` | 0 | 4 | 4 | 0 |
<!-- make record: end -->

## Independent review

### Pass 1, role A

- Reviewer: Codex CLI, model `gpt-6-astra`, effort `medium` (owner decision 2026-11-02; `route.json` recommends high), sandbox `read-only`, run by Zaki with `make review` on head `039d6820` against the merge base `3341f8a8`. Invocation: `codex exec -m gpt-6-astra -c model_reasoning_effort="medium" -s read-only -C <worktree> -`. Model confirmation: the CLI reported model `gpt-6-astra`, effort `medium`, and sandbox `read-only`. Session `01a19f35-9548-7090-b974-933d2f545f61`.
- Snapshot: the worktree hash before the pass was `e6d81bcb09c5…`; the reviewer reported that it changed no file, and the worktree was clean before the fix round.
- Findings: Critical 0, High 4, Medium 4, Low 0 (the report file holds the report twice; its eight unique findings match these counts). Resolutions, all in `ec971227` and `76fde79b`:
  1. High, Octokit logs GitHub's error message in `auth-app`'s clock skew retry (`github-api.ts`): both Octokit clients get a logger that discards everything (design decision 6).
  2. High, a refresh overtaken by a revocation loses its token when the cleanup revocation fails (`run-credentials.ts`): a revocation waits for the credential's pending refreshes, whose tokens join the versions, so it ends them or fails with `unavailable` for a retry (decision 3).
  3. High, a refused or malformed token grant is forgotten when its revocation fails (`installation-tokens.ts`): the token is read apart from its grant and expiry, and a refused one is revoked, or kept and revoked again before the next token request or revocation (decision 3).
  4. High, ensuring protection drops required reviews, push restrictions, and strict checks (`change-requests.ts`): fixed by coordinator decision D2, read first and fail with `precondition-failed` naming every setting the PUT would drop or weaken, writing nothing; merging such settings is a follow-up (decision 4, contract sections 2 and 4, `scm-port` deltas).
  5. Medium, extra App permissions accepted (`installation-tokens.ts`, `permissions.ts`): the raw App permission map must equal the request apart from `metadata: read` (decision 3).
  6. Medium, a refresh can keep the previous expiry (`run-credentials.ts`): a refresh whose expiry is not later than the newest version's is refused, its token revoked, with `unavailable`; the new requirement "GitHub refresh expiry" states it (decision 3).
  7. Medium, unconfirmed revocations map to other codes (`installation-tokens.ts`): every answer but success or 401 is `unavailable` and keeps the token.
  8. Medium, remote URL checks miss the length, IPv6, and port rules (`change-requests.ts`): the execution wire `RemoteUrl` pattern and its 2048 character bound (decision 4).
- Coordinator decisions applied in this round (Niki, 2026-11-03): D1 above (register status); D2 (finding 4); D3, `docs/qualification/github.md` untouched; D4, design decision 3 records why run tokens are requested directly with `POST /app/installations/{installation_id}/access_tokens` and not through `auth-app`.
- The fixes are not yet reviewed: pass 2 (role B) reviews them.

## Limitations

- Credential versions live in the plugin's memory: a restart forgets every credential, whose tokens then end at GitHub's own expiry, at most an hour later (design decision 3). Durable state waits for item 21.
- The tests run against an emulated GitHub API that encodes this change's reading of GitHub; no live GitHub call was made. 20d's live conformance checks it, including narrowing a token to one of several installed repositories, which the qualification did not test.
- `ensureMergeProtection` refuses a branch whose protection it would weaken, such as one with required reviews, instead of merging those settings, a recorded follow-up (design decision 4).
- A second refresh within one second of the newest version fails with `unavailable`, because GitHub's expiry has second precision (design decision 3).
- A token the plugin refused and could not revoke stays live until a later token request or revocation of the same plugin instance revokes it, or until its own expiry.
- No composition root registers the plugin yet.

## Remaining gates

- Independent review pass 2 (role B) of the pass 1 fixes, pass 3 if pass 2 reports a Medium or worse finding, and the coordinator's architect check of any unreviewed fixes.
- Promotion of the Octokit register rows after 20d's live conformance (D1).
- Integration into dev by the coordinator (single pull request)
