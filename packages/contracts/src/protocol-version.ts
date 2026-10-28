import type { MessageSchemas } from './generated/message-types.js';

export type ProtocolVersionWindow = MessageSchemas['ProtocolVersionWindow'];

// The execution protocol this build speaks; a change that a worker of this
// version could not execute needs the next version.
export const EXECUTION_PROTOCOL_VERSION = 1;

// The first version that carries session work; the control plane sends it
// only to a worker whose common version is at least this one.
export const SESSION_PROTOCOL_VERSION = 2;

export const SUPPORTED_PROTOCOL_VERSIONS: ProtocolVersionWindow = Object.freeze({
  minimum: EXECUTION_PROTOCOL_VERSION,
  maximum: EXECUTION_PROTOCOL_VERSION,
});

export function supportsProtocolVersion(window: ProtocolVersionWindow, version: number): boolean {
  return Number.isInteger(version) && version >= window.minimum && version <= window.maximum;
}

// The highest version both windows contain, which the control plane stamps on
// the worker's commands; none means it assigns that worker nothing.
export function commonProtocolVersion(worker: ProtocolVersionWindow, server: ProtocolVersionWindow): number | undefined {
  const highest = Math.min(worker.maximum, server.maximum);
  return highest >= Math.max(worker.minimum, server.minimum) ? highest : undefined;
}
