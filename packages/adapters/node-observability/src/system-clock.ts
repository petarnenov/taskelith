import type { Instant } from '@taskelith/kernel';
import type { Clock } from '@taskelith/sdlc';

export const SYSTEM_CLOCK: Clock = Object.freeze({ now: () => new Date().toISOString() as Instant });
