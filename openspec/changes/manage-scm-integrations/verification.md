# Verification: manage-scm-integrations

## Scope and source

G3 plan item 20 (`docs/g3-plan.md`, row 20), sub-change 20f, the sixth change of item 20 by the owner's decision of 2026-11-03, developed by a briefed subagent for the worker Zaki from `dev` `4b89aa6e` (#428): handlers for the existing operations `listScmIntegrations`, `createScmIntegration`, `readScmIntegration`, and `updateScmIntegration`; kebab-case setting and secret names checked by the plugin; the allowed origin normalized in the module's domain; migration `1792934000000_scm-integrations` with secrets sealed under the new control-plane key `scm-integration-secrets.key`; store-backed webhook verifiers cached per revision; the draft SCM plugin descriptor with plugin API `0.4.0`, which resolves the deferred 20e finding (pass 2 finding 7 of `receive-scm-webhooks`); no secret value in any answer, log, failure, or string form; the G3 plan rows 11, 15, and 20; and the contract and spec updates. Excluded, as the brief lists: `bindRepository` and `readRepositoryBinding` (11b), `createRun` and the bridge (11c), deletion and rotation beyond an update, 20d live conformance, delivery to runs (item 21), the SPA screen (item 34), any change of the receiver's answers, limit, or deduplication, and a foreign key from `scm_webhook_deliveries`.

## Revision

- Base: `dev` `4b89aa6e`; the brief's checklist was saved with `--at 4b89aa6ec5785669b3e58798cd06d52c2fdcb0be --size L`.
- `5982e4f3` `docs: create the manage scm integrations change` (checklist, empty `findings.jsonl` and `passes.jsonl`).
- `385cd38f` `chore: add scm integration management to the integrations module`.
- `27cfc5b0` `chore: add the draft scm plugin descriptor and raise the plugin api to 0.4.0`.
- `fa95a6ad` `chore: store scm integrations with sealed secrets under their own key`.
- `a91ec9a9` `chore: serve scm integration management over http with store-backed webhook verifiers`.
- `33212169` `docs: specify the manage scm integrations change and update the contracts and the g3 plan` (with the regenerated dependency inventory).
- `90ef6d65` `docs: record the review route of the manage scm integrations change` (`route.json` unedited). `make verify` run 1 on this tree failed in `access-requirements.test.ts` (see "Checks"), so:
- `cb7cbbcb` `test: list the scm integration operations among the served control-plane operations` changes the diff, so `route.json` was deleted and routed again, as protocol worker step 4 requires:
- `06851a35` `docs: route the manage scm integrations change again after the access requirements test fix` (`route.json` unedited, same recommendation): the tree `ec677ca1` that `make verify` run 2 checked; the commit after it adds this record and the `make record` output and is the head for review pass 1 (`37aaf861`).
- Pass 1 fix round: `c9ed4062` `docs: record review pass 1 of the manage scm integrations change` (its `passes.jsonl` line and four findings, recorded before any fix); `4e569972` `chore: name the scm setting or secret at fault when the schema refuses an integration body` (finding 1); `88d2698d` `chore: bound the stored scm integration origin port to 65535` (finding 2); `444e9878` `test: run one scm integrations store conformance suite against the postgresql and in-memory adapters` (finding 3); `b3a15bee` `chore: let only an app composition root import a plugin package` (coordinator condition Q4); `839758ff` `docs: specify the schema refusal names, the origin port bound, the store conformance suite, and the coordinator decisions of the manage scm integrations change`; the next commit, `docs: record the pass 1 fix round of the manage scm integrations change`, fixes finding 4 in this record and is the tree that the round's `make verify` checks. `route.json` is not routed again: later passes never route.
- Pass 2 fix round: `b96f89af` `docs: record review pass 2 of the manage scm integrations change` (its `passes.jsonl` line and eight findings, recorded before any fix); `d0c51844` `chore: read scm integrations read-only, recover a broken secret, report unverifiable integrations, require an rsa app key, and bound stored secrets` (findings 1 to 4 and 6 to 8, with their tests); `cb4ea8b4` `docs: describe the pass 2 fixes of the manage scm integrations change and the audit events of 11b` (finding 5, the design, the source control contract, the `scm-port` scenario, and the G3 plan note); the next commit records the round and is the tree that the round's `make verify` checks.

