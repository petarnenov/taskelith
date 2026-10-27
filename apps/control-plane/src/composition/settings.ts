import { readFileSync } from 'node:fs';
import { resolveDataRoot } from '@taskelith/data-root';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { TRANSPORT_LIMITS, type TransportLimits } from '@taskelith/nats';
import { parseWorkflowDefinition, type WorkflowDefinitionInput } from '@taskelith/sdlc';
import type { KnownWorkflow } from '../application/workflow-registry.js';
import { readServiceEndpoints, type Environment } from '../service-endpoints.js';
import type { ControlPlaneSettings } from './control-plane.js';

export const DEFAULT_API_HOST = '127.0.0.1';
export const DEFAULT_API_PORT = 8080;

// The service's settings from its environment; a failure names the variable,
// never its value.
export function readControlPlaneSettings(environment: Environment, platform: NodeJS.Platform, ownerUid: number): Result<ControlPlaneSettings> {
  const endpoints = readServiceEndpoints(environment);
  if (!endpoints.ok) return endpoints;
  const dataRoot = resolveDataRoot({ environment, platform });
  if (!dataRoot.ok) return dataRoot;
  const port = readPort(environment.TASKELITH_API_PORT);
  if (!port.ok) return port;
  const workflows = readWorkflows(environment.TASKELITH_WORKFLOWS);
  if (!workflows.ok) return workflows;
  const ca = readCa(environment.TASKELITH_NATS_CA);
  if (!ca.ok) return ca;
  const transportLimits = readTransportLimits(environment.TASKELITH_STREAM_MAX_BYTES);
  if (!transportLimits.ok) return transportLimits;
  return ok({
    dataRoot: dataRoot.value, ownerUid, postgres: endpoints.value.postgres, nats: endpoints.value.nats,
    api: { host: environment.TASKELITH_API_HOST || DEFAULT_API_HOST, port: port.value },
    workflows: workflows.value,
    transportLimits: transportLimits.value,
    ...(ca.value === undefined ? {} : { natsTls: { ca: ca.value } }),
  });
}

function readCa(path: string | undefined): Result<string | undefined> {
  if (path === undefined || path === '') return ok(undefined);
  try {
    return ok(readFileSync(path, 'utf8'));
  } catch {
    return err(failure('invalid', 'TASKELITH_NATS_CA must name a readable PEM file', { variable: 'TASKELITH_NATS_CA' }));
  }
}

// The targets, with a smaller stream byte limit for a smaller broker disk.
function readTransportLimits(text: string | undefined): Result<TransportLimits> {
  if (text === undefined || text === '') return ok(TRANSPORT_LIMITS);
  const streamMaxBytes = Number(text);
  if (Number.isSafeInteger(streamMaxBytes) && streamMaxBytes > 0) return ok({ ...TRANSPORT_LIMITS, streamMaxBytes });
  return err(failure('invalid', 'TASKELITH_STREAM_MAX_BYTES must be a positive whole number of bytes', { variable: 'TASKELITH_STREAM_MAX_BYTES' }));
}

function readPort(text: string | undefined): Result<number> {
  if (text === undefined || text === '') return ok(DEFAULT_API_PORT);
  const port = Number(text);
  if (Number.isInteger(port) && port >= 0 && port <= 65_535) return ok(port);
  return err(failure('invalid', 'TASKELITH_API_PORT must be a port number', { variable: 'TASKELITH_API_PORT' }));
}

// A JSON file listing `{definition, digest}`; without one no run is accepted.
function readWorkflows(path: string | undefined): Result<readonly KnownWorkflow[]> {
  if (path === undefined || path === '') return ok([]);
  let entries: unknown;
  try {
    entries = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return err(failure('invalid', 'TASKELITH_WORKFLOWS must name a readable JSON file', { variable: 'TASKELITH_WORKFLOWS' }));
  }
  if (!Array.isArray(entries)) return err(failure('invalid', 'TASKELITH_WORKFLOWS must hold a list', { variable: 'TASKELITH_WORKFLOWS' }));
  const known: KnownWorkflow[] = [];
  for (const entry of entries as unknown[]) {
    const workflow = knownWorkflow(entry);
    if (workflow === undefined) return err(failure('invalid', 'TASKELITH_WORKFLOWS holds an invalid workflow', { variable: 'TASKELITH_WORKFLOWS' }));
    known.push(workflow);
  }
  return ok(known);
}

// The parser expects the input's shape, so a malformed entry is caught here.
function knownWorkflow(entry: unknown): KnownWorkflow | undefined {
  const { definition, digest } = (entry ?? {}) as { definition?: WorkflowDefinitionInput; digest?: unknown };
  if (typeof digest !== 'string' || typeof definition !== 'object' || definition === null || !Array.isArray(definition.stages)) return undefined;
  try {
    const parsed = parseWorkflowDefinition(definition);
    return parsed.ok ? { definition: parsed.value, digest } : undefined;
  } catch {
    return undefined;
  }
}
