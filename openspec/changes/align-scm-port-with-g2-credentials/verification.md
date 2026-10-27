# Verification: align-scm-port-with-g2-credentials

## Scope and source

A worker task the coordinator (Niki) assigned on 2026-10-27, developed in a briefed subagent: the G3 item 7 follow-up of the item 0 revalidation (`/docs/g3-plan.md`, items 0 and 7), size M. Source: Niki's brief from item 0 revalidation passes 1 (reviewer A, OpenCode `deepseek-v4-pro`) and 2 (reviewer B, `gpt-6-astra`) by Pepi, with findings H1, M1, H1b, M1b, M2, and L1. Scope: `docs/contracts/source-control.md`, the `scm-port` spec delta, the `docs/g3-plan.md` rows of items 9, 18, 20, and 21 (M1b, coordinator decision option A), and the private `@taskelith/integrations` package (`packages/modules/integrations/`, `"private": true`, so its commits are `chore` and `test`). Out of scope: any delivery path, redaction rule, webhook receiver, or plugin. Design: [design.md](design.md).

## Revision

- Base: `origin/dev` `4fe09456`.
- `032bc2ee` `docs: align the SCM port contract and spec with the G2 credential model` (contract, spec delta, and change records, before the code).
- `29e42d82` `chore(integrations): keep raw payloads out of SCM conformance findings and check identifiers` (code and tests).
- `ae067aa8` `docs: record the align-scm-port-with-g2-credentials verification`.
- `c17c9b5b`: the coordinator merged `origin/dev` `c3e97105` into the branch, without conflicts.
- `bcd49ab3` `docs: assign refreshed SCM credential delivery to G3 items 9, 18, 20, and 21` (M1b).
- `60cc4b80`: the coordinator merged `origin/dev` `bd4382e8` (#357, archive files only) into the branch; reviewer A's pass 1 reviewed this head.
- `b74d1954` `chore(integrations): keep plugin and fixture values out of every SCM conformance finding` (pass 1 findings R1 to R3, with tests).
- `8e8ce090` `docs: record review pass 1 of the align-scm-port-with-g2-credentials change` (the contract and spec for R1, and the pass 1 records, R4 and R5); reviewer B's pass 2 reviewed this head.
- `1883aee3` `chore(integrations): report a revoked Proxy result as a shape finding` (pass 2, L4, with its test).
- A later `docs` commit: the pass 2 fixes to the contract, the plan rows, the spec delta, and the records.

## Environment

macOS 26.6.2 (Darwin 25.6.0), x86_64, the Intel iMac; Node.js v24.22.1 through `nvm use` from `.nvmrc`.

## Author self-check

- H1, contract section 3 (`docs/contracts/source-control.md:35`) and the added requirement "Run credential secret": G2 has no mechanism; item 20 adds the secret's shape to the shared `SECRET_SHAPE_RULES` of `@taskelith/observability`, which log redaction (`packages/modules/observability/src/domain/redaction.ts:13`) and `@taskelith/secrets` (`packages/adapters/secrets/src/scrub.ts:6`) both use; item 21, whose amended plan row owns the delivery to a run, scrubs it on that path (`/docs/g3-plan.md` rows 20 and 21, lines 117 and 118). Checked: `SECRET_SHAPE_RULES` (`packages/modules/observability/src/domain/redaction-rules.ts:88`) has no SCM shape, the marked-position rules (`:86`) match a secret only after a marker, and a search of `packages/` and `apps/` finds `scrubEnvironment` only in `packages/adapters/secrets/src/` and its test.
- M1, contract sections 1 (`:11`) and 6 (`:73`): items 9, 20, 26, and 37 own the receiver's operation, the receiver, its TLS, and the installation; G2 publishes the API on `127.0.0.1` over HTTP (`infra/installation/compose.yaml:70`, `/docs/local-installation.md` lines 28 and 99).
- H1b, contract section 8 (`:98`) and the added requirement "Conformance findings without payloads": `describeThrown` (`packages/modules/integrations/src/ports/untrusted-shapes.ts:134`) at every exception site: `conformance-case.ts:41`, `:87`, `:99`; `conformance-steps.ts:33`; `untrusted-shapes.ts:49`, `:71`, `:93`, `:115`; the unknown failure code at `untrusted-shapes.ts:107`. The former `describe` is removed (pass 1, R1).
- Pass 1 R1: no finding interpolates a plugin or fixture value; the messages of `credential-cases.ts`, `conformance-steps.ts`, `merge-cases.ts`, and `webhook-cases.ts` name the field and the mismatch, probes name the permission and "the project repository" or "the foreign repository", and a context outside the suite's own is "another required context" (`describeContext`, `conformance-steps.ts:182`). What remains interpolated is the suite's own: operation and step names, the port's constants, the suite's contexts and probe phrases, validated states, and kernel failure codes.
- Pass 1 R2: `fixtureResult` (`conformance-case.ts:104`) reads a fixture `Result` through `readResult`; `attemptBypassMerge` (`merge-cases.ts:150`, `:161`) and `attemptAction` (`credential-cases.ts:194`) use it.
- Pass 1 R3: `abort` throws a frozen object registered in a module-private `WeakSet` (`conformance-case.ts:14`, `:33`), and `isAbortion` (`:47-48`) checks only `typeof` and `WeakSet.has`, which run no trap of a thrown `Proxy`.
- L1, contract section 2 rule 3 (`:20`) and the modified "Opaque SCM identifiers": `kernelIdentifier` (`untrusted-shapes.ts:21`, kernel `parseIdentifier`), `externalIdentifier` and `externalIdentifiers` (`:33`, `:36`, bound `MAX_EXTERNAL_IDENTIFIER_LENGTH` 1024 at `:25`); `nonEmptyText` (`:14`) reads only the secret. `source-control-readers.ts` uses them for `runId`, `credentialId`, `repositories`, every `repository`, `id`, `headCommit`, `commit`, `changeRequest`, `mergeCommit`, and `deliveryId`.
- M2, contract sections 3 (`:34`) and 7 (`:83`, `:94`) and the modified "Effective permissions": the gate is recorded; `credential-cases.ts:13-14` names it; the suite already reports a `write-code` grant to the change request and status requests (`source-control-results.test.ts`, "an effective grant beyond the request is allowed, but not write-code").
- M1b, coordinator decision (Niki, 2026-10-27) option A: `/docs/g3-plan.md` row 9 (line 106) adds the message for a refreshed per-run SCM credential and the worker's adoption confirmation, row 18 (line 115) its adoption by passing the run's current credential to the item 16 workspace per operation, with the confirmation, row 20 (line 117) the port revision, as version `0.2.0`, that keeps the previous secret until the run confirms adoption, and row 21 (line 118) the delivery, a refreshed credential included, with the secret scrubbed, and the end of the previous secret on the confirmation. Contract sections 2 rule 7 (`:24`), 3 (`:38`), 9 (`:111-112`), and 10 (`:119`), "Draft SCM port", and "Refreshed credential delivery" name them. No "Depends on" entry or wave changed ([design.md](design.md), decision 6).
- Spec delta bodies: "Draft SCM port" 374 characters, "Opaque SCM identifiers" 344, "Effective permissions" 439, "Credential refresh and revocation" 285, "Run credential secret" 341, "Refreshed credential delivery" 417, "Conformance findings without payloads" 375 (190 before pass 1, 313 before pass 2). Each modified requirement copies the current text and keeps its scenarios.
- Plan checklist: [design.md](design.md), section "Plan checklist".

## Checks and results

- Fail-before: the two new test files, `test/source-control-diagnostics.test.ts` and `test/source-control-identifiers.test.ts`, run with `node --experimental-strip-types --test` against the built `src` of `4fe09456`: tests 16, pass 0, fail 16. The diagnostics tests failed because findings held the synthetic secret `scm-secret-7f3a9c`, for example `change request threw: readChangeRequest threw instead of returning a Result: Error: scm-secret-7f3a9c`, `change request fixture: prepareHeadBranch threw: Error: scm-secret-7f3a9c`, `read-only credential threw: the case stopped: Error: scm-secret-7f3a9c`, `... credential could not be read: Error: scm-secret-7f3a9c`, `capabilities could not be read: Error: scm-secret-7f3a9c`, `... readChangeRequest threw instead of returning a Result: {"token":"scm-secret-7f3a9c"}`, `... scm-secret-7f3a9c: x` (an error class named like the secret), `result.error.code scm-secret-7f3a9c is not a kernel failure code`, and `result.error.details` and `result.value could not be read: Error: scm-secret-7f3a9c`. The identifier tests failed because no shape finding was reported for an empty or whitespace `runId`, an empty or 1025-character credential repository, or an empty protection, change request, status, merge, or webhook identifier. After the fail-before run, one assertion with a thrown `Proxy` whose `getPrototypeOf` throws was added to the test "a thrown value that is not an Error is reported without its payload", which had already failed on its first assertion.
- Fail-before for pass 1: seven tests added to `test/source-control-diagnostics.test.ts`, run against the built code of `60cc4b80`: tests 17, pass 10, fail 7; each new test failed on its first assertion. The R1 tests failed because outcome findings held the secret, for example `issueRunCredential returned run scm-secret-7f3a9c, not conformance-read-only`, `issueRunCredential granted ["read-code","scm-secret-7f3a9c"] for ["read-code"]`, `returned expiresAt scm-secret-7f3a9c, not a canonical future instant`, `readChangeRequest returned repository scm-secret-7f3a9c, not acme/project`, and `setCommitStatus returned context scm-secret-7f3a9c, not taskelith/verification`; the fixture test failed on a `signatureHeader` that held the secret. The R2 test failed on `attemptBypassMerge ... failed with scm-secret-7f3a9c`, and the R3 test failed because the run rejected with `Error: scm-secret-7f3a9c`.
- Fail-before for pass 2 (L4): the test "a revoked Proxy as a returned value is a shape finding", run against the built code of `8e8ce090`, failed with `read-only credential threw: the case stopped: a TypeError` instead of the expected shape finding.
- Results per revision:

| Check | `ae067aa8` | `bcd49ab3` (after merge `c17c9b5b`) | `8e8ce090` | Final tree (after `1883aee3`) |
| --- | --- | --- | --- | --- |
| Integrations tests with coverage (`node --experimental-strip-types --test --experimental-test-coverage --test-coverage-include='packages/modules/integrations/dist/**/*.js' packages/modules/integrations/test/*.test.ts`, after `npm run build`) | 77 of 77 pass; 99.22% lines, 97.05% branches, 99.23% functions | the same | 84 of 84 pass; 99.49% lines, 98.04% branches, 99.24% functions | 85 of 85 pass; 99.75% lines, 98.33% branches, 99.25% functions |
| `npm run build`; `npm run check:boundaries` | exit 0; `Workspace and hexagonal boundary checks passed.` | the same | the same | the same |
| `npm run verify:comments` | `Every comment is within the comment length rule.` | the same | the same | the same |
| `npm run verify:links` | `Every checked link conforms.` | the same | the same | the same |
| `make findings ARGS="validate"` | 33 findings files, 13 pass summary files valid | 34 and 14 valid | 35 and 15 valid | 35 and 15 valid |
| `npm run openspec -- validate align-scm-port-with-g2-credentials --strict` | valid | valid | valid | valid |
| `npm run verify:archive` | `Every active OpenSpec change archives into strictly valid specs.` | the same | the same | the same |

- `make verify` on `60cc4b80`, before pass 1, by the coordinator (Niki's worker session, macOS x86_64 iMac): exit 0, last line `Packed file allowlist and installed CLI verification passed.`
- `make verify` on `8e8ce090`, after the pass 1 fixes and before pass 2, by the coordinator (Niki's worker session, macOS x86_64 iMac): exit 0, last line `Packed file allowlist and installed CLI verification passed.`
- `make verify` after the pass 2 fixes: pending.

## Independent review

- Pass 1, reviewer A: Codex CLI `gpt-6.1-sol`, invoked as `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`. Model confirmation from the session header: model `gpt-6.1-sol`, reasoning effort medium, sandbox read-only, session `01a17e30-c2d5-7432-a273-61e226b7223f`. Run by the coordinator on HEAD `60cc4b80a5c52fc8a6232a8c8359f9cb1f831a92`; the worktree snapshot before and after was equal. The reviewer confirmed 77 of 77 tests and that the 16 tests of `29e42d82` fail on the code of `4fe09456`. Findings: Critical 0, High 2, Medium 2, Low 1, as in `passes.jsonl`; all fixed, unreviewed until pass 2:
  - R1 High (redaction, `credential-cases.ts:100`): outcome findings interpolated plugin and fixture values, so a secret in permissions, an invalid `expiresAt`, `runId`, or repositories reached the report. Fixed in `b74d1954`: fixed field paths and mismatch descriptions; the contract (section 8) and "Conformance findings without payloads" now cover every finding, and the earlier limitation about checked values is removed.
  - R2 High (redaction, `merge-cases.ts:152`): `attemptBypassMerge` failure codes were interpolated without validating the fixture's `Result`. Fixed in `b74d1954` with `fixtureResult`.
  - R3 Medium (error-handling, `conformance-case.ts:38`): `instanceof CaseAborted` could run a thrown `Proxy`'s `getPrototypeOf` trap, which rejected the whole run. Fixed in `b74d1954` with the `WeakSet` of aborts.
  - R4 Medium (process, `verification.md:42`): the `make verify` before review was not recorded. Recorded above, with the post-fix run pending.
  - R5 Low (stale-citation, `verification.md:14`): the revision list and the per-revision counts were stale, as were contract citations. The revision list, the results table, and every citation were checked again.
- Pass 2, reviewer B: Claude Code `claude-opus-5-5`, invoked as `claude -p ... --model claude-opus-5-5 --effort high --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json < /dev/null`. Model confirmation: `claude-opus-5-5` in the result's `modelUsage`; effort high from the invocation. Session `c8a4b74c-e6e5-4612-884d-720448756f3f`, run by the coordinator on HEAD `8e8ce090347f251e2ba3d4dafb38090706070a84`; the worktree snapshot before and after was equal. The reviewer confirmed the pass 1 fixes and found no path for a plugin or fixture value, a secret, or a raw payload to reach a finding; it did not run the integrations tests, which need a build that writes files. Findings: Critical 0, High 0, Medium 5, Low 7, as in `passes.jsonl`; all fixed, unreviewed until pass 3:
  - M1 Medium (docs, `docs/g3-plan.md:106`): no row owned the adoption confirmation. Within coordinator decision option A, row 9 carries the confirmation, row 18 sends it, and row 21 ends the previous secret through item 20's revised port; contract section 3 and "Refreshed credential delivery" say so.
  - M2 Medium (contract-drift, `docs/contracts/source-control.md:24`): rule 7 kept the port at `0.1.0`, against item 20's revision. Rule 7, plan row 20, and "Draft SCM port" now give the revision version `0.2.0`.
  - M3 Medium (docs, `docs/contracts/source-control.md:35`): the redaction obligation named `@taskelith/secrets`, which logs do not use. The contract, plan row 20, "Run credential secret", and design decision 1 now name the shared `SECRET_SHAPE_RULES` of `@taskelith/observability`.
  - M4 Medium (spec-wording, `specs/scm-port/spec.md:53`): the requirement forbade every supplied value, while the code names validated states and failure codes. It now excepts a value equal to a port constant or a kernel failure code, as contract section 8 does.
  - M5 Medium (process, `verification.md:54`): the `make verify` before pass 2 was not recorded. It ran; the record lagged, not the check. Recorded above, with the post-fix run pending.
  - L1 Low (docs, `docs/contracts/source-control.md:35`): the G2 redaction facts omitted the marked-position rules. Section 3 and design.md now list them and say no rule matches a bare SCM token outside them.
  - L2 Low (docs, `docs/contracts/source-control.md:11`): the receiver's owners omitted item 20. Added to the section 1 table and section 6.
  - L3 Low (docs, `docs/contracts/source-control.md:9`): the `RunCredentialIssuer` client row did not name item 21. Added.
  - L4 Low (error-handling, `packages/modules/integrations/src/ports/untrusted-shapes.ts:63`): a revoked `Proxy` stopped the case. `readRecord` and `textRecord` check the type inside a `try` (`1883aee3`), with a test that failed before.
  - L5 Low (evidence-mismatch, `findings.jsonl:1`): R1 named one commit. Its resolution now names `b74d1954` and `8e8ce090`.
  - L6 Low (stale-citation, `verification.md:17`): the revision list did not name `8e8ce090`. It does now.
  - L7 Low (process, `verification.md:58`): pass 1 lacked its invocation and model confirmation. Both are recorded.
- Pass 3, reviewer A: Codex CLI `gpt-6.1-sol`. Not run yet.

## Limitations

- A finding names neither the credential nor the value that differed, so a plugin author must reproduce a mismatch to see it.
- A thrown error of a non-built-in class is reported only as "an Error of another class", which tells the plugin author less than its message did.
- The bound of 1024 characters for external identifiers is the module's choice, not a service limit.

## Remaining gates

- `make verify` after the pass 2 fixes.
- Independent review: reviewer A pass 3.
- Archive of the change.
- Integration into dev by the coordinator (single pull request).