## Environment

Native Ubuntu host `hpz600`, Linux 6.8.0-147-generic x86_64. `make verify`, `make dependency-inventory`, and every focused run before review pass 1 ran with Node.js v24.22.1, the `.nvmrc` pin that `scripts/with-pinned-node.sh` selects; the focused PostgreSQL runs used `scripts/services.sh run taskelith-zaki20f-verify` under `scripts/docker-slot.ts`.

## Author self-check

- Scope: only the brief's ten points. `git diff 4b89aa6e 90ef6d65 --shortstat` without `package-lock.json`, `docs/dependencies/`, and `openspec/`: 52 files, 1726 insertions, 140 deletions, within the size guard of about 60 files and 5000 lines; with them: 66 files, 2206 insertions, 142 deletions. `git diff 4b89aa6e -- packages/contracts` is empty: no operation, response, or schema changed. The receiver's module code (`webhook-receiver.ts`) is unchanged; only the composition's verifiers, decoy, and eventless rule are replaced.
- Proposed names (scope point 2, design decision 2): settings `app-id`, `installation-id`, `merge-methods`; secrets `private-key`, `webhook-secret`.
- Order and roles: the server checks `ACCESS_REQUIREMENTS`, unchanged, before the body; the HTTP test shows 403 `role-required` for a principal without `installation-owner` on create and update, 403 `csrf-token-invalid` for a browser without the header, and 401 without a credential.
- Compare-and-set: `packages/adapters/postgres/test/scm-integrations.integration.test.ts` holds two updates after their reads until both arrive and sees one win, one `conflict`, and at least three transaction attempts; `apps/control-plane/test/scm-integration-routes.test.ts` sends two concurrent `PATCH` requests and sees 200 and 409 and the revision moved once.
- Secrets: sealed with AES-256-GCM through `scmSecretCipher` under `scm-integration-secrets.key`, a file of its own (`SCM_INTEGRATION_SECRET_KEY_FILE` differs from `SLOT_CREDENTIAL_KEY_FILE`, which the key file test asserts); the authenticated data binds the integration, the name, and the revision, and the store test shows a ciphertext of an earlier revision put back fails with `internal` naming only the secret. The route test checks that no answer or request log line holds the webhook secret, the rotated secret, or a line of the private key, also for refused bodies.
- Plugin facts: `grep -rn "x-hub-signature-256\|x-github-event\|GITHUB_EVENTLESS_EVENTS" apps/control-plane/src` finds nothing; the decoy and the eventless set live in `packages/plugins/scm-github/src/webhook-verifier.ts`, and the decoy shares the verifier's signature check. `scm-webhook-decoy.test.ts` keeps its five signature cases against the plugin's decoy.
- Hexagonal boundaries: the module's ports, domain, and application name no SCM; `npm run check:boundaries` passed. `@taskelith/scm-github` moves from a development to a runtime dependency of `@taskelith/control-plane`; `make dependency-inventory` reported `Generated 927 package paths; 70 with license coverage gaps (all reviewed; 4 declaration-only)`, and only `docs/dependencies/licenses.json` changed by one line.
- Test edits outside the new files: `api-server.test.ts` adds `scmIntegrations` to its stub services; the receiver and decoy tests take the plugin's decoy and eventless rule and an inline verifier map instead of the removed composition classes; the migration tests add the new migration to their lists and tables and remove it from copies that hold back the project setup migration; `access-requirements.test.ts` lists the four operations among the served ones (`cb7cbbcb`, after `make verify` run 1); the plugin SDK tests move to `0.4.0`; the administration test checks the new key at initialization.
- Requirement texts, counted as the characters of the requirement's text: `scm-port` "SCM plugin descriptor" 410, "SCM integration management" 465, "Store-backed webhook verifiers" 307; `control-plane-api` "SCM integration operations" 438, "No SCM secret in answers or logs" 169, "SCM integration secret key at initialization" 338, "GitHub webhook composition" (MODIFIED, with both former scenarios kept) 439; `postgres-state` "SCM integration storage" 426, "Sealed SCM secrets" 309; `plugin-registration` (MODIFIED, every scenario kept) "Compatible plugin API only" 290, "Frozen port types from the plugin SDK" 415, "Draft SCM port from the plugin SDK" 461.
- Commit types: no code of this change is in the published `taskelith` package's `src/`; the commits use `chore` and `docs`.
- Comments: `npm run verify:comments`: `Every comment is within the comment length rule.` No AI attribution in commits. Only synthetic secrets and per-run generated keys are used.

