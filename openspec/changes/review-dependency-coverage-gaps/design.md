## Context

The generator detects top-level LICENSE/COPYING/NOTICE files only. Some packages carry license statements in a README, in a monorepo root, or nowhere. The two advisories sit inside npm's own bundle, which lockfile overrides cannot change.

## Goals / Non-Goals

Record located evidence per path with version-specific sources, and keep the review bound to the inspected manifest. Do not change the gap detection rule, classify licenses automatically, interpret legal sufficiency, upgrade dependencies, patch vendor bundles, or grant a security exception.

## Decisions

Keep reviews in a separate hand-maintained file rather than in the generated inventory, so regeneration never overwrites reviewer judgement. Key each review by path, version, and manifest SHA-256 already present in the inventory. Require an exact match between gaps and reviews in both modes: an unreviewed gap, a stale review, a duplicate, an unknown status, or an entry without finding and evidence fails. Use three descriptive statuses: `text-located`, `notice-only`, and `declaration-only`. Prefer evidence at the registry `gitHead`; when none exists, cite an upstream license file that predates the publication date and state that the release commit is unestablished.

For advisories, compare the bundled `ip-address` and `undici` versions in the published tarballs of the plugin's resolved npm, the CI npm pin, and the plugin prerelease line against the first fixed versions.

## Risks / Trade-offs

Upstream URLs can disappear; commit-pinned permalinks reduce but do not remove that risk. Date-based inference is weaker than a release commit and is labeled as such. The review must be renewed whenever a manifest changes, which is intentional friction. Registry observations are time-dependent and dated.
