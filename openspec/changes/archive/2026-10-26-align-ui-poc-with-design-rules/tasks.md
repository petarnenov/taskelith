## 1. Touch targets

- [x] 1.1 Measure every interactive target of the current build in a headless browser.
- [x] 1.2 Set theme default props so that every component kind reaches 44 px, and remove the explicit 44 px props that the theme now covers.
- [x] 1.3 Give the board card's `UnstyledButton`s `mih` 44 px and drop `size="xs"` from the vertical segmented controls.

## 2. Contrast

- [x] 2.1 Measure text contrast in both color schemes.
- [x] 2.2 Keep Mantine's default colors, as the owner decided, and record the default ratios below 4.5:1 as a departure for item 28.

## 3. Documentation and build

- [x] 3.1 Replace the README section on the departures with the design rules' status, and rewrite the ADR 0011 consequence as history.
- [x] 3.2 Rebuild the proof of concept as the README says, measure it again, and record its size and SHA-256 for version 7.

## 4. Verify

- [x] 4.1 Run `npm run openspec -- validate align-ui-poc-with-design-rules --strict` and `make verify`.
- [x] 4.2 Independent review and record it in `verification.md` (passes 1 to 3 recorded).
