import type { Instant } from '@taskelith/kernel';

export interface Clock {
  now(): Instant;
}