## Fail-before

### Historical test-first evidence (before review pass 1)

Pass 1 finding 4 noted that most of these runs stopped at a missing export while loading, so they show that the API was absent, not that each behavior's assertion failed; the behavior negative controls of the pass 1 fix round below close that gap.

Each group's tests were written before its implementation and run with `node --experimental-strip-types --test` after `npm run build`.

- Module (`385cd38f`): `packages/modules/integrations/test/scm-integration-service.test.ts` failed to load with `SyntaxError: The requested module '@taskelith/integrations' does not provide an export named 'InMemoryScmIntegrations'` (tests 1, fail 1). After the implementation, and one fix of the test's own 300-character host arithmetic: 11 of 11 pass.
- Plugin API and descriptor (`27cfc5b0`): the plugin SDK tests and the new `packages/plugins/scm-github/test/github-integration-plugin.test.ts` gave tests 19, pass 15, fail 4: "plugin API 0.4.0 carries version 1.0.0 of the SDLC framework port", "a plugin whose plugin API range excludes this SDK is rejected before admission", "a plugin built for plugin API 0.3.0, before the draft SCM plugin descriptor, is rejected", and the new file (`does not provide an export named 'githubSourceControlPlugin'`). A build with the SDK at `0.4.0` and the GitHub plugin's index not yet compiling also failed the unchanged `test/plugin-manifests.test.ts` and the plugin's manifest tests, which pass with both manifests at `^0.4.0`. After the implementation: the plugin SDK, `scm-github`, `sdlc-openspec`, and manifest tests pass, 127 of 127.
- Adapters (`fa95a6ad`): with the new source and migration files stashed and the tests kept, the cipher, key file, store, and migration tests gave tests 46, pass 31, fail 15: the three new files failed to load (`SCM_SECRET_KEY_BYTES`, `SCM_INTEGRATION_SECRET_KEY_FILE`, `PostgresScmIntegrations` not exported), and twelve migration tests failed on the missing migration. Restored: 52 of 52 pass.
- Control plane (`a91ec9a9`): with `apps/control-plane/src` stashed and the tests kept, `scm-integration-routes.test.ts` and `scm-integration-start.test.ts` failed to load (`scmIntegrationServices`, `startScmIntegrationServices` not exported), and `administration.integration.test.ts` failed "initialization, enrollment, rotation, revocation, and the operator reset work end to end" on the missing key and, as a consequence of the shared database that the first test leaves behind, "the owner exists from initialization, and only its credential manages principals and roles" (tests 10, pass 6, fail 4). Restored, with the receiver, decoy, API server, and module tests: 186 of 186 pass.

### Pass 1 fix round: failing before, passing after

Focused runs of the fix round used `node --experimental-strip-types --test` after `npm run build`: the finding 1 route runs and the boundary runs with Node.js v24.22.0 of the shell; the negative controls and every PostgreSQL run with the pinned v24.22.1 through `scripts/with-pinned-node.sh`, the PostgreSQL ones also under `scripts/docker-slot.ts` and `scripts/services.sh run taskelith-zaki20f-fix1`.

