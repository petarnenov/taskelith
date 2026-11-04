// The generic guards every wire module reads a body with; a screen's wire
// adds the checks of its own contract, such as the OpenAPI scalars.

export type Fields = Record<string, unknown>;

export function isRecord(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null;
}

export function isText(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

export function isInstant(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}
