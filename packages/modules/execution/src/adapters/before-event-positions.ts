import { ok } from '@taskelith/kernel';
import type { ViewPositions } from '../ports/session-scopes.js';

// `0`, before any numbered event, for the tests that wire no UI event log;
// the control plane reads its positions from the log.
export const BEFORE_ANY_EVENT: ViewPositions = Object.freeze({ current: async () => ok('0') });
