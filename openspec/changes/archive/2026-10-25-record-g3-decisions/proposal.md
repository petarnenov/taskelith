## Why

On 2026-10-25, after `draft-g3-plan` merged, the owner decided the open decisions of the draft G3 plan except D15, which waits for item 2's review of the provider terms. For D13 the owner chose (c), agent delegation and a web terminal in G3, against the author's recommendation; that adds work items. Because Mantine (D17) has no terminal emulator, the owner also decided a new D18 for the web terminal.

## What Changes

- Mark D2 to D14 and D16 in `docs/g3-plan.md` as decided by the owner on 2026-10-25: D2 (a), D3 (a), D4 (a), D5 (a), D6 (a), D7 (a), D8 (a), D9 (a), D10 (a), D11 (b), D12 (a), D13 (c), D14 (a), and D16 (a). D15 stays open.
- Add D18, the web terminal, decided (a): xterm.js for the terminal view only, as the one exception to D17, and node-pty on the worker; D17's decision names the exception.
- For D13 (c), add items 38 `implement-agent-delegation`, 39 `implement-web-terminal`, and 40 `build-terminal-screen` (UI); widen items 1, 3, 9, and 18 to cover them; renumber acceptance and closure to 41 and 42, and add delegation and the terminal to the acceptance scenarios.
- Clear the "Blocked by" column except D15 on items 35 and 36, update the status line and the decisions introduction, and recompute the waves and the longest chain.

## Capabilities

### New Capabilities

### Modified Capabilities

None. The `delivery-planning` requirement "Owner decisions recorded in the plan" already requires this record, and the change is documentation only, so it sets `skip_specs: true`.

## Impact

Documentation only. No product code or dependency is added; xterm.js and node-pty are evaluated by item 1 before any use. The plan stays a draft that authorizes no implementation until G2 closes and the owner starts G3.
