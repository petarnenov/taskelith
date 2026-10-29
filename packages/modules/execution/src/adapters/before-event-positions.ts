import { ok } from '@taskelith/kernel';
import type { ViewPositions } from '../ports/session-scopes.js';

// `0`, before any event, until item 14 assigns event stream positions and
// replaces this adapter (coordinator answer Q2).
export const BEFORE_ANY_EVENT: ViewPositions = Object.freeze({ current: async () => ok('0') });