- Finding 1: the new route test "a body that the schema refuses names the setting or secret at fault on create and update, never its value", written first, failed (tests 1, pass 0, fail 1): `actual: [ 400, 'invalid', undefined ]`, `expected: [ 400, 'invalid', 'Bad Name' ]`. After `4e569972`: `scm-integration-routes.test.ts` and `api-server.test.ts` 32 of 32 pass.
- Finding 2: three port cases and an accepted `:65535` were added to "the SCM integrations migration checks its values and its down migration removes its tables" first; against the unchanged migration it failed (tests 1, pass 0, fail 1) with `AssertionError [ERR_ASSERTION]: Missing expected rejection.` After `88d2698d`: the migration and store tests 48 of 48 pass.
- Coordinator condition Q4 (only a composition root imports a plugin): with a temporary probe `import { githubSourceControlPlugin } from '@taskelith/scm-github';` at the top of `apps/control-plane/src/api/routes.ts`, `npm run check:boundaries` printed `Workspace and hexagonal boundary checks passed.` (exit 0), so the rule was not enforced. The new test "only an app composition root imports a plugin package, so no module, adapter, handler, or API file names a plugin" failed first (tests 1, pass 0, fail 1). With the rule of `b3a15bee` and the probe still in place, `npm run check:boundaries` exited 1 with `Boundary violation: apps/control-plane/src/api/routes.ts: only an app composition root can import plugin "@taskelith/scm-github" (microkernel)`. Probe removed: `Workspace and hexagonal boundary checks passed.`, and `test/check-boundaries.test.ts` 14 of 14 pass; the worker-only fixture, whose adapter imports a plugin only to build a worker-only chain, now also expects that one violation.
- Findings 3 and 4, behavior negative controls: each control applied one mutation to the committed implementation at `444e9878`, rebuilt, ran the named tests, and restored the file; `git status` afterwards showed no source change. Every control failed the assertions of the behavior it breaks; unmutated, the same tests pass (the in-memory conformance suite 5 of 5 and the PostgreSQL store file 9 of 9, also after `444e9878`).

| Control | Mutation | Tests run | Result with the mutation |
| --- | --- | --- | --- |
| Default port | `normalized-origin.ts`: `match[2] ?? DEFAULT_HTTPS_PORT` becomes `match[2] ?? 0` | `scm-integration-service.test.ts` | tests 11, fail 2: "an origin is normalized to https, a lower-case host, and an explicit port", "a created integration starts at revision 1 and shows its secrets only by name" |
| Lower-case host | `normalized-origin.ts`: `ORIGIN.exec(origin.toLowerCase())` becomes `ORIGIN.exec(origin)` | `scm-integration-service.test.ts` | tests 11, fail 9, the normalization test first |
| IPv6 literal | `normalized-origin.ts`: the host pattern also admits `[` hex digits and colons `]` | `scm-integration-service.test.ts` | tests 11, fail 2: the normalization test, "an update checks what it changes and refuses an unknown integration with not-found" |
| In-memory settings whole | `in-memory-scm-integrations.ts`: an update merges the settings into the stored ones | in-memory conformance, service test | tests 16, fail 1: "in-memory SCM integrations: an update replaces the settings whole and only the named secrets, ..." |
| In-memory named secrets | `in-memory-scm-integrations.ts`: `stored.secrets.replacedBy(replacements)` becomes `replacements` | in-memory conformance, service test | tests 16, fail 2: that conformance case and "an update replaces the settings, replaces only the named secrets, and moves the revision" |
| In-memory compare-and-set | `in-memory-scm-integrations.ts`: the revision check never refuses | in-memory conformance | tests 5, fail 1: "in-memory SCM integrations: a stale revision fails with conflict, and of two concurrent updates at one revision exactly one wins" |
| PostgreSQL named secrets | `postgres/src/scm-integrations.ts`: `kept.value.replacedBy(change.secrets)` becomes `change.secrets` | `scm-integrations.integration.test.ts` | tests 9, fail 2: "PostgreSQL SCM integrations: an update replaces the settings whole and only the named secrets, ...", "an update replaces the named secrets, re-seals the others under the new revision, and fails at a stale one" |
| Sealing context | `postgres/src/scm-integrations.ts`: the authenticated data omits the revision | `scm-integrations.integration.test.ts` | tests 9, fail 1: "a sealed secret put back from an earlier revision no longer opens" |
| Verifier cache | `stored-integration-verifiers.ts`: a cached verifier is reused whatever the revision | service test, route test | tests 20, fail 2: "a stored integration verifies its webhooks, and a changed webhook secret applies to the next delivery", "stored verifiers serve the integration plugin, cached by revision, and none for an unknown integration" |
| HTTP 409 | `routes.ts`: `updateScmIntegration` loses `conflict: 409` | route test | tests 9, fail 2: "an update replaces the settings and the named secrets, and a stale revision answers 409", "of two concurrent updates at one revision exactly one wins and the other answers 409" |
| Plugin settings check | `github-plugin.ts`: an unknown setting is no longer refused | plugin test, route test | tests 16, fail 2: "the settings check names an unknown, missing, or invalid setting and never quotes a value", "an unknown plugin answers 404, and a bad origin, setting, or secret 400 naming it but never its value" |
| No secret in JSON | `scm-integration.ts`: `ScmSecrets.toJSON` returns the values | service test | tests 11, fail 1: "secrets never show their values in a string, JSON, or inspection" |
| Key at start | `composition/scm-integrations.ts`: a missing key falls back to a random one | `scm-integration-start.test.ts` | tests 3, fail 1: "a missing SCM secret key refuses the start and names init, which creates it" |

