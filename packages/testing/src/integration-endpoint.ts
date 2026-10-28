import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export const SERVICES_REMEDY = 'run make test or make verify, or export the URLs that make services-up prints';

// A service URL that scripts/services.sh exports for integration tests;
// without it the test fails at once and names the remedy.
export function integrationEndpoint(variable: string, env: NodeJS.ProcessEnv = process.env): URL {
  const value = env[variable];
  if (!value || !URL.canParse(value)) throw new Error(`${variable} is not set to a URL; ${SERVICES_REMEDY}`);
  return new URL(value);
}

// A file of the test broker trust and certificates that scripts/services.sh
// writes, such as `integration.creds` or `ca.pem`.
export function integrationSecret(name: string, env: NodeJS.ProcessEnv = process.env): string {
  return readFileSync(integrationSecretPath(name, env), 'utf8');
}

// The path of such a file, for settings that name a file, such as a CA.
export function integrationSecretPath(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const directory = env.TASKELITH_SERVICES_SECRETS;
  if (!directory) throw new Error(`TASKELITH_SERVICES_SECRETS is not set; ${SERVICES_REMEDY}`);
  return join(directory, name);
}

// The integration broker's certificate is from the test CA, not the
// installation's, so a test worker trusts that CA in place of its pin.
export function withTestBrokerCa<T extends object>(endpoint: T, env: NodeJS.ProcessEnv = process.env): T & { readonly tls: { readonly ca: string } } {
  return { ...endpoint, tls: { ca: integrationSecret('ca.pem', env) } };
}
