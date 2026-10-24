## Context

The architecture names no harness or SCM. ADR 0003 records the owner's selections and changes the rules: closed harnesses and providers are admissible, opt-out telemetry needs an egress test, open-core needs every required feature in the open-source edition, and license evidence stays light until G8.

## Goals / Non-Goals

Give a dated, source-backed assessment that matches ADR 0003. Do not admit a component, change the dependency register's statuses, install software, or claim qualification.

## Decisions

Derive requirements only from the architecture, the worker platform contract, the trust model, and ADR 0003, and list everything else as a preference. Use `verified`, `partial`, `unsupported`, and `unknown` for capabilities, and `ineligible`, `not ruled out`, and `not evaluated` for candidates not selected. Pin sources to a tag, commit, or exact package version; mark unversioned vendor pages with their retrieval date. Per ADR 0003 decision 9, one official source per license suffices. Keep the document out of the npm package and link it only from repository documentation.

## Risks / Trade-offs

Fast release cadences make version observations stale quickly; the date is explicit, and qualification must re-pin. Some capability evidence comes from unversioned vendor pages. Research used delegated agents; the author re-checked the cited capability lines at the pinned sources, and remaining claims carry the stated verification level.