### Pass 2 fixes for the architect check

Pass 2 reported only Low findings, so the review ended and these fixes are `fixed-unreviewed`: no later pass reviewed them, and the coordinator checks them as solution architect (`/docs/governance.md`, "Architect check of unreviewed fixes"). Each behavior test was written first and run against the unchanged implementation; the module, plugin, and route tests with `node --experimental-strip-types --test` after `npm run build`, and the PostgreSQL ones under `scripts/docker-slot.ts` and `scripts/services.sh run taskelith-zaki20f-fix2`, all with the pinned Node.js v24.22.1 through `scripts/with-pinned-node.sh`.

- Before (`b96f89af` with the tests added): the module, plugin, and route files gave tests 37, pass 32, fail 5; the PostgreSQL store file gave tests 12, pass 9, fail 3.
- After (`d0c51844`): the service, conformance, plugin, route, start, receiver, and decoy tests 64 of 64 pass; the PostgreSQL store and webhook delivery files 15 of 15 pass; `tsc -p tsconfig.check.json --noEmit`, `npm run verify:comments`, and `npm run check:boundaries` pass.

| Finding | Fix | Test, failing before |
| --- | --- | --- |
| 1, reads in SERIALIZABLE | `packages/adapters/postgres/src/scm-integrations.ts`: `get`, `page`, and `configurationOf` run in `PostgresDatabase.readOnly` | "reads run in read-only transactions and only changes in read-write ones": `actual` five `read-write`, `expected` `read-only` for the three reads |
| 2, update opens every secret | same file: `update` opens only the secrets it keeps (`#opened` takes the wanted names) | "a secret that no longer opens can be replaced, though an update that keeps it still fails": `expected success, got {"code":"internal",...,"details":{"setting":"signing-key"}}` |
| 3, silent unverifiable integration | `packages/modules/integrations/src/application/stored-integration-verifiers.ts`: reports `plugin-missing` or `provider-refused` once per integration and revision through the new port `UnverifiableIntegrations` (`ports/scm-integrations.ts`) and caches the miss; `apps/control-plane/src/composition/scm-integrations.ts` logs it as the warning `scm.integration.unverifiable` with no value, and the composition passes its logger | module: "stored verifiers report once per revision an integration that cannot verify, never with a value" (`actual: []`); route file: "the composition logs an integration that cannot verify its webhooks, without a secret" (`actual: []`) |
| 4, non-RSA private key | `packages/plugins/scm-github/src/github-plugin.ts`: `isRsaPrivateKey` requires `asymmetricKeyType === 'rsa'` | "the secret check refuses a private key that is not RSA without quoting it", with EC P-256 and Ed25519 keys generated at test time: `expected a failure` |
| 5, wire wording | `docs/contracts/control-plane-wire-contracts.md` section 4: `details.field` `allowedOrigin` for an origin, `details.setting` for a setting or secret | docs only |
| 6, undefined change field | `changedConfiguration` in `packages/modules/integrations/src/ports/scm-integrations.ts` keeps a field that is absent or `undefined` | conformance "a change field that is present but undefined keeps the stored value": in memory, `got` an integration without label, origin, or settings; PostgreSQL, `null value in column "label" ... violates not-null constraint` |
| 7, secrets past 32 | `packages/modules/integrations/src/application/scm-integration-service.ts`: `secretPastLimit` refuses the first added secret beyond `MAX_SCM_SECRETS` (32, `domain/scm-integration.ts`) with `invalid` naming it; the wire contract states it | "an update refuses a secret that would take the integration past 32 secrets and names it", with a plugin that accepts any name: `expected a failure` |
| 8, duplicated merge | both stores (`in-memory-scm-integrations.ts`, postgres `scm-integrations.ts`) apply a change through `changedConfiguration` | refactoring: the conformance suite, now six cases, passes for both stores |

