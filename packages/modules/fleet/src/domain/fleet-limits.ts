// Provisional G2 item 13 values (owner decision O4) in
// docs/operational-targets.md, which G6 verifies.
const MINUTE_MILLISECONDS = 60_000;

export const FLEET_LIMITS = Object.freeze({
  enrollmentTokenTtlMilliseconds: 15 * MINUTE_MILLISECONDS,
  rotationGraceMilliseconds: 10 * MINUTE_MILLISECONDS,
});

export type FleetLimits = { readonly [Name in keyof typeof FLEET_LIMITS]: number };
