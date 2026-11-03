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
- `06851a35` `docs: route the manage scm integrations change again after the access requirements test fix` (`route.json` unedited, same recommendation): the tree `ec677ca1` that `make verify` run 2 checked; the commit after it adds this record and the `make record` output and is the head for review pass 1.

## Environment

Native Ubuntu host `hpz600`, Linux 6.8.0-147-generic x86_64. `make verify`, `make dependency-inventory`, and every focused run ran with Node.js v24.22.1, the `.nvmrc` pin that `scripts/with-pinned-node.sh` selects; the focused PostgreSQL runs used `scripts/services.sh run taskelith-zaki20f-verify` under `scripts/docker-slot.ts`.

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

Each group's tests were written before its implementation and run with `node --experimental-strip-types --test` after `npm run build`.

- Module (`385cd38f`): `packages/modules/integrations/test/scm-integration-service.test.ts` failed to load with `SyntaxError: The requested module '@taskelith/integrations' does not provide an export named 'InMemoryScmIntegrations'` (tests 1, fail 1). After the implementation, and one fix of the test's own 300-character host arithmetic: 11 of 11 pass.
- Plugin API and descriptor (`27cfc5b0`): the plugin SDK tests and the new `packages/plugins/scm-github/test/github-integration-plugin.test.ts` gave tests 19, pass 15, fail 4: "plugin API 0.4.0 carries version 1.0.0 of the SDLC framework port", "a plugin whose plugin API range excludes this SDK is rejected before admission", "a plugin built for plugin API 0.3.0, before the draft SCM plugin descriptor, is rejected", and the new file (`does not provide an export named 'githubSourceControlPlugin'`). A build with the SDK at `0.4.0` and the GitHub plugin's index not yet compiling also failed the unchanged `test/plugin-manifests.test.ts` and the plugin's manifest tests, which pass with both manifests at `^0.4.0`. After the implementation: the plugin SDK, `scm-github`, `sdlc-openspec`, and manifest tests pass, 127 of 127.
- Adapters (`fa95a6ad`): with the new source and migration files stashed and the tests kept, the cipher, key file, store, and migration tests gave tests 46, pass 31, fail 15: the three new files failed to load (`SCM_SECRET_KEY_BYTES`, `SCM_INTEGRATION_SECRET_KEY_FILE`, `PostgresScmIntegrations` not exported), and twelve migration tests failed on the missing migration. Restored: 52 of 52 pass.
- Control plane (`a91ec9a9`): with `apps/control-plane/src` stashed and the tests kept, `scm-integration-routes.test.ts` and `scm-integration-start.test.ts` failed to load (`scmIntegrationServices`, `startScmIntegrationServices` not exported), and `administration.integration.test.ts` failed "initialization, enrollment, rotation, revocation, and the operator reset work end to end" on the missing key and, as a consequence of the shared database that the first test leaves behind, "the owner exists from initialization, and only its credential manages principals and roles" (tests 10, pass 6, fail 4). Restored, with the receiver, decoy, API server, and module tests: 186 of 186 pass.

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `env -u NODE_ENV make verify` (run 1) | `90ef6d65`, clean | Failed, profile full (`apps/control-plane/package.json changed`): tests 4402, pass 4354, fail 1, skipped 47. The one failure was this change's: `apps/control-plane/test/access-requirements.test.ts` "a served operation of the control-plane document accepts the schemes the document declares, and only login is browser-only" listed the served operations without the four new routes (`createScmIntegration`, `listScmIntegrations`, `readScmIntegration` appeared as unexpected). Fixed in `cb7cbbcb`; no known flake failed |
| `env -u NODE_ENV make verify` (run 2) | `06851a35`, tree `ec677ca1`, clean | Passed, profile full, stamp written: tests 4402, suites 49, pass 4355, fail 0, cancelled 0, skipped 47; all files 99.38 % lines, 92.71 % branches, 98.88 % functions; new files 100 % lines and functions each, branches: `scm-integration-api.js` 83.33 %, control-plane `scm-integrations.js` 84.62 %, postgres `scm-integrations.js` 91.84 %, `in-memory-scm-integrations.js` 88.89 %, `scm-integration-service.js` 93.94 %, `stored-integration-verifiers.js` 86.67 %, `github-plugin.js` 95.65 %, `normalized-origin.js`, `scm-integration.js`, `scm-secret-cipher.js`, `scm-integration-secret-key.js` 100 %. No known flake failed |
| `npm run openspec -- validate manage-scm-integrations --strict` | `33212169` | `Change 'manage-scm-integrations' is valid` |
| `npm run verify:archive`, inside run 2 | tree `ec677ca1` | `Every active OpenSpec change archives into strictly valid specs.`: the archive of this change, tried in a temporary copy |

### Route

Route (`route.json`, rule version 5): elevated (lines, files, capabilities, security, contracts, size); pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-fable-5-1#high`, pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding; the shadow router `jev-1.14.0` agrees. Reviews run at effort medium, owner decision 2026-11-02, although `route.json` recommends high for passes 1 and 2. The coordinator assigns the reviewers.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `ec677ca18d85d084b453121954e989862c291e30`; tests 4402, pass 4355, fail 0, skipped 47; all files 99.38% lines, 92.71% branches, 98.88% functions.
- `npm run openspec -- validate manage-scm-integrations --strict`: passed, `Change 'manage-scm-integrations' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 105 file(s); every pass summary file is valid: 85 file(s); every route file is valid: 38 file(s).`.
- Spec diff against the merge base `4b89aa6ec578` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

Not yet run: the worker Zaki runs the passes and records them here, in `passes.jsonl`, and in `findings.jsonl`.

## Limitations

- The composition registers one SCM plugin, GitHub, whose decoy and eventless rule serve every integration (design, Risks).
- No audit event records an integration's creation or change.
- Settings are stored as `jsonb`, which cannot hold a NUL; the GitHub plugin refuses one first.
- No live GitHub was called; the plugin's provider is exercised against the emulator and synthetic signatures.

## Remaining gates

- Independent review passes 1 to 3 as the coordinator assigns them, and their fix rounds.
- The archive of the change in the last commit of the branch.
- Integration into dev by the coordinator (single pull request).