Also in the round: `docs/g3-plan.md` item 11 says that 11b carries the audit events for an SCM integration's creation, update, and secret change (coordinator decision, 2026-11-03); the design states the read-only reads, the recovery, the report, the RSA key, and the bound; `docs/contracts/source-control.md` section 6.1 and the `scm-port` scenario "GitHub secrets" name the RSA key. No OpenAPI document, schema, or 20e receiver answer changed.

Architect check (coordinator): pending.

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `env -u NODE_ENV make verify` (run 1) | `90ef6d65`, clean | Failed, profile full (`apps/control-plane/package.json changed`): tests 4402, pass 4354, fail 1, skipped 47. The one failure was this change's: `apps/control-plane/test/access-requirements.test.ts` "a served operation of the control-plane document accepts the schemes the document declares, and only login is browser-only" listed the served operations without the four new routes (`createScmIntegration`, `listScmIntegrations`, `readScmIntegration` appeared as unexpected). Fixed in `cb7cbbcb`; no known flake failed |
| `env -u NODE_ENV make verify` (run 2) | `06851a35`, tree `ec677ca1`, clean | Passed, profile full, stamp written: tests 4402, suites 49, pass 4355, fail 0, cancelled 0, skipped 47; all files 99.38 % lines, 92.71 % branches, 98.88 % functions; new files 100 % lines and functions each, branches: `scm-integration-api.js` 83.33 %, control-plane `scm-integrations.js` 84.62 %, postgres `scm-integrations.js` 91.84 %, `in-memory-scm-integrations.js` 88.89 %, `scm-integration-service.js` 93.94 %, `stored-integration-verifiers.js` 86.67 %, `github-plugin.js` 95.65 %, `normalized-origin.js`, `scm-integration.js`, `scm-secret-cipher.js`, `scm-integration-secret-key.js` 100 %. No known flake failed |
| `env -u NODE_ENV make verify` (pass 1 fix round, run 1) | `62a560d9`, tree `a34946f2`, clean | Passed, profile full (`apps/control-plane/package.json changed`), stamp written: tests 4413, suites 49, pass 4366, fail 0, cancelled 0, skipped 47; all files 99.39 % lines, 92.73 % branches, 98.89 % functions; changed files: `api-server.js` 99.17 % lines, 92.38 % branches, `routes.js` and `in-memory-scm-integrations.js` 100 % each, `scm-integrations-conformance.js` 100 % lines and functions, 80 % branches. No known flake failed; no rerun |
| `env -u NODE_ENV make verify` (pass 2 fix round, run 1) | `10b8c383`, tree `92d14252`, clean | Passed, profile full, stamp written: tests 4421, suites 49, pass 4374, fail 0, cancelled 0, skipped 47; all files 99.39 % lines, 92.76 % branches, 98.91 % functions; changed files 100 % lines and functions each, branches: postgres `scm-integrations.js` 98.18 %, `stored-integration-verifiers.js` 89.47 %, `scm-integration-service.js` 94.37 %, `in-memory-scm-integrations.js` and control-plane `scm-integrations.js` 100 %, `github-plugin.js` 95.65 %. No known flake failed; no rerun |
| `npm run openspec -- validate manage-scm-integrations --strict` | `33212169` | `Change 'manage-scm-integrations' is valid` |
| `npm run verify:archive`, inside run 2 | tree `ec677ca1` | `Every active OpenSpec change archives into strictly valid specs.`: the archive of this change, tried in a temporary copy |

