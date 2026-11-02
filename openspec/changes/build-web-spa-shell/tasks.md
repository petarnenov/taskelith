## 1. Change

- [x] 1.1 Create the change, save the brief's `checklist.json` (`--size M-L`), and add the empty `findings.jsonl` and `passes.jsonl`

## 2. Implementation and tests

- [x] 2.1 Fail-before test that the web build ignores `NODE_ENV`, then the fix in `vite.config.ts`
- [x] 2.2 Theme with the system fonts, the 44 px defaults, and contrast settings, with the WCAG contrast test in both schemes
- [x] 2.3 Session gateway over `readSession`, `logIn`, and `logOut`, and the session provider with the expiry check
- [x] 2.4 Sign-in page, `AppShell` layout, D10 navigation, account menu, color scheme toggle, and the seven icons
- [x] 2.5 Routes under `/app` with an empty page per screen and a not-found page
- [x] 2.6 React Router's library texts in the bundle URL allowlist, each with its reason
- [x] 2.7 Tests for each behavior, with coverage of at least 75%

## 3. Records and checks

- [x] 3.1 Write the proposal, the design, the spec delta, this task list, and the README section
- [x] 3.2 Route the change, run `make verify`, and write `verification.md`

## 4. Review and archive

- [ ] 4.1 Review passes recorded in `passes.jsonl`, `findings.jsonl`, and `verification.md`
- [ ] 4.2 Architect check by the coordinator of any unreviewed fixes
- [ ] 4.3 Archive the change in the last commit of the branch
