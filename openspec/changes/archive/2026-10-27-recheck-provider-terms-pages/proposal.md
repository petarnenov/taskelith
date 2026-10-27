## Why

G3 item 0 (`revalidate-g3-foundations`) re-reviewed the G3 provider terms record (item 2) and deferred seven findings to this change ([archived verification](/openspec/changes/archive/2026-10-27-revalidate-g3-foundations/verification.md#item-2)). The 2026-10-25 terms review omitted Anthropic passages that were already on the pages it cited: the Usage Policy clause on services that route requests through consumer subscriptions (pass 1 H1), the Agent SDK's governance by the Commercial Terms (pass 1 H2), the customer API key paragraph of the legal page (pass 1 L1), the broadened Usage Policy clause against bypassing restrictions, including the account sign-up or log-in process (pass 2 M2), the conditions of the hosting carve-out (pass 2 M3), and sign-in through Anthropic's own flow (pass 2 L1). The Codex status line still lists the provider terms as open (pass 2 L2). Pass 1 H3, on the Codex App Server page, was declined in item 0 and is declined here again with fresh evidence.

## What Changes

- `docs/qualification/claude-code.md`: quote the omitted passages verbatim from the live pages, accessed 2026-10-27, mark them so, and name the dated Wayback Machine snapshots that show each passage on its page before the 2026-10-25 review; add each passage to the "text says" and "ambiguous" bullets it bears on; state the open question for the owner on D15 and ADR 0005 decision 2 without a recommendation.
- `docs/qualification/codex.md`: the status line no longer lists the provider terms as open and points to the recorded review.
- No change to D15 in `docs/g3-plan.md`, to ADR 0005, or to any requirement.

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

Documentation only, two qualification records. No runtime impact. The change sets `skip_specs: true`: the requirement "Provider terms review" of `harness-qualification` already requires the record to quote each relevant clause with its URL, effective date, and access date, and this change fills that record without changing the requirement.