### Route

Route (`route.json`, rule version 5): elevated (lines, files, capabilities, security, contracts, size); pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-fable-5-1#high`, pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding; the shadow router `jev-1.14.0` agrees. Reviews run at effort medium, owner decision 2026-11-02, although `route.json` recommends high for passes 1 and 2. The coordinator assigns the reviewers.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `92d14252f30e36fd7be5ac40abd432b9995f0c53`; tests 4421, pass 4374, fail 0, skipped 47; all files 99.39% lines, 92.76% branches, 98.91% functions.
- `npm run openspec -- validate manage-scm-integrations --strict`: passed, `Change 'manage-scm-integrations' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 105 file(s); every pass summary file is valid: 85 file(s); every route file is valid: 38 file(s).`.
- Spec diff against the merge base `4b89aa6ec578` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a1a04c-b762-7452-8a9c-a3856c97fce8` | 0 | 0 | 4 | 0 |
| 2 | B | `claude claude-fable-5-1#medium` | `2f6c7103-d8f0-4ccb-89f2-680d0f76d16e` | 0 | 0 | 0 | 8 |
<!-- make record: end -->

## Independent review

### Pass 1 (role A)

- Reviewer: Codex CLI `gpt-6-astra`, effort `medium` (`codex gpt-6-astra#medium`), assigned by the coordinator; `route.json` recommends `high`, and the authorized `medium` applies (owner decision 2026-11-02).
- Invocation, through `make review CHANGE=manage-scm-integrations PASS=1`: `codex exec -m gpt-6-astra -c model_reasoning_effort="medium" -s read-only -C <worktree> -`, environment `PATH HOME USER LANG TERM`, started 2026-11-03T07:25:44Z at head `37aaf861`; the route gate reported that `route.json` was made for this tree.
- Confirmation: model `gpt-6-astra`, effort `medium`, sandbox `read-only` reported in the header; session `01a1a04c-b762-7452-8a9c-a3856c97fce8`; exit 0.
- Snapshot before and after: both `ddecfc033e26015f7ecf3aaecf594aedb9a50979cc0cab41d4b47eb53e716f37`, unchanged, taken by the worker Zaki; the reviewer reported that it modified no file.
- Counts: Critical 0, High 0, Medium 4, Low 0, as in `passes.jsonl`. The report file holds the report twice, with the same four findings and counts.
- Findings, recorded before any fix (`findings.jsonl`):
  1. Medium, `contract-drift`: schema failures of settings and secrets answer 400 without `details.setting`.
  2. Medium, `contract-drift`: the migration's origin check admits ports above 65535.
  3. Medium, `missing-fail-before-test`: no shared store conformance suite for both adapters.
  4. Medium, `missing-fail-before-test`: most fail-before runs stopped at missing exports.
- Resolutions (`findings.jsonl`, all `fixed`, for pass 2 to check):
  1. Fixed in `4e569972`: the API server checks each entry of `settings` and `secrets` alone against `ScmSettings` or `ScmSecrets` and names the first refused one in `details.setting` (`apps/control-plane/src/api/api-server.ts`, `settingAtFault`; route flag `settingMaps`), with POST and PATCH tests for a bad name, an empty secret, and values that are no string.
  2. Fixed in `88d2698d`: the migration's port pattern is that of `NormalizedOrigin`, 1 to 65535; the migration test refuses `0`, `65536`, and `99999` and accepts `65535`.
  3. Fixed in `444e9878`: `SCM_INTEGRATIONS_CONFORMANCE` runs against `InMemoryScmIntegrations` (`packages/modules/integrations/test/scm-integrations-conformance.test.ts`) and `PostgresScmIntegrations`; the PostgreSQL-only pages test that the suite replaces is removed, and the sealing and overlap tests stay.
  4. Fixed in this record: "Pass 1 fix round: failing before, passing after" gives behavior negative controls that run the assertions, apart from the historical test-first evidence.
