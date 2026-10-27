# Verification: align-scm-port-with-g2-credentials

## Scope and source

A worker task the coordinator (Niki) assigned on 2026-10-27, developed in a briefed subagent: the G3 item 7 follow-up of the item 0 revalidation (`/docs/g3-plan.md`, items 0 and 7), size M. Source: Niki's brief from item 0 revalidation passes 1 (reviewer A, OpenCode `deepseek-v4-pro`) and 2 (reviewer B, `gpt-6-astra`) by Pepi, with findings H1, M1, H1b, M1b, M2, and L1. Scope: `docs/contracts/source-control.md`, the `scm-port` spec delta, the `docs/g3-plan.md` rows of items 9, 18, 20, and 21 (M1b, coordinator decision option A), and the private `@taskelith/integrations` package (`packages/modules/integrations/`, `"private": true`, so its commits are `chore` and `test`). Out of scope: any delivery path, redaction rule, webhook receiver, or plugin. Design: [design.md](design.md).

## Revision

- Base: `origin/dev` `4fe09456`.
- `032bc2ee` `docs: align the SCM port contract and spec with the G2 credential model` (contract, spec delta, and change records, before the code).
- `29e42d82` `chore(integrations): keep raw payloads out of SCM conformance findings and check identifiers` (code and tests).
- `ae067aa8` `docs: record the align-scm-port-with-g2-credentials verification`.
- `c17c9b5b`: the coordinator merged `origin/dev` `c3e97105` into the branch, without conflicts.
- A later `docs` commit: the M1b plan rows, contract text, spec requirement, and this record's update. The checks below ran on its working tree, after the merge.

## Environment

macOS 26.6.2 (Darwin 25.6.0), x86_64, the Intel iMac; Node.js v24.22.1 through `nvm use` from `.nvmrc`.

## Author self-check

- H1, contract section 3 (`docs/contracts/source-control.md:35`) and the added requirement "Run credential secret": G2 has no mechanism; item 20 adds the secret to the redaction of `@taskelith/secrets`, item 21, whose amended plan row owns the delivery to a run, scrubs it on that path (`/docs/g3-plan.md` rows 20 and 21, lines 117 and 118). Checked: `SECRET_SHAPE_RULES` (`packages/modules/observability/src/domain/redaction-rules.ts:88`) has no SCM shape, and a search of `packages/` and `apps/` finds `scrubEnvironment` only in `packages/adapters/secrets/src/` and its test.
- M1, contract sections 1 (`:11`) and 6 (`:72`): items 9, 26, and 37 own the receiver's operation, TLS, and installation; G2 publishes the API on `127.0.0.1` over HTTP (`infra/installation/compose.yaml:70`, `/docs/local-installation.md` lines 28 and 99).
- H1b, contract section 8 (`:97`) and the added requirement "Conformance findings without payloads": `describeThrown` (`packages/modules/integrations/src/ports/untrusted-shapes.ts:136`) at every exception site: `conformance-case.ts:38`, `:80`, `:92`; `conformance-steps.ts:33`; `untrusted-shapes.ts:49`, `:86`, `:108`; the unknown failure code at `untrusted-shapes.ts:100`. `describe` was renamed `describeValue` (`:113`) without its `Error` branch; `credential-cases.ts` and `merge-cases.ts` use it for checked values only.
- L1, contract section 2 rule 3 (`:20`) and the modified "Opaque SCM identifiers": `kernelIdentifier` (`untrusted-shapes.ts:21`, kernel `parseIdentifier`), `externalIdentifier` and `externalIdentifiers` (`:33`, `:36`, bound `MAX_EXTERNAL_IDENTIFIER_LENGTH` 1024 at `:25`); `nonEmptyText` (`:14`) reads only the secret. `source-control-readers.ts` uses them for `runId`, `credentialId`, `repositories`, every `repository`, `id`, `headCommit`, `commit`, `changeRequest`, `mergeCommit`, and `deliveryId`.
- M2, contract sections 3 (`:34`) and 7 (`:82`, `:93`) and the modified "Effective permissions": the gate is recorded; `credential-cases.ts:14-15` names it; the suite already reports a `write-code` grant to the change request and status requests (`source-control-results.test.ts`, "an effective grant beyond the request is allowed, but not write-code").
- M1b, coordinator decision (Niki, 2026-10-27) option A: `/docs/g3-plan.md` row 9 (line 106) adds the message for a refreshed per-run SCM credential, row 18 (line 115) its adoption by passing the run's current credential to the item 16 workspace per operation, row 20 (line 117) the port revision that keeps the previous secret until the run confirms adoption, and row 21 (line 118) the delivery, a refreshed credential included, with the secret scrubbed. Contract section 3 (`:38`), section 9 (`:111-112`), and section 10 (`:119`), and the added requirement "Refreshed credential delivery", name them. No "Depends on" entry or wave changed ([design.md](design.md), decision 6).
- Spec delta bodies: "Opaque SCM identifiers" 344 characters, "Effective permissions" 439, "Credential refresh and revocation" 285, "Run credential secret" 296, "Refreshed credential delivery" 352, "Conformance findings without payloads" 190. Each modified requirement copies the current text and keeps its scenarios.
- Plan checklist: [design.md](design.md), section "Plan checklist".

