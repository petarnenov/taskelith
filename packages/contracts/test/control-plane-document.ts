import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { SchemaViolations } from '@taskelith/contracts';
import type { Result } from '@taskelith/kernel';

// Reads the contract documents for the control-plane contract tests.

export type Json = Record<string, unknown>;
type SecurityRequirement = Record<string, string[]>;

export interface Parameter {
  readonly name: string;
  readonly in: string;
  readonly required?: boolean;
  readonly schema?: Json;
}

export interface Operation {
  readonly operationId: string;
  readonly description?: string;
  readonly security: SecurityRequirement[];
  readonly parameters?: Parameter[];
  readonly requestBody?: { readonly content: Record<string, { schema?: Json }> };
  readonly responses: Record<string, { headers?: Record<string, Json>; content?: Record<string, { schema: Json }> }>;
}

interface Document {
  readonly openapi: string;
  readonly info: { readonly version: string };
  readonly paths: Record<string, Record<string, Operation>>;
  readonly components: { readonly schemas: Record<string, Json>; readonly securitySchemes: Record<string, Json> };
}

export function document(name: string): Document {
  return JSON.parse(readFileSync(new URL(`../documents/${name}`, import.meta.url), 'utf8'));
}

export function violations<T>(result: Result<T, SchemaViolations>): SchemaViolations {
  assert.equal(result.ok, false);
  return result.ok ? [] : result.error;
}

export const CONTROL_PLANE = document('control-plane.openapi.json');
export const SCHEMAS = CONTROL_PLANE.components.schemas;
export const WEBHOOK = 'receiveScmWebhook';
export const AT = '2026-10-28T10:00:00.000Z';

export const OPERATIONS = Object.entries(CONTROL_PLANE.paths).flatMap(([path, item]) =>
  Object.entries(item).map(([method, operation]) => ({ path, method, ...operation })),
);

export function operation(id: string): Operation & { path: string; method: string } {
  const found = OPERATIONS.find((candidate) => candidate.operationId === id);
  assert.ok(found, id);
  return found;
}

export function referencesIn(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(referencesIn);
  if (node === null || typeof node !== 'object') return [];
  const own = typeof (node as Json).$ref === 'string' ? [(node as Json).$ref as string] : [];
  return [...own, ...Object.values(node).flatMap(referencesIn)];
}

export function schemaName(reference: Json): string {
  return (reference.$ref as string).replace('#/components/schemas/', '');
}

// Every schema a node reaches, following component references.
export function reachable(node: unknown, seen = new Set<string>()): unknown[] {
  const nodes: unknown[] = [node];
  for (const reference of referencesIn(node)) {
    const name = reference.replace('#/components/schemas/', '');
    if (seen.has(name)) continue;
    seen.add(name);
    nodes.push(...reachable(SCHEMAS[name], seen));
  }
  return nodes;
}

export function holdsKey(node: unknown, key: string, value: unknown): boolean {
  if (Array.isArray(node)) return node.some((item) => holdsKey(item, key, value));
  if (node === null || typeof node !== 'object') return false;
  return (node as Json)[key] === value || Object.values(node).some((item) => holdsKey(item, key, value));
}

export function responseSchemas(candidate: Operation): unknown[] {
  return Object.values(candidate.responses).flatMap((response) => Object.values(response.content ?? {}).map(({ schema }) => schema));
}
