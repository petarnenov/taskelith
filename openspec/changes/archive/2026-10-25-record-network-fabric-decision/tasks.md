## 1. Decision record

- [x] 1.1 Add `docs/decisions/0012-network-fabric-plugins.md` with the six decisions, the context, and the consequences.
- [x] 1.2 Add a network fabric row to the open-decisions table of architecture section 15.
- [x] 1.3 Record the three planned network fabric components in the dependency register as `candidate`.
- [x] 1.4 Renumber the ADR to 0012 after pass 1 found that 0011 was already used by the Mantine proof of concept.
- [x] 1.5 Update acceptance requirement R35 for the narrow closed-provider exception after pass 3.

## 2. Change artifacts

- [x] 2.1 Write the proposal, design, and task list; set `skip_specs: true`.
- [x] 2.2 Validate with `npm run openspec -- validate record-network-fabric-decision --strict`.
- [x] 2.3 Run `make verify`.
- [x] 2.4 Record the scope, author evidence, checks, and review history in `verification.md`.

## 3. Review and verification

- [x] 3.1 Independent review by the assigned reviewer: pass 1, pass 2, and pass 3 by Codex.
- [x] 3.2 Record the pass results, resolutions, and remaining gates in `verification.md`.
- [x] 3.3 Extra pass permitted by the owner; pass 4 confirmed the pass-3 resolutions, and its Low finding is fixed as an unreviewed fix.
