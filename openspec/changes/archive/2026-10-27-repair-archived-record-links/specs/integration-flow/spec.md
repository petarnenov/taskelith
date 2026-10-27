## MODIFIED Requirements

### Requirement: Record link check
`make verify` SHALL run `npm run verify:links` before the archive dry run. It SHALL fail on each inline or reference Markdown link under `openspec/changes/`, `openspec/specs/`, and `docs/`, outside code and HTML, without a URI scheme, whose target or GitHub heading anchor is missing, that enters an active change, or that is relative and leaves its change directory, capability directory, or the repository, or sits in a spec delta. Active changes SHALL be checked at their archived path.

#### Scenario: Link out of the change directory
- **WHEN** an active change's `design.md` links `../../../../docs/governance.md`, which resolves once the change is archived
- **THEN** `make verify` fails and prints the file, the line, the target, and that the link must be root-relative

#### Scenario: Link that archiving would break
- **WHEN** an active change links `../../../docs/governance.md`, which resolves only from the change's current directory
- **THEN** the check fails before the change is archived

#### Scenario: Root-relative link
- **WHEN** a record links `/docs/governance.md#independent-review-process` and that heading exists
- **THEN** the check passes

#### Scenario: Missing anchor
- **WHEN** a link names an anchor that no heading of its target produces, counting the `-1` suffix of a repeated heading
- **THEN** the check fails and names the missing anchor

#### Scenario: Link into an active change
- **WHEN** a document or an archived record links into an active change's directory
- **THEN** the check fails, because the target moves when that change is archived

#### Scenario: Code and external links
- **WHEN** a link is inside a code block, a code span, or raw HTML, or starts with a URI scheme such as `https:`, `mailto:`, or `tel:`
- **THEN** the check ignores it

#### Scenario: Archived record
- **WHEN** an archived record holds a link that fails any of these rules
- **THEN** the check fails on it; no list of accepted archived links exists

## REMOVED Requirements

### Requirement: Record link baseline
**Reason**: The owner chose to repair the archived links (decision B1, 2026-10-27). The change rewrote all 332 baselined link destinations, so the baseline would hold no entry and could never grow.
**Migration**: None. Fix a failing archived link in its record; `scripts/record-links-baseline.tsv` is removed.
