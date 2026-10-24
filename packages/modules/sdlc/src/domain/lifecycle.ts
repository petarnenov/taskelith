import { err, failure, ok, type Result } from '@taskelith/kernel';

// The obligations every workflow must cover (architecture section 6). A
// framework names its own stages; each stage declares which obligations it
// covers.
// Frozen, because the parsers below read them at run time.
export const LIFECYCLE_OBLIGATIONS = Object.freeze([
  'intake',
  'specification',
  'implementation',
  'review',
  'verification',
  'closure',
] as const);

export type LifecycleObligation = (typeof LIFECYCLE_OBLIGATIONS)[number];

// A native stage is a step of the framework itself; a platform-managed stage is
// a gate or record the platform supplies where the framework has none, and the
// UI must show it as such.
export const STAGE_ORIGINS = Object.freeze(['native', 'platform-managed'] as const);

export type StageOrigin = (typeof STAGE_ORIGINS)[number];

export function parseLifecycleObligation(text: string): Result<LifecycleObligation> {
  if (!(LIFECYCLE_OBLIGATIONS as readonly string[]).includes(text)) {
    return err(failure('invalid', `LifecycleObligation must be one of ${LIFECYCLE_OBLIGATIONS.join(', ')}`));
  }
  return ok(text as LifecycleObligation);
}

export function parseStageOrigin(text: string): Result<StageOrigin> {
  if (!(STAGE_ORIGINS as readonly string[]).includes(text)) {
    return err(failure('invalid', `StageOrigin must be one of ${STAGE_ORIGINS.join(', ')}`));
  }
  return ok(text as StageOrigin);
}
