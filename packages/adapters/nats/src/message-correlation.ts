import { pickCorrelation, type LogCorrelation } from '@taskelith/observability';
import type { WireMessage } from './wire-message.js';

// The command or observation metadata that ties a log record to its chain;
// a body without metadata, such as a notice, correlates by nothing.
export function correlationOf(message: WireMessage): LogCorrelation {
  const metadata = message.body['metadata'];
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) return {};
  return pickCorrelation(metadata as Record<string, unknown>);
}
