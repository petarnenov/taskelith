## Context

The coordinator's brief (Niki, 2026-10-28), approved by the owner on 2026-10-28, names the gap in `scripts/check-contract-compatibility.ts` at `24d25938`: `declaresBreakingChange` treats a higher minor version while the major version is 0 as a declaration, and `compatibilityProblems` then accepts every breaking change the detectors report. G3 item 17 declared 306 changes of the SDLC AsyncAPI document that way. The check compares each document of `CONTRACT_DOCUMENTS` with its version at the merge base of `HEAD` with `origin/dev`: OpenAPI documents with the digest-pinned oasdiff container, AsyncAPI documents in process with `@asyncapi/diff`.

## Goals / Non-Goals

**Goals:** every breaking change that a version declares is listed, one by one, in a tracked file that review and history can read; `make verify` fails deterministically on an unlisted or stale change and on a malformed file; authors get the list from a read-only command.

**Non-Goals:** version 1.0 of any contract; changes to the contract documents or the detectors; a writer that edits the file.

## Decisions

1. **Capability `sdlc-wire-contracts`.** The brief names `contract-tooling`, but that capability holds the tool evaluation, and "Breaking-change check" lives in `sdlc-wire-contracts`. The coordinator decided (Niki, 2026-10-28, option c): the four requirements are added to `sdlc-wire-contracts`, and "Breaking-change check" is modified, its living text kept except where it must point to "Declared breaking changes listed", so that it no longer says that a version bump alone passes. Its "Declared breaking change" scenario now names the entry; its text was shortened in two places (the 0.x clause and the semantic versioning clause) to stay under the 500-character limit of strict validation.
2. **File format.** `packages/contracts/breaking-changes.json` is `{ "declarations": [...] }`, each entry `{ "path", "version", "reason", "breakingChanges" }`. The strings of `breakingChanges` are the ones the check already reports after `breaking change ... over <base>:`, so existing messages and the file use one vocabulary. JSON matches the other records the repository validates with ajv; one array keeps history in one place.
3. **Validation.** `breaking-changes.schema.json` (JSON Schema 2020-12, checked with the repository's ajv adapter `ajvSchemaCheck`) requires the four properties, rejects others, and requires a non-blank reason and at least one change. The code then checks what the schema cannot: a path of `CONTRACT_DOCUMENTS`, a semantic version, a unique path and version, entries sorted by path and version, and changes sorted and unique. A malformed file reports its problems and skips the comparison, so that one mistake does not hide behind many derived messages.
4. **Comparison.** For each document present at the merge base, with a valid head version:
    - head declares a breaking change (`declaresBreakingChange`, majors included) and an entry for that path and head version exists: its list must equal the computed list as a set; each computed change it lacks is undeclared, each listed change not computed is stale;
    - head declares one, the detectors find changes, and no entry exists: each change is undeclared;
    - head declares one and the detectors find none: no entry is needed, and an entry's listed changes are stale (kept as built by the coordinator's decision, Niki, 2026-10-28; "Declared breaking changes listed" states it and its scenario "Bump without found changes" shows it);
    - any other entry with a version above the merge-base version (semantic versioning precedence) is stale as a whole;
    - entries at or below the merge-base version are history and are not compared;
    - when the head declares nothing, `compatibilityProblems` applies unchanged.

    A document absent at the merge base needs no entry and its entries are not compared, because nothing defines its changes. When the merge-base version is not a semantic version, its entries are not compared either; the head version then declares nothing, so every breaking change fails as before.
5. **Determinism.** Computed changes are deduplicated and sorted by UTF-16 code units (`<`, never `localeCompare`), so neither the detectors' order, the locale, nor the host changes a result; versions are ordered by semantic versioning precedence, prerelease identifiers by its rules. `OASDIFF_IMAGE` stays pinned.
6. **Listing.** `make contract-breaking-changes` runs the script with `--print`, and with `--base <revision>` when `BASE` is set (a scope addition beyond the brief, approved by the coordinator, Niki, 2026-10-28), which reaches the script as typed, like `CHANGE` of `make record`. It prints the file's format to standard output, one entry per document with computed changes, with the head version and an empty reason that the author must fill (an empty reason fails validation), and logs to standard error. It never writes the file; the author copies the entry.
7. **History seed.** One entry, the SDLC AsyncAPI document 0.4.0 with reason "G3 item 17 (bind-evidence-to-code-head): gates and gate evidence bound to the code head, the gate, and its generation; listed against 9196804b.", lists the 306 changes against `9196804b`, the merge base item 17 declared them over. It was computed in process with the script's own `asyncapiContractChanges` and the pinned `@asyncapi/diff` and parser, twice with identical output, and equals the 306 changes `verification.md` of item 17 records; `make contract-breaking-changes BASE=9196804b` prints the same list in the same order (`verification.md`). Because the merge base `24d25938` already holds 0.4.0, the entry is history and is not compared.
8. **Docs.** The author workflow stays in the "New versions" bullet of `docs/contracts/execution-wire-contracts.md`, without a section of its own (coordinator's decision, Niki, 2026-10-28).

## Risks / Trade-offs

- A large declaration (306 lines) makes the file long; it is the point: each change is visible in the diff that introduces it.
- A detector upgrade that rewords its output makes the open entry stale; the failure names each change, and the listing gives the new list.
