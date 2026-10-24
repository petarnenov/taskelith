## Why

On 2026-10-24 the owner reviewed a clickable UI proof of concept screen by screen and made product decisions that the repository does not record yet: the project board as landing page, its screens and states, auto-merge as the integration authority with automatic conflict handling, intake with write-back, automatic worker admission, and new capabilities as plugins. The owner also decided that auto-merge wins over every conflicting rule and that Taskelith's own development may select its SDLC framework, with OpenSpec as the default. The owner asked that these decisions be recorded in an ADR and in OpenSpec.

## What Changes

- Add ADR 0008 with the six decisions and the gate in which each is implemented.
- Amend ADR 0004 principle 8 and ADR 0003 decision 11 with dated amendments that point to ADR 0008.
- Update the governance policy to version 3 (integration authority, selectable framework), and update the architecture, the foundation ledger, the repository instructions, and the README to match.

## Capabilities

### New Capabilities
- `product-ui`: the board as landing page, lifecycle columns, gate states, board states, screens, intake, and design rules.
- `auto-merge-authority`: the per-project auto-merge setting as integration authority, standing approval rules, serial merges, and the conflict-resolution flow with its budget and escalation.

### Modified Capabilities
- `engineering-principles`: the mandatory-OpenSpec requirement becomes a requirement that every Taskelith task binds to the selected framework, with OpenSpec as the default.

## Impact

Documentation and policy only. No product code, dependency, or runtime behaviour is added. This repository keeps using OpenSpec. The decisions bind later gates (G2 to G5); none is implemented by this change.
