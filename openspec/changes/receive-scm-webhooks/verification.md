# Verification: receive-scm-webhooks

## Scope and source

G3 plan item 20 (`docs/g3-plan.md`, row 20), sub-change 20e, developed by a briefed subagent for the worker Zaki from `dev` `a21913f1` (#426): the handler of the existing `receiveScmWebhook` operation (control-plane wire contracts section 5), its 25 MiB raw body limit (Q2), one identical 401 for every unauthenticated case, 400 for an unparseable verified payload, deduplication by the verified `deliveryId` per integration under concurrency, the read port `ScmIntegrationVerifiers` with an in-memory adapter (Q1), migration `1792933700000`, request logs under section 7, and the contract and spec updates. The coordinator's decisions in force come from the brief: the SCM port stays draft; verification is the plugin's `verifyWebhookDelivery` over the raw bytes with lower-case header names; a verified ping and `installation` or `installation_repositories` delivery answers 2xx without the port's event; `X-GitHub-Delivery` stays a string; credential state stays in memory. Excluded: SCM integration CRUD and secret storage, 20d live conformance, event consumers (items 23 and the board), ingress and TLS (items 26 and 37), and changes to `verifyWebhookDelivery`.

## Revision

- Base: `dev` `a21913f1`; the brief's checklist was saved with `--at a21913f13672d87306b86b8f26cf474ef8264bba --size M`.
- `5eab931f` `chore: add webhook receipt ports and the SCM webhook receiver to the integrations module`.
- `3274d5e9` `chore: record SCM webhook deliveries once per integration and delivery identifier` (migration, repository, migration and concurrency tests).
- `dbfbf3fd` `chore: serve the SCM webhook receiver with a 25 MiB raw body limit` (route, raw body read, handler, composition, HTTP and plugin tests, lockfile, and the regenerated inventory).
- `5e63d8a6` `docs: specify the receive scm webhooks change and update the contracts`.
- `22ce7cc4` `docs: record the review route of the receive scm webhooks change` (`route.json` unedited): the tree that `make verify` checked; the commit after it adds this record and the `make record` output and is the head for review pass 1.

## Environment

Native Ubuntu host `hpz600`, Linux 6.8.0-147-generic x86_64. `make verify` and `make dependency-inventory` ran with Node.js v24.22.1, the `.nvmrc` pin; the focused runs below ran with Node.js v24.22.0 from `nvm use`, against services of `make services-up` for the PostgreSQL tests.

## Author self-check

- Scope: only the brief's nine points. `git diff a21913f1 --shortstat` without `package-lock.json`, `docs/dependencies/`, and `openspec/`: 28 files, 715 insertions, 31 deletions; with them: 42 files, 1104 insertions, 32 deletions. No OpenAPI, AsyncAPI, or schema change, no new or changed response, no change of `verifyWebhookDelivery` or the draft port (`git diff a21913f1 -- packages/contracts packages/plugins/scm-github/src packages/modules/integrations/src/ports/source-control.ts` is empty).
- Order (checklist `contract-drift`): the route's `signedBodyLimit` makes the server read the body as bytes up to 25 MiB before the handler runs, and answer 413 with reason `body-too-large` beyond it; the receiver verifies before anything reads the payload, and only the receiver's JSON object check (design decision 4) parses, after a verification that failed with `invalid`. The HTTP test shows the oversized body never reaches the verifier and a body of exactly 25 MiB is read and accepted.
- One refusal (checklist `error-handling`): the HTTP test sends a known integration's signed delivery to an unknown identifier, to `%ZZ`, to a 129-character identifier, and to `caf%C3%A9`, and without a signature, with another secret, and with a changed body to the known integration; all seven answers are 401 with the identical body text. The module test shows the decoy verified each delivery of an unknown or invalid integration and that an invalid identifier is never looked up. No timing is asserted.
- Hexagonal boundaries: the module's ports and use case name no SCM; GitHub appears only in the composition's tests and the plugin's own test. `npm run check:boundaries`: `Workspace and hexagonal boundary checks passed.`
- Dependencies: `@taskelith/integrations` becomes a dependency of `@taskelith/postgres` and `@taskelith/control-plane`, `@taskelith/scm-github` a development dependency of `@taskelith/control-plane`; no third-party package changed. `make dependency-inventory` reported `Generated 927 package paths; 70 with license coverage gaps (all reviewed; 4 declaration-only)`.
- Test edits outside the new files: `access-requirements.test.ts` reads an empty `security` array as the scheme `none`, which the document's `security: []` means, and lists `receiveScmWebhook` among the served control-plane operations; `api-server.test.ts` adds `scmWebhooks` to its stub services; the migration tests add the new migration to their lists and the table to the schema list, and the stored-at test removes the new migration from its copy as it does the stored-at one.
- Requirement texts: `scm-port` "Webhook receipt ports" 346 characters, "One refusal for unauthenticated deliveries" 295, "Verified deliveries without an event" 157, "Webhook deduplication" 332; `control-plane-api` "SCM webhook receiver served" 366, "Identical webhook rejection" 335, "Webhook request logs" 221; `postgres-state` "SCM webhook deliveries table" 222. All deltas are ADDED; none modifies a living requirement.
- Commit types: no code of this change is in the published `taskelith` package's `src/`; the commits use `chore` and `docs`.
- Comments: every new comment is at most two lines of at most 80 characters; `npm run verify:comments`: `Every comment is within the comment length rule.` No AI attribution in commits. Only synthetic secrets (`synthetic-receiver-secret`, `another-secret`) and a per-run generated App key are used.

## Fail-before

- Module receiver: `packages/modules/integrations/test/webhook-receiver.test.ts` was written before the ports and the use case; after `npm run build` it failed to load with `SyntaxError: The requested module '@taskelith/integrations' does not provide an export named 'ScmWebhookReceiver'`. After the implementation: 6 of 6 pass.
- HTTP receiver: with the implementation built but the `receiveScmWebhook` route removed from `routes.ts`, `apps/control-plane/test/scm-webhook-receiver.test.ts` gave `pass 0`, `fail 7`, each request answered `404` `{"code":"not-found","message":"no operation has this method and path","details":{}}` instead of 202, 401, 400, or 413. With the route restored: 7 of 7 pass.
- Deduplication: with the migration's `PRIMARY KEY` removed and the insert's conflict target dropped (`ON CONFLICT DO NOTHING`), `packages/adapters/postgres/test/scm-webhook-deliveries.integration.test.ts` gave `pass 0`, `fail 2`: a repeat answered `recorded` instead of `repeated`, and the two concurrent deliveries answered `[ 'recorded', 'recorded' ]` instead of `[ 'recorded', 'repeated' ]`. With the key and the target restored: 2 of 2 pass, the losing transaction retried once.
- The migration test, the plugin-side receipt test (`packages/plugins/scm-github/test/webhook-receipt.test.ts`), and the `access-requirements` change were written with the implementation; they pass on it and have no separate fail-before run.

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `env -u NODE_ENV make verify` (run 1) | `22ce7cc4`, tree `da53d542` | Failed in a test file this change does not touch: `packages/adapters/worker-control-plane-client/test/http-evidence-publisher.test.ts`, whose test "a gateway failure, a 503, or no answer is unavailable; other failures keep their meaning" passed but "generated asynchronous activity after the test ended" (`TypeError [ERR_INVALID_STATE]: Invalid state: ReadableStream is already closed`), which failed the file: tests 4300, pass 4252, fail 1, skipped 47. Not on the brief's list of known flakes; the run also started while this record was an untracked file, so it could not have written a stamp |
| `env -u NODE_ENV make verify` (run 2) | `22ce7cc4`, tree `da53d542`, clean | Failed only the known flake "value redaction takes linear time on long runs" (`packages/adapters/secrets/test/secrets.test.ts:220`, the brief's "secrets linear-time"): tests 4299, pass 4251, fail 1, skipped 47 |
| `env -u NODE_ENV make verify` (run 3) | `22ce7cc4`, tree `da53d542`, clean | Passed, profile full (`apps/control-plane/package.json changed`), stamp written: tests 4299, suites 49, pass 4252, fail 0, cancelled 0, skipped 47; all files 99.37 % lines, 92.68 % branches, 98.85 % functions; `webhook-receiver.js` and `scm-webhooks.js` 100 % each, `scm-webhook-deliveries.js` 100 % lines, 92.31 % branches, 100 % functions, `api-server.js` 99.10 %, 92.89 %, 96.88 %, `control-plane-api.js` 99.67 %, 84.29 %, 100 % |
| `npm run openspec -- validate receive-scm-webhooks --strict` | `5e63d8a6` | `Change 'receive-scm-webhooks' is valid` |
| `npm run verify:archive`, inside run 3 | tree `da53d542` | `Every active OpenSpec change archives into strictly valid specs.`: the archive of this change, tried in a temporary copy |
| Focused runs | `dbfbf3fd` working tree | The new and touched tests with the PostgreSQL adapter's integration tests, the control-plane API, access, browser session, request edge, agent session route, and slot credential tests, the integrations, `scm-github`, and contracts tests: `pass 726`, `fail 0` |

### Route

Route (`route.json`, rule version 5): elevated (lines, files, capabilities, contracts); pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-fable-5-1#high`, pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding; the shadow router `jev-1.14.0` agrees. Reviews run at effort medium, owner decision 2026-11-02, although `route.json` recommends high for passes 1 and 2. The coordinator assigns the reviewers.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `da53d542b1f0a2aefd2d948a7ce7f1d4dcbd85cc`; tests 4299, pass 4252, fail 0, skipped 47; all files 99.37% lines, 92.68% branches, 98.85% functions.
- `npm run openspec -- validate receive-scm-webhooks --strict`: passed, `Change 'receive-scm-webhooks' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 103 file(s); every pass summary file is valid: 83 file(s); every route file is valid: 36 file(s).`.
- Spec diff against the merge base `a21913f13672` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Independent review

Not yet run; Zaki runs the passes.

## Limitations

- No integration is served until SCM integrations and their secrets are stored: the composition's verifier map is empty, so the installed receiver answers every delivery with 401 (design decision 1).
- The decoy matches the GitHub plugin's work; a later plugin with other work needs a matching decoy for its timing (design, Risks).
- A verified JSON body that the plugin rejects for another reason than a missing repository answers 202 without a record; a form-encoded GitHub delivery verifies but answers 400 (design decision 4).
- No external sender can reach the receiver before items 26 and 37; the tests use synthetic secrets, the plugin's verifier, and the emulated GitHub of 20c, never GitHub.com.
- Recorded events have no consumer yet (items 23 and the board).

## Remaining gates

- Independent review passes 1 to 3 as the coordinator assigns them, with their records.
- Integration into dev by the coordinator (single pull request)
