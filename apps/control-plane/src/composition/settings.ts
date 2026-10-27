import { readFileSync } from 'node:fs';
import { resolveDataRoot } from '@taskelith/data-root';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { TRANSPORT_LIMITS, type TransportLimits } from '@taskelith/nats';
import { parseWorkflowDefinition, type WorkflowDefinitionInput } from '@taskelith/sdlc';
import type { ServerTls } from '../api/server-tls.js';
import type { KnownWorkflow } from '../application/workflow-registry.js';
import { readBrokerTls } from '../broker-tls.js';
import { readServiceEndpoints, type Environment } from '../service-endpoints.js';
import type { ControlPlaneSettings } from './control-plane.js';

export const DEFAULT_API_HOST = '127.0.0.1';
export const DEFAULT_API_PORT = 8080;
export const DEFAULT_BROWSER_HOST = '127.0.0.1';
export const DEFAULT_BROWSER_PORT = 8443;

// The service's settings from its environment; a failure names the variable,
// never its value.
export function readControlPlaneSettings(environment: Environment, platform: NodeJS.Platform, ownerUid: number): Result<ControlPlaneSettings> {
  const endpoints = readServiceEndpoints(environment);
  if (!endpoints.ok) return endpoints;
  const dataRoot = resolveDataRoot({ environment, platform });
  if (!dataRoot.ok) return dataRoot;
  const port = readPort(environment, 'TASKELITH_API_PORT', DEFAULT_API_PORT);
  if (!port.ok) return port;
  const browserPort = readPort(environment, 'TASKELITH_BROWSER_PORT', DEFAULT_BROWSER_PORT);
  if (!browserPort.ok) return browserPort;
  const browserTls = readBrowserTls(environment);
  if (!browserTls.ok) return browserTls;
  const workflows = readWorkflows(environment.TASKELITH_WORKFLOWS);
  if (!workflows.ok) return workflows;
  const natsTls = readBrokerTls(environment, dataRoot.value);
  if (!natsTls.ok) return natsTls;
  const transportLimits = readTransportLimits(environment.TASKELITH_STREAM_MAX_BYTES);
  if (!transportLimits.ok) return transportLimits;
  return ok({
    dataRoot: dataRoot.value, ownerUid, postgres: endpoints.value.postgres, nats: endpoints.value.nats,
    api: { host: environment.TASKELITH_API_HOST || DEFAULT_API_HOST, port: port.value },
    browser: {
      host: environment.TASKELITH_BROWSER_HOST || DEFAULT_BROWSER_HOST, port: browserPort.value,
      ...(browserTls.value === undefined ? {} : { tls: browserTls.value }),
    },
    workflows: workflows.value,
    transportLimits: transportLimits.value,
    ...(natsTls.value === undefined ? {} : { natsTls: natsTls.value }),
  });
}

const BROWSER_CERTIFICATE = 'TASKELITH_BROWSER_TLS_CERT';
const BROWSER_KEY = 'TASKELITH_BROWSER_TLS_KEY';

// The operator's certificate and key of the browser endpoint, both or none;
// the composition checks that they match (installation contract 7).
function readBrowserTls(environment: Environment): Result<ServerTls | undefined> {
  const certificatePath = environment[BROWSER_CERTIFICATE] || undefined;
  const keyPath = environment[BROWSER_KEY] || undefined;
  if (certificatePath === undefined && keyPath === undefined) return ok(undefined);
  if (certificatePath === undefined) return err(unpaired(BROWSER_CERTIFICATE, BROWSER_KEY));
  if (keyPath === undefined) return err(unpaired(BROWSER_KEY, BROWSER_CERTIFICATE));
  const certificate = readText(certificatePath, BROWSER_CERTIFICATE);
  if (!certificate.ok) return certificate;
  const key = readText(keyPath, BROWSER_KEY);
  return key.ok ? ok({ certificate: certificate.value, key: key.value }) : key;
}

function unpaired(missing: string, given: string) {
  return failure('invalid', `${missing} must be set with ${given}`, { variable: missing });
}

function readText(path: string, variable: string): Result<string> {
  try {
    return ok(readFileSync(path, 'utf8'));
  } catch {
    return err(failure('invalid', `${variable} must name a readable PEM file`, { variable }));
  }
}

// The targets, with a smaller stream byte limit for a smaller broker disk.
function readTransportLimits(text: string | undefined): Result<TransportLimits> {
  if (text === undefined || text === '') return ok(TRANSPORT_LIMITS);
  const streamMaxBytes = Number(text);
  if (Number.isSafeInteger(streamMaxBytes) && streamMaxBytes > 0) return ok({ ...TRANSPORT_LIMITS, streamMaxBytes });
  return err(failure('invalid', 'TASKELITH_STREAM_MAX_BYTES must be a positive whole number of bytes', { variable: 'TASKELITH_STREAM_MAX_BYTES' }));
}

function readPort(environment: Environment, variable: string, fallback: number): Result<number> {
  const text = environment[variable];
  if (text === undefined || text === '') return ok(fallback);
  const port = Number(text);
  if (Number.isInteger(port) && port >= 0 && port <= 65_535) return ok(port);
  return err(failure('invalid', `${variable} must be a port number`, { variable }));
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
