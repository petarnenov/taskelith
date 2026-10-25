import { err, failure, ok, type Result } from '@taskelith/kernel';

export type Environment = Readonly<Record<string, string | undefined>>;

export interface ServiceEndpoints {
  readonly postgres: URL;
  readonly nats: URL;
}

interface EndpointVariable {
  readonly name: string;
  readonly protocols: readonly string[];
}

const POSTGRES_URL: EndpointVariable = { name: 'TASKELITH_POSTGRES_URL', protocols: ['postgres:', 'postgresql:'] };
const NATS_URL: EndpointVariable = { name: 'TASKELITH_NATS_URL', protocols: ['nats:'] };

// Reads the control plane's PostgreSQL and NATS endpoints from the
// environment, without defaults, so a missing setting fails at startup.
export function readServiceEndpoints(environment: Environment): Result<ServiceEndpoints> {
  const postgres = readEndpoint(environment, POSTGRES_URL);
  if (!postgres.ok) return postgres;
  const nats = readEndpoint(environment, NATS_URL);
  if (!nats.ok) return nats;
  return ok({ postgres: postgres.value, nats: nats.value });
}

// Failures name the variable, never its value, which may hold a password.
function readEndpoint(environment: Environment, { name, protocols }: EndpointVariable): Result<URL> {
  const value = environment[name];
  const details = { variable: name };
  if (value === undefined || value === '') return err(failure('invalid', `${name} is not set`, details));
  if (!URL.canParse(value)) return err(failure('invalid', `${name} is not a URL`, details));
  const url = new URL(value);
  if (!protocols.includes(url.protocol)) {
    return err(failure('invalid', `${name} must use ${protocols.join(' or ')}`, details));
  }
  return ok(url);
}