- Coordinator decisions applied in the same round (Niki, 2026-11-03): Q1, audit events for an integration's creation, update, and secret change are a named follow-up in the scope of 11b (proposal, design non-goals and risks); Q2, the single registered SCM plugin's decoy and eventless rule, and Q3, `SOURCE_CONTROL_PORT_VERSION` stays `0.2.0`, are accepted and stated in design decision 7 and the risks; Q4, only a composition root imports a plugin package, enforced by `npm run check:boundaries` (`b3a15bee`, evidence above).
- Pass 2 checked every pass 1 fix and coordinator decision and found them in place, so the four pass 1 findings stay `fixed`.

### Pass 2 (role B)

- Reviewer: Claude Code `claude-fable-5-1`, effort `medium` (`claude claude-fable-5-1#medium`), assigned by the coordinator; `route.json` recommends `high`, and the authorized `medium` applies (owner decision 2026-11-02).
- Invocation, through `make review CHANGE=manage-scm-integrations PASS=2`: `claude -p --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format stream-json --verbose -- <prompt>`, environment `PATH HOME USER LANG TERM`, started 2026-11-03T08:00:47Z at head `d24a5051`.
- Confirmation: model `claude-fable-5-1` reported; session `2f6c7103-d8f0-4ccb-89f2-680d0f76d16e`; exit 0.
- Snapshot before and after: both `8a1038a2f8e0df48adc0cc0586f1eeb8a8e5bee2b4c4872cd2694ee811e08284`, unchanged, taken by the worker Zaki; the reviewer reported that it modified no file.
- Counts: Critical 0, High 0, Medium 0, Low 8, as in `passes.jsonl`. A Low-only pass ends the review: the fixes go in without another pass, as `fixed-unreviewed`, for the coordinator's architect check.
- Findings, recorded before any fix (`findings.jsonl`, each missed by pass 1, role A):
  1. Low, `concurrency-race`: the store's reads run in read-write SERIALIZABLE transactions.
  2. Low, `error-handling`: an update opens every stored secret, also those it replaces.
  3. Low, `error-handling`: stored verifiers drop a missing plugin or a failed build silently.
  4. Low, `contract-drift`: the GitHub `private-key` check accepts keys that are not RSA.
  5. Low, `docs`: the wire contract reads as if `details.setting` also names a refused origin.
  6. Low, `contract-drift`: an optional change field present but `undefined` overwrites the stored value.
  7. Low, `contract-drift`: updates can grow the secret names past the response schema's 32.
  8. Low, `contract-drift`: both adapters duplicate how a change merges over the current integration.
- Resolutions (`findings.jsonl`, all `fixed-unreviewed`): findings 1 to 4 and 6 to 8 in `d0c51844`, finding 5 in `cb4ea8b4`; "Pass 2 fixes for the architect check" gives each fix and its failing-first test. None was declined or deferred, and none needed an OpenAPI or receiver change.

## Limitations

- The composition registers one SCM plugin, GitHub, whose decoy and eventless rule serve every integration (design, Risks); the coordinator accepted it (Niki, 2026-11-03).
- No audit event records an integration's creation, update, or secret change: a named follow-up in the scope of 11b (coordinator decision, Niki, 2026-11-03).
- Settings are stored as `jsonb`, which cannot hold a NUL; the GitHub plugin refuses one first.
- No live GitHub was called; the plugin's provider is exercised against the emulator and synthetic signatures.

## Remaining gates

- The coordinator's architect check of the pass 2 fixes (the review ended after the Low-only pass 2).
- The archive of the change in the last commit of the branch.
- Integration into dev by the coordinator (single pull request).
