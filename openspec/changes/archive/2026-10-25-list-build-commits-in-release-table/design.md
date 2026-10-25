## Context

`release.config.js` configures `@semantic-release/commit-analyzer` with the `conventionalcommits` preset and no `releaseRules`. The analyzer then applies its default release rules (`lib/default-release-rules.js` of the installed 13.0.1).

## Goals / Non-Goals

**Goals:**
- Document the release behavior of `build:` and `ci:` commits from the configuration, not from habit.

**Non-Goals:**
- Changing the release configuration, or documenting other types that the defaults release, such as `perf:` and reverts, which this repository does not use today.

## Decisions

- **Evidence.** The default rules release breaking changes (major), reverts (patch), and the types `feat` (minor), `fix` (patch), and `perf` (patch), and the upper-case types `FEAT` and `FIX` of the JSHint convention; the remaining rules match the `emoji`, `tag`, and `component` fields of other conventions, which the `conventionalcommits` parser does not produce; `load-release-rules.js` loads only configured rules, never preset rules. A `build:` or `ci:` commit without a breaking change therefore matches no rule and publishes no release.
- **Requirement.** The matching requirement, "Automatic semantic versions", keeps its full text and its first scenario; only the non-release scenario names the two added types.

## Risks / Trade-offs

- A future analyzer version could change its defaults → the configuration pins the behavior only through the installed version, which the dependency inventory records.
