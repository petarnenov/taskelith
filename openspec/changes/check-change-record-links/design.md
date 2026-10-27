## Context

A change's records live in `openspec/changes/<change>/` while it is developed and in `openspec/changes/archive/<date>-<change>/` after `openspec archive`, which moves the directory and rewrites no link. The archive name is the change name with the local calendar date in front, unless the name already starts with a date (`formatLocalDate` and `ARCHIVE_DATE_PREFIX_PATTERN` in the pinned CLI's `dist/core/archive.js`). Archiving also copies the requirement text of each spec delta into `openspec/specs/<capability>/spec.md`. The repository's other record checks are small scripts run by `make verify`: `scripts/check-comment-length.ts`, `scripts/findings.ts`, and `scripts/check-archive-dry-run.ts`, each with a test file under `test/`.

## Goals / Non-Goals

**Goals:** a link written into a change's records keeps working after the change is archived; documents link only targets and anchors that exist; the archived links that break the rule are known and can only become fewer.

**Non-Goals:** rewriting archived records; checking links with a URI scheme, which the evidence check covers by pinning; checking reference-style definitions that no link uses; checking links outside `docs/` and `openspec/`.

## Decisions

1. **Where a relative link may point.** In a change record a relative link must resolve inside the change directory, so `proposal.md`, `./proposal.md`, and `specs/<capability>/spec.md` are allowed: the subtree moves with the record. Everything else is root-relative (`/docs/governance.md`), which GitHub resolves against the repository root. A spec delta allows no relative link, because its text is copied into `openspec/specs/<capability>/spec.md`, where a relative path resolves against another directory. A main spec's relative link stays inside its capability directory. Documents under `docs/` may use any relative link that stays in the repository; they do not move, and the packaged `docs/architecture.md` must keep relative links for `scripts/verify-package.ts`.
2. **Active changes at their archived path.** The check places each file of an active change at `openspec/changes/archive/<date>-<change>/`, with the date the CLI would use, resolves its links there, and maps a target inside that directory back to the active one. A link that only works from the active path therefore fails before the archive, and a root-relative link to the change's own future path is accepted.
3. **No link into an active change.** A target under `openspec/changes/<change>/` other than `archive/` moves when that change is archived, so documents and records may not link it; a change's links to its own files are relative and resolve inside its archived path, so they are not affected.
4. **Parsing and anchors.** `marked` 15.0.12's GFM lexer, not hand-written regular expressions, finds the links and headings, because review pass 1 showed patterns that missed CommonMark's forms: destinations with parentheses or on the next line, titles in parentheses, indented and block-quoted code, multi-line code spans, Setext headings, and entities. Link and image tokens give the target, reference-style links included, each reported at its use; code, code spans, and raw HTML give no link. Lexer tokens carry no position, so a link's line is found by searching its raw text from the previous match. Anchors are GitHub heading slugs of the heading's rendered text: emphasis markers, images, and raw HTML dropped, code spans verbatim, entities decoded, then lowercased, punctuation other than `-` and `_` dropped, spaces turned into hyphens, and a repeated slug numbered `-1`, `-2`, and so on. An anchor is checked only when the target is a Markdown file, and a fragment-only link in a spec delta is rejected like any other relative link.
5. **Baseline instead of rewriting the archive.** The archive is the record of what was reviewed, so it is not edited. `scripts/record-links-baseline.tsv` holds one tab-separated file and target per failing archived occurrence, sorted; each entry suppresses one occurrence, so a second copy of a known link in the same file still fails. An entry outside `openspec/changes/archive/` is rejected and a leftover entry is reported as stale, so the baseline can only shrink. File and target, without the line, keep an entry stable if a correction elsewhere in the file shifts lines.
6. **One rule for archived records.** Archived records are held to the same rule as active ones; the 7 archived links that leave their directory but resolve are in the baseline too, so a future archived record cannot add such a link.
7. **Shape.** Pure functions for parsing (`markdownLinks`, `headingAnchors`), a `LinkChecker` that resolves links against a root directory and caches anchors, `findLinkProblems` over the scanned directories, and `parseBaseline`, `applyBaseline`, and `linkReport` for the baseline and output, as in the neighbouring check scripts. Tests use temporary directory fixtures.

