## Context

`release.config.js` uses `@semantic-release/commit-analyzer` 13.0.1 with the `conventionalcommits` preset and no `releaseRules`, so the analyzer's default rules apply: a breaking change is major, `feat` is minor, and `fix`, `perf`, and a revert are patch. Before applying them, `index.js` calls `filterRevertedCommitsSync`, which drops a revert and the commit it reverts when both are in the analyzed range.

## Goals / Non-Goals

**Goals:**
- One consistent list of release and no-release commit types in the protocol and the release table.

**Non-Goals:**
- Changing the release configuration or the classification test.

## Decisions

- **Revert row.** The `conventionalcommits` parser marks a commit as a revert when its message matches the case-insensitive `revertPattern`: `Revert` or `revert:`, optional quotes around the reverted header, then `This reverts commit <hash>.`; a `revert:` header alone matches no rule. The row gives two examples of that form, and the paragraph below the table states the pair filtering.
- **Protocol wording.** Step 3 reserves every type that can trigger a release for the published package, so `perf` and a revert join `feat` and `fix` there, and `ci` joins the private-work types.
- **No specification delta.** The `automated-releases` requirement already calculates versions from Conventional Commits, and its scenarios stay true; the change documents the rules it applies.

## Risks / Trade-offs

- The two new rows are not in the classification test → this change is documentation only, as assigned; the evidence is a run of the analyzer with the repository's configuration, recorded in verification.
