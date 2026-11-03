# Verification: receive-scm-webhooks

## Scope and source

G3 plan item 20 (`docs/g3-plan.md`, row 20), sub-change 20e, developed by a briefed subagent for the worker Zaki from `dev` `a21913f1` (#426): the handler of the existing `receiveScmWebhook` operation (control-plane wire contracts section 5), its 25 MiB raw body limit (Q2), one identical 401 for every unauthenticated case, 400 for an unparseable verified payload, deduplication by the verified `deliveryId` per integration under concurrency, the read port `ScmIntegrationVerifiers` with an in-memory adapter (Q1), migration `1792933700000`, request logs under section 7, and the contract and spec updates. The coordinator's decisions in force come from the brief: the SCM port stays draft; verification is the plugin's `verifyWebhookDelivery` over the raw bytes with lower-case header names; a verified ping and `installation` or `installation_repositories` delivery answers 2xx without the port's event; `X-GitHub-Delivery` stays a string; credential state stays in memory. Excluded: SCM integration CRUD and secret storage, 20d live conformance, event consumers (items 23 and the board), ingress and TLS (items 26 and 37), and changes to `verifyWebhookDelivery`.

## Revision

- Base: `dev` `a21913f1`; the brief's checklist was saved with `--at a21913f13672d87306b86b8f26cf474ef8264bba --size M`.
- `5eab931f` `chore: add webhook receipt ports and the SCM webhook receiver to the integrations module`.
- `3274d5e9` `chore: record SCM webhook deliveries once per integration and delivery identifier` (migration, repository, migration and concurrency tests).
- `dbfbf3fd` `chore: serve the SCM webhook receiver with a 25 MiB raw body limit` (route, raw body read, handler, composition, HTTP and plugin tests, lockfile, and the regenerated inventory).
- `5e63d8a6` `docs: specify the receive scm webhooks change and update the contracts`.
- `22ce7cc4` `docs: record the review route of the receive scm webhooks change` (`route.json` unedited): the tree that `make verify` checked; the commit after it, `e1493259`, adds this record and the `make record` output and is the head for review pass 1.
- Pass 1 fix round: `1d214a8f` `docs: record review pass 1 of the receive scm webhooks change` (its `passes.jsonl` line and four findings, recorded before any fix); `6e8b7bb6` `chore: store SCM webhook identifiers as UTF-16LE bytes so that every port identifier is kept exactly` (finding 2); `776698c8` `chore: give the SCM webhook decoy the GitHub plugin's work and accept only GitHub's eventless events without an event` (findings 1 and 3, coordinator decision of 2026-11-03); `e5943f9a` `docs: specify the eventless webhook rule, the decoy work, and the identifier storage of the receive scm webhooks change`: the tree that the fix round's `make verify` checked; the commit after it, `d337810f`, adds this record and is the head for review pass 2. Pass 2 fix round: `74e9068b` `docs: record review pass 2 of the receive scm webhooks change` (its `passes.jsonl` line, seven findings, and the review snapshots, recorded before any fix); `f5c03c52` `chore: bound concurrent SCM webhook bodies, refuse an oversized declared length unread, and name the raw path parameter rule` (findings 1, 5, and 6); `aeb928f9` `docs: keep the scm-port delta SCM-neutral and state the unsigned webhook headers and the webhook body bounds` (findings 2, 3, and 4); the commit after it records the resolutions and is the tree that the round's `make verify` checked. `route.json` is not routed again: later passes never route.

## Environment

Native Ubuntu host `hpz600`, Linux 6.8.0-147-generic x86_64. `make verify` and `make dependency-inventory` ran with Node.js v24.22.1, the `.nvmrc` pin; the focused runs below ran with Node.js v24.22.0 from `nvm use`, against services of `make services-up` for the PostgreSQL tests.

## Author self-check

- Scope: only the brief's nine points and the pass 1 and pass 2 fix rounds. At `e5943f9a`, `git diff a21913f1 --shortstat` without `package-lock.json`, `docs/dependencies/`, and `openspec/`: 29 files, 947 insertions, 31 deletions; with them: 44 files, 1443 insertions, 32 deletions; the fix round (`git diff e1493259 e5943f9a --shortstat`): 23 files, 340 insertions, 82 deletions. No OpenAPI, AsyncAPI, or schema change, no new or changed response, no change of `verifyWebhookDelivery` or the draft port (`git diff a21913f1 -- packages/contracts packages/plugins/scm-github/src packages/modules/integrations/src/ports/source-control.ts` is empty).
- Order (checklist `contract-drift`): the route's `signedBodyLimit` makes the server read the body as bytes up to 25 MiB before the handler runs, and answer 413 with reason `body-too-large` beyond it; the receiver verifies before anything reads the payload, and only the receiver's JSON object check (design decision 4) parses, after a verification that failed with `invalid`. The HTTP test shows the oversized body never reaches the verifier and a body of exactly 25 MiB is read and accepted.
- Decoy work (pass 1 finding 1): `GithubWebhookDecoy` in `apps/control-plane/src/composition/scm-webhooks.ts` repeats the GitHub plugin's header-dependent work, no HMAC for a missing or malformed `x-hub-signature-256`, HMAC-SHA256 and `timingSafeEqual` for a well-formed one; `apps/control-plane/test/scm-webhook-decoy.test.ts` counts the `node:crypto` calls of a known and an unknown integration for five signature forms. `verifyWebhookDelivery` is unchanged.
- Eventless deliveries (coordinator decision, 2026-11-03): after a verified `invalid`, the receiver answers `no-event` (202, nothing recorded) only when the new module port `EventlessDeliveries` calls the delivery eventless and its body is a JSON object; the composition's `GithubEventlessDeliveries` uses the named set `GITHUB_EVENTLESS_EVENTS` (`ping`, `installation`, `installation_repositories`; core design decision 5). The set names GitHub, so it lives in the composition, not the module.
- Identifier storage (pass 1 finding 2): the deliveries table stores the delivery identifier, repository, change request, and commit as `bytea` of their UTF-16LE code units, 2 to 2048 bytes of even length; migration `1792933700000` is not yet on `dev`, so it was edited in place.
- One refusal (checklist `error-handling`): the HTTP test sends a known integration's signed delivery to an unknown identifier, to `%ZZ`, to a 129-character identifier, and to `caf%C3%A9`, and without a signature, with another secret, and with a changed body to the known integration; all seven answers are 401 with the identical body text. The module test shows the decoy verified each delivery of an unknown or invalid integration and that an invalid identifier is never looked up. No timing is asserted.
- Hexagonal boundaries: the module's ports and use case name no SCM; GitHub appears only in the composition's tests and the plugin's own test. `npm run check:boundaries`: `Workspace and hexagonal boundary checks passed.`
- Dependencies: `@taskelith/integrations` becomes a dependency of `@taskelith/postgres` and `@taskelith/control-plane`, `@taskelith/scm-github` a development dependency of `@taskelith/control-plane`; no third-party package changed. `make dependency-inventory` reported `Generated 927 package paths; 70 with license coverage gaps (all reviewed; 4 declaration-only)`.
- Test edits outside the new files: `access-requirements.test.ts` reads an empty `security` array as the scheme `none`, which the document's `security: []` means, and lists `receiveScmWebhook` among the served control-plane operations; `api-server.test.ts` adds `scmWebhooks` to its stub services; the migration tests add the new migration to their lists and the table to the schema list, and the stored-at test removes the new migration from its copy as it does the stored-at one.
- Requirement texts, counted as the characters of the requirement's text line after the pass 2 fix round: `scm-port` "Webhook receipt ports" 438, "One refusal for unauthenticated deliveries" 428, "Verified deliveries without an event" 271, "Webhook deduplication" 222; `control-plane-api` "SCM webhook receiver served" 461, "Identical webhook rejection" 348, "GitHub webhook composition" 287, "Webhook request logs" 157; `postgres-state` "SCM webhook deliveries table" 394. All deltas are ADDED; none modifies a living requirement.
- Commit types: no code of this change is in the published `taskelith` package's `src/`; the commits use `chore` and `docs`.
- Comments: every new comment is at most two lines of at most 80 characters; `npm run verify:comments`: `Every comment is within the comment length rule.` No AI attribution in commits. Only synthetic secrets (`synthetic-receiver-secret`, `another-secret`) and a per-run generated App key are used.

## Fail-before

- Module receiver: `packages/modules/integrations/test/webhook-receiver.test.ts` was written before the ports and the use case; after `npm run build` it failed to load with `SyntaxError: The requested module '@taskelith/integrations' does not provide an export named 'ScmWebhookReceiver'`. After the implementation: 6 of 6 pass.
- HTTP receiver: with the implementation built but the `receiveScmWebhook` route removed from `routes.ts`, `apps/control-plane/test/scm-webhook-receiver.test.ts` gave `pass 0`, `fail 7`, each request answered `404` `{"code":"not-found","message":"no operation has this method and path","details":{}}` instead of 202, 401, 400, or 413. With the route restored: 7 of 7 pass.
- Deduplication: with the migration's `PRIMARY KEY` removed and the insert's conflict target dropped (`ON CONFLICT DO NOTHING`), `packages/adapters/postgres/test/scm-webhook-deliveries.integration.test.ts` gave `pass 0`, `fail 2`: a repeat answered `recorded` instead of `repeated`, and the two concurrent deliveries answered `[ 'recorded', 'recorded' ]` instead of `[ 'recorded', 'repeated' ]`. With the key and the target restored: 2 of 2 pass, the losing transaction retried once.
- The migration test, the plugin-side receipt test, and the `access-requirements` change were written with the implementation, so they have no test-first run; pass 1 finding 4 asked for the negative controls below instead, which do not claim test-first authorship.

### Pass 1 fix round

Runs of the focused files with `node --experimental-strip-types --test` after `npm run build`, against `make services-up` services for PostgreSQL. A temporary copy of a new test that used the old composition names (`DecoyWebhookVerifier`, no `eventless` port) ran the new tests against the code of `e1493259`; the copy was deleted.

- Finding 1, decoy work: the new `scm-webhook-decoy.test.ts` against the old decoy gave `pass 3`, `fail 3`: for a missing, malformed, and short signature the unknown integration did `{ hmacs: 1, comparisons: 1 }` where the known one did `{ hmacs: 0, comparisons: 0 }`; the well-formed and upper-case wrong signatures and the plugin baseline passed. With `GithubWebhookDecoy`: 6 of 6 pass.
- Finding 2, identifiers: the new integration test "identifiers with a NUL or an unpaired surrogate are recorded and read back exactly" failed on the `text` schema with `StatementError: invalid byte sequence for encoding "UTF8": 0x00`; with the `bytea` schema the adapter and migration files pass, 42 of 42.
- Finding 3, shared state: the reviewer's command (`--test-isolation=none --test-name-pattern='a GitHub ping'`) on the old plugin test gave `fail 1`, `0 !== 1`; on the rewritten file, where each test builds its own plugin, receiver, and record, the same command and the whole file pass.
- Coordinator decision: the HTTP tests against the old receiver gave `pass 8`, `fail 1`: "a verified push without a repository is 400 invalid and not recorded" answered `202 !== 400`. "a verified ping and installation delivery answer 202 without a record" (now with `installation_repositories`) and "a verified ping whose body is no JSON object is 400 invalid and not recorded" already passed, as the old rule gave the same answers; they guard the decision. With the new rule: 9 of 9 pass, and the module's new test "a verified delivery the plugin maps to no event is invalid unless eventless with a JSON object" passes.
- Finding 4, negative controls on the fixed code, each restored afterwards; the migration file is read at run time, the others needed a rebuild:
  - In `1792933700000_scm-webhook-deliveries.sql`, removing one at a time the check of `delivery_id`, its even-length part, the check of `kind`, `repository`, `change_request`, `commit_id`, or the primary key failed the migration test "the SCM webhook deliveries migration checks its values and its down migration removes its table" with `Missing expected rejection`; removing `DEFAULT now()` from `received_at` failed it at the first insert (`The input did not match the regular expression /scm_webhook_deliveries_delivery_id_check/`, a NOT NULL violation instead); a down migration of `SELECT 1;` failed its table-gone `deepEqual`. Restored: 1 of 1 passes.
  - Removing `installation_repositories` from `GITHUB_EVENTLESS_EVENTS` failed "a verified ping and installation delivery answer 202 without a record" with status 400 `invalid` instead of 202.
  - Removing the `isEventless` condition from the receiver failed the module test above (`false !== 'invalid'`) and the HTTP push test (`202 !== 400`).
  - Declaring the route's security as `operatorToken` failed the access requirements test at `receiveScmWebhook` (`'operatorToken'` against `'none'`). A first run that combined this control with the other two masked them, as the HTTP tests then needed a credential; each was rerun alone.
  - Restored: the receiver, decoy, access requirements, and module tests pass, 31 of 31.

### Pass 2 fix round

The new tests were written first and run with `node --experimental-strip-types --test` against a build of the code of `74e9068b` (the fix's `apps/control-plane/src` stashed), then against a build with the fix.

- Finding 1, body bounds: in `apps/control-plane/test/scm-webhook-receiver.test.ts`, "a declared length over the limit is 413 before the body is read" failed with `Error: no answer within 5000 ms`, as the old server waited for the declared bytes, and "deliveries beyond the concurrency limit wait for a free slot before their body is read" failed with `the second delivery waits while the first holds the only slot`, `1 !== 0`; the file gave `pass 9`, `fail 2`. With the fix, `signedBody` refuses a `content-length` over the limit unread, and `answerRoute` runs a signed body under `BodySlots.signedBodies` (`MAX_CONCURRENT_WEBHOOKS`, 4).
- Finding 5, raw path parameters: in `apps/control-plane/test/api-server.test.ts`, "a route that keeps undecodable path parameters gets them as sent", a probe route with `keepsUndecodablePathParameters` and no body limit, failed with `400 !== 200`; the file gave `pass 22`, `fail 1`. The HTTP test of the identical 401 still covers `%ZZ` on the real route.
- Finding 6 is a type change without behavior, checked by `tsc` in `npm run build`; findings 2, 3, and 4 change prose only.
- After the fix: the receiver, API server, decoy, and access requirements tests pass, 49 of 49; `npm run verify:comments`, `npm run check:boundaries`, and `npm run openspec -- validate receive-scm-webhooks --strict` pass.

## Checks

| Check | Revision | Result |
| --- | --- | --- |
| `env -u NODE_ENV make verify` (run 1) | `22ce7cc4`, tree `da53d542` | Failed in a test file this change does not touch: `packages/adapters/worker-control-plane-client/test/http-evidence-publisher.test.ts`, whose test "a gateway failure, a 503, or no answer is unavailable; other failures keep their meaning" passed but "generated asynchronous activity after the test ended" (`TypeError [ERR_INVALID_STATE]: Invalid state: ReadableStream is already closed`), which failed the file: tests 4300, pass 4252, fail 1, skipped 47. Not on the brief's list of known flakes; the run also started while this record was an untracked file, so it could not have written a stamp |
| `env -u NODE_ENV make verify` (run 2) | `22ce7cc4`, tree `da53d542`, clean | Failed only the known flake "value redaction takes linear time on long runs" (`packages/adapters/secrets/test/secrets.test.ts:220`, the brief's "secrets linear-time"): tests 4299, pass 4251, fail 1, skipped 47 |
| `env -u NODE_ENV make verify` (run 3) | `22ce7cc4`, tree `da53d542`, clean | Passed, profile full (`apps/control-plane/package.json changed`), stamp written: tests 4299, suites 49, pass 4252, fail 0, cancelled 0, skipped 47; all files 99.37 % lines, 92.68 % branches, 98.85 % functions; `webhook-receiver.js` and `scm-webhooks.js` 100 % each, `scm-webhook-deliveries.js` 100 % lines, 92.31 % branches, 100 % functions, `api-server.js` 99.10 %, 92.89 %, 96.88 %, `control-plane-api.js` 99.67 %, 84.29 %, 100 % |
| `npm run openspec -- validate receive-scm-webhooks --strict` | `5e63d8a6` | `Change 'receive-scm-webhooks' is valid` |
| `npm run verify:archive`, inside run 3 | tree `da53d542` | `Every active OpenSpec change archives into strictly valid specs.`: the archive of this change, tried in a temporary copy |
| `env -u NODE_ENV make verify` (fix round, run 1) | `e5943f9a`, tree `1f418345`, clean | Passed on the first run, profile full, stamp written: tests 4309, suites 49, pass 4262, fail 0, cancelled 0, skipped 47; all files 99.37 % lines, 92.70 % branches, 98.85 % functions; `webhook-receiver.js` 100 % each, `scm-webhooks.js` 100 % lines, 90 % branches, 100 % functions, `scm-webhook-deliveries.js` 100 % each. No known flake failed |
| `npm run openspec -- validate receive-scm-webhooks --strict` | `e5943f9a` | `Change 'receive-scm-webhooks' is valid` |
| Focused runs | `dbfbf3fd` working tree | The new and touched tests with the PostgreSQL adapter's integration tests, the control-plane API, access, browser session, request edge, agent session route, and slot credential tests, the integrations, `scm-github`, and contracts tests: `pass 726`, `fail 0` |

### Route

Route (`route.json`, rule version 5): elevated (lines, files, capabilities, contracts); pass 1 reviewer A `codex gpt-6-astra#high`, pass 2 reviewer B `claude claude-fable-5-1#high`, pass 3 reviewer A `agy gemini-4-argon-medium#medium` only after a pass 2 with a Medium or worse finding; the shadow router `jev-1.14.0` agrees. Reviews run at effort medium, owner decision 2026-11-02, although `route.json` recommends high for passes 1 and 2. The coordinator assigns the reviewers.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `1f41834505eccaa4286f466ad23f0103ce5efb00`; tests 4309, pass 4262, fail 0, skipped 47; all files 99.37% lines, 92.70% branches, 98.85% functions.
- `npm run openspec -- validate receive-scm-webhooks --strict`: passed, `Change 'receive-scm-webhooks' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 103 file(s); every pass summary file is valid: 83 file(s); every route file is valid: 36 file(s).`.
- Spec diff against the merge base `a21913f13672` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a19fb8-59e6-7ef3-b2f9-cc2d2e520bff` | 0 | 1 | 3 | 0 |
<!-- make record: end -->

## Independent review

### Pass 1 (role A)

- Reviewer: Codex CLI `gpt-6-astra`, effort `medium` (`codex gpt-6-astra#medium`), assigned by the coordinator; `route.json` recommends `high`, and the authorized `medium` applies (owner decision 2026-11-02).
- Invocation, through `make review CHANGE=receive-scm-webhooks PASS=1`: `codex exec -m gpt-6-astra -c model_reasoning_effort="medium" -s read-only -C <worktree> -`, environment `PATH HOME USER LANG TERM`, started 2026-11-03T04:43:41Z at head `e1493259`; the route gate reported that `route.json` was made for this tree.
- Confirmation: model `gpt-6-astra`, effort `medium`, sandbox `read-only` reported in the header; session `01a19fb8-59e6-7ef3-b2f9-cc2d2e520bff`; exit 0.
- Snapshot before and after: both `b39e8a0829a2fdd1fa04b99532fe304adef3cc18841b27acca92c194bbefbb29`, unchanged, taken by the worker Zaki; the reviewer reported that it modified no file.
- Counts: Critical 0, High 1, Medium 3, Low 0, as in `passes.jsonl`. The report also noted that the wire contracts document has no section 14 (its last is 12); the brief's reference to it is the coordinator's, and this record cites no section 14.
- Findings and resolutions (`findings.jsonl`, all `fixed`, for pass 2 to check):
  1. High, `error-handling`: the decoy hashed every body while the plugin hashes only for a well-formed signature. Fixed in `776698c8` (`GithubWebhookDecoy`, design decision 3).
  2. Medium, `error-handling`: `text` columns reject a NUL and lose unpaired surrogates of port identifiers. Fixed in `6e8b7bb6` (UTF-16LE `bytea`, design decision 6).
  3. Medium, `test-flakiness`: the plugin's ping test depended on the previous test's record. Fixed in `776698c8`.
  4. Medium, `missing-fail-before-test`: no fail-before evidence for the migration, plugin receipt, and access tests. Fixed in this record ("Pass 1 fix round" above).
- Coordinator decision applied in the same round (Niki, 2026-11-03): the eventless rule of design decision 4.

### Pass 2 (role B)

- Reviewer: Claude Code `claude-fable-5-1`, effort `medium` (`claude claude-fable-5-1#medium`), assigned by the coordinator; `route.json` recommends `high`, and the authorized `medium` applies (owner decision 2026-11-02).
- Invocation, through `make review CHANGE=receive-scm-webhooks PASS=2`: `claude -p --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format stream-json --verbose -- <prompt>`, environment `PATH HOME USER LANG TERM`, started 2026-11-03T05:09:28Z at head `d337810f`; the prompt named pass 1's session and asked for a check of each pass 1 fix and an independent review of the whole change.
- Confirmation: the last `"type":"result"` line of the log names `claude-fable-5-1` in its `modelUsage` and session `b7260c40-dd88-4f3e-934d-0eec0a8e4aff`; exit 0.
- Snapshot before and after: both `1330ac02e132f6f40c81a4765382452c9be61de2f24a5620b1a92b672f35831d`, unchanged, taken by the worker Zaki.
- Pass 1 fixes: the reviewer confirmed all four (`findings.jsonl` keeps them `fixed`).
- Counts: Critical 0, High 0, Medium 1, Low 6, as in `passes.jsonl`. Findings 1, 4, 5, and 6 concern code or text that pass 1 reviewed, so `findings.jsonl` names pass 1 in their `missedBy`; findings 2, 3, and 7 concern text of the pass 1 fix round.
- Findings and resolutions (`findings.jsonl`, for pass 3 to check):
  1. Medium, `error-handling`: the unauthenticated route buffered up to 25 MiB per request without a concurrency bound and waited for a declared length over the limit. Fixed in `f5c03c52`: a separate slot pool, `MAX_CONCURRENT_WEBHOOKS` = 4, and a 413 for an oversized `content-length` before reading (design decision 2).
  2. Low, `docs`: the event header was called verified, but the signature covers the body only. Fixed in `aeb928f9` in design decision 4 and source control section 6.1.
  3. Low, `spec-wording`: the scm-port delta named GitHub. Fixed in `aeb928f9`: the delta is SCM-neutral, and the control-plane-api requirement "GitHub webhook composition" takes the GitHub sentence and scenario.
  4. Low, `contract-drift`: wire contracts section 5 lacked the percent-encoding case. Fixed in `aeb928f9`.
  5. Low, `naming`: the matcher tied raw path parameters to the body limit. Fixed in `f5c03c52` with the route flag `keepsUndecodablePathParameters`.
  6. Low, `naming`: `ApiServices.scmWebhooks` was an inline type. Fixed in `f5c03c52` as `Pick<ScmWebhookReceiver, 'receive'>`.
  7. Low, `contract-drift`: the composition copies the plugin's signature header, its form, and the eventless events. Deferred, as the reviewer proposed: a plugin-provided decoy and eventless capability changes the plugin and its API, outside this change and the coordinator's decision; the decoy test catches drift meanwhile.

## Limitations

- No integration is served until SCM integrations and their secrets are stored: the composition's verifier map is empty, so the installed receiver answers every delivery with 401 (design decision 1).
- The decoy repeats the GitHub plugin's work for each signature form, checked by counting crypto calls, not by timing; a later plugin with other work needs a matching decoy (design, Risks).
- The eventless rule and the decoy repeat the GitHub plugin's facts in the composition (pass 2 finding 7, deferred) until a plugin supplies them; a later SCM plugin needs its own rule in the composition. A form-encoded GitHub delivery verifies but answers 400 (design decision 4).
- Stored identifiers are UTF-16LE bytes; nothing reads them yet.
- `make verify` run 1 of the first round failed in `http-evidence-publisher.test.ts` ("asynchronous activity after the test ended"), a flake candidate outside this change; it did not recur.
- No external sender can reach the receiver before items 26 and 37; the tests use synthetic secrets, the plugin's verifier, and the emulated GitHub of 20c, never GitHub.com.
- Recorded events have no consumer yet (items 23 and the board).

## Remaining gates

- Independent review pass 3 (role A), required because pass 2 reported a Medium finding, as the coordinator assigns it, with its record.
- Integration into dev by the coordinator (single pull request)
