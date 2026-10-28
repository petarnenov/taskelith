// Provisional G2 item 13 values (owner decision O4) in
// docs/operational-targets.md, which G6 verifies.
const MINUTE_MILLISECONDS = 60_000;
const DAY_MILLISECONDS = 24 * 60 * MINUTE_MILLISECONDS;

// A rotation's deadline is the larger of the grace window and the hard cap
// (G3 sub-change 26c), counted from `rotate-worker`.
export const FLEET_LIMITS = Object.freeze({
  enrollmentTokenTtlMilliseconds: 15 * MINUTE_MILLISECONDS,
  rotationGraceMilliseconds: 10 * MINUTE_MILLISECONDS,
  rotationHardCapMilliseconds: 7 * DAY_MILLISECONDS,
});

export type FleetLimits = { readonly [Name in keyof typeof FLEET_LIMITS]: number };
