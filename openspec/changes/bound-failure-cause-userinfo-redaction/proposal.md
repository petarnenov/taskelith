## Why

The scheme-less user-information rule that #322 added to `packages/adapters/worker-control-plane-client/src/failure-cause.ts`, `/[^\s/?#@:'"]+:[^\s/?#@'"]+@/g`, is a ReDoS. On a long run of user-information characters with no `@`, every start position scans forward to the end of the run and fails, so the time grows with the square of the run: a 60,000-character cause message such as `'a'.repeat(60_000)` takes about three seconds. The message comes from a thrown error or a server's answer, and the redaction runs on the whole text before any cut, as the requirement "Control-plane failure cause" demands. Pepi found it during the integration of #322; coordinator Niki assigned the fix.

## What Changes

- **Rule.** The rule starts a match only where a run of user-information characters starts, by a lookbehind, and keeps that run's leading colons through a group, so it redacts exactly what it redacted before and is tried once per run.
- **Spec.** The requirement "Control-plane failure cause" gains the scenario "Pathological cause message": a cause message of tens of thousands of characters with no user-information end is described in linear time, and user information of any length is still redacted.
- **Tests.** Six pathological 60,000-character shapes must each be described within 200 ms; user information after leading colons, of 10,001 characters, and right after another is redacted as before.

No other redaction rule, no contract, and no published package changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `worker-runtime`: requirement "Control-plane failure cause".

## Impact

- `packages/adapters/worker-control-plane-client/src/failure-cause.ts` (one rule).
- `packages/adapters/worker-control-plane-client/test/control-plane-failure-cause.test.ts` (two tests).
- Out of scope: centralizing the log redaction rules, a separate next task.
