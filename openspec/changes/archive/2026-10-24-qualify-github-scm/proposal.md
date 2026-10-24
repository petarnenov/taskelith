## Why

ADR 0006 made GitHub.com the first SCM and set its G0 qualification target: GitHub App permissions, installation-token scoping and expiry, pull request, review, commit-status, and branch-protection APIs, signed webhooks, and recorded terms. The owner created and installed a qualification GitHub App on 2026-10-24 and asked to run the qualification in the `taskelith` repository instead of a sandbox.

## What Changes

- Record the App setup, terms, method, and results of the GitHub.com qualification, including the administrator-bypass finding.
- Add a register section for SCM integrations and update the foundation ledger.
- Add an `scm-qualification` capability that states what an SCM qualification must prove.

## Capabilities

### New Capabilities
- `scm-qualification`: Reproducible evidence that an SCM plugin's credentials, merge blocking, and webhooks meet the trust model before admission.

### Modified Capabilities

None.

## Impact

Documentation only. The probe ran against the real repository on temporary branches, deleted the branches and protection it created, and closed its pull requests; closed pull requests, reviews, and statuses remain as public records. GitHub.com stays `candidate`.
