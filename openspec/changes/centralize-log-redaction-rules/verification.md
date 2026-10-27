# Verification

Date: 2026-10-27. The author's verification is recorded below; `make verify` and the independent review are pending.

## Scope and source

A coordinator brief from Niki on 2026-10-27: centralize the log redaction rules, with decisions Q1 to Q8 (design): the rules live in the Observability domain (Q1); `SECRET_PREFIXES` moves to access if a dependency observability → access is allowed without a cycle, else the prefixes become a parameter (Q2); the secrets adapter's text rules move into the shared set and `redactSecrets`/`redactFailure` delegate with the same output (Q3); per-caller profiles keep each caller's output, and the logger gains the secret shapes (Q4); every shared rule is linear-time (Q5); one `REDACTED` (Q6); vocabularies co-located but not merged (Q7); the failure cause keeps its local rules and contract (Q8). Developed in a briefed and checked subagent ([subagent execution](../../../docs/agent-task-protocol.md#subagent-execution)), in worktree `taskelith-worktrees/centralize-log-redaction-rules` on branch `centralize-log-redaction-rules`.

- **Base revision:** `3d188855`, the archive commit of `bound-failure-cause-userinfo-redaction`, not yet on `dev`.
- **Revision verified:** `590135de` (tests `c711ba25` and `edcf301f`, implementation `e4db4c5e`, `8553f277`, and `590135de`), plus this change's records.
- **Q2 outcome:** option (a), observability depends on access (design decision 2).

Environment: macOS (Darwin 25.6.0), Node 24.22.1 from `.nvmrc`.

## Author self-check

- Comments are at most two lines of at most 80 characters; `npm run verify:comments` passes.
- Commit types are `test`, `chore`, and `docs`; only private workspace packages change.
- No application, contract, or OpenAPI document changes; `SECRET_PREFIXES` and `REDACTED` stay exported by `@taskelith/secrets`.
- The scheduling module's `SlotSecret` and its `REDACTED` are unchanged.
- The requirement body has 391 characters, under the strict archive limit; the guarantees are also scenarios.
- `installation-enrollment` "Secret scrubbing" and `worker-runtime` "Control-plane failure cause" keep their behaviour, so they have no delta.

## Evidence check

- **Fail before.** With the tests of `edcf301f` on the base implementation, after `npm run build`, `node --experimental-strip-types --test --test-reporter=tap packages/testing/test/linear-time.test.ts packages/modules/observability/test/logger.test.ts packages/adapters/secrets/test/secrets.test.ts`: 21 tests, 18 pass, 3 fail: the logger's `text is redacted in linear time on long runs` (`"a." repeated took 1360 ms`), `issued secrets, seeds, JWTs, and creds blocks are redacted in fields and correlation` (correlation `w-tkwk_0123…` kept), and the secrets adapter's `text is redacted in linear time on long runs` (`"a." repeated took 1364 ms`).
- **Leaks on the base logger.** The base `redactText` keeps `w-tkwk_0123456789abcdefghijABCDEFGHIJ-_xyzXYZ0123`, `seed SU…` (a 58-character seed), `jwt xeyJ0eXAiOiJKV1QifQ.eyJzdWIiOiJVIn0.c2lnbmF0dXJl`, and a whole `.creds` block; the new one gives `w-[redacted]`, `seed [redacted]`, `jwt x[redacted]`, and `[redacted]`.
- **Timings, base / fixed, at 20,000 / 40,000 / 80,000 characters (ms).** Logger `redactText`: `a.` 152/606/2403 / 0/1/1; `.a` 149/600/2406 / 0/1/1; `A.` 154/600/2396 / 0/1/1; `a.b` 100/401/1607 / 0/1/1; `eyJ.` 76/306/1209 / 0/1/1; `proxy-` 50/201/807 / 1/1/2. `redactSecrets`: `a.` 151/604/2422 / 0/1/1; `.a` 151/598/2397 / 0/1/1; `A.` 150/602/2393 / 0/1/2; `a.b` 99/396/1599 / 0/1/1; `eyJ.` 74/300/1234 / 0/1/1; `proxy-` 51/216/806 / 0/1/1; `eyJ` 101/407/1621 / 0/1/1; `eyJ_` 75/302/1203 / 0/1/1. At 100,000 / 200,000 / 400,000 characters of `.creds` begin markers: `redactSecrets` 131/527/2118 / 2/4/9.
- **Every shared rule measured.** Each of the twelve exported rules alone on 45 repeated units (among them `a.`, `.a`, `A.`, `a.b`, `a-`, `a+`, `eyJ`, `eyJ.`, `eyJ_`, `eyJa`, `proxy-`, `a://`, `a:`, `bearer `, `token =`, `password:"`, `tkop_`, `SA`, `authorization`, and the `.creds` markers): the slowest at 20,000 / 40,000 / 80,000 characters is `redactUrlUserinfo` on `a://` at 0.2/0.5/1.3 ms.
- **Identical output.** The former and new `redactSecrets`, `sanitizeFailureText`, and `describeFailureCause(...).cause`, and the former `redactText` against `MARKED_SECRET_RULES`, compared on every string up to a length over six alphabets: `a . : / @ space -` up to 7 (960,800 strings), `e y J . _ space` up to 8 (2,015,539), the tokens `a . :// @ space eyJ : -` up to 6 (299,593), the `.creds` markers, `x`, and a line break up to 8 (87,381), `a B 1 . + - _ : / space` up to 6 (1,111,111), and `e y J a . - _ + space` up to 7 (5,380,840), 9,855,264 in all; and on 1,000,000 random strings of up to 40 tokens and 100,000 of up to 300 over 49 tokens (letters, digits, separators, quotes, `\`, a line break, `é`, `://`, `eyJ`, the prefixes, seed and run fragments, `bearer `, keys, `authorization: `, `proxy-`, the `.creds` markers, `[redacted]`, `@` forms), and 500,000 of up to 40 tokens that add a real issued secret, NKey seed, JWT, and URLs: 11,455,264 comparisons per caller, 0 differences.
- **The logger change only adds.** On 300,000 random strings the new `redactText` equals `SECRET_SHAPE_RULES` applied to the former output.
- **Why the failure cause keeps the former rules.** With the new `redactText` inside its pipeline, `token tkop_abcdefghijklmnopqrst end` would become `token [redacted] end` (was unchanged), `xx` and a seed `xx[redacted]` (was `[redacted]`), and a one-line `.creds` block `[redacted]` (was its markers around `[redacted]`), so it composes `MARKED_SECRET_RULES` (design decision 6).
- **Determinism.** The bound is 200 ms per run against at most 9 ms measured; no retry or sleep.
- **Links.** The change adds no external link.

## Checks

- `npm run build`: exit 0.
- `npm run check:boundaries` (`tsc -p tsconfig.check.json` and `scripts/check-boundaries.ts`): "Workspace and hexagonal boundary checks passed."
- Package tests with coverage: `node --experimental-strip-types --test --experimental-test-coverage` over the `dist` of observability, secrets, worker-control-plane-client, access, and `packages/testing/dist/linear-time.js`, running `packages/testing/test/linear-time.test.ts`, `packages/modules/observability/test/*.test.ts`, `packages/adapters/secrets/test/*.test.ts`, `packages/adapters/worker-control-plane-client/test/*.test.ts`, and `packages/modules/access/test/*.test.ts`: 75 tests, 75 pass, 0 fail; `redaction-rules.js`, `redaction.js`, `scrub.js`, `node-secrets.js`, and `linear-time.js` 100% lines, branches, and functions; `failure-cause.js` 100% lines, 95.65% branches, 100% functions; all measured files 100% lines, 93.73% branches, 99.11% functions.
- `apps/control-plane/test/api-server.test.ts`: 19 tests, 19 pass. `apps/worker/test/worker-start.test.ts`: 31 tests, 31 pass.
- Not run: `apps/control-plane/test/administration.integration.test.ts` and `packages/adapters/nats/test/transport.integration.test.ts`, which need the PostgreSQL and NATS services that `make verify` starts.
- `npm run verify:comments`: "Every comment is within the comment length rule."
- `npm run verify:dependencies` reported the inventory stale after the two new workspace dependencies; `make dependency-inventory` regenerated `docs/dependencies` (one package path's dependency list each), and the check then passed: "Verified 731 package paths".
- `make findings ARGS="validate"`: "Every findings file is valid: 7 file(s)."
- `npm run openspec -- validate centralize-log-redaction-rules --strict`: valid. A scratch copy of `openspec/` outside the worktree archived the change (1 requirement modified) and `openspec validate --all --strict --no-interactive` there gave 69 passed, 0 failed. `npm run verify:archive`: "Every active OpenSpec change archives into strictly valid specs."
- `make verify`: not run by the worker; the coordinator schedules the host slot.

## Independent review

Independent review: OpenCode opencode-go/kimi-k2.7-code, pending.

## Limitations

- The key vocabularies are co-located, not merged, and two URL user-information rules and two JWT rules remain, each keeping a caller's output (design decisions 9 and risks).
- The failure cause does not get the secret shapes: an issued-secret-shaped string of 25 to 31 characters stays in a failure cause, as before; real issued secrets have 48 characters and the run rule redacts them (design decision 6).
- The time bound is wall-clock and can be hit by a long scheduler pause on a loaded host.
- The identical-output proof is a scratch comparison against copies of the base build, not a committed test.

## Remaining gates

- `make verify` on the branch head.
- Independent review by OpenCode `opencode-go/kimi-k2.7-code`, with its findings in `findings.jsonl`.
- Archive under worker step 7.
- Integration into dev by the coordinator (single pull request).