## Review checklist

The checklist that the worker brief supplied on 2026-10-27, verbatim:

```text
Review checklist (capabilities agent-task-protocol, review-process, development-environment, bootstrap-governance; files scripts/**, docs/**), most frequent finding categories first:
1. contract-drift (7): Code, a contract document, and its specification disagree. Example: "The requirement stated only the capability rule for code findings, while the tool also rejects a record finding naming an unknown capability"
2. docs (5): Documentation is missing, wrong, or out of date with the change. Example: "The Ubuntu register row still said the linux/arm64 installation images were not built or run"
3. redaction (5): A secret or private value can leak into output, logs, or records. Example: "The NATS seed pattern misses server, cluster, and curve seeds"
4. error-handling (3): A failure is swallowed, misreported, or leaves inconsistent state. Example: "The Linux crash windows script mounted the services secrets without checking that their variable is set"
5. process (3): A protocol, governance, or review rule was not followed. Example: "The findings operations have no Makefile entry"
6. evidence-mismatch (1): A recorded result, count, or claim differs from what the checks show. Example: "The platforms document and the table summary said every row keeps an open part, though three rows are met for their G2 part"

Record quality (archived findings under openspec/changes/), most frequent finding categories first:
1. docs (18): Documentation is missing, wrong, or out of date with the change. Example: "The safe-to-retry conflict with the supervisor identity contract was recorded only as a limitation"
2. evidence-mismatch (16): A recorded result, count, or claim differs from what the checks show. Example: "The after-fix perturbation ran before the pins, which overwrite it, yet the record presented it as surviving the perturbation"
3. stale-citation (10): A cited file line, commit, or record no longer matches its target. Example: "Merge 72003c4 was described only as the UI proof-of-concept documents"
4. spec-wording (9): A requirement or scenario is ambiguous, untestable, or inaccurate. Example: "The retryable statuses read as an exit code other than either 0 or a signal"
5. contract-drift (3): Code, a contract document, and its specification disagree. Example: "The requirement stated only the capability rule for code findings, while the tool also rejects a record finding naming an unknown capability"
6. process (2): A protocol, governance, or review rule was not followed. Example: "The findings operations have no Makefile entry"
```

How this change addresses the top categories:

- **contract-drift.** The `integration-flow` requirements, worker step 6, the governance evidence check, and the script state the same rule: same-directory or root-relative links in records, root-relative only in spec deltas, no link into an active change, and existing targets and anchors. Each scenario has a test.
- **docs.** Worker step 6 and the evidence check describe the rule and the baseline; the one broken document link is fixed.
- **redaction.** The check prints only repository paths, line numbers, and link targets that are already in tracked files.
- **error-handling.** A malformed baseline line or an entry outside the archive fails the check with its line or path instead of being ignored; a stale entry fails instead of passing silently.
- **process.** The check runs in `make verify`, so the rule is enforced at every push, not only in review.
- **evidence-mismatch and stale-citation.** Every count and citation in these records was produced by the commands in `verification.md` on the revision it names, and this change's own links follow the new rule, which `npm run verify:links` checks at the change's archived path.
- **spec-wording.** The requirements name the exact directories, link kinds, and outcomes, and keep under 500 characters for strict validation after archive.

## Risks / Trade-offs

- A branch with an active change that uses `../` links fails `make verify` after merging `dev`; the message names the root-relative fix.
- Root-relative links resolve on GitHub but not in every local Markdown viewer; records are read on GitHub, and the packaged documents keep relative links.
- The slug rules follow GitHub's for the forms the tests cover; a heading whose rendered text differs in another way, for example through inline HTML that GitHub keeps, would show as a reported missing anchor.
- A link that spans block quote lines is reported at the line of the previous match.
- The baseline accepts the 331 archived links for as long as the archived records keep them.
