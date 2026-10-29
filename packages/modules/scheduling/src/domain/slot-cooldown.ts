import { err, failure, instantFromEpochMilliseconds, ok, type Instant, type Result } from '@taskelith/kernel';
import { SLOT_COOLDOWN_DEFAULT_MINUTES, type SlotCooldown } from './account-slot.js';

declare const defaultCooldownBrand: unique symbol;

// The installation's default cooldown, within the bounds of contract
// section 5; its caller keeps the setting.
export type DefaultCooldownMinutes = number & { readonly [defaultCooldownBrand]: true };

// A plugin's limit report, with the reset time only when it reports one;
// in epoch milliseconds, which hold a reset beyond the range of Instant.
export interface SlotLimitReport {
  readonly resetsAtEpochMilliseconds?: number;
}

// Covers weekly provider limits; a far reported reset locks no slot longer.
export const SLOT_REPORTED_RESET_MAXIMUM_MINUTES = 10_080;

const MILLISECONDS_PER_MINUTE = 60_000;

export function parseDefaultCooldownMinutes(minutes: number): Result<DefaultCooldownMinutes> {
  const { minimum, maximum } = SLOT_COOLDOWN_DEFAULT_MINUTES;
  if (Number.isSafeInteger(minutes) && minutes >= minimum && minutes <= maximum) return ok(minutes as DefaultCooldownMinutes);
  return err(failure('invalid', `the default cooldown must be a whole number of minutes from ${minimum} to ${maximum}`));
}

// Contract section 5: a reported reset after `now`, capped, else the
// default; a later limit extends the stored cooldown, never shortens it.
export function cooldownAfterLimit(
  stored: SlotCooldown | undefined, report: SlotLimitReport, now: Instant, defaultMinutes: DefaultCooldownMinutes,
): SlotCooldown {
  const reported = reportedCooldown(report, now, defaultMinutes);
  return stored !== undefined && Date.parse(stored.until) >= Date.parse(reported.until) ? stored : reported;
}

function reportedCooldown(report: SlotLimitReport, now: Instant, defaultMinutes: DefaultCooldownMinutes): SlotCooldown {
  const resetsAt = report.resetsAtEpochMilliseconds;
  if (resetsAt !== undefined && resetsAt > Date.parse(now)) {
    const cap = millisecondsAfter(now, SLOT_REPORTED_RESET_MAXIMUM_MINUTES);
    return Object.freeze({ until: instantAt(Math.min(resetsAt, cap)), source: 'reported-reset' });
  }
  return Object.freeze({ until: instantAt(millisecondsAfter(now, defaultMinutes)), source: 'default' });
}

function millisecondsAfter(now: Instant, minutes: number): number {
  return Date.parse(now) + minutes * MILLISECONDS_PER_MINUTE;
}

function instantAt(epochMilliseconds: number): Instant {
  const instant = instantFromEpochMilliseconds(epochMilliseconds);
  if (!instant.ok) throw new Error(instant.error.message);
  return instant.value;
}
