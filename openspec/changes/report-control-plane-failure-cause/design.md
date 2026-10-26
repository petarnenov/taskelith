## Context

`post` in `packages/adapters/worker-control-plane-client/src/control-plane-http.ts` catches whatever `fetch` throws and reports `failure('unavailable', 'the control plane did not answer', { cause: error.name })`. Node's `fetch` (undici) throws `TypeError: fetch failed` for every network failure and keeps the root cause in `error.cause`: a Node system error (`code: 'ECONNRESET'`, `syscall: 'read'`), an undici error (`SocketError`, `code: 'UND_ERR_SOCKET'`, `other side closed`), or an `AggregateError` with `code: 'ECONNREFUSED'` and the per-address errors in `errors`. A timeout throws a `DOMException` named `TimeoutError` without a cause. So every failure was reported as `TypeError`.

The failure reaches two outputs on the worker:

- the start failure line of `workerMain` (`apps/worker/src/main.ts`), which writes the whole failure, details included, through `redactFailure` of `@taskelith/secrets` when enrollment fails;
- the launch authorization loop of `LaunchOrchestrator#authorize` (`apps/worker/src/launch-orchestrator.ts`), which backs off and repeats the operation without logging anything.

The evidence publisher uses the same `post` but has no worker caller yet.

Observability rules that apply: `execution-observability` requirement "Logs without secrets" (the logger redacts secret-named fields, URL user information, and bearer tokens in text), architecture section 11 (no secret values in logs), and the bounded-output principle of the operational targets.

## Goals / Non-Goals

**Goals:** the root cause of an unanswered request reaches the reported failure and the logs, as a structured code where one exists; the description is bounded and holds no secret even before the logger's own redaction.

**Non-Goals:** changing the failure code, the message, or the retry policy; any wire or OpenAPI change; logging the evidence publisher, which has no caller; changing `redactSecrets` or the logger's redaction.

## Decisions

1. **Two details, `cause` and `causeCode`.** `cause` keeps its key and becomes the chain, outermost first, joined by ` <- `, each link `Name[CODE]: message` (for example `TypeError: fetch failed <- Error[ECONNRESET]: read ECONNRESET`). `causeCode` is the innermost code among the first 16 links of the chain, the root cause, which a chain longer than the four rendered links keeps (review pass 1, finding 5), as a separate field so logs can be filtered on it. A failure without any code has no `causeCode`, rather than an empty or sentinel value. Details stay `Record<string, string>`, so the kernel's `Failure` shape is unchanged.
   *Alternative:* one field with only the innermost code. Rejected: the chain also tells a timeout from a socket error and keeps undici's message, which names the closed side.

2. **The chain follows `cause`, then `errors[0]`, and never throws.** A getter or a `Proxy` of the thrown value may throw while it is read; `describeFailureCause` then returns `cause` `unknown`, so the request still returns a `Result` (pass 2, finding L1). An `AggregateError` from Node's address selection has no `cause` but per-address errors; the first one is followed. The walk stops at 16 links, at a value already seen (a cycle), or at a value that is not an object. A thrown value that is not an object is described as `unknown`, as before; a non-empty string `cause` of a link ends the chain as a last link `Error: <sanitized string>` (review pass 3, finding L4).