## Checks and results

- Fail-before: the two new test files, `test/source-control-diagnostics.test.ts` and `test/source-control-identifiers.test.ts`, run with `node --experimental-strip-types --test` against the built `src` of `4fe09456`: tests 16, pass 0, fail 16. The diagnostics tests failed because findings held the synthetic secret `scm-secret-7f3a9c`, for example `change request threw: readChangeRequest threw instead of returning a Result: Error: scm-secret-7f3a9c`, `change request fixture: prepareHeadBranch threw: Error: scm-secret-7f3a9c`, `read-only credential threw: the case stopped: Error: scm-secret-7f3a9c`, `... credential could not be read: Error: scm-secret-7f3a9c`, `capabilities could not be read: Error: scm-secret-7f3a9c`, `... readChangeRequest threw instead of returning a Result: {"token":"scm-secret-7f3a9c"}`, `... scm-secret-7f3a9c: x` (an error class named like the secret), `result.error.code scm-secret-7f3a9c is not a kernel failure code`, and `result.error.details` and `result.value could not be read: Error: scm-secret-7f3a9c`. The identifier tests failed because no shape finding was reported for an empty or whitespace `runId`, an empty or 1025-character credential repository, or an empty protection, change request, status, merge, or webhook identifier. After the fail-before run, one assertion with a thrown `Proxy` whose `getPrototypeOf` throws was added to the test "a thrown value that is not an Error is reported without its payload", which had already failed on its first assertion.
- `node --experimental-strip-types --test --experimental-test-coverage --test-coverage-include='packages/modules/integrations/dist/**/*.js' packages/modules/integrations/test/*.test.ts` after `npm run build`: tests 77, pass 77, fail 0; all files 99.22% lines, 97.05% branches, 99.23% functions.
- After the merge of `c3e97105` and the M1b edits, every check below was run again with the same results, except `make findings ARGS="validate"`, whose counts grew with the merged records.
- `npm run build` (exit 0) and `npm run check:boundaries`: `Workspace and hexagonal boundary checks passed.`
- `npm run verify:comments`: `Every comment is within the comment length rule.`
- `npm run verify:links`: `Every checked link conforms.`
- `make findings ARGS="validate"`: `Every findings file is valid: 34 file(s); every pass summary file is valid: 14 file(s).`
- `npm run openspec -- validate align-scm-port-with-g2-credentials --strict`: `Change 'align-scm-port-with-g2-credentials' is valid`.
- `npm run verify:archive`: `Every active OpenSpec change archives into strictly valid specs.`
- `make verify`: not run by the worker (a shared machine slot); the coordinator runs it.

## Independent review

- Pass 1, reviewer A: Codex CLI `gpt-6.1-sol`. Not run yet.
- Pass 2, reviewer B: Claude Code `claude-opus-5-5`, effort high. Not run yet.
- Pass 3, reviewer A: Codex CLI `gpt-6.1-sol`. Not run yet.

## Limitations

- Outcome findings still print checked plugin values, such as a credential's run, repositories, and permissions, through `describeValue`; a plugin that places a secret in such a field reaches the report. The secret field itself is never printed.
- A thrown error of a non-built-in class is reported only as "an Error of another class", which tells the plugin author less than its message did.
- The bound of 1024 characters for external identifiers is the module's choice, not a service limit.

## Remaining gates

- `make verify` on the final tree.
- Independent review: reviewer A passes 1 and 3, reviewer B pass 2.
- Archive of the change.
- Integration into dev by the coordinator (single pull request).