3. **Only identifiers pass as names and codes.** A name must match `^[A-Za-z][A-Za-z0-9_$]{0,30}$`, otherwise it becomes `Error`, because a name is not redacted and must stay below the 32-character token run (pass 3, finding L1); a code must be a string matching `^[A-Z][A-Z0-9_]{0,30}$`, otherwise it is left out; a code of 32 or more characters has the shape of a NATS seed, and the longest Node code, `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, has 31 (review pass 2, finding L5). This keeps Node and undici codes (`ECONNRESET`, `UND_ERR_SOCKET`, `ERR_INVALID_URL`) and drops the numeric legacy `code` of a `DOMException` and any free text placed in `code`. `errno` and `syscall` are not added: the code already carries the errno meaning, and Node puts the syscall into the message.

4. **Messages are sanitized here, on the logger's rules.** The client cannot rely on the caller's redaction, because the details also reach the start failure line and any future caller. `sanitizeFailureText` (`failure-cause.ts`) builds on `redactText` of `@taskelith/observability`, the logger's own rules for URL user information, bearer values, and quoted-aware key-value secrets, so the client adds no third copy of them (review pass 1, finding 3). Around it, the client adds only what a failure text needs and the logger lacks:
   - before `redactText`: control characters and the line separators U+0085, U+2028, and U+2029 become spaces; every URL becomes `[url]`, which removes user information and query strings together; user information without a scheme (`owner:secret@host`) becomes `[redacted]@` (pass 3, finding L3); an `Authorization` or `Proxy-Authorization` value, quoted or not as in JSON, is redacted with its scheme up to `;`, `,`, a quote, or the end, so a Basic credential goes too; a `password`, `passwd`, `passphrase`, `pass`, `pwd`, `secret`, `token`, `credential(s)`, `cookie`, `private_key`, or `api_key` key followed by `:` loses its value, quoted-aware (pass 3, finding L2), which the logger's `KEY_VALUE` covers only for `=` (pass 2, findings L2 and L3);
   - after it: a JWT (`eyJ…` with three dot-separated parts, however short) and every run of 32 or more of `[A-Za-z0-9_+=/-]`, which covers the product's prefixed secrets, NATS seeds, and standard base64 (pass 2, finding L4); a long file path without dots is hidden too;
   - last: `<-` becomes `< -`, so a message cannot fake a link of the chain (finding 6).
   The whole text is redacted before any cut, because a cut first can leave a secret's prefix shorter than the run rule (finding 1). An address such as `127.0.0.1:8443` stays, because it names no secret and is what an operator needs. `@taskelith/observability` is a module, which adapters may depend on, as `@taskelith/nats` and `@taskelith/postgres` do; the boundary check passes.
   *Alternative:* `redactSecrets` of `@taskelith/secrets`. Rejected: it would make one adapter depend on another, and it keeps query strings.
   The JWT and `Authorization` rules would also help the logger; moving them into `redactText` changes the logger's contract and is left to a later change.

5. **Bounds.** At most four rendered links (`MAX_CAUSE_LINKS`), 16 links walked for the code (`MAX_CODE_DEPTH`), 160 characters per message (`MAX_FAILURE_TEXT`), and 512 characters for the whole `cause` (`MAX_CAUSE_LENGTH`), cut with a trailing `…`. The same sanitizing and 160-character bound apply to the server's message and `reason` that `statusFailure` puts into a failure, because the worker now logs them on every retry (finding 4), and to the first schema violation that each client reports, which can name a property the server chose (pass 2, finding M1). Four links cover `TypeError` → `AggregateError` → system error with one spare.

6. **The worker logs each failed authorization request.** `#authorize` logs `worker.launch.authorization-failed` at `warn` with the failure's details spread as fields, then `executionId`, `operationId`, `code`, and `message`, so that no detail replaces a known field (finding 4), before it backs off. The back-off of at least 5 seconds per retry bounds the rate. The fields pass through the logger's redaction as every other log line. Spreading the details also logs `status` and `reason` of a status failure and `violation` of a schema failure, which say why a grant was not received.

7. **Where the log rule lives.** The log line is a behavior of the launch loop, so its sentence and scenario modify requirement "Journaled launch authorization" (489 characters with the sentence), and requirement "Control-plane failure cause" holds only the client's behavior (finding 8).

## Risks / Trade-offs

- The 32-character token rule also hides a long hexadecimal identifier inside a message. Identifiers are not what an operator needs from a network failure, and the code and the rest of the message stay.
- Replacing whole URLs hides the host of a message that names one. The worker's configured control-plane URL is known to the operator, and a system error names the address without a scheme, which stays.
- A failed authorization request is now one warning per retry. A long outage writes one line per back-off, at most one per 60 seconds once the back-off is at its maximum.
